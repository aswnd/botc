import {tutorialSteps} from '../src/tutorial.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { testApp as createApp } from './http.ts';

/** Real Chromium over a debugging pipe, using the actual HTTP server and SSE. */
class Browser {
  process:ReturnType<typeof spawn>;pending=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void}>();seq=0;buffer='';errors:string[]=[];events:((e:any)=>void)[]=[];
  constructor(executable:string,profile:string) {
    this.process=spawn(executable,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-breakpad','--disable-crash-reporter','--disable-crashpad-for-testing','--disable-background-networking','--disable-extensions','--enable-features=NetworkServiceInProcess2,AudioServiceInProcess','--disable-features=AudioServiceOutOfProcess','--no-proxy-server','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
    this.process.stderr?.on('data',d=>this.errors.push(d.toString()));
    for(const i of [3,4])(this.process.stdio[i] as any)?.on('error',()=>{});
    this.process.on('error',e=>this.fail(e));this.process.on('exit',()=>this.fail(new Error(this.errors.join('').slice(-1500)||'Chromium wurde beendet.')));
    this.process.stdio[4]!.on('data',(chunk:Buffer)=>{
      this.buffer+=chunk.toString();let i;
      while((i=this.buffer.indexOf('\0'))>=0){const raw=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);if(!raw)continue;const msg=JSON.parse(raw);if(msg.id){const p=this.pending.get(msg.id);this.pending.delete(msg.id);msg.error?p?.reject(new Error(msg.error.message)):p?.resolve(msg.result);}else for(const fn of this.events)fn(msg);}
    });
  }
  fail(e:Error){for(const p of this.pending.values())p.reject(e);this.pending.clear();}
  send(method:string,params:Record<string,unknown>={},sessionId?:string):Promise<any> {return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},method==='Page.captureScreenshot'?25000:8000);this.pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});(this.process.stdio[3] as any).write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
  async page(app:ReturnType<typeof createApp>,path:string,width=1440,height=1000,ready='!!document.querySelector(".connection.online")') {
    if(!app.server.listening)await new Promise<void>((ok,fail)=>{app.server.once('error',fail);app.server.listen(0,'127.0.0.1',ok);});
    const address=app.server.address();if(!address||typeof address==='string')throw new Error('No test server address');
    const base=`http://127.0.0.1:${address.port}`;
    const {targetId}=await this.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
    const runtimeErrors:string[]=[];
    this.events.push(e=>{if(e.sessionId===sessionId&&e.method==='Runtime.exceptionThrown')runtimeErrors.push(JSON.stringify(e.params.exceptionDetails));});
    await this.send('Runtime.enable',{},sessionId);await this.send('Page.enable',{},sessionId);
    await this.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    const navigation=await this.send('Page.navigate',{url:base+path},sessionId);
    if(navigation.errorText)throw new Error(`Navigation failed: ${navigation.errorText}`);
    const evaluate=async(expression:string)=>{const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const wait=async(expression:string)=>{const end=Date.now()+8000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw new Error(`Browser wait timed out: ${expression}\n${await evaluate('document.body.innerText')}\n${runtimeErrors.join('\n')}\n${await evaluate('document.documentElement.outerHTML.slice(0,1500)')}`);};
    const click=async(selector:string)=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait('!document.querySelector(".working")');};
    const screenshot=async(file:string)=>{await this.send('Page.bringToFront',{},sessionId);const r=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await writeFile(file,Buffer.from(r.data,'base64'));};
    await wait(ready);return {evaluate,wait,click,screenshot,runtimeErrors,sessionId};
  }
  close(){this.process.kill('SIGTERM');}
}
test('Chromium: setup, no-PIN handovers, two night rounds, projector cues, timer and voting',async t=>{
  const executable=process.env.CHROMIUM_PATH??(existsSync('/usr/lib/chromium/chromium')?'/usr/lib/chromium/chromium':'/usr/bin/chromium');
  if(!existsSync(executable)){t.skip('Chromium is not installed. Set CHROMIUM_PATH to run browser checks.');return;}
  const profile=await mkdtemp(join(tmpdir(),'ravenswood-chromium-'));const browser=new Browser(executable,profile);const app=createApp({dbPath:':memory:'});
  try {
    try{await browser.send('Browser.getVersion');}catch(e){if(browser.errors.join('').includes('Operation not permitted')){t.skip('The sandbox blocks Chromium socket operations. Run npm run test:e2e on the laptop outside this sandbox.');return;}throw e;}
    await mkdir(resolve('test-results'),{recursive:true});
    const laptop=await browser.page(app,'/');await laptop.screenshot(resolve('test-results/setup.png'));
    await laptop.evaluate(`document.querySelector('#assistant').value='1';document.querySelector('#assistant').dispatchEvent(new Event('change',{bubbles:true}));var input=document.querySelector('[data-name-index="1"]');input.focus();input.value='Renée <&>';input.dispatchEvent(new Event('input',{bubbles:true}));`);
    assert.equal(await laptop.evaluate('document.querySelector("#assistant").selectedOptions[0].textContent'),'Renée <&>');
    assert.equal(await laptop.evaluate('document.activeElement.dataset.nameIndex'),'1');
    await laptop.evaluate(`var input=document.querySelector('[data-name-index="1"]');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));`);
    assert.equal(await laptop.evaluate('document.querySelector("#assistant").selectedOptions[0].textContent'),'Platz 2');
    await laptop.evaluate(`var input=document.querySelector('[data-name-index="1"]');input.value='Ben';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#assistant').value='0';document.querySelector('#assistant').dispatchEvent(new Event('change',{bubbles:true}));`);
    const beamer=await browser.page(app,'/projector',1920,1080);await beamer.evaluate(`window.musicElements=[];const NativeAudio=window.Audio;window.Audio=function(url){const audio=new NativeAudio(url);window.musicElements.push(audio);return audio;};`);await beamer.click('[data-action="audio"]');await beamer.wait('window.musicElements[0]?.currentTime>0.1&&!window.musicElements[0].paused');assert.ok(await beamer.evaluate('document.body.innerText.includes("Tontest")'));
    await laptop.click('[data-action="tutorial-start"]');
    await beamer.wait('!!document.querySelector(".tutorial-projector")');
    assert.equal(await laptop.evaluate('document.querySelectorAll(".tutorial-library details").length'),29);
    await laptop.evaluate('document.querySelector(".tutorial-library details").open=true');
    assert.ok(await laptop.evaluate('document.body.innerText.includes("Beispiel:")'));
    const lesson=tutorialSteps(['Anna','Ben','Clara','David','Emilia','Felix','Greta','Hannes']);
    for(let i=0;i<lesson.length;i++){
      const step=lesson[i];
      if(step.choices){
        if(step.vote)for(let j=0;j<step.choices.length;j++)await laptop.click('[data-action="tutorial-answer"][data-choice="'+j+'"]');
        else await laptop.click('[data-action="tutorial-answer"][data-choice="'+step.correct+'"]');
      }
      if(step.seconds){
        await beamer.wait('!!document.querySelector("[data-tutorial-clock]")');
        await beamer.screenshot(resolve('test-results/tutorial-projector.png'));
        await laptop.screenshot(resolve('test-results/tutorial-laptop.png'));
      }
      await laptop.click('[data-action="tutorial-'+(i===lesson.length-1?'end':'next')+'"]');
    }
    await laptop.wait('!!document.querySelector("#demo")');
    await laptop.evaluate('document.querySelector("#demo").checked=true;document.querySelector("#demo").dispatchEvent(new Event("change",{bubbles:true}))');
    await laptop.click('[data-action="create"]');await laptop.wait('document.body.innerText.includes("bitte vorlesen")');
    await laptop.click('[data-action="assistant"]');await laptop.click('[data-action="ack"]');await laptop.click('[data-action="home"]');
    for(let i=0;i<8;i++){
      await laptop.wait(`document.querySelector('[data-action="open-private"]')?.dataset.player==='p${i+1}'`);
      await laptop.click('[data-action="open-private"]');await laptop.wait('!!document.querySelector(".character-card")');
      assert.equal(await laptop.evaluate('!!document.querySelector("input[type=password]")'),false);
      if(i===0)await laptop.screenshot(resolve('test-results/private.png'));
      await laptop.click('[data-action="finish"]');await laptop.wait('!document.querySelector(".private-layout")');
    }
    await laptop.click('[data-action="assistant"]');await laptop.click('[data-action="ack"]');await laptop.click('[data-action="home"]');
    await beamer.wait('window.musicElements.at(-1)?.src.includes("60_Dark_and_Stormy")&&!window.musicElements.at(-1).paused&&window.musicElements.at(-1).currentTime>.1');
    for(let round=0;round<2;round++)for(let i=0;i<8;i++){
      await laptop.wait(`document.querySelector('[data-action="open-private"]')?.dataset.player==='p${i+1}'`);await laptop.click('[data-action="open-private"]');await laptop.wait('!!document.querySelector(".character-card")');
      if(await laptop.evaluate('!!document.querySelector(".target-grid")')){await laptop.click('[data-action="target"]');await laptop.click('[data-action="target"]:not(.selected)');}
      await laptop.click('[data-action="finish"]');await laptop.wait('!document.querySelector(".private-layout")');
    }
    await laptop.click('[data-action="assistant"]');await laptop.click('[data-action="ack"]');await laptop.wait('!!document.querySelector("[data-clock]")');
    await beamer.wait('window.musicElements.at(-1)?.src.includes("182_Country_Village")&&!window.musicElements.at(-1).paused&&window.musicElements.at(-1).currentTime>.1');
    await beamer.wait('!!document.querySelector(".timer.large")');await beamer.wait('document.querySelector("[data-attention]").hidden');await beamer.screenshot(resolve('test-results/projector.png'));
    await laptop.click('[data-action="timer-toggle"]');assert.equal(app.getGame()!.timer.deadline,null);await laptop.click('[data-action="plus-minute"]');assert.ok(app.getGame()!.timer.remainingMs>420000);
    await laptop.click('[data-action="attention"]');await beamer.wait('!document.querySelector("[data-attention]").hidden');
    await laptop.click('[data-action="nominations"]');await laptop.click('[data-action="ack"]');
    await beamer.wait('window.musicElements.at(-1)?.src.includes("10_In_The_Shadows")&&!window.musicElements.at(-1).paused&&window.musicElements.at(-1).currentTime>.1');
    await laptop.evaluate('for(const [id,value] of [["nominator","p1"],["nominee","p8"]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event("change",{bubbles:true}));}');
    await laptop.click('[data-action="nominate"]');await laptop.click('[data-action="ack"]');
    for(let i=1;i<=4;i++){await laptop.click(`[data-voter="p${i}"]`);await laptop.wait(`document.querySelector('.vote-total strong')?.innerText==='${i}'`);}
    await laptop.screenshot(resolve('test-results/voting.png'));await laptop.click('[data-action="vote-confirm"]');await laptop.click('[data-action="ack"]');
    assert.equal(app.getGame()!.ballots.at(-1)!.total,4);
    assert.deepEqual(laptop.runtimeErrors,[]);assert.deepEqual(beamer.runtimeErrors,[]);
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},laptop.sessionId);
    await laptop.screenshot(resolve('test-results/mobile.png'));assert.equal(await laptop.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  }catch(e){console.error('Browser diagnostics:',browser.errors.join('').slice(-1500));throw e;}finally{browser.close();app.server.closeAllConnections();await app.close();await new Promise(r=>setTimeout(r,100));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});


