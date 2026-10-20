import { applyCommand, testDecider } from './engine-helper.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame,privateView,privateAction,publicView,poisoned,grimoire } from '../server/engine.ts';
import { CHARACTERS,ROLE,teamOf } from '../shared/characters.ts';
import type { Role } from '../shared/characters.ts';
import type { Game,Decider } from '../shared/types.ts';

const names=['Anna','Ben','Clara','David','Emilia','Felix','Greta','Hannes','Ida','Jonas'];
function fixture(roles:Role[]=['washerwoman','chef','empath','fortune_teller','soldier','poisoner','imp']) {
  const g=makeGame({names:names.slice(0,roles.length),assistant:0,roles,seed:42,minimumVisitMs:0});g.announcement=undefined;return g;
}
function asRole(g:Game,index:number,role:Role,apparent=role){Object.assign(g.players[index],{role,apparent,team:teamOf(role),notifiedRole:apparent});}
const choose=(id:string):Decider=>async r=>({choice:r.options.some(o=>o.id===id)?id:r.fallback,reason:'Testentscheidung'});
async function allVisits(g:Game,targets:Record<string,string[]>={},d?:Decider) {
  const phase=g.phase;
  while(g.phase===phase&&g.queueIndex<g.players.length){const p=g.players[g.queueIndex];const action=privateAction(g,p);const picks=targets[p.id]??g.players.filter(t=>!action?.excludeSelf||t.id!==p.id).slice(0,action?.count??0).map(p=>p.id);g=await applyCommand(g,{type:'visit',playerId:p.id,targets:picks},d);}
  return g;
}
function night(g:Game,n=2){g.phase='night_choices';g.night=n;g.day=n-1;g.queueIndex=0;g.choices={};g.nightStartAlive=g.players.filter(p=>p.alive).map(p=>p.id);g.nightDeaths=[];g.announcement=undefined;return g;}
function day(g:Game){g.phase='nominations';g.day=1;g.night=1;g.announcement=undefined;return g;}
async function ballot(g:Game,a:string,b:string,voters:string[]){g=await applyCommand(g,{type:'nominate',nominator:a,nominee:b});g=await applyCommand(g,{type:'ack'});g=await applyCommand(g,{type:'vote_draft',voters});g=await applyCommand(g,{type:'vote_confirm'});return applyCommand(g,{type:'ack'});}

