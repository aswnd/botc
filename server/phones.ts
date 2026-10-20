import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { IncomingMessage } from 'node:http';
import { applyCommand, makeGame, privateView, publicView, requireThat } from './engine.ts';
import type { Game, GameMasterServices } from '../shared/types.ts';
import type { Store } from './store.ts';

type Member={id:string;name:string;seat:number;tokenHash:string;playerId?:string};
type Lobby={id:string;members:Member[];gameId?:string;assistantId?:string};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(24).toString('base64url');
export function createPhones(store:Store,getGame:()=>Game|null,setGame:(g:Game)=>void,services:(g:Game)=>GameMasterServices,broadcast:()=>void) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS phone_lobby(id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS phone_decisions(game_id TEXT NOT NULL, decision_key TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(game_id,decision_key));
    CREATE TABLE IF NOT EXISTS phone_commands(game_id TEXT NOT NULL, member_id TEXT NOT NULL, command_id TEXT NOT NULL, PRIMARY KEY(game_id,member_id,command_id));`);
  const saved=store.db.prepare('SELECT state FROM phone_lobby WHERE id=1').get() as {state:string}|undefined;
  let lobby:Lobby=saved?JSON.parse(saved.state, (key,value)=>key==='recoveryHash'?undefined:value):{id:randomUUID(),members:[]};
  const hostToken=secret();
  function save(){store.db.prepare('INSERT INTO phone_lobby VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(lobby));}
  function host(req:IncomingMessage){requireThat(req.headers['x-host-token']===hostToken,'Diese Steuerung ist nur am Laptop verfügbar.');}
  function bootstrap(req:IncomingMessage){requireThat(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress??''),'Die Assistenz wird am Laptop geöffnet.');return {token:hostToken};}
  function member(req:IncomingMessage){const token=req.headers['x-player-token'];requireThat(typeof token==='string'&&token.length<=100,'Bitte auf deinem Handy anmelden.');const m=lobby.members.find(m=>m.tokenHash===hash(token));requireThat(m,'Anmeldung abgelaufen. Bitte die Assistenz am Laptop um Hilfe bitten.');return m;}
  function current(){const g=getGame();return g?.phone&&g.id===lobby.gameId?g:null;}
  function view(req:IncomingMessage){const m=member(req),g=current();const identity={id:m.id,name:m.name,seat:m.seat,lobbyId:lobby.id};
    if(!g||!m.playerId)return {identity,view:null};
    const v=privateView(g,m.playerId),submitted=g.phase==='night_choices'?Object.hasOwn(g.choices,m.playerId):(g.ready??[]).includes(m.playerId);
    return {identity,view:{...v,history:store.history(g.id,m.playerId),submitted,action:submitted||g.paused||g.announcement?null:v.action,blocked:!!g.announcement||g.paused,gameId:g.id}};
  }
  function publicLobby(){return {id:lobby.id,started:!!lobby.gameId,members:lobby.members.map(({id,name,seat})=>({id,name,seat})),assistantId:lobby.assistantId,legacyArchived:!!getGame()&&!getGame()?.phone};}
  function urls(port:number){return Object.entries(networkInterfaces()).sort(([a],[b])=>Number(/^(wl|en|eth)/.test(b))-Number(/^(wl|en|eth)/.test(a))).flatMap(([,xs])=>(xs??[]).filter(x=>x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}/join`));}
  function durableServices(g:Game):GameMasterServices {const ports=g.fastNight&&['distribution','night_choices','night_results'].includes(g.phase)?{decide:async (r:Parameters<GameMasterServices['decide']>[0])=>({choice:r.fallback,reason:'Schnelle Nacht: regelkonforme lokale Auswahl.'})}:services(g);return {...ports,decide:async r=>{
    const old=store.db.prepare('SELECT result FROM phone_decisions WHERE game_id=? AND decision_key=?').get(g.id,r.key) as {result:string}|undefined;
    if(old)return JSON.parse(old.result);
    const result=await ports.decide(r);
    requireThat(result&&typeof result.reason==='string'&&r.options.some(o=>o.id===result.choice),'Ungültige KI-Entscheidung.');
    requireThat(result.notes===undefined||(typeof result.notes==='string'&&result.notes.length<=12000),'Ungültige KI-Notizen.');
    store.db.prepare('INSERT INTO phone_decisions VALUES(?,?,?)').run(g.id,r.key,JSON.stringify(result));return result;
  }};}
  let resolving=false;
  const resumed=current();
  let resolutionError=!!(resumed&&resumed.phase==='night_choices'&&resumed.players.every(p=>Object.hasOwn(resumed.choices,p.id)));
  async function resolve(){const g=current();if(!g||g.phase!=='night_choices'||g.announcement||g.paused||!g.players.every(p=>Object.hasOwn(g.choices,p.id)))return;
    resolving=true;resolutionError=false;broadcast();
    try{const next=await applyCommand(g,{type:'phone_resolve'},durableServices(g));store.save(next);setGame(next);resolving=false;resolutionError=false;broadcast();}
    catch(e){resolving=false;resolutionError=true;broadcast();throw e;}
  }
  async function post(path:string,input:any,req:IncomingMessage):Promise<unknown|undefined> {
    if(path==='/api/lobby/reset'){host(req);requireThat(!current()||current()!.phase==='ended'||input.archive===true,'Bitte das Archivieren der laufenden Runde bestätigen.');lobby={id:randomUUID(),members:[]};resolutionError=false;save();broadcast();return publicLobby();}
    if(path==='/api/lobby/register'){
      requireThat(!lobby.gameId,'Das Spiel hat bereits begonnen. Bitte die Assistenz am Laptop um Hilfe bitten.');
      requireThat(input.lobbyId===lobby.id,'Die Anmeldung gehört zu einer früheren Runde.');
      let m:Member|undefined;if(req.headers['x-player-token'])m=member(req);
      requireThat(typeof input.name==='string'&&input.name.trim().length>0&&input.name.trim().length<=32,'Bitte einen Namen mit 1–32 Zeichen eintragen.');
      requireThat(Number.isInteger(input.seat)&&input.seat>=1&&input.seat<=10,'Bitte einen Platz von 1 bis 10 wählen.');
      const name=input.name.trim();requireThat(!lobby.members.some(x=>x.id!==m?.id&&(x.seat===input.seat||x.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'))),'Name oder Sitzplatz ist bereits belegt.');
      requireThat(m||lobby.members.length<10,'Alle zehn Plätze sind belegt.');
      let token:string|undefined;
      if(m){m.name=name;m.seat=input.seat;}else{token=secret();m={id:randomUUID(),name,seat:input.seat,tokenHash:hash(token)};lobby.members.push(m);}
      save();broadcast();return {token,...viewForMember(m)};
    }
    if(path==='/api/lobby/assistant'){host(req);requireThat(!lobby.gameId,'Die Anmeldung ist geschlossen.');requireThat(lobby.members.some(m=>m.id===input.id),'Bitte eine angemeldete Person wählen.');lobby.assistantId=input.id;save();broadcast();return publicLobby();}
    if(path==='/api/lobby/start'){
      host(req);requireThat(!lobby.gameId,'Das Spiel wurde bereits gestartet.');requireThat(!current()||current()!.phase==='ended','Ein Spiel läuft bereits.');
      requireThat(typeof input.demo==='boolean','Bitte einen Spielmodus wählen.');
      requireThat(input.fastNight===undefined||typeof input.fastNight==='boolean','Bitte einen Nachtmodus wählen.');
      requireThat(input.truthfulInformation===undefined||typeof input.truthfulInformation==='boolean','Bitte einen Informationsmodus wählen.');
      const members=[...lobby.members].sort((a,b)=>a.seat-b.seat);requireThat(members.length>=7&&members.length<=10&&members.every((m,i)=>m.seat===i+1),'Benötigt werden 7–10 Personen auf lückenlosen Plätzen ab 1.');
      const assistant=members.findIndex(m=>m.id===lobby.assistantId);requireThat(assistant>=0,'Bitte eine Assistenz wählen.');
      const g=makeGame({truthfulInformation:input.truthfulInformation??!input.demo,names:members.map(m=>m.name),assistant,demo:input.demo,phone:true,fastNight:input.fastNight??true,minimumVisitMs:0});
      lobby.gameId=g.id;members.forEach((m,i)=>m.playerId=g.players[i].id);
      store.db.exec('BEGIN IMMEDIATE');try{store.db.prepare('INSERT INTO games VALUES(?,?,?)').run(g.id,JSON.stringify(g),Date.now());save();store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');const old=store.db.prepare('SELECT state FROM phone_lobby WHERE id=1').get() as {state:string}|undefined;lobby=old?JSON.parse(old.state):{id:randomUUID(),members:[]};throw e;}
      setGame(g);resolutionError=false;broadcast();return {ok:true};
    }
    if(path==='/api/player/submit'){
      const m=member(req),g=current();requireThat(g&&m.playerId,'Bitte auf den Spielstart warten.');
      requireThat(typeof input.commandId==='string'&&input.commandId.length>0&&input.commandId.length<=100,'Ungültige Befehlskennung.');
      requireThat(input.gameId===g.id,'Diese Aktion gehört zu einer früheren Runde.');
      const old=store.db.prepare('SELECT 1 FROM phone_commands WHERE game_id=? AND member_id=? AND command_id=?').get(g.id,m.id,input.commandId);
      if(!old){
        const next=await applyCommand(g,{...input,type:'phone_submit',playerId:m.playerId},durableServices(g));
        store.db.exec('BEGIN IMMEDIATE');try{
          store.db.prepare('UPDATE games SET state=?,updated=? WHERE id=?').run(JSON.stringify(next),Date.now(),next.id);
          store.db.prepare('INSERT INTO audit(game_id,command,state) VALUES(?,?,?)').run(next.id,JSON.stringify({type:'phone_submit',playerId:m.playerId}),JSON.stringify(next));
          store.db.prepare('INSERT INTO phone_commands VALUES(?,?,?)').run(g.id,m.id,input.commandId);store.db.exec('COMMIT');
        }catch(e){store.db.exec('ROLLBACK');throw e;}
        setGame(next);broadcast();
      }
      // The HTTP layer schedules resolution after returning this durable acknowledgement.
      return view(req);
    }
    if(path==='/api/player/chat'){
      const m=member(req),g=current();requireThat(g&&m.playerId,'Bitte auf den Spielstart warten.');
      requireThat(typeof input.question==='string'&&input.question.trim().length>0&&input.question.length<=1200,'Bitte eine Frage mit höchstens 1200 Zeichen stellen.');
      return {chat:{game:g,playerId:m.playerId,question:input.question.trim()}};
    }
    if(path==='/api/night/mode'){
      host(req);const g=current();requireThat(g&&!resolving&&g.phase!=='ended','Der Nachtmodus kann gerade nicht geändert werden.');
      requireThat(typeof input.fastNight==='boolean','Bitte einen Nachtmodus wählen.');
      const next={...g,fastNight:input.fastNight,version:g.version+1};store.save(next);setGame(next);broadcast();return {ok:true};
    }
    if(path==='/api/night/retry'){host(req);await resolve();return {ok:true};}
    return undefined;
  }
  function viewForMember(m:Member){return {identity:{id:m.id,name:m.name,seat:m.seat,lobbyId:lobby.id}};}
  return {host,bootstrap,member,view,post,publicLobby,urls,current,durableServices,resolve,get resolving(){return resolving;},get resolutionError(){return resolutionError;}};
}
