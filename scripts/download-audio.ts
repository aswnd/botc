import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tracks} from '../src/music.js';
const destination=new URL('../assets/audio/',import.meta.url);
await mkdir(destination,{recursive:true});
let failed=false;
function isMP3(bytes:Uint8Array){return Buffer.from(bytes.subarray(0,3)).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);}
for(const {file,title} of Object.values(tracks)){
  const target=new URL(file,destination),partial=new URL(file+'.part',destination);
  try{
    const existing=await readFile(target).catch(()=>null);
    if(existing&&existing.length>100000&&isMP3(existing)){console.log(`Already downloaded: ${title}`);continue;}
    const url='https://sounds.tabletopaudio.com/'+file;
    console.log(`Downloading ${title} …`);
    const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length<100000||!isMP3(bytes))throw new Error('Response is not a complete MP3 file');
    await writeFile(partial,bytes);await rename(partial,target);
    console.log(`Saved ${fileURLToPath(target)} (${bytes.length} bytes)`);
  }catch(error){failed=true;await rm(partial,{force:true});console.error(`${title}: ${error.message}${error.cause?.code?' ('+error.cause.code+')':''}`);}
}
if(failed){console.error('Some downloads failed. Run npm run audio:download again when network access is available.');process.exitCode=1;}
