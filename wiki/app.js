import { articles } from './content.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=[...new Set(articles.map(a=>a.group))];
$('#edition').innerHTML+=groups.map(g=>`<option>${esc(g)}</option>`).join('');
function current(){return articles.find(a=>a.id===decodeURIComponentSafe(location.hash.slice(1)))??articles[0];}
function decodeURIComponentSafe(value){try{return decodeURIComponent(value);}catch{return '';}}
function navigation(){
 const terms=$('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean),group=$('#edition').value;
 const matches=articles.filter(a=>(!group||a.group===group)&&terms.every(t=>[a.title,a.category,a.summary,...a.sections.map(s=>s.title+' '+s.text)].join(' ').toLowerCase().includes(t)));
 $('#count').textContent=`${matches.length} ${matches.length===1?'article':'articles'}`;
 $('#navigation').innerHTML=groups.map(g=>{
  const items=matches.filter(a=>a.group===g);return items.length?`<section><h2>${esc(g)}</h2>${items.map(a=>`<a href="#${a.id}" ${a.id===current().id?'aria-current="page"':''}>${esc(a.title)}${a.category?`<small>${esc(a.category)}</small>`:''}</a>`).join('')}</section>`:'';
 }).join('')||'<p>No articles found. Try a character name or a shorter rule term.</p>';
}
function render(){
 const a=current(),i=articles.indexOf(a);
 document.title=`${a.title} · Clocktower manual`;
 $('#article').innerHTML=`<p class="eyebrow">${esc(a.group)}${a.category?' / '+esc(a.category):''}</p><h2>${esc(a.title)}</h2><p class="lede">${esc(a.summary)}</p><div class="contents" aria-label="On this page"><strong>On this page</strong>${a.sections.map((s,j)=>`<a href="#section-${j}" data-section="section-${j}">${esc(s.title)}</a>`).join('')}</div>${a.sections.map((s,j)=>`<section id="section-${j}"><h3>${esc(s.title)}</h3>${s.title==='Base distribution'?distribution(s.text):s.text.split('\n').map(p=>`<p>${esc(p)}</p>`).join('')}</section>`).join('')}<section class="sources"><h3>Check the source</h3><p>PDF viewer page numbers. Summaries are unofficial paraphrases.</p>${a.sources.map(s=>`<a target="_blank" rel="noopener" href="/official_pdfs/${encodeURIComponent(s.file)}#page=${s.page}">${esc(s.file.replace(/_/g,' '))} · p. ${s.page} ↗</a>`).join('')}</section><div class="related"><strong>Related reading</strong>${related(a).map(x=>`<a href="#${x.id}">${esc(x.title)} →</a>`).join('')}</div><div class="pager">${i?`<a href="#${articles[i-1].id}">← ${esc(articles[i-1].title)}</a>`:'<span></span>'}${i<articles.length-1?`<a href="#${articles[i+1].id}">${esc(articles[i+1].title)} →</a>`:''}</div>`;
 navigation();
}
function distribution(text){const lines=text.split('\n');return `<div class="table-wrap"><table><caption>Base setup before character modifiers</caption><thead><tr>${['Players','Townsfolk','Outsiders','Minions','Demons'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${lines.slice(1,-1).map(l=>{const [n,counts]=l.split(' → ');return `<tr><th scope="row">${esc(n)}</th>${counts.split(' / ').map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div><p>${esc(lines.at(-1))}</p>`;}
function related(a){const ids=a.category?['information','night-order','editions']:a.group==='Learn'?['voting','information','winning']:['setup','storytelling','glossary'];return ids.filter(id=>id!==a.id).map(id=>articles.find(x=>x.id===id));}
$('#search').addEventListener('input',navigation);
$('#edition').addEventListener('change',navigation);
$('#print').addEventListener('click',()=>window.print());
$('#article').addEventListener('click',e=>{const link=e.target.closest('[data-section]');if(link){e.preventDefault();document.getElementById(link.dataset.section)?.scrollIntoView({behavior:'smooth'});}});
window.addEventListener('hashchange',()=>{render();$('#article').focus({preventScroll:true});window.scrollTo(0,0);});
render();
