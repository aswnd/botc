import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testApp,request} from './http.ts';
import {makeGame,privateAction,privateView,publicView} from '../server/engine.ts';
import {applyCommand,testDecider} from './engine-helper.ts';
const post=(app:any,path:string,data:any={},token?:string)=>request(app,path,{method:'POST',data,headers:{'x-host-token':'',...(token?{'x-player-token':token}:{})}});
const host=(app:any,path:string,data:any={})=>request(app,path,{method:'POST',data});
const state=async(app:any)=>(await request(app,'/api/state')).json();
const view=async(app:any,token:string)=>(await request(app,'/api/player',{headers:{'x-player-token':token}})).json();
async function register(app:any,count=7){const l=(await state(app)).lobby;const members=[];for(let i=0;i<count;i++){const r=await post(app,'/api/lobby/register',{lobbyId:l.id,name:`Person ${i+1}`,seat:i+1});assert.equal(r.status,200,r.body);members.push(r.json());}return members;}
async function start(app:any,count=7){const members=await register(app,count);await host(app,'/api/lobby/assistant',{id:members[0].identity.id});assert.equal((await host(app,'/api/lobby/start',{demo:false})).status,200);await ack(app);return members;}
async function ack(app:any){return host(app,'/api/command',{version:app.getGame()!.version,commandId:crypto.randomUUID(),command:{type:'ack'}});}
async function submit(app:any,m:any,overrides:any={}){const p=(await view(app,m.token)).view;const result=await post(app,'/api/player/submit',{commandId:crypto.randomUUID(),gameId:p.gameId,phase:p.phase,night:p.night,targets:p.action?p.targets.filter((x:any)=>!p.action.excludeSelf||x.id!==p.id).slice(0,p.action.count).map((x:any)=>x.id):[],...overrides},m.token);await app.idle();return result;}

test('production lobby: unique registration, seat guards, host separation and roster lock',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  assert.equal((await request(app,'/',{remoteAddress:'192.168.1.42'})).headers.Location,'/join');
  assert.equal((await request(app,'/api/host',{remoteAddress:'192.168.1.42',headers:{'x-forwarded-for':'127.0.0.1'}})).status,400,'LAN devices cannot bootstrap the laptop credential');
  assert.equal((await post(app,'/api/lobby/start',{demo:false})).status,400);
  assert.equal((await host(app,'/api/new',{names:[],assistant:0,demo:false})).status,400);
  const members=await register(app,6),l=(await state(app)).lobby;
  assert.equal((await post(app,'/api/lobby/register',{lobbyId:l.id,name:'PERSON 1',seat:7})).status,400);
  assert.equal((await post(app,'/api/lobby/register',{lobbyId:l.id,name:'New',seat:1})).status,400);
  await host(app,'/api/lobby/assistant',{id:members[0].identity.id});
  assert.equal((await host(app,'/api/lobby/start',{demo:false})).status,400);
  const seventh=(await post(app,'/api/lobby/register',{lobbyId:l.id,name:'Last',seat:8})).json();
  assert.equal((await host(app,'/api/lobby/start',{demo:false})).status,400,'seat gap');
  assert.equal((await post(app,'/api/lobby/register',{lobbyId:l.id,name:'Last',seat:7},seventh.token)).status,200);
  assert.equal((await host(app,'/api/lobby/start',{demo:false})).status,200);
  assert.equal((await post(app,'/api/lobby/register',{lobbyId:l.id,name:'Late',seat:8})).status,400);
  assert.equal((await post(app,'/api/private/open',{playerId:'p1'},members[0].token)).status,400);
  assert.equal((await post(app,'/api/command',{commandId:'x',version:0,command:{type:'ack'}},members[0].token)).status,400);
  const r=await request(app,'/api/player',{headers:{'x-player-token':members[1].token}});assert.equal(r.json().view.id,'p2');
  assert.equal((await request(app,'/api/player')).status,400);
  const pub=JSON.stringify(await state(app));for(const key of ['tokenHash','recoveryHash','role','choices','ready','redHerring','decisions'])assert.ok(!pub.includes(`"${key}"`),key);
 }finally{await app.close();}
});

