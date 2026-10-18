import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('local audio requires activation, distinguishes cues, and respects mute/volume',async()=>{
  const played:{frequency:number;start?:number;stop?:number;gain:number}[]=[];let current:any;
  const stored=new Map<string,string>();
  class AudioContext {
    state='suspended';currentTime=1;destination={};
    async resume(){this.state='running';}
    createOscillator(){const note={frequency:0,gain:0};current=note;played.push(note);return {type:'sine',frequency:{set value(v:number){note.frequency=v;}},connect(){},start(t:number){Object.assign(note,{start:t});},stop(t:number){Object.assign(note,{stop:t});}};}
    createGain(){const note=current;return {gain:{setValueAtTime(){},linearRampToValueAtTime(v:number){note.gain=v;},exponentialRampToValueAtTime(){}},connect(){}};}
  }
  const context=vm.createContext({AudioContext,localStorage:{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v)}});
  vm.runInContext((await readFile('src/audio.js','utf8')).replace(/export /g,'')+'\nglobalThis.audio={playCue,enableAudio,setVolume,getVolume,isAudioEnabled};',context);
  const a=context.audio;a.playCue('night');assert.equal(played.length,0);await a.enableAudio();assert.equal(played.length,1);assert.equal(a.isAudioEnabled(),true);
  played.length=0;a.playCue('assistant');assert.equal(played.length,2);assert.notEqual(played[0].frequency,played[1].frequency);assert.ok(played[1].start!>played[0].start!);
  played.length=0;a.playCue('night');assert.equal(played.length,2);assert.ok(played.every(p=>p.frequency<200));
  played.length=0;a.playCue('timer');assert.equal(played.length,3);
  a.setVolume(0);played.length=0;a.playCue('attention');assert.equal(played.length,0);assert.equal(stored.get('ravenswood-volume'),'0');
  a.setVolume(10);assert.equal(a.getVolume(),1);a.setVolume(-1);assert.equal(a.getVolume(),0);a.setVolume(Number.NaN);assert.equal(a.getVolume(),.4);
});

import {createMusicPlayer,trackForPhase,tracks} from '../src/music.js';
import {testApp,request} from './http.ts';

test('music follows public phases, crossfades without restarting visits, and respects pause/mute',async()=>{
  const voices:any[]=[];let tick=()=>{};const stored=new Map<string,string>();
  const player=createMusicPlayer({makeAudio:(url:string)=>{const audio={url,volume:1,plays:0,pauses:0,removeAttribute(){},load(){},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;}};voices.push(audio);return audio;},schedule:(fn:()=>void)=>{tick=fn;return 1;},cancel:()=>{},storage:{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v)}});
  player.update('discussion');assert.equal(voices.length,0);player.activate();await Promise.resolve();
  assert.equal(voices.length,1);assert.match(voices[0].url,/182_Country_Village/);assert.equal(voices[0].loop,true);
  for(let i=0;i<30;i++)tick();assert.ok(voices[0].volume>0);
  player.update('discussion');assert.equal(voices[0].plays,1);
  player.update('night_choices');assert.equal(voices.length,2);assert.equal(voices[1].volume,0);
  tick();assert.ok(voices[1].volume>0);assert.ok(voices[0].volume>0);
  for(let i=0;i<30;i++)tick();assert.ok(voices[0].pauses>0);
  player.update('night_results');assert.equal(voices.length,2);
  player.update('night_results',true);assert.ok(voices[1].pauses>0);
  const before=voices[1].plays;player.update('night_results',false);assert.equal(voices[1].plays,before+1);
  player.toggleMute();assert.equal(player.muted,true);assert.equal(stored.get('ravenswood-music-muted'),'true');
  player.update('nominations');assert.equal(voices.length,2);player.toggleMute();assert.equal(voices.length,3);
  player.setVolume(0);for(let i=0;i<30;i++)tick();assert.equal(voices[2].volume,0);
  assert.equal(trackForPhase('dawn'),'village');assert.equal(trackForPhase('ended'),'ending');
  voices[2].onerror();assert.match(player.status,/Musik fehlt/);player.dispose();
});

test('audio assets are served with the correct type and missing tracks report 404',async()=>{
  const app=testApp();try{
    assert.equal((await request(app,'/assets/audio/credits.html')).status,200);
    assert.equal((await request(app,'/assets/audio/missing.mp3')).status,404);
    assert.equal((await request(app,'/assets/audio/../../.env')).status,400);
    // A temporary fixture verifies the real MP3 static route without requiring network.
    const {writeFile,rm}=await import('node:fs/promises');
    await writeFile('assets/audio/test-fixture.mp3',Buffer.from('ID3 audio fixture'));
    try{const response=await request(app,'/assets/audio/test-fixture.mp3');assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],'audio/mpeg');}finally{await rm('assets/audio/test-fixture.mp3');}
    assert.equal(Object.keys(tracks).length,4);
  }finally{await app.close();}
});
