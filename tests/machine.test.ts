import { applyCommand, testDecider } from './engine-helper.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accepts, machineState, transition, transitions } from '../server/machine.ts';
import { makeGame, privateAction } from '../server/engine.ts';
import type { Game, GameMasterServices, DecisionContext } from '../shared/types.ts';

const fixture=()=>makeGame({names:['A','B','C','D','E','F','G'],assistant:0,seed:42,
  roles:['washerwoman','chef','empath','fortune_teller','soldier','poisoner','imp'],minimumVisitMs:0});
async function visitRound(g:Game,services:GameMasterServices){
  const phase=g.phase;
  while(g.phase===phase){
    const p=g.players[g.queueIndex],action=privateAction(g,p);
    const targets=g.players.filter(x=>!action?.excludeSelf||x.id!==p.id).slice(0,action?.count??0).map(x=>x.id);
    g=await applyCommand(g,{type:'visit',playerId:p.id,targets},services);
  }
  return g;
}
test('machine rejects every unlisted phase edge and guards substates before invoking services',async()=>{
  const g=fixture();
  for(const from of Object.keys(transitions))for(const to of Object.keys(transitions)){
    const copy=structuredClone(g);copy.phase=from as Game['phase'];
    if(transitions[copy.phase].includes(to as Game['phase'])){transition(copy,to as Game['phase']);assert.equal(copy.phase,to);}
    else assert.throws(()=>transition(copy,to as Game['phase']),/Illegal engine transition/);
  }
  assert.equal(machineState(g),'announcement');assert.equal(accepts(g,{type:'visit'}),false);
  const before=structuredClone(g);let calls=0;
  await assert.rejects(applyCommand(g,{type:'close_day'},{decide:async()=>{calls++;throw Error();},narrate:async()=>{calls++;return '';}}));
  assert.equal(calls,0);assert.deepEqual(g,before);
  g.phase='nominations';g.announcement=undefined;g.nomination={nominator:'p1',nominee:'p2'};
  assert.equal(machineState(g),'voting');assert.equal(accepts(g,{type:'nominate'}),false);assert.equal(accepts(g,{type:'vote_confirm'}),true);
  g.paused=true;assert.equal(machineState(g),'paused');assert.equal(accepts(g,{type:'vote_confirm'}),false);assert.equal(accepts(g,{type:'pause'}),true);
});
test('services receive isolated structured contexts and cannot mutate state or legal options',async()=>{
  let decisions=0,narrations=0;
  const services:GameMasterServices={decide:async r=>{
    decisions++;
    const context=r.context as DecisionContext;
    assert.equal(context.schemaVersion,1);assert.equal(context.phase,'night_choices');
    assert.equal(context.grimoire.length,7);assert.equal(context.information.length,7);
    assert.ok(context.choices.p4);assert.equal(context.redHerring.startsWith('p'),true);
    context.grimoire[0].name='mutated';context.choices.p4.length=0;
    r.options.push({id:'injected-illegal',label:'not legal'});
    return {choice:'injected-illegal',reason:'untrusted'};
  },narrate:async r=>{
    narrations++;assert.equal(r.audience,'public');assert.equal(r.language,'de');
    assert.equal(r.state.reveal,undefined);assert.equal(r.state.debrief,undefined);
    assert.ok(r.state.players.every(p=>!('role' in p)&&!('character' in p)));
    r.state.players[0].name='mutated';r.announcement.text='mutated';
    return 'Nebel zieht durch die Straßen.';
  }};
  let g=fixture();g.demo=true;g=await applyCommand(g,{type:'ack'},services);
  g=await visitRound(g,services);assert.equal(narrations,1);
  assert.match(g.announcement!.text,/Die Nacht beginnt/);assert.match(g.announcement!.text,/Nebel/);
  const before=structuredClone(g);
  g=await applyCommand(g,{type:'ack'},services);assert.deepEqual(before.players,g.players);
  await assert.rejects(visitRound(g,services),/ungültige Entscheidung/);assert.ok(decisions>0);
  assert.equal(g.players[0].name,'A');
  assert.ok(g.decisions.every(d=>d.choice!=='injected-illegal'));
});
test('narration failure stops the action and preserves the saved state',async()=>{
  let g=fixture();g.announcement=undefined;
  for(let i=0;i<6;i++)g=await applyCommand(g,{type:'visit',playerId:g.players[i].id,targets:[]});
  const before=structuredClone(g);
  await assert.rejects(applyCommand(g,{type:'visit',playerId:'p7',targets:[]},{decide:testDecider,narrate:async()=>{throw Error('offline');}}),/offline/);
  assert.deepEqual(g,before);
});
