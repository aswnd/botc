import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeGame, publicView } from '../server/engine.ts';
import { rulesContext, searchRules } from '../server/knowledge.ts';
import { testApp, request } from './http.ts';

const names=['Anna','Ben','Clara','David','Emilia','Felix','Greta','Hannes'];
test('PDF wiki preserves source hashes, page provenance, and unique IDs',()=>{
  const {articles}=JSON.parse(readFileSync('shared/wiki/manuals.json','utf8'));
  assert.equal(new Set(articles.map((a:any)=>a.source)).size,8);
  assert.equal(new Set(articles.map((a:any)=>a.id)).size,articles.length);
  for(const a of articles){assert.ok(a.page>0);assert.ok(a.text.length>0&&a.text.length<=2400);assert.equal(a.sha256,createHash('sha256').update(readFileSync(a.source)).digest('hex'));}
  const hits=searchRules('poisoned ability');assert.ok(hits.some(a=>a.page&&a.source.endsWith('.pdf')));assert.ok(hits.every(a=>a.edition==='trouble-brewing'));assert.ok(searchRules('Wie stimmen Tote ab?').some(a=>/Tod|dead|vot/i.test(a.title+' '+a.text)));
});
test('Q&A allowlist excludes demo reveals, Spy knowledge, unpublished deaths, and secret markers',()=>{
  const g=makeGame({names,assistant:0,demo:true});g.phase='night_choices';g.publicDead=[];
  const before=rulesContext(publicView(g),'p1');
  g.players[0].role='spy';g.players[0].apparent='spy';g.players[0].team='evil';g.players[1].alive=false;
  g.players[0].info=[{night:1,text:'SECRET-NIGHT-INFO',grimoire:[{id:'secret-id',name:'SECRET-NAME',seat:1,character:'imp',team:'evil',alive:true,markers:['SECRET-MARKER']}]}];
  g.bluffs=['saint','mayor','slayer'];g.redHerring='SECRET-HERRING';g.poison={source:'p1',target:'p2'};g.story.push({day:0,night:1,text:'SECRET-STORY'});
  assert.deepEqual(rulesContext(publicView(g),'p1'),before);
  g.phase='ended';const serialized=JSON.stringify(rulesContext(publicView(g),'p1'));assert.ok(!serialized.includes('SECRET'));assert.ok(!serialized.includes('reveal'));assert.ok(!serialized.includes('debrief'));
});
test('daytime Q&A uses session identity, keeps old chat local, and cannot change game state',async()=>{
  const app=testApp({dbPath:':memory:'});try{
    await request(app,'/api/new',{method:'POST',data:{names,assistant:0,demo:true,budget:5}});
    const g=app.getGame()!;g.phase='discussion';g.announcement=undefined;
    app.store.addChat(g.id,'p1','SECRET-OLD-QUESTION','SECRET-OLD-ANSWER');
    app.store.addChat(g.id,'p2','OTHER-PRIVATE-QUESTION','OTHER-PRIVATE-ANSWER');
    assert.equal((await request(app,'/api/private/qa/context')).status,400);
    const opened=(await request(app,'/api/private/open',{method:'POST',data:{playerId:'p1'}})).json();
    const headers={'x-terminal-token':opened.token};
    const context=(await request(app,'/api/private/qa/context',{headers})).json();assert.equal(context.speaker.id,'p1');
    let captured:any;app.ai.key='test';app.ai.fetcher=async(_url,init)=>{captured=JSON.parse(String(init?.body));return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Tote behalten eine letzte Stimme.'})}]}]}));};
    const before=JSON.stringify(g);
    const result=await request(app,'/api/private/chat',{method:'POST',headers,data:{question:'Wie stimmen Tote ab?',playerId:'p2'}});
    assert.equal(result.status,200);assert.match(result.json().answer,/letzte Stimme/);assert.equal(JSON.parse(captured.input).speaker.id,'p1');assert.ok(!JSON.stringify(captured).includes('SECRET'));assert.ok(!JSON.stringify(captured).includes('OTHER-PRIVATE'));assert.equal(JSON.stringify(app.getGame()),before);
    assert.equal(result.json().history.length,4);assert.ok(!JSON.stringify(result.json()).includes('OTHER-PRIVATE'));
    const search=await request(app,'/api/rules/search?q=poisoned');assert.equal(search.status,200);assert.ok(search.json().articles.length>0);
    await request(app,'/api/private/hide',{method:'POST',headers,data:{}});assert.equal((await request(app,'/api/private/qa/context',{headers})).status,400);
  }finally{await app.close();}
});
