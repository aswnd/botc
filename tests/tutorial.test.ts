import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testApp,request} from './http.ts';
import {tutorialRoles,tutorialSteps} from '../src/tutorial.js';
import {tutorialScreen} from '../src/tutorial-ui.js';
import {CHARACTERS,RULES,categoryName} from '../shared/characters.ts';
const names=['Anna','Ben','Clara','David','Emilia','Felix','Greta','Hannes'];
const post=(app:any,data:any)=>request(app,'/api/tutorial',{method:'POST',data});
test('guided tutorial: complete exercises, reject stale clicks, render all roles, preserve real game and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'clocktower-tutorial-'));
 let app=testApp({dbPath:join(dir,'game.sqlite')});
 try{
  await request(app,'/api/new',{method:'POST',data:{names,assistant:0,budget:0,demo:true}});
  const original=JSON.stringify(app.getGame());
  assert.equal((await post(app,{action:'start',names})).status,400);
  await request(app,'/api/command',{method:'POST',data:{version:app.getGame()!.version,commandId:crypto.randomUUID(),command:{type:'pause'}}});
  const paused=JSON.stringify(app.getGame());assert.notEqual(original,paused);
  let r=await post(app,{action:'start',names});assert.equal(r.status,200);
  let t=r.json().tutorial;
  const html=tutorialScreen(t,{characters:CHARACTERS,rules:RULES,categories:categoryName},false,false);
  for(const c of CHARACTERS)assert.ok(html.includes(c.name));
  assert.equal((await post(app,{action:'next',version:0})).status,400);
  assert.equal((await request(app,'/api/new',{method:'POST',data:{names,assistant:0,budget:0,demo:true}})).status,400);
  const steps=tutorialSteps(names);
  for(let i=0;i<steps.length;i++){
   assert.equal(t.step,i);
   const s=steps[i];
   if(s.choices){
    assert.equal((await post(app,{action:'next',version:t.version})).status,400);
    if(s.vote){
     for(let choice=0;choice<names.length;choice++){r=await post(app,{action:'answer',choice,version:t.version});assert.equal(r.status,200);t=r.json().tutorial;}
    }else{
     r=await post(app,{action:'answer',choice:(s.correct+1)%s.choices.length,version:t.version});t=r.json().tutorial;assert.equal(t.complete,false);
     r=await post(app,{action:'answer',choice:s.correct,version:t.version});t=r.json().tutorial;assert.equal(t.complete,true);
    }
   }
   if(i===3){await app.close();app=testApp({dbPath:join(dir,'game.sqlite')});assert.deepEqual((await request(app,'/api/state')).json().tutorial,t);}
   if(i<steps.length-1){r=await post(app,{action:'next',version:t.version});assert.equal(r.status,200);t=r.json().tutorial;if(steps[t.step].seconds)assert.ok(t.deadline>Date.now());}
  }
  assert.equal(JSON.stringify(app.getGame()),paused);
  r=await post(app,{action:'end',version:t.version});assert.equal(r.json().tutorial,null);
  assert.equal(JSON.stringify(app.getGame()),paused);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('tutorial scenarios fit 7–10 seats and do not expose undefined actors',()=>{
 for(let count=7;count<=10;count++){
  const ns=Array.from({length:count},(_,i)=>'Person '+(i+1)),steps=tutorialSteps(ns);
  assert.equal(tutorialRoles[count].length,count);
  assert.equal(new Set(tutorialRoles[count]).size,count);
  for(const step of steps){assert.ok(!step.text.includes('undefined'));if(step.actor!==undefined)assert.ok(step.actor>=0&&step.actor<count);}
 }
});
