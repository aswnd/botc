import { chromium, type Page } from 'playwright';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from '../../server/app.ts';

export async function startSession() {
  const directory=await mkdtemp(join(tmpdir(),'ravenswood-playtest-'));
  const output=resolve('test-results',`playtest-${Date.now()}`);
  await mkdir(output,{recursive:true});
  const app=createApp({dbPath:join(directory,'game.sqlite')});
  await app.ready;
  let browser;
  const events:unknown[]=[];
  try {
    await new Promise<void>((ok,fail)=>{
      const onError=(error:Error)=>fail(error);
      app.server.once('error',onError);
      app.server.listen(0,'127.0.0.1',()=>{
        app.server.removeListener('error',onError);
        ok();
      });
    });
    const address=app.server.address();
    if(!address||typeof address==='string')throw new Error('Missing server address');
    const executable=process.env.CHROMIUM_PATH ?? (existsSync('/usr/lib/chromium/chromium')?'/usr/lib/chromium/chromium':undefined);
    browser=await chromium.launch({headless:!process.argv.includes('--headed'),executablePath:executable,args:['--enable-features=NetworkServiceInProcess2,AudioServiceInProcess']});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const laptop=await context.newPage();
    const projector=await context.newPage();
    const pages={laptop,projector};
    const acceptDialogs={laptop:false,projector:false};
    for(const [screen,page] of Object.entries(pages)) {
      page.setDefaultTimeout(5000);
      page.on('pageerror',error=>events.push({kind:'pageerror',screen,message:error.message}));
      page.on('console',message=>{if(message.type()==='error')events.push({kind:'console',screen,message:message.text(),location:message.location()});});
      page.on('response',response=>{if(response.status()>=400)events.push({kind:'http',screen,status:response.status(),url:response.url()});});
      page.on('dialog',async dialog=>{events.push({kind:'dialog',screen,message:dialog.message()});if(acceptDialogs[screen])await dialog.accept();else await dialog.dismiss();});
      await page.goto(`http://127.0.0.1:${address.port}${screen==='projector'?'/projector':'/'}`);
      await page.locator('.connection.online').waitFor();
    }
    await projector.setViewportSize({width:1920,height:1080});
    // Keep the shared laptop active: hiding its tab deliberately closes private visits.
    await laptop.bringToFront();
    let step=0;
    const transcript:unknown[]=[];
    async function observePage(page:Page,screen:string) {
      const controls=[];
      const candidates=page.locator('button,input,select,textarea,a[href],summary');
      for(let i=0;i<await candidates.count();i++) {
        const control=candidates.nth(i);
        if(!await control.isVisible())continue;
        const id=`c${controls.length}`;
        await control.evaluate((el,id)=>el.setAttribute('data-harness-id',id),id);
        controls.push(await control.evaluate((el:any)=>({id:el.getAttribute('data-harness-id'),tag:el.tagName.toLowerCase(),type:el.type,label:el.getAttribute('aria-label')||el.innerText||el.closest('label')?.innerText||el.id,value:el.type==='password'?'[redacted]':el.value,disabled:el.disabled??false,checked:el.checked,options:el.options?[...el.options].map((o:any)=>({value:o.value,label:o.text})):undefined,action:el.dataset.action,player:el.dataset.player})));
      }
      const screenshot=join(output,`${String(step).padStart(4,'0')}-${screen}.png`);
      await page.screenshot({path:screenshot,fullPage:true});
      return {text:await page.locator('body').innerText(),controls,screenshot,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};
    }
    async function observe() {
      await laptop.locator('.working').waitFor({state:'hidden',timeout:55000});
      const observation={step,output,laptop:await observePage(laptop,'laptop'),projector:await observePage(projector,'projector'),events:[...events]};
      await writeFile(join(output,`${String(step).padStart(4,'0')}-observation.json`),JSON.stringify(observation,null,2));
      return observation;
    }
    async function act(command:any) {
      const page=pages[command.screen??'laptop'];
      if(!page)throw new Error('screen must be laptop or projector');
      const selector=command.control?`[data-harness-id="${String(command.control).replace(/[^c0-9]/g,'')}"]`:command.selector;
      const locator=selector?page.locator(selector):null;
      switch(command.action) {
        case 'observe':break;
        case 'click':
          acceptDialogs[command.screen??'laptop']=command.acceptDialog===true;
          try {await locator!.click();} finally {acceptDialogs[command.screen??'laptop']=false;}
          break;
        case 'fill':await locator!.fill(command.value);break;
        case 'select':await locator!.selectOption(command.value);break;
        case 'check':await locator!.setChecked(command.checked??true);break;
        case 'press':await (locator??page.locator('body')).press(command.key);break;
        case 'reload':await page.reload();await page.locator('.connection.online').waitFor();break;
        case 'resize':await page.setViewportSize({width:command.width,height:command.height});break;
        case 'wait':await page.waitForTimeout(Math.min(15000,Math.max(0,command.ms??250)));break;
        case 'assert': {
          if(command.text!==undefined) {
            const present=(await page.locator('body').innerText()).includes(command.text);
            if(present===(command.absent??false))throw new Error(`Text assertion failed: ${command.text}`);
          }
          if(command.noOverflow&&await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow');
          if(command.noPageErrors&&events.some((e:any)=>e.kind==='pageerror'))throw new Error('Browser exception recorded');
          break;
        }
        default:throw new Error(`Unknown action: ${command.action}`);
      }
      await laptop.locator('.working').waitFor({state:'hidden',timeout:55000});
      step++;
      transcript.push({step,command});
      return observe();
    }
    return {app,pages,output,events,observe,act,async close(result:unknown={}) {
      await writeFile(join(output,'report.json'),JSON.stringify({result,events,transcript},null,2));
      try {await context.tracing.stop({path:join(output,'trace.zip')});} finally {
        await browser!.close();app.server.closeAllConnections();await app.close();await rm(directory,{recursive:true,force:true});
      }
    }};
  } catch(error) {
    await writeFile(join(output,'report.json'),JSON.stringify({result:{status:'failed',error:String(error)},events},null,2));
    await browser?.close();app.server.closeAllConnections();await app.close();await rm(directory,{recursive:true,force:true});throw error;
  }
}
