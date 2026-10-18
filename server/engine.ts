import { accepts, transition } from './machine.ts';
import { randomUUID } from 'node:crypto';
import { CHARACTERS, ROLE, RULES, teamOf } from '../shared/characters.ts';
import type { Role, Category } from '../shared/characters.ts';
import type { Game, Player, Command, Decider, DecisionRequest, PublicGameView, PlayerPrivateView, GrimoireEntry, CueKind, DecisionContext, GameMasterServices } from '../shared/types.ts';

export class GameError extends Error { status = 400; }
export function requireThat(condition:unknown, message:string):asserts condition { if (!condition) throw new GameError(message); }
export const player = (g:Game, id:unknown):Player => { const p=g.players.find(p=>p.id===id); if(!p) throw new GameError('Diese Person gibt es nicht.'); return p; };
export function rand(g:{seed:number}) { g.seed=(Math.imul(g.seed,1664525)+1013904223)>>>0; return g.seed/4294967296; }
export function shuffle<T>(g:{seed:number}, items:T[]) { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(rand(g)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
const living = (g:Game) => g.players.filter(p=>p.alive);
export const poisoned = (g:Game,p:Player) => !!g.poison && g.poison.target===p.id && g.players.some(s=>s.id===g.poison!.source&&s.alive&&s.role==='poisoner');
export const healthy = (g:Game,p:Player) => p.role!=='drunk'&&!poisoned(g,p);
export const active = (g:Game,p:Player) => p.alive&&healthy(g,p);
const pushInfo=(g:Game,p:Player,text:string,grimoire?:GrimoireEntry[])=>p.info.push({night:g.night,text,...(grimoire?{grimoire}:{})});
export function cue(g:Game,kind:CueKind) {g.cue={id:g.cue.id+1,kind};}
function event(g:Game,text:string) {g.events.push({day:g.day,night:g.night,text});}
function secretEvent(g:Game,text:string) {g.story.push({day:g.day,night:g.night,text});}
function announce(g:Game,title:string,text:string) {g.announcement={id:randomUUID(),title,text};cue(g,'assistant');}
const missingDecider:Decider=async()=>{throw new GameError('KI-Spielleitung nicht verbunden.');};
async function decide(g:Game,d:Decider,r:DecisionRequest):Promise<string> {
  const cached=g.decisions.find(x=>x.key===r.key);if(cached)return cached.choice;
  requireThat(r.options.length>0&&r.options.some(o=>o.id===r.fallback),'Keine legale Spielleitungsentscheidung verfügbar.');
  const a=await d(structuredClone({...r,context:decisionContext(g,r.context)}));
  requireThat(a&&typeof a.reason==='string'&&r.options.some(o=>o.id===a.choice),'Die KI hat eine ungültige Entscheidung geliefert. Bitte erneut versuchen.');
  requireThat(a.notes===undefined||(typeof a.notes==='string'&&a.notes.length<=12000),'Die KI hat ungültige Spielleitungsnotizen geliefert. Bitte erneut versuchen.');
  g.decisions.push({key:r.key,kind:r.kind,choice:a.choice,reason:String(a.reason).slice(0,500),...(a.plan?{plan:a.plan}:{}),...(a.notes!==undefined?{notes:a.notes}:{})});return a.choice;
}
export function decisionContext(g:Game,request:unknown=null):DecisionContext {
  return structuredClone({schemaVersion:1,gameId:g.id,phase:g.phase,night:g.night,day:g.day,
    grimoire:grimoire(g),choices:g.choices,redHerring:g.redHerring,bluffs:g.bluffs,
    information:g.players.map(p=>({playerId:p.id,apparent:p.apparent,history:p.info})),
    notes:g.decisions.findLast(record=>record.notes!==undefined)?.notes??'',recentDecisions:g.decisions,request});
}
function options(items:string[]) {return [...new Set(items)].map(id=>({id,label:id}));}
export function makeGame(input:{names:string[];assistant:number;demo?:boolean;seed?:number;minimumVisitMs?:number;roles?:Role[]}):Game {
  requireThat(Array.isArray(input.names)&&input.names.length>=7&&input.names.length<=10,'Bitte 7 bis 10 Personen eintragen.');
  const names=input.names.map(n=>String(n).trim());
  requireThat(names.every(n=>n.length>0&&n.length<=32)&&new Set(names.map(n=>n.toLocaleLowerCase('de'))).size===names.length,'Namen müssen eindeutig sein und 1–32 Zeichen haben.');
  requireThat(Number.isInteger(input.assistant)&&input.assistant>=0&&input.assistant<names.length,'Bitte eine Assistenz wählen.');
  const seed={seed:input.seed??Math.floor(Math.random()*0xffffffff)};
  const minions=names.length===10?2:1;let outsiders=(names.length-7)%3;
  const minionRoles=shuffle(seed,CHARACTERS.filter(c=>c.category==='minion').map(c=>c.id)).slice(0,minions);
  if(minionRoles.includes('baron'))outsiders+=2;
  const outside=shuffle(seed,CHARACTERS.filter(c=>c.category==='outsider').map(c=>c.id)).slice(0,outsiders);
  const townPool=shuffle(seed,CHARACTERS.filter(c=>c.category==='townsfolk').map(c=>c.id));
  // First games always get some immediately useful information, without publishing a fixed role set.
  const starter=shuffle(seed,['washerwoman','chef','empath','fortune_teller'] as Role[]).slice(0,2);
  const town=[...starter,...townPool.filter(r=>!starter.includes(r))].slice(0,names.length-minions-outsiders-1);
  const roles=input.roles??shuffle(seed,[...town,...outside,...minionRoles,'imp'] as Role[]);
  requireThat(roles.length===names.length&&roles.every(r=>!!ROLE[r])&&new Set(roles).size===roles.length&&roles.filter(r=>r==='imp').length===1,'Ungültige Charakterverteilung.');
  const expectedOutside=(names.length-7)%3+(roles.includes('baron')?2:0);
  requireThat(roles.filter(r=>ROLE[r].category==='outsider').length===expectedOutside&&roles.filter(r=>ROLE[r].category==='minion').length===minions,'Charakteranzahl entspricht nicht der Aufstellung.');
  const drunkMask=townPool.find(r=>!roles.includes(r))!;
  const players:Player[]=names.map((name,i)=>({id:`p${i+1}`,name,seat:i,role:roles[i],apparent:roles[i]==='drunk'?drunkMask:roles[i],team:teamOf(roles[i]),alive:true,ghostVote:true,usedSlayer:false,usedVirgin:false,info:[],notifiedRole:roles[i]==='drunk'?drunkMask:roles[i]}));
  const good=players.filter(p=>p.team==='good');
  const bluffs=shuffle(seed,CHARACTERS.filter(c=>['townsfolk','outsider'].includes(c.category)&&!roles.includes(c.id)&&!players.some(p=>p.apparent===c.id)).map(c=>c.id)).slice(0,3);
  const g:Game={id:randomUUID(),version:0,seed:seed.seed,demo:!!input.demo,createdAt:Date.now(),phase:'distribution',night:0,day:0,players,assistantId:players[input.assistant].id,queueIndex:0,choices:{},resultDone:[],redHerring:good[Math.floor(rand(seed)*good.length)].id,bluffs,nightDeaths:[],publicDead:[],ravenPending:[],ravenPoisoned:{},nightStartAlive:[],nominated:[],nominators:[],ballots:[],voteDraft:[],cue:{id:0,kind:'assistant'},timer:{remainingMs:420000,deadline:null},paused:false,events:[],decisions:[],minimumVisitMs:input.minimumVisitMs??10000,infoMarkers:{},story:[]};
  announce(g,'Willkommen in Ravenswood Bluff',RULES.map(r=>`${r.title}: ${r.text}`).join('\n\n')+'\n\nZuerst kommt jede Person einzeln zum Laptop und liest ihren geheimen Charakter. Noch nicht über Rollen sprechen, bis die erste Nacht vorbei ist.');
  g.infoMarkers={};g.story=[];event(g,'Die Stadt versammelt sich.');return g;
}
export function nextVisitor(g:Game) { return ['distribution','night_choices','night_results'].includes(g.phase)?g.players[g.queueIndex]??null:null; }
export function privateAction(g:Game,p:Player):PlayerPrivateView['action'] {
  if(g.phase==='night_results'&&g.ravenPending.includes(p.id)&&!g.resultDone.includes(p.id))return {kind:'ravenkeeper',count:1,excludeSelf:false,prompt:'Wähle eine Person, deren Charakter du erfahren möchtest.'};
  if(g.phase!=='night_choices'||!p.alive)return null;
  const r=p.apparent;
  if(r==='poisoner')return {kind:r,count:1,excludeSelf:false,prompt:'Wen möchtest du heute Nacht vergiften?'};
  if(r==='monk'&&g.night>1)return {kind:r,count:1,excludeSelf:true,prompt:'Wen möchtest du vor dem Dämon schützen?'};
  if(r==='imp'&&g.night>1)return {kind:r,count:1,excludeSelf:false,prompt:'Wen möchtest du heute Nacht angreifen?'};
  if(r==='fortune_teller')return {kind:r,count:2,excludeSelf:false,prompt:'Wähle zwei verschiedene Personen für deine Frage.'};
  if(r==='butler')return {kind:r,count:1,excludeSelf:true,prompt:'Wessen Abstimmung möchtest du morgen folgen?'};
  return null;
}
export function privateView(g:Game,id:string):PlayerPrivateView {
  const p=player(g,id);const opening:string[]=[];
  if(g.phase==='night_choices'&&g.night===1&&p.team==='evil') {
    if(ROLE[p.role].category==='minion')opening.push(`Der Dämon ist ${g.players.find(x=>x.role==='imp')!.name}.`, `Andere Handlanger: ${g.players.filter(x=>x.id!==p.id&&ROLE[x.role].category==='minion').map(x=>x.name).join(', ')||'keine'}.`);
    if(p.role==='imp')opening.push(`Deine Handlanger: ${g.players.filter(x=>ROLE[x.role].category==='minion').map(x=>x.name).join(', ')}.`,`Diese guten Charaktere wurden nicht vergeben: ${g.bluffs.map(r=>ROLE[r].name).join(', ')}.`);
  }
  if(p.notifiedRole!==p.apparent)opening.push(`Dein Charakter hat sich geändert: Du bist jetzt ${ROLE[p.apparent].name}.`);
  if(p.apparent==='butler'&&p.master)opening.push(`Deine zuletzt gewählte Person: ${player(g,p.master).name}. Beachte beim Abstimmen deine Fähigkeit, solange du lebst.`);
  const info=p.info.filter(i=>g.phase==='night_results'||!['night_choices','distribution'].includes(g.phase)||i.night<g.night).map(i=>{
    if(g.phase==='night_choices'||g.phase==='night_results'||g.phase==='ended')return i;
    const {grimoire,...information}=i;
    return information;
  });
  return {id:p.id,name:p.name,character:ROLE[p.apparent],team:p.team,info:structuredClone(info),opening,action:privateAction(g,p),targets:g.players.map(x=>({id:x.id,name:x.name,seat:x.seat,alive:!g.publicDead.includes(x.id),ghostVote:x.ghostVote})),phase:g.phase,night:g.night,history:[],minimumVisitMs:g.minimumVisitMs};
}
export function grimoire(g:Game):GrimoireEntry[] {return g.players.map(p=>({id:p.id,name:p.name,seat:p.seat,character:p.role,team:p.team,alive:p.alive,markers:[...(p.role==='drunk'?[`Hält sich für ${ROLE[p.apparent].name}`]:[]),...(poisoned(g,p)?['Vergiftet']:[]),...(g.protection?.target===p.id&&active(g,player(g,g.protection.source))?['Geschützt']:[]),...(g.redHerring===p.id?['Falsche Fährte']:[]),...(p.master?[`Butler folgt ${player(g,p.master).name}`]:[]),...(g.infoMarkers?.[p.id]??[])]}));}
export function executionStanding(g:Game) {
  const threshold=Math.ceil(living(g).length/2);const max=Math.max(0,...g.ballots.map(b=>b.total));const leaders=g.ballots.filter(b=>b.total===max&&b.total>=threshold);
  return {threshold,executionCandidate:leaders.length===1?leaders[0].nominee:null,tied:leaders.length>1};
}
export function publicView(g:Game):PublicGameView {
  const pub=(p:Player)=>({id:p.id,name:p.name,seat:p.seat,alive:!g.publicDead.includes(p.id),ghostVote:p.ghostVote});
  const n=nextVisitor(g);
  return {id:g.id,version:g.version,demo:g.demo,phase:g.phase,day:g.day,night:g.night,players:g.players.map(pub),assistantId:g.assistantId,nextPlayer:n?pub(n):null,announcement:g.announcement?{...g.announcement}:undefined,cue:{...g.cue},timer:{...g.timer},paused:g.paused,nomination:g.nomination?{...g.nomination}:undefined,ballots:structuredClone(g.ballots),voteDraft:[...g.voteDraft],nominators:[...g.nominators],nominated:[...g.nominated],...executionStanding({...g,players:g.players.map(p=>({...p,alive:!g.publicDead.includes(p.id)}))}),events:structuredClone(g.events),winner:g.winner,endReason:g.endReason,...(g.phase==='ended'||g.demo?{reveal:grimoire(g)}:{}),...(g.phase==='ended'?{debrief:structuredClone(g.story)}:{}),minimumVisitMs:g.minimumVisitMs};
}
function startNight(g:Game,precedingText='') {
  transition(g,'night_choices');g.night++;g.queueIndex=0;g.choices={};g.resultDone=[];g.nightDeaths=[];g.ravenPending=[];g.ravenPoisoned={};g.nightStartAlive=living(g).map(p=>p.id);g.poison=undefined;g.protection=undefined;g.nightExecuted=g.executed;g.executed=undefined;g.timer={remainingMs:420000,deadline:null};
  announce(g,`Nacht ${g.night}`, precedingText+'Die Nacht beginnt. Bitte nicht miteinander sprechen. Jede Person besucht den Laptop zweimal. In Runde A trefft ihr Entscheidungen, in Runde B erhaltet ihr Ergebnisse. Auch wer tot ist oder keine nächtliche Fähigkeit hat, kommt in beiden Runden. Achtet auf euren Namen am Beamer.');
}
function finish(g:Game,winner:'good'|'evil',reason:string) {transition(g,'ended');g.winner=winner;g.endReason=reason;g.publicDead=g.players.filter(p=>!p.alive).map(p=>p.id);g.timer.deadline=null;event(g,reason);announce(g,winner==='good'?'Die Dorfbewohner gewinnen':'Die Bösen gewinnen',reason+' Alle Charaktere werden jetzt aufgedeckt.');}
function victory(g:Game) {if(g.phase==='ended')return; if(!living(g).some(p=>p.role==='imp'))finish(g,'good','Kein Dämon lebt mehr.');else if(living(g).length<=2)finish(g,'evil','Nur noch zwei Personen leben und der Dämon hat überlebt.');}
async function register(g:Game,p:Player,category:'alignment'|'character'|'townsfolk'|'demon',key:string,d:Decider):Promise<string> {
  const actual=category==='alignment'?p.team:category==='character'?p.role:category==='townsfolk'?String(ROLE[p.role].category==='townsfolk'):String(p.role==='imp');
  if(!healthy(g,p)||!['recluse','spy'].includes(p.role))return actual;
  let choices:string[]=[actual];
  if(p.role==='recluse') {
    if(category==='alignment')choices=['good','evil'];
    if(category==='character')choices=['recluse','poisoner','spy','scarlet_woman','baron','imp'];
    if(category==='demon')choices=['false','true'];
  }else {
    if(category==='alignment')choices=['evil','good'];
    if(category==='character')choices=['spy',...CHARACTERS.filter(c=>['townsfolk','outsider'].includes(c.category)).map(c=>c.id)];
    if(category==='townsfolk')choices=['false','true'];
  }
  if(choices.length===1)return actual;
  return decide(g,d,{key,kind:'registration',prompt:`Wie registriert ${p.name} (${ROLE[p.role].name}) für diese einzelne Prüfung (${category})? Keine zusätzlichen Fähigkeiten erzeugen.`,options:options(choices),fallback:actual,context:{subjectId:p.id,check:category,actual}});
}
async function kill(g:Game,p:Player,cause:'demon'|'execution'|'slayer',d:Decider,redirected=false):Promise<boolean> {
  if(!p.alive)return false;
  if(cause==='demon') {
    if(p.role==='soldier'&&active(g,p)){secretEvent(g,`${p.name} überlebt den Dämonenangriff dank der Soldatenfähigkeit.`);return false;}
    if(g.protection?.target===p.id&&active(g,player(g,g.protection.source))){secretEvent(g,`${p.name} überlebt den Dämonenangriff dank des Mönchs.`);return false;}
    if(p.role==='mayor'&&active(g,p)&&!redirected) {
      const candidates=g.players.filter(x=>x.id!==p.id);
      const chosen=await decide(g,d,{key:`${g.night}:mayor:${p.id}`,kind:'mayor',prompt:'Der Bürgermeister wird vom Dämon angegriffen. Wähle ihn selbst oder eine Umleitung. Schutz gilt auch am neuen Ziel.',options:g.players.map(x=>({id:x.id,label:x.name})),fallback:candidates.find(x=>x.alive)?.id??p.id,context:{subjectId:p.id,cause,redirected}});
      if(chosen!==p.id){secretEvent(g,`Der Bürgermeister lenkt den Angriff von ${p.name} auf ${player(g,chosen).name} um.`);return kill(g,player(g,chosen),cause,d,true);}
    }
  }
  const before=living(g).length;const valid=healthy(g,p);
  const successor=p.role==='imp'?g.players.find(x=>x.role==='scarlet_woman'&&active(g,x)&&before>=5):undefined;
  const starpass=p.role==='imp'&&cause==='demon'&&g.choices[p.id]?.[0]===p.id&&valid;
  const raven=p.apparent==='ravenkeeper'&&cause==='demon';
  // Capture Ravenkeeper poisoning at death; later loss of its source can restore the ability.
  if(raven){g.ravenPending.push(p.id);g.ravenPoisoned[p.id]=!valid;}
  p.alive=false;
  if(g.poison?.source===p.id)g.poison=undefined;
  if(g.protection?.source===p.id)g.protection=undefined;
  if(cause==='demon')g.nightDeaths.push(p.id);else {if(!g.publicDead.includes(p.id))g.publicDead.push(p.id);event(g,`${p.name} stirbt ${cause==='execution'?'durch Hinrichtung':'nach einem öffentlichen Schuss'}.`);}
  if(cause==='execution')g.executed={playerId:p.id,role:p.role};
  if(p.role==='saint'&&cause==='execution'&&valid){finish(g,'evil',`${p.name} war der Heilige und starb durch Hinrichtung.`);return true;}
  let next=successor;
  if(!next&&starpass) {
    const candidates=living(g).filter(x=>ROLE[x.role].category==='minion');
    if(candidates.length)next=player(g,await decide(g,d,{key:`${g.night}:starpass`,kind:'succession',prompt:'Der Imp hat sich selbst getötet. Wähle einen lebenden Handlanger als Nachfolger.',options:candidates.map(x=>({id:x.id,label:x.name})),fallback:candidates[0].id,context:{deadDemonId:p.id,cause,starpass}}));
  }
  if(next) {
    secretEvent(g,`${next.name} wird nach dem Tod von ${p.name} zum Imp.`);
    next.role='imp';next.apparent='imp';if(g.poison?.source===next.id)g.poison=undefined;if(g.protection?.source===next.id)g.protection=undefined;
    pushInfo(g,next,'Dein Charakter hat sich geändert: Du bist jetzt der Imp.');
  }
  victory(g);return true;
}
async function infoCharacter(g:Game,target:Player,recipient:Player,key:string,d:Decider,malfunction=false) {
  if(malfunction)return decide(g,d,{key,kind:'misinformation',prompt:`${recipient.name} erhält wegen Betrunkenheit oder Vergiftung eine Charakterinformation über ${target.name}. Wähle einen plausiblen Charakter.`,options:options(CHARACTERS.map(c=>c.id)),fallback:target.apparent,context:{recipientId:recipient.id,targetId:target.id,malfunction}});
  return register(g,target,'character',key,d);
}
async function numberInfo(g:Game,p:Player,n:number,max:number,key:string,d:Decider) {
  if(!healthy(g,p))return Number(await decide(g,d,{key,kind:'misinformation',prompt:`${p.name} glaubt, ${ROLE[p.apparent].name} zu sein, hat aber keine funktionierende Fähigkeit. Wähle eine plausible Zahl.`,options:options(Array.from({length:max+1},(_,i)=>String(i))),fallback:String((n+1)%(max+1)),context:{recipientId:p.id,correctNumber:n,maximum:max,malfunction:true}}));
  return n;
}
async function startingPair(g:Game,p:Player,category:Category,d:Decider) {
  const key=`${g.night}:pair:${p.id}`;const valid=healthy(g,p);
  const tuples:{id:string;label:string}[]=[];
  // Offer complete legal information tuples, rather than independently choosing
  // registrations that could leave an Investigator with no eligible Minion.
  for(const a of g.players)for(const b of g.players.filter(b=>b.id!==a.id)) {
    let chars:Role[]=ROLE[a.role].category===category?[a.role]:[];
    if(!valid||(healthy(g,a)&&((a.role==='spy'&&['townsfolk','outsider'].includes(category))||(a.role==='recluse'&&category==='minion'))))chars=CHARACTERS.filter(c=>c.category===category).map(c=>c.id);
    for(const c of chars)tuples.push({id:JSON.stringify([a.id,b.id,c]),label:`${a.name} oder ${b.name}: ${ROLE[c].name}`});
  }
  const actualOutsiders=g.players.filter(x=>ROLE[x.role].category==='outsider');
  const zeroAllowed=category==='outsider'&&(!valid||actualOutsiders.every(x=>x.role==='recluse'&&healthy(g,x)));
  if(zeroAllowed)tuples.push({id:'zero',label:'Keine Außenseiter: 0'});
  requireThat(tuples.length,'Keine legale Anfangsinformation.');
  const preferred=tuples.filter(t=>t.id!=='zero'&&!t.id.startsWith(`["${p.id}"`));
  const fallback=zeroAllowed&&actualOutsiders.length===0?'zero':(preferred.length?preferred:tuples)[Math.floor(rand(g)*(preferred.length||tuples.length))].id;
  const choice=await decide(g,d,{key,kind:valid?'starting_information':'misinformation',prompt:`Wähle die Anfangsinformation für ${p.name} (${ROLE[p.apparent].name}). ${valid?'Die Auswahl wurde einschließlich erlaubter Fehlregistrierung regelkonform eingeschränkt.':'Die Fähigkeit ist gestört; plausible Fehlinformation ist erlaubt.'}`,options:tuples,fallback,context:{recipientId:p.id,category,functioning:valid}});
  if(choice==='zero'){pushInfo(g,p,'Es sind keine Außenseiter im Spiel: 0.');return;}
  const [a,b,r]=JSON.parse(choice) as [string,string,Role];const pair=shuffle(g,[player(g,a).name,player(g,b).name]);
  (g.infoMarkers[a]??=[]).push(`${ROLE[p.apparent].name}: ${ROLE[r].name}`);
  (g.infoMarkers[b]??=[]).push(`${ROLE[p.apparent].name}: Falsch`);
  pushInfo(g,p,`${pair[0]} oder ${pair[1]} ist ${ROLE[r].name}.`);
}
async function resolveNight(g:Game,d:Decider) {
  // Choice collection is not resolution. Always resolve by the official night sheet.
  const poisoner=g.players.find(p=>p.role==='poisoner'&&p.alive);
  if(poisoner&&active(g,poisoner)&&g.choices[poisoner.id]?.[0]){g.poison={source:poisoner.id,target:g.choices[poisoner.id][0]};secretEvent(g,`${poisoner.name} vergiftet ${player(g,g.poison.target).name}.`);}
  if(g.night>1) {
    const monk=g.players.find(p=>p.role==='monk'&&active(g,p));
    if(monk&&g.choices[monk.id]?.[0]){g.protection={source:monk.id,target:g.choices[monk.id][0]};secretEvent(g,`${monk.name} schützt ${player(g,g.protection.target).name}.`);}
    // Capture original Imp: a new Imp created by this attack does not attack again.
    const imp=g.players.find(p=>p.role==='imp'&&active(g,p));
    if(imp&&g.choices[imp.id]?.[0]){secretEvent(g,`${imp.name} greift ${player(g,g.choices[imp.id][0]).name} an.`);await kill(g,player(g,g.choices[imp.id][0]),'demon',d);}
    if(g.phase==='ended')return;
  }
  if(g.night===1)for(const [r,cat] of [['washerwoman','townsfolk'],['librarian','outsider'],['investigator','minion']] as [Role,Category][]) {
    for(const p of g.players.filter(p=>p.alive&&p.apparent===r))await startingPair(g,p,cat,d);
  }
  if(g.night===1)for(const p of g.players.filter(p=>p.alive&&p.apparent==='chef')) {
    const evil:boolean[]=[];for(const t of g.players)evil.push((await register(g,t,'alignment',`1:chef:${p.id}:${t.id}`,d))==='evil');
    const n=evil.reduce((s,e,i)=>s+Number(e&&evil[(i+1)%evil.length]),0);
    pushInfo(g,p,`Benachbarte böse Paare: ${await numberInfo(g,p,n,g.players.length,`1:chef:${p.id}:number`,d)}.`);
  }
  for(const p of g.players.filter(p=>p.alive&&p.apparent==='empath')) {
    const alive=living(g);const i=alive.findIndex(x=>x.id===p.id);const neighbors=[alive[(i-1+alive.length)%alive.length],alive[(i+1)%alive.length]];
    let n=0;for(const t of neighbors)n+=Number((await register(g,t,'alignment',`${g.night}:empath:${p.id}:${t.id}`,d))==='evil');
    pushInfo(g,p,`Personen aus dem Team „die Bösen“ unter deinen zwei lebenden Nachbarn: ${await numberInfo(g,p,n,2,`${g.night}:empath:${p.id}:number`,d)}.`);
  }
  for(const p of g.players.filter(p=>p.alive&&p.apparent==='fortune_teller')) {
    const targets=g.choices[p.id]??[];let yes=false;
    for(const id of targets)yes=(await register(g,player(g,id),'demon',`${g.night}:fortune:${p.id}:${id}`,d))==='true'||id===g.redHerring||yes;
    if(!healthy(g,p))yes=(await decide(g,d,{key:`${g.night}:fortune:${p.id}:misinfo`,kind:'misinformation',prompt:`Die Fähigkeit von ${p.name} ist gestört. Wähle eine plausible Antwort.`,options:options(['yes','no']),fallback:yes?'no':'yes',context:{recipientId:p.id,targets,correctAnswer:yes,malfunction:true}}))==='yes';
    pushInfo(g,p,`${targets.map(id=>player(g,id).name).join(' und ')}: ${yes?'Ja':'Nein'}.`);
  }
  for(const p of g.players.filter(p=>p.alive&&p.apparent==='butler'))if(g.choices[p.id]?.[0]) {p.master=g.choices[p.id][0];pushInfo(g,p,`Deine gewählte Person für morgen: ${player(g,p.master).name}. Du darfst nur abstimmen, wenn sie ebenfalls abstimmt.`);}
  if(g.night>1&&g.nightExecuted)for(const p of g.players.filter(p=>p.alive&&p.apparent==='undertaker')) {
    const target=player(g,g.nightExecuted.playerId);const r=await infoCharacter(g,target,p,`${g.night}:undertaker:${p.id}`,d,!healthy(g,p));
    pushInfo(g,p,`Durch Hinrichtung gestorben: ${ROLE[r as Role].name}.`);
  }
  for(const p of g.players.filter(p=>p.alive&&p.apparent==='spy')) {
    let snapshot=grimoire(g);
    if(!healthy(g,p)) {
      const swapped=shuffle(g,snapshot.map(x=>x.character));snapshot=snapshot.map((x,i)=>({...x,character:swapped[i],markers:[]}));
    }
    pushInfo(g,p,'Das Grimoire zum Zeitpunkt deiner nächtlichen Fähigkeit.',snapshot);
  }
  transition(g,'night_results');g.queueIndex=0;cue(g,'player');
}
function dawn(g:Game) {
  g.publicDead=g.players.filter(p=>!p.alive).map(p=>p.id);g.protection=undefined;g.day=g.night;transition(g,'dawn');g.nominated=[];g.nominators=[];g.ballots=[];g.voteDraft=[];g.nomination=undefined;
  const text=g.nightDeaths.length?`${g.nightDeaths.map(id=>player(g,id).name).join(' und ')} ${g.nightDeaths.length===1?'ist':'sind'} in der Nacht gestorben.`:'In dieser Nacht ist niemand gestorben.';
  event(g,text);announce(g,`Tag ${g.day} · Der Morgen`,`${text} Tote bleiben im Spiel und behalten ihre letzte Stimme. Jetzt könnt ihr diskutieren und euch unter vier Augen austauschen.`);
}
async function reduceCommand(original:Game,command:Command,d:Decider,now:number):Promise<Game> {
  requireThat(accepts(original,command),'Dieser Spielbefehl ist im aktuellen Zustand nicht verfügbar.');
  const g=structuredClone(original);const type=command.type;
  if(type==='timer_elapsed') {if(g.timer.deadline!==null&&g.timer.deadline<=now){g.timer={remainingMs:0,deadline:null};cue(g,'timer');}else return g;}
  else if(type==='pause') {g.paused=!g.paused;if(g.paused){g.resumeTimer=g.timer.deadline!==null;if(g.timer.deadline!==null){g.timer.remainingMs=Math.max(0,g.timer.deadline-now);g.timer.deadline=null;}}else if(g.resumeTimer&&g.phase==='discussion'&&g.timer.remainingMs>0)g.timer.deadline=now+g.timer.remainingMs;}
  else {
    requireThat(!g.paused,'Das Spiel ist pausiert.');
    if(type==='ack') {
      requireThat(g.announcement,'Es gibt keinen neuen Vorlesetext.');g.announcement=undefined;
      if(g.phase==='dawn'){transition(g,'discussion');g.timer={remainingMs:420000,deadline:now+420000};cue(g,'attention');}
      else if(g.phase==='night_choices')cue(g,'night');else if(nextVisitor(g))cue(g,'player');
    }else if(type==='visit') {
      requireThat(!g.announcement,'Bitte zuerst den öffentlichen Vorlesetext bestätigen.');
      const p=player(g,command.playerId);requireThat(nextVisitor(g)?.id===p.id,'Bitte die angezeigte Reihenfolge einhalten.');
      const action=privateAction(g,p);const targets=command.targets??[];
      requireThat(Array.isArray(targets)&&targets.every(x=>typeof x==='string'),'Ungültige Auswahl.');
      if(action){requireThat(targets.length===action.count&&new Set(targets).size===targets.length,'Bitte die erforderliche Anzahl verschiedener Personen auswählen.');for(const id of targets){player(g,id);requireThat(!action.excludeSelf||id!==p.id,'Bitte eine andere Person wählen.');}}
      else requireThat(targets.length===0,'In diesem Besuch ist keine Auswahl erforderlich.');
      p.notifiedRole=p.apparent;
      if(g.phase==='night_choices'&&g.night===1&&p.team==='evil')for(const text of privateView(g,p.id).opening)pushInfo(g,p,text);
      if(g.phase==='night_choices')g.choices[p.id]=targets as string[];
      if(g.phase==='night_results') {
        if(action?.kind==='ravenkeeper') {
          const r=await infoCharacter(g,player(g,targets[0]),p,`${g.night}:raven:${p.id}`,d,!healthy(g,p));
          pushInfo(g,p,`${player(g,targets[0]).name} ist ${ROLE[r as Role].name}.`);
          g.resultDone.push(p.id);
          // Keep this visit open for the newly delivered answer; another confirmation closes it.
          g.version++;return g;
        }
        g.resultDone.push(p.id);
      }
      g.queueIndex++;
      if(g.queueIndex===g.players.length){if(g.phase==='distribution')startNight(g);else if(g.phase==='night_choices')await resolveNight(g,d);else dawn(g);}else cue(g,'player');
    }else if(type==='replay')cue(g,g.cue.kind);
    else if(type==='attention')cue(g,'attention');
    else if(type==='timer') {
      requireThat(g.phase==='discussion','Der Diskussionstimer ist nur während der Diskussion verfügbar.');
      const left=g.timer.deadline===null?g.timer.remainingMs:Math.max(0,g.timer.deadline-now);
      if(command.action==='toggle')g.timer=g.timer.deadline===null?{remainingMs:left,deadline:left>0?now+left:null}:{remainingMs:left,deadline:null};
      else {requireThat(command.action==='adjust'&&Number.isFinite(command.seconds)&&Math.abs(Number(command.seconds))<=600,'Ungültige Timeränderung.');const ms=Math.max(0,Math.min(3600000,left+Number(command.seconds)*1000));g.timer={remainingMs:ms,deadline:g.timer.deadline===null?null:now+ms};}
    }else {
      requireThat(!g.announcement,'Bitte zuerst den Vorlesetext bestätigen.');
      if(type==='nominations') {requireThat(g.phase==='discussion','Die Diskussion läuft gerade nicht.');transition(g,'nominations');g.timer.deadline=null;announce(g,'Nominierungen sind eröffnet','Lebende Personen dürfen einmal nominieren. Jede Person kann heute einmal nominiert werden. Nach Anklage und Verteidigung stimmen wir reihum ab. Tote besitzen nur eine letzte Stimme für den Rest des Spiels.');}
      else if(type==='nominate') {
        requireThat(g.phase==='nominations'&&!g.nomination,'Bitte zuerst die laufende Abstimmung abschließen.');
        const a=player(g,command.nominator),b=player(g,command.nominee);
        requireThat(a.alive&&!g.nominators.includes(a.id),'Diese Person kann heute nicht mehr nominieren.');requireThat(!g.nominated.includes(b.id),'Diese Person wurde heute schon nominiert.');
        g.nominators.push(a.id);g.nominated.push(b.id);
        if(b.role==='virgin'&&!b.usedVirgin) {
          b.usedVirgin=true;
          if(active(g,b)&&(await register(g,a,'townsfolk',`${g.day}:virgin:${b.id}`,d))==='true') {
            await kill(g,a,'execution',d);if(g.phase!=='ended')startNight(g,`${a.name} wird sofort hingerichtet. Der Tag ist vorbei.\n\n`);return {...g,version:g.version+1};
          }
        }
        if(b.role==='drunk'&&b.apparent==='virgin')b.usedVirgin=true;
        g.nomination={nominator:a.id,nominee:b.id};g.voteDraft=[];event(g,`${a.name} nominiert ${b.name}.`);announce(g,'Anklage und Verteidigung',`${a.name} nominiert ${b.name}. Lasst beide kurz sprechen. Danach werden die Hände im Uhrzeigersinn gezählt; ${b.name} stimmt zuletzt ab. Mindestens ${Math.ceil(living(g).length/2)} Stimmen sind nötig.`);
      }else if(type==='vote_draft') {
        requireThat(g.phase==='nominations'&&g.nomination,'Es läuft keine Abstimmung.');const ids=command.voters;
        requireThat(Array.isArray(ids)&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length,'Ungültige Stimmenliste.');
        for(const id of ids){const p=player(g,id);requireThat(p.alive||p.ghostVote,'Eine tote Person hat ihre letzte Stimme bereits verbraucht.');}g.voteDraft=ids as string[];
      }else if(type==='vote_confirm') {
        requireThat(g.phase==='nominations'&&g.nomination,'Es läuft keine Abstimmung.');
        for(const id of g.voteDraft){const p=player(g,id);requireThat(p.alive||p.ghostVote,'Eine letzte Stimme wurde bereits verbraucht.');if(!p.alive)p.ghostVote=false;}
        const nominee=g.nomination.nominee;g.ballots.push({nominee,voters:[...g.voteDraft],total:g.voteDraft.length});event(g,`${player(g,nominee).name}: ${g.voteDraft.length} Stimmen.`);g.nomination=undefined;g.voteDraft=[];const s=executionStanding(g);
        announce(g,'Abstimmung abgeschlossen',`${player(g,nominee).name} erhält ${g.ballots.at(-1)!.total} Stimmen. ${s.executionCandidate?`${player(g,s.executionCandidate).name} steht zur Hinrichtung.`:s.tied?'Gleichstand: Aktuell wird niemand hingerichtet.':'Aktuell wird niemand hingerichtet.'} Weitere Nominierungen sind möglich.`);
      }else if(type==='close_day') {
        requireThat(g.phase==='nominations'&&!g.nomination,'Bitte erst alle Abstimmungen abschließen.');const s=executionStanding(g);
        if(s.executionCandidate)await kill(g,player(g,s.executionCandidate),'execution',d);
        else if(living(g).length===3&&living(g).some(p=>p.role==='mayor'&&active(g,p)))finish(g,'good','Drei Personen leben und niemand wurde hingerichtet: Der Bürgermeister gewinnt für die Dorfbewohner.');
        if(g.phase!=='ended')startNight(g,s.executionCandidate?`${player(g,s.executionCandidate).name} wurde hingerichtet.\n\n`:'Heute wurde niemand hingerichtet.\n\n');
      }else if(type==='slayer') {
        requireThat(['discussion','nominations'].includes(g.phase)&&!g.nomination,'Ein öffentlicher Schuss ist jetzt nicht möglich.');
        const a=player(g,command.playerId),b=player(g,command.target);let death=false;
        if(a.role==='slayer'&&a.alive&&!a.usedSlayer){a.usedSlayer=true;if(active(g,a)&&(await register(g,b,'demon',`${g.day}:slayer:${a.id}`,d))==='true')death=await kill(g,b,'slayer',d);}
        event(g,`${a.name} erklärt einen Schuss auf ${b.name}.`);
        if(g.phase!=='ended')announce(g,'Ein öffentlicher Schuss',`${a.name} erklärt einen Schuss auf ${b.name}. ${death?`${b.name} stirbt.`:'Niemand stirbt.'}`);
      }else throw new GameError('Unbekannter Spielbefehl.');
    }
  }
  g.version++;return g;
}

/** Transaction boundary: rules own state; services can only return choices or prose.
 * The clone is committed by the caller only after the complete transition succeeds. */
export async function applyCommand(original:Game,command:Command,services:Decider|GameMasterServices=missingDecider,now=Date.now()):Promise<Game> {
  const ports=typeof services==='function'?{decide:services}:services;
  const next=await reduceCommand(original,command,ports.decide,now);
  if(ports.narrate&&next.announcement&&next.announcement.id!==original.announcement?.id){
    {
      const state=publicView(next);
      // Even demo/end-game reveals and debriefs are outside the narration capability.
      delete state.reveal;delete state.debrief;
      const text=await ports.narrate(structuredClone({schemaVersion:1,audience:'public',language:'de',state,announcement:next.announcement}));
      // Keep authoritative rules/facts verbatim; generated prose is atmosphere only.
      if(typeof text==='string'&&text.trim()&&text.length<=1200)next.announcement.text+='\n\n'+text.trim();
    }
  }
  return next;
}
