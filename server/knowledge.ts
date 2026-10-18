import { readFileSync } from 'node:fs';
import { CHARACTERS, RULES } from '../shared/characters.ts';
import type { PublicGameView } from '../shared/types.ts';

type Article={id:string;title:string;source:string;page:number|null;edition:string;text:string};
const manuals=JSON.parse(readFileSync(new URL('../shared/wiki/manuals.json',import.meta.url),'utf8')).articles as Article[];
const reference:Article[]=[
  ...RULES.map((r,i)=>({id:`rules:${i}`,title:r.title,source:'shared/characters.ts',page:null,edition:'trouble-brewing',text:r.text})),
  ...CHARACTERS.map(c=>({id:`character:${c.id}`,title:`${c.name} / ${c.english}`,source:'shared/characters.ts',page:null,edition:'trouble-brewing',text:`${c.ability}\n${c.help}`})),
  ...manuals,
];
const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
const stop=new Set('wie was wer ist sind ein eine einer der die das den dem des ich du wir ihr und oder mit von fur auf im in es zu kann darf meine mein man the a an of to is do does how what'.split(' '));
const synonyms:Record<string,string>={tot:'dead death die',tote:'dead death die',toten:'dead death die',stimme:'vote voting',stimmen:'vote voting',abstimmen:'vote voting',nominieren:'nomination nominate',nominierung:'nomination nominate',hinrichtung:'execution execute',gift:'poison poisoned',vergiftet:'poison poisoned',betrunken:'drunk drunkenness',nacht:'night',tag:'day',regeln:'rules',gewinnt:'winning victory',fahigkeit:'ability abilities'};
/** Public rules only. Never accepts game state or player identity. */
export function searchRules(query:string,limit=5):Article[]{
  const q=normalize(query).slice(0,1200);
  const terms=new Set(q.split(/[^a-z0-9]+/).filter(t=>t.length>1&&!stop.has(t)));
  for(const term of [...terms])for(const word of (synonyms[term]??'').split(' '))if(word)terms.add(word);
  for(const c of CHARACTERS)if(q.includes(normalize(c.name))||q.includes(normalize(c.english)))for(const word of normalize(c.english).split(' '))terms.add(word);
  return reference.filter(a=>a.edition==='trouble-brewing').map(a=>{
    const title=normalize(a.title),text=normalize(a.text);
    let score=0;for(const term of terms){if(title.includes(term))score+=8;if(text.includes(term))score+=1;}
    return {a,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id)).slice(0,Math.max(1,Math.min(8,limit))).map(x=>({...x.a}));
}
/** Deliberate allowlist: reveal/debrief and private role views never cross this boundary. */
export function rulesContext(pub:PublicGameView,playerId:string){
  const speaker=pub.players.find(p=>p.id===playerId);
  if(!speaker)throw new Error('Unbekannte Person.');
  return {
    speaker:{id:speaker.id,name:speaker.name},
    public:{phase:pub.phase,day:pub.day,night:pub.night,
      players:pub.players.map(p=>({id:p.id,name:p.name,seat:p.seat,alive:p.alive,ghostVote:p.ghostVote})),
      threshold:pub.threshold,executionCandidate:pub.executionCandidate,tied:pub.tied,
      nominated:[...pub.nominated],nominators:[...pub.nominators]},
  };
}
export type RulesContext=ReturnType<typeof rulesContext>;
