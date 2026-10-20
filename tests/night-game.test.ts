import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNightGame} from '../src/night-game.js';

test('six correct symbols complete readiness; mistakes and refreshes preserve the activity',()=>{
 const game=createNightGame(()=>0);game.reset('game:1');
 const names=['Mond','Stern','Klee','Raute'];
 const target=()=>names.findIndex(name=>game.markup().includes(`Tippe auf: ${name}`));
 assert.equal(game.choose((target()+1)%4),false);assert.equal(game.rounds,0);
 for(let i=0;i<6;i++){assert.equal(game.complete,false);assert.equal(game.choose(target()),true);game.reset('game:1');}
 assert.equal(game.complete,true);assert.match(game.markup(true),/6 \/ 6 Zeichen/);
 game.choose(target());assert.equal(game.rounds,7,'activity continues while others finish');
 game.reset('game:2');assert.equal(game.complete,false);assert.equal(game.rounds,0);
});