test('simultaneous phone steps, scoped retries, fixed choices and public privacy',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  const ms=await start(app);const g=app.getGame()!;
  const first=await submit(app,ms[3],{commandId:'same'});assert.equal(first.status,200);assert.equal(app.getGame()!.phase,'distribution');
  assert.equal((await post(app,'/api/player/submit',{commandId:'same',gameId:g.id,phase:'distribution',night:0},ms[3].token)).status,200);
  const results=await Promise.all(ms.filter((_,i)=>i!==3).reverse().map(m=>submit(app,m)));for(const r of results)assert.equal(r.status,200,r.body);
  assert.equal(app.getGame()!.phase,'night_choices');assert.equal(await ack(app).then(r=>r.status),200);
  assert.equal((await submit(app,ms[0],{night:0})).status,400,'stale night');
  const before=(await view(app,ms[0].token)).view;assert.equal((await submit(app,ms[0],{commandId:'locked'})).status,200);
  assert.equal((await submit(app,ms[0])).status,400,'cannot change submitted choice');
  const after=(await view(app,ms[0].token)).view;assert.equal(after.submitted,true);assert.equal(after.action,null);
  assert.deepEqual(after.info,before.info,'no early results');
  for(const m of ms.slice(1).reverse())assert.equal((await submit(app,m)).status,200);
  assert.equal(app.getGame()!.phase,'night_results');assert.equal(app.getGame()!.queueIndex,0);assert.equal((await state(app)).game.nextPlayer,null);
  const readyBefore=[...app.getGame()!.ready!];
  assert.equal((await post(app,'/api/player/submit',{commandId:'locked',gameId:g.id,phase:'night_choices',night:1},ms[0].token)).status,200,'duplicate survives phase change');
  assert.deepEqual(app.getGame()!.ready,readyBefore,'duplicate does not acknowledge results');
  for(const m of ms)if(!(await view(app,m.token)).view.submitted)assert.equal((await submit(app,m)).status,200);
  assert.equal(app.getGame()!.phase,'dawn');await ack(app);assert.equal(app.getGame()!.phase,'discussion');
 }finally{await app.close();}
});

