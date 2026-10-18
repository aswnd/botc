import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

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
    const name=initial.laptop.controls.find((c:any)=>c.tag==='input'&&c.type==='text');
    assert.ok(name);
    const filled=await command({action:'fill',control:name.id,value:'Protocol Tester'});
    assert.ok(filled.laptop.controls.some((c:any)=>c.value==='Protocol Tester'));
    const invalid=await command({action:'unsupported'});
    assert.match(invalid.error,/Unknown action/);
    assert.ok(invalid.observation.laptop);
    const projector=await command({action:'assert',screen:'projector',noOverflow:true,noPageErrors:true});
    assert.ok(projector.step>initial.step);
    const reloaded=await command({action:'reload'});
    assert.ok(reloaded.laptop.controls.length>0);
    child.stdin.write(JSON.stringify({action:'finish',outcome:'pass',findings:[]})+'\n');
    const [code]=await exited;
    assert.equal(code,0,errors);
    const report=JSON.parse(await readFile(join(initial.output,'report.json'),'utf8'));
    assert.equal(report.result.status,'finished');
    assert.equal(report.result.outcome,'pass');
    assert.ok(report.transcript.some((entry:any)=>entry.command.action==='reload'));
    await access(join(initial.output,'trace.zip'));
    await access(initial.laptop.screenshot);
    await access(initial.projector.screenshot);
  } finally {child.kill();child.stdin.destroy();}
});
