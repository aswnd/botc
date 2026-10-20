import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nightProgress} from '../src/night-progress.js';

test('night guide distinguishes needing action, waiting for step two, and finishing the night',()=>{
 const g={phase:'night_choices',night:2};
 assert.match(nightProgress(g,{phase:g.phase,submitted:false}),/Du bist jetzt dran/);
 assert.match(nightProgress(g,{phase:g.phase,submitted:true}),/Schritt 1 bestätigt – Schritt 2 folgt/);
 assert.match(nightProgress(g,{phase:g.phase,submitted:true},{resolving:true}),/Du musst noch einmal bestätigen/);
 g.phase='night_results';
 assert.match(nightProgress(g,{phase:g.phase,submitted:false}),/SCHRITT 2 VON 2/);
 assert.match(nightProgress(g,{phase:g.phase,submitted:true}),/Für diese Nacht bist du fertig/);
 assert.match(nightProgress(g,null,{concealed:true}),/Öffne deinen privaten Bildschirm/);
 assert.match(nightProgress({...g,paused:true}),/Bitte warten/);
 g.phase='dawn';assert.equal(nightProgress(g),'');
});

test('game master spinner appears only during resolution, including on concealed phones',()=>{
 const g={phase:'night_choices',night:1};
 for(const concealed of [false,true]){
  const html=nightProgress(g,null,{resolving:true,concealed});
  assert.match(html,/class="gm-spinner" aria-hidden="true"/);
  assert.match(html,/Die Spielleitung wertet die Nacht aus/);
  assert.doesNotMatch(nightProgress(g,null,{concealed}),/gm-spinner/);
 }
 assert.doesNotMatch(nightProgress({...g,phase:'night_results'}),/gm-spinner/);
});

test('phone night is continuous with no empty second confirmation or finished message',()=>{
 const g={phone:true,phase:'night_choices',night:1};
 assert.match(nightProgress(g,{phase:g.phase,submitted:true}),/Bleib im Nachtspiel/);
 assert.doesNotMatch(nightProgress(g,{phase:g.phase,submitted:true}),/SCHRITT|Schritt 2|fertig/);
 g.phase='night_results';
 assert.match(nightProgress(g,{phase:g.phase,submitted:false}),/Neue Information für dich/);
 assert.match(nightProgress(g,{phase:g.phase,submitted:true}),/Bleib im Nachtspiel/);
 assert.match(nightProgress(g,null,{resolving:true,concealed:true}),/gm-spinner/);
});