test('stored phone credentials survive restart, retain submissions and archive legacy saves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phones-')),dbPath=join(dir,'game.sqlite');let app=testApp({dbPath,legacyApi:false});
 try{
  const old=makeGame({names:['A','B','C','D','E','F','G'],assistant:0});app.store.save(old);await app.close();app=testApp({dbPath,legacyApi:false});
  assert.equal((await state(app)).game,null);assert.equal((await state(app)).lobby.legacyArchived,true);
  const ms=await start(app);await submit(app,ms[0]);const id=app.getGame()!.id;await app.close();app=testApp({dbPath,legacyApi:false});
  assert.equal((await view(app,ms[0].token)).view.submitted,true);
  assert.equal(app.getGame()!.id,id);
  assert.ok(app.store.db.prepare('SELECT 1 FROM games WHERE id=?').get(old.id));
  const raw=JSON.stringify(app.store.db.prepare('SELECT state FROM phone_lobby').get());assert.ok(!raw.includes(ms[0].token));assert.ok(!raw.includes('recoveryHash'));assert.equal(ms[0].recoveryCode,undefined);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('AI failure preserves all submissions and accepted decisions across restart and retry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phone-ai-')),dbPath=join(dir,'game.sqlite');let app=testApp({dbPath,legacyApi:false});try{
  const ms=await start(app);await Promise.all(ms.map(m=>submit(app,m)));await ack(app);
  // Ensure this night requests several Storyteller decisions regardless of random setup.
  const g=app.getGame()!;g.fastNight=false;g.truthfulInformation=false;for(const [i,r] of ['chef','recluse','investigator','empath','soldier','poisoner','imp'].entries()){g.players[i].role=r as any;g.players[i].apparent=r as any;g.players[i].team=i<5?'good':'evil';}app.store.save(g);
  let calls=0;app.ai.services=()=>({decide:async r=>{calls++;if(calls===2)throw new Error('injected outage');return testDecider(r);}});
  for(const m of ms)await submit(app,m);
  assert.equal(app.getGame()!.phase,'night_choices');assert.equal(Object.keys(app.getGame()!.choices).length,7);assert.equal((await state(app)).resolutionError,true);
  const accepted=app.store.db.prepare('SELECT decision_key FROM phone_decisions').all() as {decision_key:string}[];assert.ok(accepted.length>0);
  await app.close();app=testApp({dbPath,legacyApi:false});assert.equal((await state(app)).resolutionError,true);
  app.ai.services=()=>({decide:async r=>{assert.ok(!accepted.some(a=>a.decision_key===r.key),'accepted decision must be reused');return testDecider(r);}});
  assert.equal((await host(app,'/api/night/retry')).status,200);assert.equal(app.getGame()!.phase,'night_results');
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('phone rules: Ravenkeeper preselection resolves before Spy, poisoned result and no trigger',async()=>{
 for(const poisoned of [false,true]){
  let g=makeGame({names:['A','B','C','D','E','F','G','H','I','J'],assistant:0,phone:true,roles:['ravenkeeper','empath','fortune_teller','monk','chef','soldier','undertaker','poisoner','spy','imp']});
  g.phase='night_choices';g.night=2;g.announcement=undefined;g.nightStartAlive=g.players.map(p=>p.id);g.choices={p1:['p2'],p2:[],p3:['p1','p2'],p4:['p2'],p5:[],p6:[],p7:[],p8:[poisoned?'p1':'p5'],p9:[],p10:['p1']};
  assert.equal(privateAction(g,g.players[0])?.kind,'ravenkeeper');g=await applyCommand(g,{type:'phone_resolve'});
  assert.equal(g.phase,'night_results');assert.ok(g.players[0].info.some(i=>i.text.includes('B ist')));assert.equal(privateAction(g,g.players[0]),null);
  assert.ok(g.players[8].info.at(-1)?.grimoire?.find(p=>p.id==='p1')?.alive===false);
  assert.equal(publicView(g).players[0].alive,true,'death remains secret until dawn');
  if(poisoned)assert.equal(g.decisions.some(d=>d.key==='2:raven:p1'),true);
  if(poisoned)assert.ok(g.decisions.find(d=>d.key==='2:raven:p1')?.kind==='misinformation');
 }
 let g=makeGame({names:['A','B','C','D','E','F','G'],assistant:0,phone:true,roles:['ravenkeeper','empath','fortune_teller','monk','chef','poisoner','imp']});
 g.phase='night_choices';g.night=1;g.announcement=undefined;g.choices={p1:['p2'],p2:[],p3:['p1','p2'],p4:[],p5:[],p6:['p5'],p7:[]};g=await applyCommand(g,{type:'phone_resolve'});assert.equal(g.players[0].info.length,0);
});

test('new rounds archive active games, rotate lobby credentials and remain fresh after restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phone-archive-')),dbPath=join(dir,'game.sqlite');let app=testApp({dbPath,legacyApi:false});try{
  const ms=await start(app),oldId=app.getGame()!.id;
  assert.equal((await host(app,'/api/lobby/reset')).status,400,'explicit archive is required for active game');
  assert.equal((await host(app,'/api/lobby/reset',{archive:true})).status,200);
  assert.equal((await state(app)).game,null);assert.equal((await request(app,'/api/player',{headers:{'x-player-token':ms[0].token}})).status,400);
  await app.close();app=testApp({dbPath,legacyApi:false});assert.equal((await state(app)).game,null);
  await start(app);assert.notEqual(app.getGame()!.id,oldId);assert.ok(app.store.db.prepare('SELECT 1 FROM games WHERE id=?').get(oldId));
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('dead phones participate, pause blocks submissions and nobody is skipped on disconnect',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  const ms=await start(app);await Promise.all(ms.map(m=>submit(app,m)));await ack(app);
  const g=app.getGame()!;g.players[0].alive=false;g.publicDead=['p1'];app.store.save(g);
  assert.equal((await view(app,ms[0].token)).view.action,null);
  const pause=()=>host(app,'/api/command',{version:app.getGame()!.version,commandId:crypto.randomUUID(),command:{type:'pause'}});
  await pause();assert.equal((await submit(app,ms[0])).status,400);await pause();
  for(const m of ms.slice(1))await submit(app,m);
  assert.equal(app.getGame()!.phase,'night_choices','missing dead player confirmation still blocks');
  assert.equal((await host(app,'/api/night/retry')).status,200);assert.equal(app.getGame()!.phase,'night_choices');
  await submit(app,ms[0]);assert.equal(app.getGame()!.phase,'night_results');
 }finally{await app.close();}
});


test('production phone transport completes games across all supported player counts',async()=>{
 for(const count of [7,8,9,10]){
  const app=testApp({dbPath:':memory:',legacyApi:false});try{
   const ms=await start(app,count);
   const command=(type:string,rest:any={})=>host(app,'/api/command',{version:app.getGame()!.version,commandId:crypto.randomUUID(),command:{type,...rest}});
   for(let step=0;step<250&&app.getGame()!.phase!=='ended';step++){
    const g=app.getGame()!;let response;
    if(g.announcement)response=await ack(app);
    else if(['distribution','night_choices','night_results'].includes(g.phase)){
     const p=g.players.find(p=>g.phase==='night_choices'?!Object.hasOwn(g.choices,p.id):!g.ready?.includes(p.id));assert.ok(p,'a pending player must exist');response=await submit(app,ms[p.seat]);
    }else if(g.phase==='discussion')response=await command('nominations');
    else if(g.phase==='nominations'){
     if(g.nomination){response=await command('vote_draft',{voters:g.players.filter(p=>p.alive).map(p=>p.id)});assert.equal(response.status,200);response=await command('vote_confirm');}
     else if(!g.ballots.length)response=await command('nominate',{nominator:g.players.find(p=>p.alive)!.id,nominee:g.players.find(p=>p.alive&&p.role==='imp')!.id});
     else response=await command('close_day');
    }
    assert.equal(response?.status,200,response?.body);
   }
   assert.equal(app.getGame()!.phase,'ended');assert.equal(app.getGame()!.winner,'good');assert.ok((await state(app)).game.reveal.length===count);
  }finally{await app.close();}
 }
});

