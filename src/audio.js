let context;
let enabled=false;
let volume=Number(localStorage.getItem('ravenswood-volume')??0.4);
if(!Number.isFinite(volume))volume=.4;
const notes={night:[[146.8,0,1.1],[110,.45,1.4]],player:[[587.3,0,.4]],assistant:[[440,0,.35],[587.3,.3,.5]],attention:[[659.3,0,.4],[523.3,.25,.65]],timer:[[392,0,.35],[329.6,.3,.4],[261.6,.65,.8]]};
export async function enableAudio(){context??=new AudioContext();await context.resume();enabled=true;playCue('player');}
export function isAudioEnabled(){return enabled;}
export function setVolume(v){volume=Number.isFinite(v)?Math.max(0,Math.min(1,v)):.4;localStorage.setItem('ravenswood-volume',String(volume));}
export function getVolume(){return volume;}
export function playCue(kind){if(!enabled||!context||context.state!=='running'||volume===0)return;for(const [hz,delay,duration] of notes[kind]??notes.player){const t=context.currentTime+delay;const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume*.3,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+duration+.03);}}
