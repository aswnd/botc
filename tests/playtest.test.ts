import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { startSession } from '../scripts/harness/session.ts';

test('check survives replacement of a checkbox and its temporary control ID', {timeout:30000}, async()=>{
  const session=await startSession();
  try {
    // Vote updates replace the UI tree. Reproduce that lifecycle without a game
    // or an AI call, preserving checked state but discarding temporary IDs.
    await session.pages.laptop.evaluate(()=>{
      const input=document.querySelector('#demo')!;
      input.addEventListener('change',()=>{
        const replacement=input.cloneNode(true) as HTMLInputElement;
        replacement.removeAttribute('data-harness-id');
        input.replaceWith(replacement);
      },{once:true});
    });
    const initial=await session.observe();
    const control=initial.laptop.controls.find(c=>c.type==='checkbox')!;
    const checked=await session.act({action:'check',control:control.id,checked:true});
    assert.equal(checked.laptop.controls.find(c=>c.type==='checkbox')!.checked,true);
    const unchanged=await session.act({action:'check',selector:'#demo',checked:true});
    assert.equal(unchanged.laptop.controls.find(c=>c.type==='checkbox')!.checked,true);
    const cleared=await session.act({action:'check',selector:'#demo',checked:false});
    assert.equal(cleared.laptop.controls.find(c=>c.type==='checkbox')!.checked,false);
  } finally {await session.close({outcome:'regression-check'});}
});

test('playtest CLI reports server startup errors as JSON and exits unsuccessfully', {timeout:15000}, async()=>{
  const preload='import {Server} from "node:net"; Server.prototype.listen=function(){queueMicrotask(()=>this.emit("error",Object.assign(new Error("listen EPERM: injected denial"),{code:"EPERM"})));return this;}';
  const child=spawn(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(preload)}`,'scripts/playtest.ts'],{stdio:['pipe','pipe','pipe']});
  let output='',errors='';
  child.stdout.on('data',chunk=>output+=chunk);
  child.stderr.on('data',chunk=>errors+=chunk);
  const [code]=await once(child,'exit');
  assert.equal(code,1,errors);
  const response=JSON.parse(output.trim());
  assert.equal(response.status,'failed');
  assert.match(response.error,/listen EPERM: injected denial/);
  assert.doesNotMatch(errors,/unsettled top-level await/);
});

test('playtest JSON adapter operates both screens, recovers from invalid input and saves artifacts', {timeout:90000}, async()=>{
  // No game is created: this checks the real browser protocol without AI charges.
  const child=spawn(process.execPath,['scripts/playtest.ts'],{stdio:['pipe','pipe','pipe']});
  const exited=once(child,'exit');
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  async function response(){const line=await lines.next();assert.equal(line.done,false,errors);return JSON.parse(line.value);}
  async function command(value:unknown){child.stdin.write(JSON.stringify(value)+'\n');return response();}
  try {
    const initial=await response();
    assert.ok(initial.laptop.controls.length>0,JSON.stringify(initial));
    assert.ok(initial.projector.screenshot);
    const joined=await command({action:'open-phone',screen:'phone1'});
    const name=joined.phones.phone1.controls.find((c:any)=>c.tag==='input'&&c.type==='text');
    assert.ok(name);
    const filled=await command({action:'fill',screen:'phone1',control:name.id,value:'Protocol Tester'});
    assert.ok(filled.phones.phone1.controls.some((c:any)=>c.value==='Protocol Tester'));
    await command({action:'select',screen:'phone1',selector:'#seat',value:'1'});
    const registered=await command({action:'click',screen:'phone1',selector:'[data-action="register"]'});
    assert.match(registered.phones.phone1.text,/Hallo Protocol Tester/);
    const persisted=await command({action:'reload',screen:'phone1'});
    assert.match(persisted.phones.phone1.text,/Hallo Protocol Tester/);
    const isolated=await command({action:'open-phone',screen:'phone2'});
    assert.ok(isolated.phones.phone2.controls.some((c:any)=>c.label==='name'||c.tag==='input'));
    assert.doesNotMatch(isolated.phones.phone2.text,/Hallo Protocol Tester/);
    const replaced=await command({action:'replace-phone',screen:'phone1'});
    assert.doesNotMatch(replaced.phones.phone1.text,/Hallo Protocol Tester/);
    assert.ok(replaced.phones.phone1.controls.some((c:any)=>c.tag==='input'));
    const focused=await command({action:'focus',screen:'phone2'});
    assert.equal(focused.error,undefined);
    const invalid=await command({action:'unsupported'});
    assert.match(invalid.error,/Unknown action/);
    assert.ok(invalid.observation.laptop);
    const projector=await command({action:'assert',screen:'projector',noOverflow:true,noPageErrors:true});
    assert.ok(projector.step>initial.step);
    const reloaded=await command({action:'reload'});
    assert.ok(reloaded.laptop.controls.length>0);
    for(const checked of [true,true,false]){
      const toggled=await command({action:'check',selector:'#demo',checked});
      assert.equal(toggled.error,undefined);
      assert.equal(toggled.laptop.controls.find((c:any)=>c.type==='checkbox').checked,checked);
    }
    await command({action:'resize',width:390,height:844});
    const mobileReload=await command({action:'reload'});
    assert.equal(mobileReload.error,undefined,'online status is hidden by the mobile layout');
    assert.equal(mobileReload.laptop.overflow,false);
    child.stdin.write(JSON.stringify({action:'finish',outcome:'pass',findings:[]})+'\n');
    const [code]=await exited;
    assert.equal(code,0,errors);
    const report=JSON.parse(await readFile(join(initial.output,'report.json'),'utf8'));
    assert.equal(report.result.status,'finished');
    assert.equal(report.result.outcome,'pass');
    assert.ok(report.transcript.some((entry:any)=>entry.command.action==='reload'));
    await access(join(initial.output,'trace.zip'));
    await access(join(initial.output,'phone1-trace.zip'));
    await access(join(initial.output,'phone2-trace.zip'));
    assert.ok(report.transcript.some((entry:any)=>entry.command.action==='replace-phone'));
    await access(initial.laptop.screenshot);
    await access(initial.projector.screenshot);
  } finally {child.kill();child.stdin.destroy();}
});
