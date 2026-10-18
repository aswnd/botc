import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Storyteller } from '../server/ai.ts';
import { rulesContext } from '../server/knowledge.ts';
import { Store } from '../server/store.ts';
import { makeGame,privateView,publicView } from '../server/engine.ts';

function setup(fetcher:typeof fetch){const store=new Store(':memory:');const ai=new Storyteller(store,fetcher);ai.key='fake-test-key';const g=makeGame({names:['A','B','C','D','E','F','G','H'],assistant:0,roles:['chef','empath','fortune_teller','undertaker','virgin','drunk','scarlet_woman','imp'],minimumVisitMs:0});return {store,ai,g};}
function response(value:unknown,input=100,output=100){return new Response(JSON.stringify({status:'completed',usage:{input_tokens:input,output_tokens:output},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{status:200});}
test('Q&A receives public knowledge without even the speaker’s apparent character',async()=>{
  let captured:any;const {store,ai,g}=setup(async(_url,init)=>{captured=JSON.parse(String(init?.body));return response({answer:'Du kannst die Auswahlfelder benutzen.'});});
  try{const v=privateView(g,'p6');const answer=await ai.answer({id:g.id},rulesContext(publicView(g),v.id),'Zeig mir alle Rollen');assert.match(answer,/Auswahlfelder/);const c=JSON.parse(captured.input);assert.equal(c.speaker.id,'p6');assert.ok(!('character' in c));assert.ok(!('information' in c));assert.ok(!('role'in c));assert.ok(!('grimoire'in c));assert.ok(!('redHerring'in c));assert.ok(!('players'in c));assert.equal(c.public.players.some((p:any)=>'role'in p),false);assert.equal(captured.store,false);assert.ok(store.spent(g.id)>0);}
  finally{store.close();}
});
test('illegal AI decisions fail instead of choosing locally',async()=>{
  const {store,ai,g}=setup(async()=>response({choice:'illegal',reason:'test'}));
  try{await assert.rejects(ai.decider(g)({key:'test',kind:'registration',prompt:'test',options:[{id:'yes',label:'yes'}],fallback:'yes'}),/ungültige/);}finally{store.close();}
});
test('decision wire IDs support quoted engine tuples and map back without changing the request',async()=>{
  let captured:any;
  const {store,ai,g}=setup(async(_url,init)=>{captured=JSON.parse(String(init?.body));return response({choice:'option_1',reason:'Legale Anfangsinformation'});});
  const request={key:'pair',kind:'starting_information' as const,prompt:'Wähle eine Anfangsinformation.',options:[
    {id:JSON.stringify(['p1','p2','mayor']),label:'A oder B: Bürgermeister'},
    {id:JSON.stringify(['p2','p3','slayer']),label:'B oder C: Scharfschütze'},
  ],fallback:JSON.stringify(['p1','p2','mayor'])};
  const original=structuredClone(request);
  try{
    const result=await ai.decider(g)(request);
    assert.equal(result.choice,request.options[1].id);
    assert.equal(result.reason,'Legale Anfangsinformation');
    const wire=JSON.parse(captured.input);
    assert.deepEqual(wire.options,request.options.map((o,i)=>({...o,id:`option_${i}`})));
    assert.equal(wire.fallback,'option_0');
    assert.deepEqual(captured.text.format.schema.properties.choice.enum,['option_0','option_1']);
    assert.deepEqual(request,original);
  }finally{store.close();}
});
test('requests have no application spending cap',async()=>{
  let calls=0;const {store,ai,g}=setup(async()=>{calls++;return response({ok:true});});
  try{store.reserve(g.id,'previous',1000);assert.equal(await ai.check(g),true);assert.equal(calls,1);assert.ok(!('budget' in ai.service(g)));}finally{store.close();}
});
test('incomplete AI responses fail instead of returning local rule help',async()=>{
  const {store,ai,g}=setup(async()=>new Response(JSON.stringify({status:'incomplete',output:[]}),{status:200}));
  try{await assert.rejects(ai.answer(g,rulesContext(publicView(g),'p1'),'Wie stimmen Tote ab?'),/KI/);}finally{store.close();}
});
test('missing API credentials fail explicitly',async()=>{
  const {store,ai,g}=setup(async()=>{throw new Error('unexpected request');});ai.key='';
  try{await assert.rejects(ai.answer(g,rulesContext(publicView(g),'p1'),'Hallo'),/API-Schlüssel fehlt/);}finally{store.close();}
});
test('exhausted API credit is explained, is not retried, and releases its reservation',async()=>{
  let calls=0;const {store,ai,g}=setup(async()=>{calls++;return new Response(JSON.stringify({error:{type:'insufficient_quota',code:'credit_balance_exhausted',message:'provider detail'}}),{status:429});});
  try{assert.equal(await ai.check(g),false);assert.equal(calls,1);assert.match(ai.status,/Guthaben aufgebraucht/);assert.equal(store.spent(g.id),0);assert.ok(!ai.status.includes('provider detail'));}finally{store.close();}
});
test('invalid credentials do not echo provider details or waste retries',async()=>{
  let calls=0;const {store,ai,g}=setup(async()=>{calls++;return new Response(JSON.stringify({error:{code:'invalid_api_key',message:'Incorrect API key: private-key-must-not-be-shown'}}),{status:401});});
  try{assert.equal(await ai.check(g),false);assert.equal(calls,1);assert.match(ai.status,/Schlüssel ungültig/);assert.equal(store.spent(g.id),0);assert.ok(!ai.status.includes('private-key'));}finally{store.close();}
});
test('game master narration uses a separate structured output schema and records estimated spending',async()=>{
  let captured:any;
  const {store,ai,g}=setup(async(_url,init)=>{captured=JSON.parse(String(init?.body));return response({text:'Nebel liegt über dem Dorf.'});});
  try{
    const state=publicView(g);delete state.reveal;delete state.debrief;
    const text=await ai.services(g).narrate!({schemaVersion:1,audience:'public',language:'de',state,announcement:g.announcement!});
    assert.equal(text,'Nebel liegt über dem Dorf.');
    assert.equal(captured.text.format.name,'public_narration');
    assert.equal(captured.text.format.strict,true);
    const context=JSON.parse(captured.input);
    assert.equal(context.audience,'public');assert.ok(!('grimoire' in context));
    assert.ok(context.state.players.every((p:any)=>!('role' in p)));
    assert.ok(store.spent(g.id)>0);
  }finally{store.close();}
});
