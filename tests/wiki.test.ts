import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { articles } from '../wiki/content.js';
import { testApp, request } from './http.ts';

test('reader manual covers all almanac characters and cites real source pages',()=>{
  assert.equal(new Set(articles.map(a=>a.id)).size,articles.length);
  for(const [group,count] of [['Trouble Brewing',22],['Bad Moon Rising',25],['Sects & Violets',25],['Travellers & Fabled',27]] as const){
    assert.equal(articles.filter(a=>a.group===group&&a.category).length,count);
  }
  const sources=new Map<string,number>();
  for(const a of articles){
    assert.ok(a.title&&a.summary&&a.sections.length&&a.sources.length,a.id);
    for(const s of a.sources){
      if(!sources.has(s.file)){
        const info=execFileSync('pdfinfo',[`official_pdfs/${s.file}`],{encoding:'utf8'});
        sources.set(s.file,Number(info.match(/^Pages:\s+(\d+)/m)![1]));
      }
      assert.ok(s.page>=1&&s.page<=sources.get(s.file)!,`${a.id}: source page out of range`);
    }
  }
  assert.equal(sources.size,8);
  // Graphical/almanac source checks catch easily missed Traveller page offsets.
  const text=(file:string,page:number)=>execFileSync('pdftotext',['-f',String(page),'-l',String(page),`official_pdfs/${file}`,'-'],{encoding:'utf8'});
  for(const id of ['beggar','scapegoat','bureaucrat','apprentice','judge','voudon']){
    const a=articles.find(a=>a.id===id)!,s=a.sources[0];assert.ok(text(s.file,s.page).includes(a.title),id);
  }
});

test('manual and cited PDFs are public, while unrelated repository files stay private',async()=>{
  const app=testApp({dbPath:':memory:'});
  try{
    for(const path of ['/wiki','/wiki/','/wiki/index.html','/wiki/app.js','/wiki/content.js','/wiki/style.css'])assert.equal((await request(app,path)).status,200,path);
    const files=new Set(articles.flatMap(a=>a.sources.map(s=>s.file)));
    for(const file of files){const response=await request(app,`/official_pdfs/${encodeURIComponent(file)}`);assert.equal(response.status,200,file);assert.equal(response.headers['Content-Type'],'application/pdf');assert.ok(response.body.startsWith('%PDF-'));}
    for(const path of ['/.env','/data/game.sqlite','/wiki/../server/app.ts','/official_pdfs/%2e%2e%2f.env','/official_pdfs/Unknown.pdf','/wiki/content.json'])assert.notEqual((await request(app,path)).status,200,path);
    assert.ok(readFileSync('src/app.js','utf8').includes('href="/wiki/"'));
  }finally{await app.close();}
});
