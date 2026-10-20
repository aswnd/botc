import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPhones } from './phones.ts';
import { randomUUID } from 'node:crypto';
import { tutorialSteps } from '../src/tutorial.js';
import { Store } from './store.ts';
import { Storyteller } from './ai.ts';
import { rulesContext, searchRules } from './knowledge.ts';
import { makeGame, applyCommand, publicView, privateView, nextVisitor, GameError, requireThat } from './engine.ts';
import { CHARACTERS, RULES, categoryName } from '../shared/characters.ts';
import type { Game, Command } from '../shared/types.ts';

type Session={token:string;playerId:string;openedAt:number;lastActivity:number;gameId:string};
const manualPdfNames=new Set(['Rulebook.pdf','Trouble_Brewing.pdf','Bad_Moon_Rising.pdf','Sects__Violets.pdf','Travellers__Fabled.pdf','Trouble Brewing script.pdf','Bad Moon Rising script.pdf','Sects & Violets script.pdf']);
export function createApp({dbPath=resolve('data/game.sqlite'),root=resolve('.'),clock=Date.now,fetcher=fetch,legacyApi=false}:{dbPath?:string;root?:string;clock?:()=>number;fetcher?:typeof fetch;legacyApi?:boolean}={}) {
  const store=new Store(dbPath);const ai=new Storyteller(store,fetcher);let game:Game|null=store.load();let session:Session|null=null;
  store.db.exec('CREATE TABLE IF NOT EXISTS tutorial (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)');
  const savedTutorial=store.db.prepare('SELECT state FROM tutorial WHERE id=1').get() as {state:string}|undefined;
  let tutorial=savedTutorial?JSON.parse(savedTutorial.state):null;
  function saveTutorial(){store.db.prepare('INSERT INTO tutorial VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(tutorial));}
  const listeners=new Set<ServerResponse>();let chain=Promise.resolve();
  const phones=createPhones(store,()=>game,g=>{game=g;},g=>ai.services(g),broadcast);
  const ready=Promise.resolve();
  function serialized<T>(fn:()=>Promise<T>):Promise<T> {const next=chain.then(fn);chain=next.then(()=>{},()=>{});return next;}
  function expire(){if(session&&clock()-session.lastActivity>300000)session=null;}
  function state(){expire();return {legacyApi,tutorial,lobby:phones.publicLobby(),resolving:phones.resolving,resolutionError:phones.resolutionError,game:game&&(legacyApi||phones.current())?publicView(game):null,terminalBusy:!!session,serverTime:clock(),service:ai.service(game)};}
  function broadcast(){const payload=`data: ${JSON.stringify(state())}\n\n`;for(const res of listeners)res.write(payload);}
  function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req:IncomingMessage){let raw='';for await(const chunk of req){raw+=chunk;requireThat(Buffer.byteLength(raw)<=65536,'Die Anfrage ist zu groß.');}try{const v=JSON.parse(raw||'{}');requireThat(v&&typeof v==='object'&&!Array.isArray(v),'Ungültige Anfrage.');return v;}catch(e){if(e instanceof GameError)throw e;throw new GameError('Ungültige JSON-Anfrage.');}}
  function requireGame():Game {requireThat(game,'Bitte zuerst ein Spiel anlegen.');return game;}
  function checkVersion(input:Record<string,unknown>) {const g=requireGame();if(input.version!==g.version){const e=new GameError('Der Spielstand hat sich geändert. Bitte erneut versuchen.');e.status=409;throw e;}}
  function getSession(req:IncomingMessage){expire();requireThat(session&&session.token===req.headers['x-terminal-token']&&session.gameId===game?.id,'Der private Bildschirm wurde verborgen. Bitte erneut öffnen.');session.lastActivity=clock();return session;}
  function pview(){const s=session!;const v=privateView(requireGame(),s.playerId);v.history=store.history(game!.id,s.playerId);return {...v,visitRemainingMs:Math.max(0,game!.minimumVisitMs-(clock()-s.openedAt))};}
  const server=createServer(async(req,res)=>{
    await ready;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);const path=url.pathname;
      if(req.method==='GET'&&path==='/'&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress??'')){res.writeHead(302,{Location:'/join'});res.end();return;}
      if(req.method==='GET'&&path==='/favicon.ico'){res.writeHead(302,{Location:'/src/favicon.svg'});res.end();return;}
      // No cross-origin mutations: this is a local application, not a public API.
      if(req.method==='POST'){
        const origin=req.headers.origin;if(origin)requireThat(new URL(origin).host===req.headers.host,'Fremde Webseiten dürfen das Spiel nicht steuern.');
        requireThat((req.headers['content-type']??'').startsWith('application/json'),'JSON-Anfrage erforderlich.');
      }
      if(req.method==='GET'&&path==='/api/host')return json(res,200,phones.bootstrap(req));
      if(req.method==='GET'&&path==='/api/connect') {const address=server.address();return json(res,200,{urls:phones.urls(address&&typeof address!=='string'?address.port:3000)});}
      if(req.method==='GET'&&path==='/api/join-qr') {
        const address=server.address(),urls=phones.urls(address&&typeof address!=='string'?address.port:3000);
        requireThat(urls.length>0,'Keine WLAN-Adresse gefunden.');
        const {stdout}=await promisify(execFile)('qrencode',['-t','SVG','-o','-',urls[0]],{timeout:3000,maxBuffer:150000});
        res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(stdout);return;
      }
      if(req.method==='GET'&&path==='/api/player')return json(res,200,phones.view(req));
      if(req.method==='GET'&&path==='/api/player/qa/context'){const m=phones.member(req);requireThat(game?.phone&&m.playerId,'Bitte auf den Spielstart warten.');return json(res,200,rulesContext(publicView(game),m.playerId));}
      if(!legacyApi&&path.startsWith('/api/private'))throw new GameError('Private Besuche finden auf dem eigenen Handy statt.');
      if(req.method==='GET'&&path==='/api/state')return json(res,200,state());
      if(req.method==='GET'&&path==='/api/rules')return json(res,200,{characters:CHARACTERS,rules:RULES,categories:categoryName});
      if(req.method==='GET'&&path==='/api/rules/search'){const q=url.searchParams.get('q')??'';requireThat(q.length<=1200,'Suchanfrage zu lang.');return json(res,200,{articles:searchRules(q)});}
      if(req.method==='GET'&&path==='/api/private/qa/context'){const s=getSession(req);return json(res,200,rulesContext(publicView(requireGame()),s.playerId));}
      if(req.method==='GET'&&path==='/api/events') {
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});listeners.add(res);res.write(`data: ${JSON.stringify(state())}\n\n`);req.on('close',()=>listeners.delete(res));return;
      }
      if(req.method==='GET'&&path==='/api/private'){getSession(req);return json(res,200,pview());}
      if(req.method==='POST') {
        const input=await body(req);
        return await serialized(async()=>{
          const playerRoute=['/api/lobby/register','/api/player/submit','/api/player/chat','/api/player/tutorial'].includes(path);
          if(!playerRoute)phones.host(req);
          if(tutorial&&['/api/lobby/start','/api/player/submit','/api/player/chat','/api/night/retry'].includes(path))throw new GameError('Bitte zuerst die Lernrunde beenden.');
          if(path==='/api/player/tutorial'){
            const m=phones.member(req);requireThat(tutorial&&input.action==='answer','Jetzt ist keine Übung verfügbar.');
            const step=tutorialSteps(tutorial.names)[tutorial.step];
            if(step.vote)requireThat(input.choice===tutorial.names.indexOf(m.name),'Bitte nur deine eigene Übungsstimme abgeben.');
            if(step.actor!==undefined)requireThat(tutorial.names[step.actor]===m.name,'Diese Übung ist für eine andere Person.');
          }
          if(path==='/api/night/retry')ai.cooldownUntil=0;
          const phoneResult=await phones.post(path,input,req);
          if(phoneResult!==undefined){
            if((phoneResult as any).chat){const c=(phoneResult as any).chat;const answer=await ai.answer({id:c.game.id},rulesContext(publicView(c.game),c.playerId),c.question);store.addChat(c.game.id,c.playerId,c.question,answer);return json(res,200,phones.view(req));}
            if(path==='/api/player/submit')void serialized(()=>phones.resolve()).catch(()=>{});
            return json(res,200,phoneResult);
          }
          if(path==='/api/tutorial'||path==='/api/player/tutorial') {
            requireThat(!session,'Bitte zuerst den privaten Bildschirm verbergen.');
            const active=legacyApi?game:phones.current();requireThat(!active||active.phase==='ended'||active.paused,'Bitte das laufende Spiel zuerst pausieren.');
            if(input.action==='start'){
              if(!legacyApi)input.names=phones.publicLobby().members.sort((a,b)=>a.seat-b.seat).map(m=>m.name);
              requireThat(Array.isArray(input.names)&&input.names.length>=7&&input.names.length<=10&&input.names.every((n:unknown)=>typeof n==='string'&&n.trim().length>0&&n.trim().length<=32),'Bitte 7–10 Namen eintragen.');
              const names=input.names.map((n:string)=>n.trim());
              requireThat(new Set(names.map((n:string)=>n.toLowerCase())).size===names.length,'Bitte unterschiedliche Namen verwenden.');
              tutorial={names,step:0,version:1,selected:[],feedback:'',complete:false,deadline:null};
            }else{
              requireThat(tutorial,'Bitte zuerst die Lernrunde starten.');
              requireThat(input.version===tutorial.version,'Die Lernrunde hat sich geändert. Bitte erneut versuchen.');
              const steps=tutorialSteps(tutorial.names),step=steps[tutorial.step];
              if(input.action==='end')tutorial=null;
              else{
                if(input.action==='answer'){
                  requireThat(Number.isInteger(input.choice)&&step.choices&&input.choice>=0&&input.choice<step.choices.length,'Bitte eine Antwort wählen.');
                  if(step.vote){if(!tutorial.selected.includes(input.choice))tutorial.selected.push(input.choice);tutorial.complete=tutorial.selected.length===step.choices.length;tutorial.feedback=tutorial.complete?step.explanation:'Gezählt: '+tutorial.selected.length+' / '+step.choices.length;}
                  else{tutorial.selected=[input.choice];tutorial.complete=input.choice===step.correct;tutorial.feedback=tutorial.complete?step.explanation:'Noch nicht. Lest den Hinweis und versucht es erneut.';}
                }else if(input.action==='next'||input.action==='back'){
                  requireThat(input.action==='back'||!step.choices||tutorial.complete,'Bitte zuerst die Übung abschließen.');
                  tutorial.step=Math.max(0,Math.min(steps.length-1,tutorial.step+(input.action==='next'?1:-1)));
                  tutorial.selected=[];tutorial.complete=false;tutorial.feedback='';
                  tutorial.deadline=steps[tutorial.step].seconds?clock()+steps[tutorial.step].seconds*1000:null;
                }else throw new GameError('Unbekannte Lernaktion.');
                tutorial.version++;
              }
            }
            saveTutorial();broadcast();return json(res,200,state());
          }
          requireThat(!tutorial||!['/api/new','/api/private/open','/api/command'].includes(path),'Bitte zuerst die Lernrunde beenden.');
          if(path==='/api/new') {
            requireThat(legacyApi,'Bitte die Anmeldung auf den Handys verwenden.');
            requireThat(!session,'Bitte zuerst den privaten Bildschirm verbergen.');
            requireThat(Array.isArray(input.names)&&input.names.every((n:unknown)=>typeof n==='string'),'Bitte Namen eintragen.');
            requireThat(typeof input.demo==='boolean','Bitte einen Spielmodus wählen.');
      requireThat(input.truthfulInformation===undefined||typeof input.truthfulInformation==='boolean','Bitte einen Informationsmodus wählen.');
            const next=makeGame({truthfulInformation:input.truthfulInformation??!input.demo,names:input.names,assistant:input.assistant,demo:input.demo,...(input.demo?{seed:2026,minimumVisitMs:0}:{}),...(input.demo&&!(input.truthfulInformation??!input.demo)&&input.names.length===8?{roles:['chef','empath','fortune_teller','undertaker','virgin','drunk','scarlet_woman','imp']}: {})});
            store.save(next);game=next;broadcast();return json(res,200,state());
          }
          if(path==='/api/ai/check') {requireThat(!session,'Bitte zuerst den privaten Bildschirm verbergen.');const ok=await ai.check(game??{id:'setup'});broadcast();return json(res,200,{ok,service:ai.service(game)});}
          if(path==='/api/private/release') {session=null;broadcast();return json(res,200,{ok:true});}
          if(path==='/api/private/open') {
            const g=requireGame();expire();requireThat(!session,'Der Laptop wird gerade privat verwendet.');requireThat(!g.paused,'Das Spiel ist pausiert.');
            requireThat(!g.announcement,'Die Assistenz soll zuerst den Vorlesetext bestätigen.');
            const expected=nextVisitor(g);if(expected)requireThat(input.playerId===expected.id,'Bitte die angezeigte Reihenfolge einhalten.');else requireThat(['discussion','nominations'].includes(g.phase),'Jetzt ist kein privater Besuch möglich.');
            privateView(g,input.playerId);session={token:randomUUID(),playerId:input.playerId,gameId:g.id,openedAt:clock(),lastActivity:clock()};broadcast();return json(res,200,{token:session.token,view:pview()});
          }
          if(path==='/api/private/hide') {getSession(req);session=null;broadcast();return json(res,200,{ok:true});}
          if(path==='/api/private/finish') {
            const g=requireGame();const id=input.commandId;
            requireThat(typeof id==='string'&&id.length<=100,'Ungültige Befehlskennung.');
            if(store.hasCommand(id)){
              const sameSession=!!session&&session.token===req.headers['x-terminal-token'];
              return json(res,200,{done:!sameSession,state:state(),...(sameSession?{view:pview()}:{})});
            }
            const s=getSession(req);checkVersion(input);
            requireThat(clock()-s.openedAt>=g.minimumVisitMs,'Bitte noch einen Moment warten, damit alle Besuche gleich lang dauern.');
            const expected=nextVisitor(g);
            if(expected){
              requireThat(expected.id===s.playerId,'Die Besuchsreihenfolge hat sich geändert.');
              const next=await applyCommand(g,{type:'visit',playerId:s.playerId,targets:input.targets??[]},ai.services(g),clock());
              const stillHere=nextVisitor(next)?.id===s.playerId&&next.phase===g.phase;
              store.save(next,id,{type:'visit',playerId:s.playerId});game=next;
              if(stillHere){broadcast();return json(res,200,{done:false,view:pview(),state:state()});}
            }else store.save(g,id,{type:'private_chat_end',playerId:s.playerId});
            session=null;broadcast();return json(res,200,{done:true,state:state()});
          }
          if(path==='/api/private/chat') {
            const s=getSession(req);const g=requireGame();requireThat(typeof input.question==='string'&&input.question.trim().length>0&&input.question.length<=1200,'Bitte eine Frage mit höchstens 1200 Zeichen stellen.');
            const knowledge=rulesContext(publicView(g),s.playerId);
            const answer=await ai.answer({id:g.id},knowledge,input.question.trim());store.addChat(g.id,s.playerId,input.question.trim(),answer);s.lastActivity=clock();broadcast();return json(res,200,{answer,history:store.history(g.id,s.playerId),service:ai.service(g)});
          }
          if(path==='/api/command') {
            requireThat(typeof input.commandId==='string'&&input.commandId.length<=100,'Ungültige Befehlskennung.');
            if(store.hasCommand(input.commandId))return json(res,200,state());
            expire();requireThat(!session,'Bitte zuerst den privaten Bildschirm verbergen.');checkVersion(input);
            requireThat(input.command&&typeof input.command==='object'&&typeof input.command.type==='string','Ungültiger Spielbefehl.');
            const command=input.command as Command;
            requireThat(['ack','pause','timer','nominations','nominate','vote_draft','vote_confirm','close_day','slayer','replay','attention'].includes(command.type),'Dieser Befehl ist hier nicht verfügbar.');
            const next=await applyCommand(game!,command,game!.phone?phones.durableServices(game!):ai.services(game!),clock());store.save(next,input.commandId,command);game=next;broadcast();if(game.phone){try{await phones.resolve();}catch{}}return json(res,200,state());
          }
          return json(res,404,{error:'Unbekannte Adresse.'});
        });
      }
      if(req.method!=='GET')return json(res,405,{error:'Methode nicht verfügbar.'});
      const file=['/','/projector','/join','/play'].includes(path)?'index.html':['/wiki','/wiki/'].includes(path)?'wiki/index.html':decodeURIComponent(path.slice(1));
      const officialPdf=file.startsWith('official_pdfs/')&&manualPdfNames.has(file.slice('official_pdfs/'.length));
      requireThat(file==='index.html'||officialPdf||(/^wiki\/(index\.html|app\.js|content\.js|style\.css)$/.test(file)||/^src\/[a-zA-Z0-9/_-]+\.(js|css|svg)$/.test(file)||/^assets\/audio\/[a-zA-Z0-9_-]+\.(mp3|html)$/.test(file)),'Datei nicht verfügbar.');
      const full=resolve(root,file);requireThat(full.startsWith(root+'/'),'Datei nicht verfügbar.');
      let content=await readFile(full).catch(e=>{if(e.code==='ENOENT')throw Object.assign(new GameError('Datei nicht gefunden.'),{status:404});throw e;});if(['/join','/play'].includes(path))content=Buffer.from(content.toString().replace('/src/app.js','/src/phone.js'));const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
      res.writeHead(200,{'Content-Type':extname(file)==='.pdf'?'application/pdf':mime[extname(file)]??'text/plain','Cache-Control':'no-cache'});res.end(content);
    }catch(e){if(!res.headersSent)json(res,e instanceof GameError?e.status:500,{error:e instanceof GameError?e.message:'Die Anfrage konnte nicht verarbeitet werden. Der gespeicherte Spielstand bleibt erhalten.'});else res.end();}
  });
  const tick=setInterval(()=>{void serialized(async()=>{
    const wasBusy=!!session;expire();if(wasBusy&&!session)broadcast();
    if((legacyApi||phones.current())&&game?.timer.deadline!==null&&game?.timer.deadline!==undefined&&game.timer.deadline<=clock()) {
      const next=await applyCommand(game,{type:'timer_elapsed'},undefined,clock());store.save(next);game=next;broadcast();
    }
    for(const res of listeners)res.write(': heartbeat\n\n');
  }).catch(()=>{});},1000);tick.unref();
  return {server,store,ai,ready,getGame:()=>game,idle:()=>chain,close:async()=>{clearInterval(tick);await chain;for(const res of listeners)res.end();if(server.listening)await new Promise<void>((ok,fail)=>server.close(e=>e?fail(e):ok()));store.close();}};
}
