import {nightProgress} from '../src/night-progress.js';
import {createMusicPlayer} from '../src/music.js';
import {tutorialSteps} from '../src/tutorial.js';
import {tutorialScreen} from '../src/tutorial-ui.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { testApp as createApp,request } from './http.ts';

/** Runs the actual view/controller module. Real layout/audio checks live in browser.test.ts. */
async function interfaceHarness(path='/') {
  const app=createApp({dbPath:':memory:'});const listeners:Record<string,Function>={};
  const root={innerHTML:'',addEventListener:(name:string,fn:Function)=>listeners[name]=fn};
  const document={querySelector:(selector:string)=>selector==='#root'?root:null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{},activeElement:null};
  const c=vm.createContext({nightProgress,createMusicPlayer,tutorialSteps,tutorialScreen,document,location:{pathname:path},Date,console,crypto,EventSource:class {onmessage:any;onerror:any;},setInterval:()=>0,localStorage:{getItem:()=>null,setItem:()=>{}},window:{confirm:()=>true},enableAudio:async()=>{},isAudioEnabled:()=>false,setVolume:()=>{},getVolume:()=>.4,playCue:()=>{},fetch:async(url:string,init:any={})=>{
    const r=await request(app,url,{method:init.method??'GET',data:init.body?JSON.parse(init.body):undefined,headers:Object.fromEntries(Object.entries(init.headers??{}).map(([k,v])=>[k.toLowerCase(),String(v)]))});return {ok:r.status<400,json:async()=>r.json()};
  }});
  const script=(await readFile('src/app.js','utf8')).replace(/^import .*?;\n/gm,'')+`\nglobalThis.harness={get busy(){return busy},get error(){return error},get state(){return envelope},get privateData(){return privateData},get token(){return privateToken},get targets(){return privateTargets},get html(){return root.innerHTML},setDemo(){demo=true},setView(v){view=v;render()},accept,render,hide};`;
  vm.runInContext(script,c);const h=c.harness;
  async function settled(){for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,1));if(!h.busy&&h.state.service.status!=='Verbinde …')return;}throw new Error('UI did not settle');}
  await settled();
  async function click(action:string,data:Record<string,string>={}){const el={dataset:{action,...data},disabled:false};listeners.click({target:{closest:()=>el}});await settled();if(h.error)throw new Error(h.error);}
  function change(id:string,value:string){listeners.change({target:{id,value,dataset:{}}});}
  return {app,h,click,change,close:()=>app.close()};
}
test('actual UI templates and actions run a complete first-night handover flow',async()=>{
  const ui=await interfaceHarness();try{
    assert.match(ui.h.html,/Die Stadt versammeln/);assert.doesNotMatch(ui.h.html,/KI einrichten|api-key|save-settings|id="budget"/);ui.h.setDemo();await ui.click('create');assert.match(ui.h.html,/bitte vorlesen/);
    await ui.click('assistant');assert.match(ui.h.html,/BITTE LAUT VORLESEN/);await ui.click('ack');await ui.click('home');
    for(let i=1;i<=8;i++){
      assert.equal(ui.h.state.game.nextPlayer.id,`p${i}`);await ui.click('open-private',{player:`p${i}`});assert.match(ui.h.html,/NUR FÜR/);assert.ok(ui.h.privateData);await ui.click('finish');assert.equal(ui.h.privateData,null);assert.ok(!ui.h.html.includes('class="private-layout"'));
    }
    await ui.click('assistant');await ui.click('ack');await ui.click('home');
    for(let round=0;round<2;round++)for(let i=1;i<=8;i++){
      await ui.click('open-private',{player:`p${i}`});const p=ui.h.privateData;
      if(p.action)for(const t of p.targets.filter((t:any)=>!p.action.excludeSelf||t.id!==p.id).slice(0,p.action.count))await ui.click('target',{target:t.id});
      await ui.click('finish');assert.equal(ui.h.privateData,null);
    }
    assert.equal(ui.h.state.game.phase,'dawn');await ui.click('assistant');await ui.click('ack');assert.equal(ui.h.state.game.phase,'discussion');assert.match(ui.h.html,/data-clock/);
    await ui.click('home');await ui.click('open-private',{player:'p1'});assert.match(ui.h.html,/<details class="chat-panel" open>/);assert.match(ui.h.html,/keine geheimen Rollen/);await ui.h.hide();assert.equal(ui.h.privateData,null);assert.equal(ui.h.token,null);
    ui.h.accept((await request(ui.app,'/api/state')).json());await ui.click('assistant');await ui.click('timer-toggle');assert.equal(ui.app.getGame()!.timer.deadline,null);
    await ui.click('plus-minute');assert.ok(ui.app.getGame()!.timer.remainingMs>420000);
    await ui.click('nominations');await ui.click('ack');assert.match(ui.h.html,/Wer nominiert/);
    ui.change('nominator','p1');ui.change('nominee','p8');await ui.click('nominate');await ui.click('ack');assert.match(ui.h.html,/voter-list/);
    const vote=await request(ui.app,'/api/command',{method:'POST',data:{version:ui.app.getGame()!.version,commandId:crypto.randomUUID(),command:{type:'vote_draft',voters:['p1','p2','p3','p4']}}});ui.h.accept(vote.json());
    await ui.click('vote-confirm');await ui.click('ack');assert.match(ui.h.html,/Noah steht zur Hinrichtung/);
    await ui.click('confirm-close');await ui.click('close-day');assert.equal(ui.app.getGame()!.phase,'night_choices');assert.equal(ui.app.getGame()!.players.filter(p=>p.role==='imp').length,1);
    assert.match(ui.h.html,/Noah wurde hingerichtet/);
    await ui.click('ack');await ui.click('home');
    for(let round=0;round<2;round++)for(let i=1;i<=8;i++){
      await ui.click('open-private',{player:`p${i}`});const p=ui.h.privateData;
      if(p.action)for(const t of p.targets.filter((t:any)=>!p.action.excludeSelf||t.id!==p.id).slice(0,p.action.count))await ui.click('target',{target:t.id});
      await ui.click('finish');if(ui.h.privateData)await ui.click('finish');
    }
    await ui.click('assistant');await ui.click('ack');await ui.click('nominations');await ui.click('ack');ui.change('nominator','p2');ui.change('nominee',ui.app.getGame()!.players.find(p=>p.role==='imp')!.id);await ui.click('nominate');await ui.click('ack');
    const finalVote=await request(ui.app,'/api/command',{method:'POST',data:{version:ui.app.getGame()!.version,commandId:crypto.randomUUID(),command:{type:'vote_draft',voters:['p2','p3','p4']}}});ui.h.accept(finalVote.json());
    await ui.click('vote-confirm');await ui.click('ack');await ui.click('close-day');await ui.click('home');
    assert.equal(ui.app.getGame()!.winner,'good');assert.match(ui.h.html,/Die Dorfbewohner gewinnen/);assert.match(ui.h.html,/reveal-card/);assert.match(ui.h.html,/Was in den Nächten geschah/);
  }finally{await ui.close();}
});
test('private rule citations are readable and model HTML stays escaped',async()=>{
  const ui=await interfaceHarness();try{
    ui.h.setDemo();await ui.click('create');await ui.click('assistant');await ui.click('ack');await ui.click('home');await ui.click('open-private',{player:'p1'});
    ui.h.privateData.history=[{role:'assistant',text:'Siehe [Regelbuch, S. 13](rulebook:p13:3). <img src=x onerror=alert(1)> [Link](javascript:alert(1))'}];
    ui.h.render();
    assert.match(ui.h.html,/Siehe Regelbuch, S\. 13\./);
    assert.doesNotMatch(ui.h.html,/rulebook:p13|<img|href="javascript:/);
    assert.match(ui.h.html,/&lt;img/);
  }finally{await ui.close();}
});
test('projector templates receive only the public invitation and timer',async()=>{
  const ui=await interfaceHarness('/projector');try{
    assert.match(ui.h.html,/Die Stadt wartet|DIE STADT WARTET/);
    await request(ui.app,'/api/new',{method:'POST',data:{names:['A','B','C','D','E','F','G','H'],assistant:1,demo:false,budget:5}});
    ui.h.accept((await request(ui.app,'/api/state')).json());assert.match(ui.h.html,/B,<br\/><em>bitte zum Laptop/);assert.ok(!ui.h.html.includes('character-card'));assert.ok(!ui.h.html.includes('reveal-card'));assert.match(ui.h.html,/Lautstärke/);
  }finally{await ui.close();}
});

test('setup information selector starts both truthful and standard games',async()=>{
  const ui=await interfaceHarness();try{
    assert.match(ui.h.html,/id="truthful-information"/);
    assert.match(ui.h.html,/value="true" selected/);
    await ui.click('create');
    assert.equal(ui.app.getGame()!.truthfulInformation,true);
    ui.h.setView('setup');ui.change('truthful-information','false');
    assert.match(ui.h.html,/value="false" selected/);
    await ui.click('create');
    assert.equal(ui.app.getGame()!.truthfulInformation,false);
    assert.match(ui.app.getGame()!.announcement!.text,/Standardregeln/);
  }finally{await ui.close();}
});

test('readiness indicator shows current confirmations on host and projector',async()=>{
  for(const path of ['/','/projector']){
    const ui=await interfaceHarness(path);try{
      await request(ui.app,'/api/new',{method:'POST',data:{names:['A','B','C','D','E','F','G'],assistant:0,demo:false,budget:5}});
      const g=ui.app.getGame()!;g.phase='night_results';g.announcement=undefined;g.queueIndex=3;
      ui.h.accept((await request(ui.app,'/api/state')).json());
      assert.match(ui.h.html,/3 von 7 bereit/);assert.match(ui.h.html,/Ergebnisse gelesen/);
      assert.match(ui.h.html,/<progress value="3" max="7"/);
    }finally{await ui.close();}
  }
});