test('legal generated setups for 7–10 players across 200 seeds',()=>{
  const observed=new Set<Role>();for(let n=7;n<=10;n++)for(let seed=0;seed<200;seed++){
    const g=makeGame({names:names.slice(0,n),assistant:n-1,seed});const roles=g.players.map(p=>p.role);roles.forEach(r=>observed.add(r));
    assert.equal(new Set(roles).size,n);assert.equal(roles.filter(r=>r==='imp').length,1);
    assert.equal(roles.filter(r=>ROLE[r].category==='minion').length,n===10?2:1);
    assert.equal(roles.filter(r=>ROLE[r].category==='outsider').length,(n-7)%3+(roles.includes('baron')?2:0));
    assert.equal(g.bluffs.length,3);assert.ok(g.bluffs.every(r=>!roles.includes(r)&&!g.players.some(p=>p.apparent===r)));assert.equal(g.players.find(p=>p.id===g.redHerring)!.team,'good');
  }assert.equal(observed.size,22);
});
test('Spy grimoire snapshots are available at night but hidden throughout the day',()=>{
  const g=night(fixture(),2);asRole(g,5,'spy');
  const snapshot=grimoire(g);
  g.players[5].info=[{night:1,text:'Dein Grimoire.',grimoire:snapshot},{night:2,text:'Dein neues Grimoire.',grimoire:snapshot}];
  for(const phase of ['night_choices','night_results'] as const){
    g.phase=phase;
    assert.ok(privateView(g,'p6').info.every(i=>i.grimoire?.length===7));
  }
  for(const phase of ['dawn','discussion','nominations'] as const){
    g.phase=phase;
    const info=privateView(g,'p6').info;
    assert.equal(info.length,2);
    assert.ok(info.every(i=>!('grimoire' in i)));
    assert.equal(info[0].text,'Dein Grimoire.');
  }
  assert.deepEqual(g.players[5].info[0].grimoire,snapshot);
});
test('invalid input and role distributions are rejected',()=>{
  assert.throws(()=>makeGame({names:['A'],assistant:0}));assert.throws(()=>makeGame({names:['A','a','B','C','D','E','F'],assistant:0}));assert.throws(()=>makeGame({names:names.slice(0,7),assistant:12}));
});
test('distribution, first night, results and dawn are a complete playable loop',async()=>{
  let g=fixture();g=await allVisits(g);assert.equal(g.phase,'night_choices');assert.equal(g.night,1);assert.ok(g.announcement);g=await applyCommand(g,{type:'ack'});
  assert.equal(privateView(g,'p6').opening.length,2);assert.equal(privateView(g,'p7').opening.length,2);
  g=await allVisits(g,{p6:['p5'],p4:['p1','p2']});assert.equal(g.phase,'night_results');assert.equal(g.nightDeaths.length,0);
  assert.match(g.players[0].info[0].text,/oder/);assert.match(g.players[1].info[0].text,/Paare/);assert.match(g.players[2].info[0].text,/Nachbarn/);assert.match(g.players[3].info[0].text,/Ja|Nein/);
  g=await allVisits(g);assert.equal(g.phase,'dawn');assert.equal(g.day,1);g=await applyCommand(g,{type:'ack'},undefined,1000);assert.equal(g.phase,'discussion');assert.equal(g.timer.deadline,421000);
});
test('public/assistant projections never contain secrets and night deaths stay hidden',async()=>{
  let g=night(fixture());g=await allVisits(g,{p6:['p1'],p7:['p3'],p4:['p1','p2']});assert.equal(g.players[2].alive,false);
  const pub=publicView(g);assert.equal(pub.players[2].alive,true);assert.equal(pub.threshold,4);
  const raw=JSON.stringify(pub);for(const secret of ['apparent','redHerring','poison','decisions','grimoire','character','role','bluffs'])assert.ok(!raw.includes(`"${secret}"`),secret);
  g=await allVisits(g);assert.equal(publicView(g).players[2].alive,false);
});
test('soldier and monk prevent demon deaths; poisoning disables soldier',async()=>{
  let g=night(fixture());g=await allVisits(g,{p6:['p1'],p7:['p5'],p4:['p1','p2']});assert.equal(g.players[4].alive,true);
  g=night(fixture());g=await allVisits(g,{p6:['p5'],p7:['p5'],p4:['p1','p2']});assert.equal(g.players[4].alive,false);
  g=night(fixture());asRole(g,0,'monk');g=await allVisits(g,{p1:['p2'],p6:['p3'],p7:['p2'],p4:['p1','p2']});assert.equal(g.players[1].alive,true);
});
test('night choices are not rejected because the chooser will die before resolution',async()=>{
  let g=night(fixture());g=await allVisits(g,{p6:['p1'],p7:['p4'],p4:['p1','p2']});assert.equal(g.players[3].alive,false);assert.equal(g.players[3].info.length,0);
});
test('poison ends when poisoner dies or becomes Imp',async()=>{
  let g=night(fixture());g=await allVisits(g,{p6:['p2'],p7:['p6'],p4:['p1','p2']});assert.equal(g.poison,undefined);assert.equal(poisoned(g,g.players[1]),false);
  g=night(fixture());g=await allVisits(g,{p6:['p2'],p7:['p7'],p4:['p1','p2']});assert.equal(g.players[5].role,'imp');assert.equal(g.poison,undefined);assert.deepEqual(g.nightDeaths,['p7']);assert.equal(g.phase,'night_results');
});
test('scarlet woman takes precedence on starpass with five alive, and never attacks twice',async()=>{
  let g=night(fixture());asRole(g,5,'scarlet_woman');g=await allVisits(g,{p7:['p7'],p4:['p1','p2']});assert.equal(g.players[5].role,'imp');assert.deepEqual(g.nightDeaths,['p7']);
  g=night(fixture());asRole(g,5,'scarlet_woman');g.players[0].alive=false;g.players[1].alive=false;g.players[2].alive=false;g=await allVisits(g,{p7:['p7'],p4:['p1','p2']});assert.equal(g.players[5].role,'imp','below five, ordinary Imp self-kill can still pass to minion');
});
test('executing an Imp checks scarlet woman threshold immediately before death',async()=>{
  let g=day(fixture());asRole(g,5,'scarlet_woman');g=await ballot(g,'p1','p7',['p1','p2','p3','p4']);g=await applyCommand(g,{type:'close_day'});assert.equal(g.players[5].role,'imp');assert.equal(g.phase,'night_choices');assert.match(privateView(g,'p6').opening.join(' '),/geändert/);
  g=day(fixture());asRole(g,5,'scarlet_woman');for(const i of [0,1,2]){g.players[i].alive=false;g.publicDead.push(g.players[i].id);}g=await ballot(g,'p4','p7',['p4','p5']);g=await applyCommand(g,{type:'close_day'});assert.equal(g.winner,'good');
});
test('ravenkeeper chooses after death, gets answer before finishing, without a second trigger',async()=>{
  let g=night(fixture());asRole(g,0,'ravenkeeper');g=await allVisits(g,{p6:['p2'],p7:['p1'],p4:['p1','p2']});assert.equal(privateAction(g,g.players[0])?.kind,'ravenkeeper');
  g=await applyCommand(g,{type:'visit',playerId:'p1',targets:['p5']});assert.equal(g.queueIndex,0);assert.match(g.players[0].info.at(-1)!.text,/Soldat/);assert.equal(privateAction(g,g.players[0]),null);
  g=await applyCommand(g,{type:'visit',playerId:'p1',targets:[]});assert.equal(g.queueIndex,1);
});
test('poisoned ravenkeeper still receives a plausible answer',async()=>{
  let g=night(fixture());asRole(g,0,'ravenkeeper');g=await allVisits(g,{p6:['p1'],p7:['p1'],p4:['p1','p2']});g=await applyCommand(g,{type:'visit',playerId:'p1',targets:['p5']},choose('chef'));assert.match(g.players[0].info.at(-1)!.text,/Koch/);
});
test('drunk perspective never reveals actual identity or malfunction',()=>{
  const g=fixture(['washerwoman','chef','empath','fortune_teller','soldier','drunk','scarlet_woman','imp']);const p=g.players[5];p.apparent='fortune_teller';p.notifiedRole='fortune_teller';night(g,1);
  const view=privateView(g,p.id);assert.equal(view.character.id,'fortune_teller');assert.equal(view.action?.count,2);assert.equal(view.team,'good');assert.ok(!JSON.stringify(view).includes('"drunk"'));
});
test('fortune teller red herring gives yes; healthy information gives no otherwise',async()=>{
  let g=night(fixture(),1);g.redHerring='p1';g=await allVisits(g,{p6:['p2'],p4:['p1','p5']});assert.match(g.players[3].info.at(-1)!.text,/Ja/);
  g=night(fixture(),1);g.redHerring='p3';g=await allVisits(g,{p6:['p2'],p4:['p1','p5']});assert.match(g.players[3].info.at(-1)!.text,/Nein/);
});
test('chef counts wraparound and empath skips dead neighbors',async()=>{
  let g=night(fixture(),1);asRole(g,0,'poisoner');asRole(g,1,'chef');asRole(g,5,'soldier');g=await allVisits(g,{p1:['p4'],p4:['p1','p2']});assert.match(g.players[1].info.at(-1)!.text,/Paare: 1/);
  g=night(fixture());g.players[3].alive=false;g.players[4].alive=false;g=await allVisits(g,{p6:['p1'],p7:['p1']});assert.match(g.players[2].info.at(-1)!.text,/Nachbarn: 1/);
});
test('librarian zero, investigator pair, and healthy spy sees complete final-night Grimoire',async()=>{
  let g=night(fixture(),1);asRole(g,0,'librarian');asRole(g,1,'investigator');asRole(g,5,'spy');g=await allVisits(g,{p4:['p1','p2']});assert.match(g.players[0].info.at(-1)!.text,/0/);assert.match(g.players[1].info.at(-1)!.text,/Spion/);assert.equal(g.players[5].info.at(-1)!.grimoire!.length,7);
  g=night(fixture());asRole(g,5,'spy');g=await allVisits(g,{p7:['p1'],p4:['p1','p2']});assert.equal(g.players[5].info.at(-1)!.grimoire![0].alive,false);assert.ok(grimoire(g).some(p=>p.markers.includes('Falsche Fährte')));
});
test('starting-information options stay legal with a sole Spy and optional misregistration',async()=>{
  let g=night(fixture(),1);asRole(g,0,'investigator');asRole(g,5,'spy');
  g=await allVisits(g,{p4:['p1','p2']},async r=>({choice:r.options.at(-1)!.id,reason:'Choose a legal extreme'}));
  assert.match(g.players[0].info.at(-1)!.text,/Spion/);
  g=night(fixture(),1);asRole(g,0,'washerwoman');asRole(g,5,'spy');
  g=await allVisits(g,{p4:['p1','p2']},async r=>({choice:r.kind==='starting_information'?r.options.find(o=>o.id.startsWith('["p6"'))!.id:r.fallback,reason:'Spy as Townsfolk'}));
  assert.match(g.players[0].info.at(-1)!.text,/Felix/);
});
test('butler chooses another person without publicly revealing their master',async()=>{
  let g=night(fixture());asRole(g,0,'butler');await assert.rejects(()=>applyCommand(g,{type:'visit',playerId:'p1',targets:['p1']}));
  g=await allVisits(g,{p1:['p2'],p6:['p3'],p7:['p5'],p4:['p1','p2']});assert.equal(g.players[0].master,'p2');assert.match(privateView(g,'p1').opening.join(' '),/Ben/);assert.ok(!JSON.stringify(publicView(g)).includes('master'));
});
test('virgin executes a Townsfolk immediately; drunk nominator does not trigger it',async()=>{
  let g=day(fixture());asRole(g,0,'virgin');g=await applyCommand(g,{type:'nominate',nominator:'p2',nominee:'p1'});assert.equal(g.players[1].alive,false);assert.equal(g.phase,'night_choices');assert.equal(g.nightExecuted?.playerId,'p2');
  g=day(fixture());asRole(g,0,'virgin');asRole(g,1,'drunk','chef');g=await applyCommand(g,{type:'nominate',nominator:'p2',nominee:'p1'});assert.equal(g.players[1].alive,true);assert.equal(g.players[0].usedVirgin,true);assert.ok(g.nomination);
});
test('spy can register as Townsfolk for virgin and recluse as Demon for slayer',async()=>{
  let g=day(fixture());asRole(g,0,'virgin');asRole(g,5,'spy');g=await applyCommand(g,{type:'nominate',nominator:'p6',nominee:'p1'},choose('true'));assert.equal(g.players[5].alive,false);
  g=day(fixture());asRole(g,0,'slayer');asRole(g,1,'recluse');g=await applyCommand(g,{type:'slayer',playerId:'p1',target:'p2'},choose('true'));assert.equal(g.players[1].alive,false);assert.equal(g.phase,'nominations');
});
test('slayer bluffs have identical public no-effect announcements; poisoned use is consumed',async()=>{
  let a=day(fixture());asRole(a,0,'slayer');a.poison={source:'p6',target:'p1'};a=await applyCommand(a,{type:'slayer',playerId:'p1',target:'p7'});assert.equal(a.players[0].usedSlayer,true);assert.equal(a.players[6].alive,true);
  let b=day(fixture());b=await applyCommand(b,{type:'slayer',playerId:'p1',target:'p7'});assert.equal(a.announcement!.text,b.announcement!.text);
});
test('saint execution loses, poisoned saint does not; mayor wins only without execution',async()=>{
  let g=day(fixture());asRole(g,0,'saint');g=await ballot(g,'p2','p1',['p1','p2','p3','p4']);g=await applyCommand(g,{type:'close_day'});assert.equal(g.winner,'evil');assert.match(g.endReason!,/Heilige/);
  g=day(fixture());asRole(g,0,'saint');g.poison={source:'p6',target:'p1'};g=await ballot(g,'p2','p1',['p1','p2','p3','p4']);g=await applyCommand(g,{type:'close_day'});assert.equal(g.winner,undefined);
  g=day(fixture());asRole(g,0,'mayor');for(const i of [1,2,3,4]){g.players[i].alive=false;g.publicDead.push(g.players[i].id);}g=await applyCommand(g,{type:'close_day'});assert.equal(g.winner,'good');assert.match(g.endReason!,/Bürgermeister/);
});
test('mayor redirection respects protection at the new target',async()=>{
  let g=night(fixture());asRole(g,0,'mayor');g=await allVisits(g,{p6:['p2'],p7:['p1'],p4:['p1','p2']},choose('p5'));assert.equal(g.players[0].alive,true);assert.equal(g.players[4].alive,true);assert.equal(g.nightDeaths.length,0);
});
test('undertaker learns execution character, including virgin-triggered execution',async()=>{
  let g=night(fixture());asRole(g,0,'undertaker');g.nightExecuted={playerId:'p2',role:'chef'};g.players[1].alive=false;g=await allVisits(g,{p6:['p3'],p7:['p5'],p4:['p1','p2']});assert.match(g.players[0].info.at(-1)!.text,/Koch/);
});
test('ties require a strictly higher later vote; ghosts spend a vote only on confirmation',async()=>{
  let g=day(fixture());g.players[4].alive=false;g.publicDead.push('p5');
  g=await ballot(g,'p1','p2',['p1','p2','p5']);assert.equal(g.players[4].ghostVote,false);assert.equal(publicView(g).executionCandidate,'p2');
  g=await ballot(g,'p2','p3',['p1','p2','p3']);assert.equal(publicView(g).executionCandidate,null);assert.equal(publicView(g).tied,true);
  g=await ballot(g,'p3','p4',['p1','p2','p3','p4']);assert.equal(publicView(g).executionCandidate,'p4');
  g=await applyCommand(g,{type:'nominate',nominator:'p4',nominee:'p7'});g=await applyCommand(g,{type:'ack'});await assert.rejects(()=>applyCommand(g,{type:'vote_draft',voters:['p5']}));
});
test('nomination limits and simultaneous good victory at two living are enforced',async()=>{
  let g=day(fixture());g=await ballot(g,'p1','p2',['p1']);await assert.rejects(()=>applyCommand(g,{type:'nominate',nominator:'p1',nominee:'p3'}));await assert.rejects(()=>applyCommand(g,{type:'nominate',nominator:'p3',nominee:'p2'}));
  g=day(fixture());for(const i of [1,2,3,4]){g.players[i].alive=false;g.publicDead.push(g.players[i].id);}g=await ballot(g,'p1','p7',['p1','p6']);g=await applyCommand(g,{type:'close_day'});assert.equal(g.winner,'good');
});
test('timer pause, adjustment, expiry and global pause preserve remaining time',async()=>{
  let g=fixture();g.phase='discussion';g.timer={remainingMs:420000,deadline:421000};g=await applyCommand(g,{type:'timer',action:'toggle'},undefined,61000);assert.equal(g.timer.remainingMs,360000);assert.equal(g.timer.deadline,null);
  g=await applyCommand(g,{type:'timer',action:'adjust',seconds:60},undefined,100000);g=await applyCommand(g,{type:'timer',action:'toggle'},undefined,100000);assert.equal(g.timer.deadline,520000);
  g=await applyCommand(g,{type:'pause'},undefined,120000);assert.equal(g.timer.remainingMs,400000);assert.equal(g.timer.deadline,null);await assert.rejects(()=>applyCommand(g,{type:'nominations'}));
  g=await applyCommand(g,{type:'pause'},undefined,200000);assert.equal(g.timer.deadline,600000);g=await applyCommand(g,{type:'timer_elapsed'},undefined,600000);assert.equal(g.phase,'discussion');assert.equal(g.cue.kind,'timer');assert.equal(g.timer.remainingMs,0);
});
test('a global pause does not start an already stopped discussion timer',async()=>{
  let g=fixture();g.phase='discussion';g.timer={remainingMs:123000,deadline:null};g=await applyCommand(g,{type:'pause'},undefined,1000);g=await applyCommand(g,{type:'pause'},undefined,10000);assert.equal(g.timer.deadline,null);assert.equal(g.timer.remainingMs,123000);
});
test('invalid AI decisions fail without changing the original state',async()=>{
  const g=night(fixture(),1),before=structuredClone(g);
  await assert.rejects(allVisits(g,{p6:['p5'],p4:['p1','p2']},async()=>({choice:'INVALID',reason:'invalid'})),/ungültige Entscheidung/);
  assert.deepEqual(g,before);
});
test('deterministic simulations reach a correct ending for each supported count',async()=>{
  for(let count=7;count<=10;count++)for(let seed=11;seed<15;seed++) {
    let g=makeGame({names:names.slice(0,count),assistant:0,seed,minimumVisitMs:0});let steps=0;
    while(g.phase!=='ended'&&steps++<1000) {
      if(g.announcement){g=await applyCommand(g,{type:'ack'});continue;}
      if(['distribution','night_choices','night_results'].includes(g.phase)){const p=g.players[g.queueIndex];const a=privateAction(g,p);const targets=g.players.filter(t=>!a?.excludeSelf||t.id!==p.id).slice(0,a?.count??0).map(t=>t.id);if(a?.kind==='imp')targets[0]=g.players.find(t=>t.alive&&t.id!==p.id)?.id??p.id;g=await applyCommand(g,{type:'visit',playerId:p.id,targets});continue;}
      if(g.phase==='discussion'){g=await applyCommand(g,{type:'nominations'});continue;}
      if(g.phase==='nominations') {
        const imp=g.players.find(p=>p.alive&&p.role==='imp')!;
        const nominator=g.players.find(p=>p.alive&&!g.nominators.includes(p.id))!;
        g=await ballot(g,nominator.id,imp.id,g.players.filter(p=>p.alive).map(p=>p.id));
        g=await applyCommand(g,{type:'close_day'});
      }
    }
    assert.equal(g.phase,'ended',`count=${count},seed=${seed}`);assert.ok(g.winner);assert.ok(publicView(g).reveal);
  }
});

