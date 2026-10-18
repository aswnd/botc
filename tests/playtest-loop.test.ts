import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pool } from '../scripts/playtest-loop.ts';

test('rolling pool runs exactly ten agents with three active and fills free slots',async()=>{
  let active=0,peak=0;const seen:number[]=[];const done:number[]=[];
  await pool(10,3,async id=>{
    seen.push(id);active++;peak=Math.max(peak,active);
    await new Promise(ok=>setTimeout(ok,id===1?40:2));
    active--;done.push(id);
  });
  assert.equal(peak,3);assert.equal(active,0);
  assert.deepEqual(seen,[1,2,3,4,5,6,7,8,9,10]);
  assert.ok(done.indexOf(4)<done.indexOf(1));
});

test('real controller isolates, validates and integrates ten fake agents without API calls',()=>{
  const root=mkdtempSync(join(tmpdir(),'playtest-loop-test-'));
  function command(bin:string,args:string[]){const r=spawnSync(bin,args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;}
  try {
    mkdirSync(join(root,'bin'));mkdirSync(join(root,'node_modules'));
    writeFileSync(join(root,'.gitignore'),'test-results/\nnode_modules/\n');
    writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{test:'node -e "process.exit(0)"'}}));
    writeFileSync(join(root,'bin','codex'),`#!/usr/bin/env node
const fs=require('fs');const path=require('path');
if(process.argv.includes('--help'))process.exit(0);
const cwd=process.argv[process.argv.indexOf('-C')+1];
const id=path.basename(path.dirname(cwd)).replace('agent-','');
setTimeout(()=>{fs.writeFileSync(path.join(cwd,'fix-'+id+'.txt'),'fixed '+id);console.log(JSON.stringify({ok:true}));},40);
`,{mode:0o755});
    command('git',['init','-q']);command('git',['add','.']);
    command('git',['-c','user.name=Test','-c','user.email=test@localhost','commit','-qm','baseline']);
    const run=spawnSync(process.execPath,[resolve('scripts/playtest-loop.ts')],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH}});
    assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
    const dir=readdirSync(join(root,'test-results'))[0];
    const summary=JSON.parse(readFileSync(join(root,'test-results',dir,'summary.json'),'utf8'));
    assert.equal(summary.results.length,10);
    assert.ok(summary.results.every((r:any)=>r.status==='merged'));
    for(let id=1;id<=10;id++)assert.equal(readFileSync(join(root,`fix-${id}.txt`),'utf8'),`fixed ${id}`);
    assert.equal(command('git',['status','--porcelain']),'');
  }finally{rmSync(root,{recursive:true,force:true});}
});
