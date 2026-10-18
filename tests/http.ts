import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createApp } from '../server/app.ts';

/** Tests never consume a real API key inherited from the shell. */
export function testApp(options:Parameters<typeof createApp>[0]={}) {
  const app=createApp({legacyApi:true,...options,fetcher:async()=>{throw new Error('Network disabled in tests');}});
  app.ai.key='test';
  app.ai.services=()=>({decide:async r=>({choice:r.fallback,reason:'Test decision'})});
  return app;
}

/** Exercise the actual HTTP handler without opening a socket (sandbox-friendly). */
export async function request(app:ReturnType<typeof createApp>,path:string,{method='GET',data,headers={},remoteAddress='127.0.0.1'}:{method?:string;data?:unknown;headers?:Record<string,string>;remoteAddress?:string}={}) {
  await app.ready;
  if(method==='POST'&&!Object.hasOwn(headers,'x-host-token')){const h=await request(app,'/api/host');headers={...headers,'x-host-token':h.json().token};}
  return await new Promise<{status:number;headers:Record<string,string>;body:string;json:()=>any}>((done,reject)=>{
    const req=Readable.from(data===undefined?[]:[JSON.stringify(data)]) as any;req.socket={remoteAddress};req.url=path;req.method=method;req.headers={host:'ravenswood.test',...(data===undefined?{}:{'content-type':'application/json'}),...headers};
    const res=new EventEmitter() as any;let status=200;const responseHeaders:Record<string,string>={};let output='';
    res.headersSent=false;res.setHeader=(key:string,value:string)=>{responseHeaders[key.toLowerCase()]=value;};
    res.writeHead=(code:number,h:Record<string,string>)=>{status=code;Object.assign(responseHeaders,h);res.headersSent=true;};
    res.write=(chunk:string|Buffer)=>{output+=chunk.toString();return true;};
    res.end=(chunk?:string|Buffer)=>{if(chunk)output+=chunk.toString();done({status,headers:responseHeaders,body:output,json:()=>JSON.parse(output)});};
    req.on('error',reject);app.server.emit('request',req,res);
  });
}
