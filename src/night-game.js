const symbols=[{icon:'☾',name:'Mond'},{icon:'✦',name:'Stern'},{icon:'♧',name:'Klee'},{icon:'◆',name:'Raute'}];
// Local activity only: scores and symbol choices never enter the game state.
export function createNightGame(random=Math.random){
  let key='',round=0,target=0,feedback='';
  function next(){target=(target+1+Math.floor(random()*(symbols.length-1)))%symbols.length;}
  return {
    reset(nextKey){if(key===nextKey)return;key=nextKey;round=0;feedback='';next();},
    get complete(){return round>=6;},
    get rounds(){return round;},
    choose(index){if(index!==target){feedback='Versuch es noch einmal.';return false;}round++;feedback='Gefunden!';next();return true;},
    markup(required=false){return `<section class="night-game" aria-label="Nachtspiel"><span class="eyebrow">NACHTSPIEL · STERNENSUCHE</span><h2>Finde das Zeichen</h2><p>${required?'Finde sechs Zeichen. Deine Bereitschaft wird danach automatisch bestätigt.':'Spiel weiter, bis der Morgen beginnt. Neue Informationen unterbrechen das Spiel automatisch.'}</p><div class="night-game-prompt" aria-live="polite" aria-atomic="true"><span aria-hidden="true">${symbols[target].icon}</span><strong>Tippe auf: ${symbols[target].name}</strong></div><div class="night-game-grid">${symbols.map((s,i)=>`<button type="button" data-night-symbol="${i}" aria-label="${s.name}"><span aria-hidden="true">${s.icon}</span></button>`).join('')}</div><p class="night-game-score">${required?`${Math.min(round,6)} / 6 Zeichen`:`${round} Zeichen gefunden`} · <span>${feedback||'Jedes richtige Zeichen zählt.'}</span></p><small>Das Nachtspiel hat keinen Einfluss auf Rollen oder Fähigkeiten.</small></section>`;}
  };
}