test('phone host can choose truthful or standard information before starting',async()=>{
 for(const truthfulInformation of [true,false]){
  const app=testApp({dbPath:':memory:',legacyApi:false});try{
   const members=await register(app);await host(app,'/api/lobby/assistant',{id:members[0].identity.id});
   assert.equal((await host(app,'/api/lobby/start',{demo:false,truthfulInformation:'false'})).status,400);
   assert.equal((await host(app,'/api/lobby/start',{demo:false,truthfulInformation})).status,200);
   assert.equal(app.getGame()!.truthfulInformation,truthfulInformation);
   assert.equal((await state(app)).game.truthfulInformation,truthfulInformation);
  }finally{await app.close();}
 }
});

test('continuous night only asks recipients of new information to confirm again and fast mode calls no AI',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  const ms=await start(app,8);await Promise.all(ms.map(m=>submit(app,m)));await ack(app);
  const g=app.getGame()!;
  const roles=['fortune_teller','empath','monk','soldier','undertaker','butler','poisoner','imp'];
  for(const [i,role] of roles.entries())Object.assign(g.players[i],{role,apparent:role,notifiedRole:role,team:i<6?'good':'evil'});
  g.players[3].alive=false;g.publicDead=['p4'];g.fastNight=true;
  app.ai.services=()=>{throw new Error('fast night must not request AI services');};
  for(const m of ms)assert.equal((await submit(app,m)).status,200);
  assert.equal(app.getGame()!.phase,'night_results');
  for(const i of [2,3,4,5,6,7])assert.equal((await view(app,ms[i].token)).view.submitted,true,roles[i]);
  for(const i of [0,1])assert.equal((await view(app,ms[i].token)).view.submitted,false,roles[i]);
  const ready=[...app.getGame()!.ready!];
  assert.deepEqual(ready,['p3','p4','p5','p6','p7','p8']);
  assert.ok(app.getGame()!.decisions.every(d=>d.reason.includes('lokale Auswahl')));
  for(const i of [0,1])assert.equal((await submit(app,ms[i])).status,200);
  assert.equal(app.getGame()!.phase,'dawn');
 }finally{await app.close();}
});

test('last submission returns while AI works and resolution does not expose partial results',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});let release!:()=>void;
 const gate=new Promise<void>(ok=>release=ok);let started!:()=>void;const resolving=new Promise<void>(ok=>started=ok);
 try{
  const ms=await start(app);await Promise.all(ms.map(m=>submit(app,m)));await ack(app);
  const g=app.getGame()!;g.fastNight=false;
  for(const [i,role] of ['washerwoman','chef','empath','soldier','monk','poisoner','imp'].entries())Object.assign(g.players[i],{role,apparent:role,notifiedRole:role,team:i<5?'good':'evil'});
  app.ai.services=()=>({decide:async r=>{started();await gate;return testDecider(r);}});
  for(const m of ms.slice(0,-1))await submit(app,m);
  const m=ms.at(-1)!,p=(await view(app,m.token)).view;
  const result=await post(app,'/api/player/submit',{commandId:crypto.randomUUID(),gameId:p.gameId,phase:p.phase,night:p.night,targets:p.action?p.targets.filter((x:any)=>!p.action.excludeSelf||x.id!==p.id).slice(0,p.action.count).map((x:any)=>x.id):[]},m.token);
  assert.equal(result.status,200);assert.equal(result.json().view.submitted,true);
  await resolving;assert.equal((await state(app)).resolving,true);
  assert.equal((await view(app,ms[0].token)).view.info.filter((i:any)=>i.night===g.night).length,0);
  release();await app.idle();assert.equal((await state(app)).resolving,false);assert.equal(app.getGame()!.phase,'night_results');
 }finally{release();await app.close();}
});

