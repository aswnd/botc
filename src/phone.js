import { createNightGame } from './night-game.js';
import { nightProgress } from './night-progress.js';
import { tutorialSteps, tutorialRoles } from './tutorial.js';
const root=document.querySelector('#root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let credentials;try{credentials=JSON.parse(localStorage.getItem('ravenswood-player')||'null');}catch{credentials=null;}
if(credentials){credentials={token:credentials.token,lobbyId:credentials.lobbyId};localStorage.setItem('ravenswood-player',JSON.stringify(credentials));}
let state=null,me=null,rules=null,error='',busy=false,concealed=false,targets=[],draftKey='',question='',name='',seat=1,dayTarget='',lastActivity=Date.now(),sequence=0;
const nightGame=createNightGame();
const button=(label,action,disabled=false)=>`<button class="secondary full" data-action="${action}" ${disabled||busy?'disabled':''}>${label}</button>`;
const chatText=s=>esc(s).replace(/\[([^\]\n]+)\]\((?:rulebook|trouble-brewing(?:-script)?|bad-moon-rising(?:-script)?|sects-violets(?:-script)?|travellers-fabled|rules|character):[^\s)]+\)/g,'$1');
const commandId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
async function api(path,data){const r=await fetch(path,{...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)}),headers:{'Content-Type':'application/json',...(credentials?.token?{'X-Player-Token':credentials.token}:{})}});const json=await r.json();if(!r.ok){const e=new Error(json.error||'Verbindung unterbrochen.');e.status=r.status;throw e;}return json;}
function remember(result){credentials={token:result.token,lobbyId:state.lobby.id};localStorage.setItem('ravenswood-player',JSON.stringify(credentials));}
function info(i){return `<article class="information"><small>Nacht ${i.night}</small><p>${esc(i.text)}</p>${i.grimoire?i.grimoire.map(p=>`<p><b>${esc(p.name)} ${p.alive?'':'†'}</b> · ${esc(rules.characters.find(c=>c.id===p.character)?.name)} · ${p.team==='good'?'gut':'böse'}<br/>${p.markers.map(esc).join(' · ')}</p>`).join(''):''}</article>`;}
const avatar=p=>p?.photo?`<img class="player-photo" src="${esc(p.photo)}" alt=""/>`:`<span class="player-photo placeholder" aria-hidden="true">${esc(p?.name?.slice(0,1)||'?')}</span>`;
function photoUpload(){const m=state.lobby.members.find(m=>m.id===me?.identity.id);return `<section class="photo-upload">${avatar(m)}<label>Dein Spielerfoto<input id="player-photo" type="file" accept="image/*"/></label><p>Wähle ein Foto, damit die anderen dich beim Nominieren erkennen.</p></section>`;}
async function uploadPhoto(file){
  if(!file)return;
  if(!file.type.startsWith('image/'))throw new Error('Bitte ein Bild wählen.');
  const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Das Foto konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
  try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d');const side=Math.min(image.naturalWidth,image.naturalHeight);ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,160,160);await api('/api/player/photo',{photo:canvas.toDataURL('image/jpeg',.8)});}catch(e){throw new Error(e.message||'Das Foto konnte nicht geladen werden.');}
}
function registration(){const l=state.lobby;return `<h1>Ravenswood</h1><p>Dein Handy · dein privater Spielzug.</p>${l.started?'<p>Die Anmeldung ist geschlossen. Bitte wende dich bei Anmeldeproblemen an die Assistenz auf dem Leiter-Handy.</p>':`<label>Dein Name<input id="name" maxlength="32" value="${esc(name)}" autocomplete="name"/></label><label>Dein Platz im Uhrzeigersinn<select id="seat">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${seat===i+1?'selected':''}>Platz ${i+1}${l.members.some(m=>m.seat===i+1)?' · belegt':''}</option>`).join('')}</select></label>${button('Für das Spiel anmelden','register')}`}`;}
function lobby(){const m=me.identity;return `<h1>Hallo ${esc(m.name)}</h1><p>Du sitzt auf Platz ${m.seat}. Die Assistenz startet auf dem Leiter-Handy.</p><ol class="lobby-members">${state.lobby.members.slice().sort((a,b)=>a.seat-b.seat).map(m=>`<li value="${m.seat}">${avatar(m)}${esc(m.name)}</li>`).join('')}</ol><details><summary>Name oder Platz ändern</summary><label>Name<input id="name" maxlength="32" value="${esc(name)}"/></label><label>Platz<input id="seat" type="number" min="1" max="10" value="${seat}"/></label>${button('Anmeldung ändern','register')}</details>`;}
function tutorial(){const t=state.tutorial,steps=tutorialSteps(t.names),step=steps[t.step],index=t.names.indexOf(me.identity.name),role=tutorialRoles[t.names.length][index],c=rules.characters.find(c=>c.id===role);const allowed=step.actor===undefined||step.actor===index;return `<h1>Offene Lernrunde</h1><p>Diese Übungsrollen sind öffentlich; das echte Spiel bleibt gespeichert.</p>${c?`<article class="information"><h2>${esc(c.name)}</h2><p>${esc(c.ability)}</p></article>`:''}<h2>${esc(step.title)}</h2><p>${esc(step.text)}</p>${step.choices&&allowed?step.choices.map((choice,i)=>`<button class="target ${t.selected.includes(i)?'selected':''}" data-choice="${i}" ${busy||t.complete||step.vote&&i!==index?'disabled':''}>${esc(choice)}</button>`).join(''):''}<p>${esc(t.feedback)}</p><p>Die Assistenz führt gemeinsam durch die Schritte.</p>`;}
function nightActivity(p,g){
  const night=['night_choices','night_results'].includes(g.phase);
  const idle=night&&(p.blocked||p.submitted||g.phase==='night_choices'&&!p.action&&!p.opening.length);
  return {night,idle,required:idle&&!p.blocked&&!p.submitted&&g.phase==='night_choices'};
}
async function submitNight(){const p=me?.view;if(!p)return;await api('/api/player/submit',{commandId:commandId(),gameId:p.gameId,phase:p.phase,night:p.night,targets});targets=[];}
function game(){
  const p=me.view,g=state.game,{night,idle,required}=nightActivity(p,g);
  nightGame.reset(`${g.id}:${g.night}`);
  const canSubmit=['distribution','night_choices','night_results'].includes(p.phase)&&!p.blocked&&!p.submitted&&!required;
  const current=p.info.filter(i=>i.night===p.night);
  const task=`${p.opening.map(text=>`<article class="information"><p>${esc(text)}</p></article>`).join('')}${current.map(info).join('')}${p.action?`<h2>${esc(p.action.prompt)}</h2><div class="target-grid">${p.targets.filter(t=>!p.action.excludeSelf||t.id!==p.id).map(t=>`<button class="target ${targets.includes(t.id)?'selected':''}" data-target="${t.id}" ${busy?'disabled':''}>${avatar(t)}${t.seat+1} · ${esc(t.name)}${!t.alive?' · † Tot':''}</button>`).join('')}</div>`:''}${canSubmit?button(p.phase==='distribution'?'Charakter gelesen':p.phase==='night_choices'?'Nachtaufgabe bestätigen':'Information gelesen – weiter zum Nachtspiel','submit',!!p.action&&targets.length!==p.action.count):''}`;
  const role=`<section class="character-card ${p.character.category}"><span class="role-glyph">${p.character.icon}</span><h2>${esc(p.character.name)}</h2><p>${p.team==='good'?'GUT':'BÖSE'}</p><p>${esc(p.character.ability)}</p><details><summary>Hinweise zu deiner Rolle</summary><p>${esc(p.character.help)}</p></details></section>`;
  return `<h1>${esc(p.name)}</h1><p>${p.phase==='distribution'?'Dein Charakter':night?`Nacht ${p.night}`:`Tag ${g.day}`}</p>${nightProgress(g,p,{resolving:state.resolving})}${['distribution','night_choices','night_results'].includes(g.phase)?`<div class="readiness" role="status"><strong>${g.readyCount ?? 0} von ${g.players.length} bereit</strong><span>${g.phase==='distribution'?'Charakter gelesen':g.phase==='night_choices'?'Nachtaufgabe erledigt':'Nacht abgeschlossen'}</span><progress value="${g.readyCount ?? 0}" max="${g.players.length}" aria-label="Bestätigte Bereitschaft"></progress></div>`:''}${p.blocked?'<p>Das Spiel wartet auf die Assistenz oder ist pausiert.</p>':''}${state.resolutionError&&night?'<p class="error" role="alert">Die Auswertung wurde unterbrochen. Die Assistenz muss sie auf dem Leiter-Handy erneut starten. Du kannst hier weiterspielen.</p>':''}${idle?nightGame.markup(required):night?task:role+task}${night?`<details class="night-role"><summary>Dein Charakter und bisherige Nachtinformationen</summary>${role}${p.opening.map(text=>`<p>${esc(text)}</p>`).join('')}${current.map(info).join('')}</details>`:''}${p.submitted&&p.phase==='distribution'?'<p role="status">Charakter bestätigt. Die Assistenz beginnt die Nacht.</p>':''}${p.phase==='dawn'?'<p>Die Assistenz liest den Morgen vor.</p>':''}${['discussion','nominations'].includes(g.phase)?`<section class="information"><h2>Tagesaktion: Schuss erklären</h2><p>Sage deinen Schuss laut an. Auch andere Rollen dürfen einen Schuss bluffen.</p><label>Ziel<select id="day-target"><option value="">Bitte wählen</option>${g.players.map(t=>`<option value="${esc(t.id)}" ${dayTarget===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>${button('Öffentlichen Schuss bestätigen','day-shot',!dayTarget||p.blocked||!!g.nomination)}</section>`:''}${g.phase==='ended'?`<h2>${g.winner==='good'?'Die Dorfbewohner gewinnen.':'Die Bösen gewinnen.'}</h2><p>${esc(g.endReason)}</p>`:''}<details class="chat-panel"><summary>Private Regelfrage</summary><p>Die Regelhilfe kennt öffentliche Regeln und Spielstände, keine geheimen Rollen oder Nachtinformationen. Jede Frage muss für sich verständlich sein.</p>${p.history.map(m=>`<p><b>${m.role==='user'?'Du':'Regelhilfe'}:</b> ${chatText(m.text)}</p>`).join('')}<textarea id="question" maxlength="1200" placeholder="Deine Frage">${esc(question)}</textarea>${button('Privat fragen','chat',!question.trim())}</details><details><summary>Bisherige Informationen</summary>${p.info.filter(i=>i.night!==p.night).map(info).join('')}</details>`;
}
function render(){const active=document.activeElement,id=active?.id,symbol=active?.dataset?.nightSymbol,start=active?.selectionStart,end=active?.selectionEnd,openDetails=[...root.querySelectorAll('details')].map(d=>d.open);
  root.innerHTML=`<main class="phone-shell"><nav><span class="connection ${state?'online':''}">${state?'Verbunden':'Verbinde …'}</span>${localStorage.getItem('ravenswood-leader')?'<a href="/leader">Leitung / Tagesablauf</a>':''}<a href="/wiki/" target="_blank" rel="noopener">Regel-Wiki</a>${me?button(concealed?'Privaten Bildschirm öffnen':'Bildschirm verbergen',concealed?'reveal':'hide'):''}</nav>${error?`<div class="error" role="alert">${esc(error)}</div>`:''}${busy?'<p class="working">Wird gespeichert …</p>':''}${!state?'<p>Verbindung wird aufgebaut …</p>':concealed&&me?`<h1>Bildschirm verborgen</h1>${nightProgress(state.game,null,{concealed:true,resolving:state.resolving})}<p>Deine Anmeldung bleibt erhalten.</p>`:!me?registration():state.tutorial?tutorial():me.view?game():lobby()}${me&&!concealed&&!state?.tutorial?photoUpload():''}</main>`;
  root.querySelectorAll('details').forEach((d,i)=>{if(openDetails[i])d.open=true;});
  if(symbol!==undefined)root.querySelector(`[data-night-symbol="${symbol}"]`)?.focus({preventScroll:true});
  if(id){const el=document.getElementById(id);if(el){el.focus({preventScroll:true});if(typeof start==='number'&&el.setSelectionRange)try{el.setSelectionRange(start,end);}catch{}}}
}
const snapshot=()=>JSON.stringify({state:state?{...state,serverTime:0}:null,me,concealed});
async function refresh(){const seq=++sequence,before=snapshot();let newTask=false;try{const next=await api('/api/state');if(seq!==sequence)return;
    state=next;if(credentials&&credentials.lobbyId!==state.lobby.id){credentials=null;me=null;localStorage.removeItem('ravenswood-player');targets=[];}
    if(credentials?.token&&!concealed&&!document.hidden){const result=await api('/api/player');if(seq!==sequence)return;const key=`${result.view?.gameId}:${result.view?.phase}:${result.view?.night}`;if(draftKey!==key){targets=[];draftKey=key;newTask=!!result.view&&!result.view.submitted&&['night_choices','night_results'].includes(result.view.phase);}const changed=me?.identity?.id!==result.identity.id;me=result;if(!me.view&&changed){name=me.identity.name;seat=me.identity.seat;}}
    const changed=before!==snapshot()||!!error;error='';if(changed){render();if(newTask)document.querySelector('.night-progress')?.scrollIntoView({block:'start'});}
  }catch(e){if(seq!==sequence)return;if(e.status===400&&credentials){me=null;credentials=null;localStorage.removeItem('ravenswood-player');}error=e.message;render();}}
async function perform(fn){if(busy)return;busy=true;++sequence;error='';render();try{await fn();await refresh();}catch(e){error=e.message;}finally{busy=false;render();}}
root.addEventListener('input',e=>{const el=e.target;if(el.id==='name')name=el.value;if(el.id==='seat')seat=Number(el.value);if(el.id==='question'){question=el.value;const b=root.querySelector('[data-action="chat"]');if(b)b.disabled=busy||!question.trim();}});
root.addEventListener('change',e=>{if(e.target.id==='player-photo'){const file=e.target.files[0];void perform(()=>uploadPhoto(file));return;}if(e.target.id==='seat')seat=Number(e.target.value);if(e.target.id==='day-target'){dayTarget=e.target.value;render();}});
root.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||el.disabled||busy)return;lastActivity=Date.now();
  if(el.dataset.nightSymbol!==undefined){
    if(!me?.view||concealed||!nightActivity(me.view,state.game).idle)return;
    nightGame.choose(Number(el.dataset.nightSymbol));
    if(nightActivity(me.view,state.game).required&&nightGame.complete)void perform(submitNight);
    else render();
    return;
  }
  if(el.dataset.target){const id=el.dataset.target,count=me.view.action.count;targets=targets.includes(id)?targets.filter(x=>x!==id):[...targets.slice(-(count-1)||targets.length),id].slice(-count);render();return;}
  const action=el.dataset.action;
  if(action==='hide'){concealed=true;me={identity:me.identity,view:null};sequence++;render();return;}
  if(action==='reveal'){concealed=false;void refresh();return;}
  void perform(async()=>{
    if(el.dataset.choice!==undefined)await api('/api/player/tutorial',{action:'answer',choice:Number(el.dataset.choice),version:state.tutorial.version});
    else if(action==='register'){const result=await api('/api/lobby/register',{lobbyId:state.lobby.id,name,seat});if(result.token)remember(result);me=result;}
    else if(action==='day-shot'){if(!window.confirm('Diesen Schuss jetzt öffentlich erklären?'))return;await api('/api/player/day-action',{gameId:state.game.id,version:state.game.version,action:'slayer',target:dayTarget});dayTarget='';}
    else if(action==='submit')await submitNight();
    else if(action==='chat'){await api('/api/player/chat',{question});question='';}
  });
});
for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,()=>lastActivity=Date.now());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&me){concealed=true;me={identity:me.identity,view:null};sequence++;render();}else if(!document.hidden)void refresh();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&me){concealed=true;me={identity:me.identity,view:null};sequence++;render();}});
setInterval(()=>{if(me&&!concealed&&!busy&&!['night_choices','night_results'].includes(state?.game?.phase)&&Date.now()-lastActivity>90000){concealed=true;me={identity:me.identity,view:null};sequence++;render();}},1000);
setInterval(()=>{if(!busy&&!document.hidden)void refresh();},3000);
async function init(){render();try{rules=await api('/api/rules');await refresh();const events=new EventSource('/api/events');events.onmessage=()=>{if(!busy)void refresh();};events.onerror=()=>{error='Verbindung unterbrochen. Die Anmeldung bleibt erhalten; wir verbinden erneut.';render();};}catch(e){error=e.message;render();}}
void init();
