import { createInterface } from 'node:readline';
import { startSession } from './harness/session.ts';

// One JSON command per line; stdout is exclusively JSON for an LLM tool adapter.
let session:Awaited<ReturnType<typeof startSession>>|undefined;
try {session=await startSession();} catch(error) {
  console.log(JSON.stringify({error:String(error),status:'failed'}));
  process.exitCode=1;
}
let result:unknown={status:'input-closed'};
let input:ReturnType<typeof createInterface>|undefined;
if(session)try {
  console.log(JSON.stringify(await session.observe()));
  input=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of input) {
    if(!line.trim())continue;
    try {
      const command=JSON.parse(line);
      if(command.action==='finish') {result={status:'finished',...command};break;}
      console.log(JSON.stringify(await session.act(command)));
    } catch(error) {console.log(JSON.stringify({error:String(error),observation:await session.observe()}));}
  }
} finally {
  input?.close();
  process.stdin.pause();
  await session.close(result);
}
