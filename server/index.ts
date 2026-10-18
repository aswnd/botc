import { resolve } from 'node:path';
import { createApp } from './app.ts';
const port=Number(process.env.PORT??3000);const host=process.env.HOST??'127.0.0.1';
const app=createApp({dbPath:process.env.DB_PATH??resolve('data/game.sqlite')});
app.server.listen(port,host,()=>{
  console.log(`\n  RAVENSWOOD · Trouble Brewing\n\n  Laptop:  http://${host}:${port}\n  Beamer:  http://${host}:${port}/projector\n\n  Spielstände werden lokal in data/ gespeichert.\n  Beenden: Strg+C\n`);
});
app.server.on('error',e=>{console.error(`Server konnte nicht starten: ${e.message}`);process.exitCode=1;app.store.close();});
let stopping=false;for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{if(stopping)return;stopping=true;void app.close().then(()=>process.exit(0));});
