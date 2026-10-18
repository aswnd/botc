import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp as createApp,request } from './http.ts';

const names=['Anna','Ben','Clara','David','Emilia','Felix','Greta','Hannes'];
async function fresh(app:ReturnType<typeof createApp>){const r=await request(app,'/api/new',{method:'POST',data:{names,assistant:0,demo:true,budget:5}});assert.equal(r.status,200);return r.json().game;}
async function command(app:ReturnType<typeof createApp>,type:string,rest:Record<string,unknown>={}){return request(app,'/api/command',{method:'POST',data:{version:app.getGame()!.version,commandId:crypto.randomUUID(),command:{type,...rest}}});}

test('HTTP delivers app/assets and rejects secret files and cross-origin writes',async()=>{
  const app=createApp({dbPath:':memory:'});try{
    assert.equal((await request(app,'/')).status,200);assert.match((await request(app,'/src/app.js')).body,/privateScreen/);
    const favicon=await request(app,'/favicon.ico');assert.equal(favicon.status,302);assert.equal(favicon.headers.Location,'/src/favicon.svg');
    assert.equal((await request(app,'/src/favicon.svg')).status,200);
    assert.equal((await request(app,'/.env')).status,400);assert.equal((await request(app,'/data/game.sqlite')).status,400);
    const r=await request(app,'/api/new',{method:'POST',data:{},headers:{origin:'https://evil.example'}});assert.equal(r.status,400);
    const rules=(await request(app,'/api/rules')).json();assert.equal(rules.characters.length,22);assert.ok(rules.rules.length>=6);
  }finally{await app.close();}
});
test('private visit tokens isolate data, enforce queue, clear on finish, and replay safely',async()=>{
  const app=createApp({dbPath:':memory:'});try{
    await fresh(app);await command(app,'ack');
    const wrong=await request(app,'/api/private/open',{method:'POST',data:{playerId:'p2'}});assert.equal(wrong.status,400);
    const opened=await request(app,'/api/private/open',{method:'POST',data:{playerId:'p1'}});assert.equal(opened.status,200);const token=opened.json().token;
    assert.equal((await request(app,'/api/private')).status,400);
    assert.equal((await request(app,'/api/private',{headers:{'x-terminal-token':token}})).json().id,'p1');
    assert.equal((await command(app,'attention')).status,400,'assistant cannot interrupt a private session');
    const id=crypto.randomUUID();const data={version:app.getGame()!.version,commandId:id,targets:[]};
    const first=await request(app,'/api/private/finish',{method:'POST',data,headers:{'x-terminal-token':token}});assert.equal(first.status,200);assert.equal(first.json().done,true);
    const version=app.getGame()!.version;
    const again=await request(app,'/api/private/finish',{method:'POST',data,headers:{'x-terminal-token':token}});assert.equal(again.status,200);assert.equal(app.getGame()!.version,version);assert.equal(app.getGame()!.queueIndex,1);
    assert.equal((await request(app,'/api/private',{headers:{'x-terminal-token':token}})).status,400);
    const second=(await request(app,'/api/private/open',{method:'POST',data:{playerId:'p2'}})).json();
    const delayed=await request(app,'/api/private/finish',{method:'POST',data,headers:{'x-terminal-token':token}});
    assert.equal(delayed.json().view,undefined,'late retry must not receive the next player’s private view');
    assert.equal(delayed.json().done,true);assert.notEqual(second.token,token);
    const pub=(await request(app,'/api/state')).body;assert.ok(!pub.includes('redHerring'));assert.ok(!pub.includes('decisions'));
  }finally{await app.close();}
});
test('stale and duplicate assistant commands do not apply twice',async()=>{
  const app=createApp({dbPath:':memory:'});try{await fresh(app);const data={version:0,commandId:crypto.randomUUID(),command:{type:'ack'}};
    assert.equal((await request(app,'/api/command',{method:'POST',data})).status,200);const v=app.getGame()!.version;
    assert.equal((await request(app,'/api/command',{method:'POST',data})).status,200);assert.equal(app.getGame()!.version,v);
    data.commandId=crypto.randomUUID();assert.equal((await request(app,'/api/command',{method:'POST',data})).status,409);
  }finally{await app.close();}
});
test('refresh release and inactivity clear only the private session, not progress',async()=>{
  let now=1000;const app=createApp({dbPath:':memory:',clock:()=>now});try{
    await fresh(app);await command(app,'ack');const open=()=>request(app,'/api/private/open',{method:'POST',data:{playerId:'p1'}});
    await open();assert.equal((await request(app,'/api/state')).json().terminalBusy,true);now+=301000;assert.equal((await request(app,'/api/state')).json().terminalBusy,false);assert.equal(app.getGame()!.queueIndex,0);
    await open();assert.equal((await request(app,'/api/private/release',{method:'POST',data:{}})).status,200);assert.equal(app.getGame()!.queueIndex,0);
  }finally{await app.close();}
});
test('SQLite restart resumes the exact night round without resurrecting private sessions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ravenswood-test-'));const dbPath=join(dir,'game.sqlite');let app=createApp({dbPath});
  try{await fresh(app);await command(app,'ack');const open=await request(app,'/api/private/open',{method:'POST',data:{playerId:'p1'}});await request(app,'/api/private/finish',{method:'POST',data:{version:app.getGame()!.version,commandId:crypto.randomUUID(),targets:[]},headers:{'x-terminal-token':open.json().token}});
    const before=JSON.parse(JSON.stringify(app.getGame()));await app.close();app=createApp({dbPath});assert.deepEqual(app.getGame(),before);assert.equal((await request(app,'/api/state')).json().terminalBusy,false);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('real-game minimum visit duration is enforced on the server',async()=>{
  let now=1000;const app=createApp({dbPath:':memory:',clock:()=>now});try{
    const r=await request(app,'/api/new',{method:'POST',data:{names,assistant:0,demo:false,budget:5}});assert.equal(r.status,200);await command(app,'ack');
    const open=(await request(app,'/api/private/open',{method:'POST',data:{playerId:'p1'}})).json();const finish=()=>request(app,'/api/private/finish',{method:'POST',data:{version:app.getGame()!.version,commandId:crypto.randomUUID(),targets:[]},headers:{'x-terminal-token':open.token}});
    assert.equal((await finish()).status,400);now+=10000;assert.equal((await finish()).status,200);
  }finally{await app.close();}
});
