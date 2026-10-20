import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {testApp} from './http.ts';

test('projector fits the viewport and keeps the join QR square',async t=>{
 const executablePath=process.env.CHROMIUM_PATH??'/usr/bin/chromium';
 if(!existsSync(executablePath)){t.skip('Chromium unavailable');return;}
 const app=testApp({dbPath:':memory:'});
 await new Promise<void>(ok=>app.server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route('**/api/connect',route=>route.fulfill({json:{urls:['http://192.168.1.100:3000/join']}}));
  await page.goto(`http://127.0.0.1:${(app.server.address() as any).port}/projector`);
  await page.locator('.join-qr').waitFor();
  for(const size of [{width:1920,height:1080},{width:1280,height:720},{width:1024,height:768},{width:640,height:360}]){
   await page.setViewportSize(size);
   await page.waitForTimeout(50);
   const layout=await page.evaluate(()=>{
    const shell=document.querySelector('.projector-shell')!.getBoundingClientRect();
    const qr=document.querySelector('.join-qr')!.getBoundingClientRect();
    return {bottom:shell.bottom,right:shell.right,qrWidth:qr.width,qrHeight:qr.height,fit:getComputedStyle(document.querySelector('.join-qr')!).objectFit,scroll:document.documentElement.scrollHeight,height:innerHeight};
   });
   assert.ok(layout.bottom<=size.height+1,JSON.stringify(layout));
   assert.ok(layout.right<=size.width+1);
   assert.ok(Math.abs(layout.qrWidth-layout.qrHeight)<0.1);
   assert.equal(layout.fit,'contain');
   assert.ok(layout.scroll<=layout.height);
  }
 }finally{await browser.close();await app.close();}
});
