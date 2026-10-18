import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {testApp} from './http.ts';

test('Chromium: seven isolated phones join, recover, play nights and use private tutorial exercises',{timeout:90000},async t=>{
 const executablePath=process.env.CHROMIUM_PATH??'/usr/bin/chromium';if(!existsSync(executablePath)){t.skip('Chromium unavailable');return;}
 const app=testApp({dbPath:':memory:',legacyApi:false});let browser;
 try{
  await new Promise<void>(ok=>app.server.listen(0,'127.0.0.1',ok));const addr=app.server.address() as any,base=`http://127.0.0.1:${addr.port}`;
  browser=await chromium.launch({headless:true,executablePath,args:['--enable-features=NetworkServiceInProcess2,AudioServiceInProcess']});
  const laptop=await browser.newPage(),projector=await browser.newPage({viewport:{width:1920,height:1080}}),phones=[];const errors:string[]=[];
  await laptop.goto(base);await laptop.locator('#assistant').waitFor();await projector.goto(base+'/projector');
  for(let i=0;i<7;i++){
   const context=await browser.newContext({viewport:{width:390,height:844}});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/join');
   await p.locator('#name').fill(`Phone ${i+1}`);await p.locator('#seat').selectOption(String(i+1));await p.locator('[data-action="register"]').click();await p.getByText(`Hallo Phone ${i+1}`).waitFor();phones.push(p);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await laptop.bringToFront();await laptop.locator('#assistant option').filter({hasText:'Phone 1'}).waitFor({state:'attached'});await laptop.locator('#assistant').selectOption({label:'Phone 1'});await laptop.locator('[data-action="create"]').click();await laptop.locator('[data-action="ack"]').click();
  async function reveal(p:any){await p.bringToFront();if(await p.locator('[data-action="reveal"]').count())await p.locator('[data-action="reveal"]').click();await p.locator('.character-card').waitFor();}
  async function submit(p:any){await reveal(p);const target=p.locator('[data-target]:not(.selected)');for(let n=0;await p.locator('[data-action="submit"]').isDisabled()&&n<3;n++)await target.first().click();await p.locator('[data-action="submit"]').click();await p.locator('.working').waitFor({state:'hidden'});assert.equal(await p.locator('[role="alert"]').count(),0,await p.locator('body').innerText());}
  for(const p of phones)await submit(p);
  await laptop.bringToFront();await laptop.locator('[data-action="ack"]').click();
  // A repeated refresh preserves identity; hiding clears actual role markup.
  await reveal(phones[0]);await phones[0].reload();await phones[0].locator('.character-card').waitFor();await phones[0].locator('[data-action="hide"]').click();assert.equal(await phones[0].locator('.character-card').count(),0);
  for(const p of [...phones].reverse())await submit(p);
  assert.equal(app.getGame()!.phase,'night_results');
  await projector.waitForFunction(()=>document.body.innerText.includes('Ergebnisse lesen.'));
  assert.doesNotMatch(await projector.locator('body').innerText(),/Phone \d,.*Laptop|DER NÄCHSTE BESUCH|Runde A|Runde B/);
  await reveal(phones[0]);await mkdir('test-results',{recursive:true});await phones[0].screenshot({path:'test-results/phone-results.png',fullPage:true});await laptop.screenshot({path:'test-results/phone-host.png',fullPage:true});await projector.screenshot({path:'test-results/phone-projector.png',fullPage:true});
  // Recover on a replacement phone and verify the previous browser loses private access.
  await phones[0].locator('summary').filter({hasText:'Privater Wiederherstellungscode'}).click();
  const code=await phones[0].locator('code').innerText();const oldPhone=phones[0];
  const recoveredContext=await browser.newContext({viewport:{width:320,height:844}}),replacement=await recoveredContext.newPage();
  await replacement.goto(base+'/join');await replacement.locator('summary').filter({hasText:'Mit Wiederherstellungscode'}).click();await replacement.locator('#recovery').fill(code);await replacement.locator('[data-action="recover"]').click();await replacement.locator('.character-card').waitFor();phones[0]=replacement;
  assert.equal(await replacement.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  let rejectedRequests=0;
  oldPhone.on('request',request=>{if(new URL(request.url()).pathname==='/api/player')rejectedRequests++;});
  await oldPhone.bringToFront();await oldPhone.reload();await oldPhone.locator('[role="alert"]').waitFor();assert.equal(await oldPhone.locator('.character-card').count(),0);
  assert.equal(rejectedRequests,1);
  // SSE refreshes and the polling interval must not retry a revoked credential.
  await oldPhone.waitForTimeout(3500);
  assert.equal(rejectedRequests,1);
  await oldPhone.reload();await oldPhone.locator('#recovery').waitFor({state:'attached'});
  assert.equal(rejectedRequests,1);
  assert.equal(await oldPhone.locator('#recovery').inputValue(),code);
  for(const p of phones)await submit(p);
  assert.equal(app.getGame()!.phase,'dawn');
  await reveal(phones[0]);
  await phones[0].getByText('Die Assistenz liest den Morgen vor.').waitFor();
  assert.equal(await phones[0].locator('[role="status"]').count(),0,'Night readiness status must not persist into dawn');
  await laptop.bringToFront();await laptop.locator('[data-action="ack"]').click();
  // Private Q&A uses the identity from the phone, independent of public control access.
  app.ai.answer=async(_g,k,q)=>{assert.equal(k.speaker.name,'Phone 1');return 'Eine öffentliche Regelantwort.';};
  await reveal(phones[0]);await phones[0].locator('summary').filter({hasText:'Private Regelfrage'}).click();await phones[0].locator('#question').fill('Was ist ein Bluff?');await phones[0].locator('[data-action="chat"]').click();await phones[0].getByText('Regelhilfe: Eine öffentliche Regelantwort.').waitFor();
  // Open tutorial on the host and answer the first actor exercise on their phone.
  await laptop.bringToFront();await laptop.locator('[data-action="tutorial-start"]').click();await laptop.locator('[data-action="tutorial-next"]').waitFor();
  for(let n=0;n<30;n++){
   const exercise=await laptop.locator('[data-choice]').count();if(exercise)break;
   await laptop.locator('[data-action="tutorial-next"]').click();
  }
  assert.ok((await laptop.locator('[data-choice]').count())>0);
  await phones[0].bringToFront();if(await phones[0].locator('[data-action="reveal"]').count())await phones[0].locator('[data-action="reveal"]').click();await phones[0].getByRole('heading',{name:'Offene Lernrunde'}).waitFor();
  await phones[0].locator('[data-choice="1"]').click();await laptop.waitForFunction(()=>document.body.innerText.includes('Der Einsiedler bleibt ein guter Außenseiter.'));
  assert.equal(app.getGame()!.paused,true);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.server.closeAllConnections();await app.close();}
});