test('Chromium: real MP3 decoding, audible signal, crossfades, pause, volume, mute, and ending',async t=>{
  const executable=process.env.CHROMIUM_PATH??(existsSync('/usr/lib/chromium/chromium')?'/usr/lib/chromium/chromium':'/usr/bin/chromium');
  if(!existsSync(executable)){t.skip('Chromium is not installed.');return;}
  const profile=await mkdtemp(join(tmpdir(),'ravenswood-music-'));const browser=new Browser(executable,profile);const app=createApp({dbPath:':memory:'});
  try{
    await browser.send('Browser.getVersion');const page=await browser.page(app,'/projector');
    // Separate controller exercises every public phase with actual browser media elements.
    await page.evaluate(`(async()=>{
      const {createMusicPlayer}=await import('/src/music.js');
      window.voices=[];window.audioContexts=[];window.samples=[];
      window.player=createMusicPlayer({storage:localStorage,makeAudio:url=>{
        const audio=new Audio(url),context=new AudioContext(),analyser=context.createAnalyser();
        context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);context.resume();
        window.audioContexts.push(context);window.voices.push({audio,analyser});return audio;
      }});
      window.player.update('discussion');
      window.sampleTimer=setInterval(()=>window.samples.push(window.voices.map(v=>({src:v.audio.src,volume:v.audio.volume,paused:v.audio.paused,time:v.audio.currentTime}))),20);
    })()`);
    assert.equal(await page.evaluate('window.voices.length'),0);
    await page.evaluate('window.player.activate()');
    const playing=`window.voices.at(-1)?.audio.currentTime>.1&&!window.voices.at(-1).audio.paused&&window.voices.at(-1).audio.volume>0`;
    await page.wait(playing);
    const audible=`(()=>{const v=window.voices.at(-1);const bytes=new Float32Array(v.analyser.fftSize);v.analyser.getFloatTimeDomainData(bytes);return bytes.some(x=>Math.abs(x)>.00001);})()`;
    await page.wait(audible);
    const initialTime=await page.evaluate('window.voices[0].audio.currentTime');
    await page.evaluate("window.player.update('discussion')");assert.equal(await page.evaluate('window.voices.length'),1);
    for(const [phase,file] of [['night_choices','60_Dark_and_Stormy'],['dawn','182_Country_Village'],['nominations','10_In_The_Shadows'],['ended','4_Solemn_Vow-a']]){
      await page.evaluate(`window.player.update(${JSON.stringify(phase)})`);
      await page.wait(playing);await page.wait(audible);
      assert.ok(await page.evaluate(`window.voices.at(-1).audio.src.includes(${JSON.stringify(file)})`));
      await page.wait('window.voices.slice(0,-1).every(v=>v.audio.paused&&v.audio.volume<.001&&!v.audio.getAttribute("src"))');
      if(phase==='night_choices'){
        const count=await page.evaluate('window.voices.length');await page.evaluate("window.player.update('night_results')");assert.equal(await page.evaluate('window.voices.length'),count);
      }
    }
    assert.ok(initialTime>0);
    assert.ok(await page.evaluate('window.samples.some(sample=>sample.filter(v=>!v.paused&&v.volume>0).length===2)'), 'crossfade must overlap playing tracks at nonzero volumes');
    await page.evaluate("window.player.update('ended',true)");assert.equal(await page.evaluate('window.voices.at(-1).audio.paused'),true);
    const pausedTime=await page.evaluate('window.voices.at(-1).audio.currentTime');
    await page.evaluate("window.player.update('ended',false)");await page.wait(`window.voices.at(-1).audio.currentTime>${pausedTime+.1}`);
    await page.evaluate('window.player.setVolume(0)');assert.equal(await page.evaluate('window.voices.at(-1).audio.volume'),0);
    await page.evaluate('window.player.setVolume(.5)');await page.wait('window.voices.at(-1).audio.volume>0');
    await page.evaluate('window.player.toggleMute()');assert.equal(await page.evaluate('window.voices.at(-1).audio.paused'),true);
    await page.evaluate('window.player.toggleMute()');await page.wait('!window.voices.at(-1).audio.paused');
    assert.deepEqual(page.runtimeErrors,[]);
    await page.evaluate('clearInterval(window.sampleTimer);window.player.dispose();Promise.all(window.audioContexts.map(c=>c.close()))');
  }finally{browser.close();app.server.closeAllConnections();await app.close();await new Promise(r=>setTimeout(r,100));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});


test('Chromium: readable manual search, filters, deep links, PDF access and mobile layout',async t=>{
  const executable=process.env.CHROMIUM_PATH??'/usr/bin/chromium';
  if(!existsSync(executable)){t.skip('Chromium is not installed.');return;}
  const profile=await mkdtemp(join(tmpdir(),'clocktower-wiki-'));const browser=new Browser(executable,profile);const app=createApp({dbPath:':memory:'});
  try{
    await browser.send('Browser.getVersion');await mkdir(resolve('test-results'),{recursive:true});
    const page=await browser.page(app,'/wiki/',1440,1000,'!!document.querySelector("#article h2")');
    assert.equal(await page.evaluate('document.querySelector("#count").textContent'),'114 articles');
    await page.screenshot(resolve('test-results/wiki-desktop.png'));
    await page.evaluate(`document.querySelector('#search').value='poisoned';document.querySelector('#search').dispatchEvent(new Event('input'));`);
    assert.ok(await page.evaluate('document.querySelectorAll("#navigation a").length>5'));
    await page.evaluate(`document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#edition').value='Bad Moon Rising';document.querySelector('#edition').dispatchEvent(new Event('change'));`);
    assert.equal(await page.evaluate('document.querySelectorAll("#navigation a").length'),25);
    await page.click('#navigation a[href="#pukka"]');
    await page.wait('document.querySelector("#article h2").textContent==="Pukka"');
    assert.equal(await page.evaluate(`fetch(document.querySelector('.sources a').href).then(r=>r.headers.get('content-type'))`),'application/pdf');
    await page.click('[data-section="section-1"]');
    assert.equal(await page.evaluate('location.hash'),'#pukka');
    await page.evaluate(`document.querySelector('#search').value='zzz-no-such-rule';document.querySelector('#search').dispatchEvent(new Event('input'));`);
    assert.ok(await page.evaluate('document.querySelector("#navigation").textContent.includes("No articles found")'));
    const mobile=await browser.page(app,'/wiki/#voting',390,844,'document.querySelector("#article h2")?.textContent==="Nominations, votes and ties"');
    assert.equal(await mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await mobile.screenshot(resolve('test-results/wiki-mobile.png'));
    await mobile.evaluate(`location.hash='#setup'`);await mobile.wait('!!document.querySelector("table")');
    assert.equal(await mobile.evaluate('document.querySelectorAll("tbody tr").length'),11);
    assert.deepEqual(page.runtimeErrors,[]);assert.deepEqual(mobile.runtimeErrors,[]);
  }finally{browser.close();await app.close();await rm(profile,{recursive:true,force:true});}
});