test('private storyteller notes flow between decisions and survive game storage',async()=>{
  let calls=0;
  const d:Decider=async r=>{
    const context=r.context as {notes:string};
    assert.equal(context.notes,calls?`Notiz ${calls}`:'');
    calls++;
    return {choice:r.fallback,reason:'Testentscheidung',notes:`Notiz ${calls}`};
  };
  const initial=night(fixture(),1);
  asRole(initial,1,'investigator');
  const g=await allVisits(initial,{},d);
  assert.ok(calls>=2);
  const restored=JSON.parse(JSON.stringify(g));
  assert.equal(restored.decisions.at(-1).notes,`Notiz ${calls}`);
  assert.ok(!JSON.stringify(publicView(g)).includes('Notiz'));
  for(const p of g.players)assert.ok(!JSON.stringify(privateView(g,p.id)).includes('Notiz'));
});

test('beginner setups allow all Outsiders and remain valid for every player count',()=>{
  for(let n=7;n<=10;n++)for(let seed=0;seed<200;seed++){
    const g=makeGame({names:names.slice(0,n),assistant:0,seed,truthfulInformation:true});
    assert.equal(g.truthfulInformation,true);
    assert.equal(g.players.length,n);
    assert.equal(g.players.filter(p=>ROLE[p.role].category==='outsider').length,(n-7)%3+(g.players.some(p=>p.role==='baron')?2:0));
    assert.match(g.announcement!.text,/Anfänger-Hausregel/);
  }
});
test('beginner setups allow explicitly assigned Recluse',()=>{
  const roles:Role[]=['washerwoman','chef','empath','fortune_teller','soldier','recluse','poisoner','imp'];
  assert.ok(makeGame({names:names.slice(0,8),assistant:0,roles,truthfulInformation:true}).players.some(p=>p.role==='recluse'));
  assert.ok(makeGame({names:names.slice(0,8),assistant:0,roles,truthfulInformation:false}).players.some(p=>p.role==='recluse'));
});
test('beginner clues allow poison misinformation but disable false trails and optional registrations',async()=>{
  let g=night(fixture(),1);g.truthfulInformation=true;g.redHerring='p2';
  g=await allVisits(g,{p6:['p2'],p4:['p2','p5']},async r=>{
    assert.notEqual(r.kind,'registration');
    if(r.kind==='misinformation'){assert.equal((r.context.request as any).recipientId,'p2');return {choice:'0',reason:'Vergifteter Koch'};}
    return testDecider(r);
  });
  assert.match(g.players[1].info.at(-1)!.text,/Paare: 0/);
  assert.match(g.players[3].info.at(-1)!.text,/Nein/);
  g=night(fixture(),1);g.truthfulInformation=true;asRole(g,5,'spy');
  g=await allVisits(g,{p4:['p2','p5']},async r=>{
    assert.notEqual(r.kind,'registration');
    for(const o of r.options){const [a,b,role]=JSON.parse(o.id);assert.ok(g.players.some(p=>[a,b].includes(p.id)&&p.role===role));}
    return testDecider(r);
  });
  assert.match(g.players[1].info.at(-1)!.text,/Paare: 1/);
});

 test('beginner mode permits Drunk setup and false starting information',async()=>{
  let g=makeGame({names:names.slice(0,8),assistant:0,roles:['washerwoman','chef','empath','fortune_teller','soldier','drunk','poisoner','imp'],truthfulInformation:true,seed:42,minimumVisitMs:0});
  asRole(g,5,'drunk','washerwoman');g=night(g,1);
  let misinformed=false;
  g=await allVisits(g,{p7:['p5']},async r=>{
    assert.notEqual(r.kind,'registration');
    if(r.kind==='misinformation'){
      assert.equal((r.context.request as any).recipientId,'p6');misinformed=true;
      const choice=JSON.stringify(['p7','p8','chef']);
      assert.ok(r.options.some(o=>o.id===choice));return {choice,reason:'Betrunkene Waschfrau'};
    }
    return testDecider(r);
  });
  assert.ok(misinformed);assert.match(g.players[5].info.at(-1)!.text,/Koch/);
 });

