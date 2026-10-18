/** Rebuild the local rules index. Requires Poppler's pdftotext; no network or AI. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const extract=promisify(execFile);
const sources=readdirSync('official_pdfs').filter(f=>f.endsWith('.pdf')).sort();
const articles=[];
for(const file of sources){
  const source=`official_pdfs/${file}`;
  const hash=createHash('sha256').update(readFileSync(source)).digest('hex');
  // Reading order is more useful than preserving multi-column page layout.
  const pages=(await extract('pdftotext',['-enc','UTF-8',source,'-'],{encoding:'utf8',maxBuffer:10*1024*1024})).stdout.split('\f');
  for(const [index,raw] of pages.entries()){
    const paragraphs=raw.replace(/\r/g,'').split(/\n\s*\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);
    const chunks:string[]=[];let chunk='';
    for(const paragraph of paragraphs){
      // Split long paragraphs too so retrieval always has bounded excerpts.
      for(let start=0;start<paragraph.length;start+=1800){const part=paragraph.slice(start,start+1800);if(chunk.length+part.length+(chunk?2:0)>2400){chunks.push(chunk);chunk='';}chunk+=(chunk?'\n\n':'')+part;}
    }
    if(chunk)chunks.push(chunk);
    for(const [section,text] of chunks.entries())articles.push({id:`${file.replace(/\.pdf$/,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}:p${index+1}:${section+1}`,title:paragraphs[0]?.slice(0,120)??file,source,page:index+1,sha256:hash,edition:/Trouble|Rulebook/.test(file)?'trouble-brewing':/Bad/.test(file)?'bad-moon-rising':/Sects/.test(file)?'sects-and-violets':'travellers-fabled',text});
  }
}
writeFileSync('shared/wiki/manuals.json',JSON.stringify({format:1,articles},null,2)+'\n');
console.log(`Indexed ${articles.length} excerpts from ${sources.length} official PDFs.`);