test('phone nights with no new information advance directly to dawn',async()=>{
 let g=makeGame({names:['A','B','C','D','E','F','G'],assistant:0,phone:true,roles:['ravenkeeper','monk','soldier','virgin','slayer','poisoner','imp']});
 g.phase='night_choices';g.night=2;g.announcement=undefined;g.nightStartAlive=g.players.map(p=>p.id);
 g.choices={p1:['p2'],p2:['p3'],p3:[],p4:[],p5:[],p6:['p4'],p7:['p3']};
 g=await applyCommand(g,{type:'phone_resolve'});
 assert.equal(g.phase,'dawn');assert.equal(g.nightDeaths.length,0,'Soldier survives');
});

test('host can switch an existing night to local mode without discarding accepted choices',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  const ms=await start(app);await Promise.all(ms.map(m=>submit(app,m)));await ack(app);
  app.getGame()!.fastNight=false;await submit(app,ms[0]);
  const choices=structuredClone(app.getGame()!.choices);
  assert.equal((await post(app,'/api/night/mode',{fastNight:true},ms[0].token)).status,400);
  assert.equal((await host(app,'/api/night/mode',{fastNight:'true'})).status,400);
  assert.equal((await host(app,'/api/night/mode',{fastNight:true})).status,200);
  assert.equal((await state(app)).game.fastNight,true);assert.deepEqual(app.getGame()!.choices,choices);
  assert.equal((await host(app,'/api/night/mode',{fastNight:false})).status,200);
  assert.equal(app.getGame()!.fastNight,false);
 }finally{await app.close();}
});

test('phone-only leader route and authenticated daytime actions',async()=>{
 const app=testApp({dbPath:':memory:',legacyApi:false});try{
  const leader=await request(app,'/leader',{remoteAddress:'192.168.1.42'});assert.equal(leader.status,200);assert.ok(leader.body.includes('/src/app.js'));
  const token=(await request(app,'/api/leader',{remoteAddress:'192.168.1.42'})).json().token;assert.ok(token);
  const ms=await start(app);const g=app.getGame()!;
  g.phase='dawn';g.announcement={title:'Morgen',text:'Vorlesen'};
  await ack(app);assert.equal(app.getGame()!.phase,'discussion');assert.equal(app.getGame()!.timer.deadline,null);
  const current=app.getGame()!;current.players[0].role='slayer';current.players[0].usedSlayer=false;current.players[2].role='imp';
  const target=current.players.find(p=>p.role==='imp')!;assert.ok(target);
  const input={gameId:current.id,version:current.version,action:'slayer',target:target.id,playerId:current.players[0].id};
  assert.equal((await post(app,'/api/player/day-action',input)).status,400);
  assert.equal((await post(app,'/api/player/day-action',{...input,version:-1},ms[1].token)).status,400);
  assert.equal((await post(app,'/api/player/day-action',input,ms[1].token)).status,200);
  assert.equal(app.getGame()!.players[0].usedSlayer,false,'client cannot shoot as another player');
  assert.ok(app.getGame()!.events.some(e=>e.text.includes('Person 2 erklärt einen Schuss')));
  assert.equal((await post(app,'/api/player/day-action',input,ms[1].token)).status,400,'stale retry cannot repeat a shot');
 }finally{await app.close();}
});

test('player photos are authenticated, validated, public and durable across restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'clocktower-photos-')),dbPath=join(dir,'game.sqlite');let app=testApp({dbPath,legacyApi:false});
 try{
  const ms=await register(app);const photo='data:image/jpeg;base64,/9j/2Q==';
  assert.equal((await post(app,'/api/player/photo',{photo})).status,400);
  for(const bad of ['data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,AAAA',photo+'A'.repeat(60000)])assert.equal((await post(app,'/api/player/photo',{photo:bad},ms[0].token)).status,400);
  assert.equal((await post(app,'/api/player/photo',{photo},ms[0].token)).status,200);
  const url=(await state(app)).lobby.members[0].photo;assert.match(url,/^\/api\/avatar\//);
  assert.equal((await request(app,url)).headers['Content-Type'],'image/jpeg');
  assert.equal((await state(app)).lobby.members[1].photo,undefined);
  await host(app,'/api/lobby/assistant',{id:ms[0].identity.id});await host(app,'/api/lobby/start',{demo:false});
  assert.equal((await state(app)).game.players[0].photo,url);
  await app.close();app=testApp({dbPath,legacyApi:false});
  assert.equal((await state(app)).game.players[0].photo,url);assert.equal((await request(app,url)).status,200);
  assert.equal((await post(app,'/api/player/photo',{photo},ms[0].token)).status,200);
  assert.notEqual((await state(app)).game.players[0].photo,url,'replacement updates the public player');
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