test('beginner mode allows Recluse registration only while healthy',async()=>{
  for(const poisonedRecluse of [false,true]){
    let g=night(fixture(['washerwoman','chef','empath','fortune_teller','soldier','recluse','poisoner','imp']),1);g.truthfulInformation=true;
    let registered=false;
    g=await allVisits(g,{p7:[poisonedRecluse?'p6':'p5'],p4:['p6','p5']},async r=>{
      if(r.kind==='registration'){
        assert.equal(poisonedRecluse,false);assert.equal((r.context.request as any).subjectId,'p6');registered=true;
        return {choice:(r.context.request as any).check==='demon'?'true':r.fallback,reason:'Einsiedler-Fähigkeit'};
      }
      return testDecider(r);
    });
    assert.equal(registered,!poisonedRecluse);
    assert.match(g.players[3].info.at(-1)!.text,poisonedRecluse?/Nein/:/Ja/);
  }
});

test('public readiness counts the current step including dead players without exposing submissions',()=>{
  const g=fixture();g.phone=true;
  assert.equal(publicView(g).readyCount,0);
  g.ready=[g.players[0].id];assert.equal(publicView(g).readyCount,1);
  g.phase='night_choices';g.players[0].alive=false;g.choices={[g.players[0].id]:[]};
  assert.equal(publicView(g).readyCount,1);
  g.choices[g.players[1].id]=[g.players[2].id];assert.equal(publicView(g).readyCount,2);
  assert.equal('choices' in publicView(g),false);assert.equal('ready' in publicView(g),false);
  g.phase='night_results';g.ready=[];assert.equal(publicView(g).readyCount,0);
  g.ready=[g.players[0].id];assert.equal(publicView(g).readyCount,1);
  g.phone=false;g.queueIndex=3;assert.equal(publicView(g).readyCount,3);
  g.phase='discussion';assert.equal(publicView(g).readyCount,0);
});
