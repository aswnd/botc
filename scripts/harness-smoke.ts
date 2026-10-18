import assert from 'node:assert/strict';
import { publicView } from '../server/engine.ts';
import { startSession } from './harness/session.ts';

const session=await startSession();
const page=session.pages.laptop;
let result:any={status:'failed'};
let visits=0,ballots=0;
const captured=new Set<string>();
async function click(action:string) {
  await page.locator(`[data-action="${action}"]`).first().click();
  await page.locator('.working').waitFor({state:'hidden',timeout:55000});
  assert.equal(await page.locator('[role="alert"]').count(),0,await page.locator('body').innerText());
}
try {
  if(process.argv.includes('--demo'))await page.locator('#demo').check();
  await click('create');
  for(let step=0;step<500;step++) {
    const g=publicView(session.app.getGame()!);
    const checkpoint=`${g.phase}:${g.night}:${g.day}`;
    if(!captured.has(checkpoint)){await session.act({action:'observe'});captured.add(checkpoint);}
    if(g.phase==='ended') {
      assert.ok(g.winner);
      assert.ok(session.app.ai.service(session.app.getGame()).spent>0,'Real AI usage must be recorded');
      assert.ok(visits>=24,'Distribution and both night rounds were visited');
      assert.ok(ballots>0,'At least one ballot was confirmed');
      assert.ok(!session.events.some((e:any)=>e.kind==='pageerror'));
      await session.act({action:'resize',width:390,height:844});
      await session.act({action:'assert',noOverflow:true,noPageErrors:true});
      result={status:'passed',winner:g.winner,steps:step,visits,ballots,ai:session.app.ai.service(session.app.getGame())};
      break;
    }
    if(g.announcement) {
      if(!await page.locator('[data-action="ack"]').count())await click('assistant');
      await click('ack');
    } else if(g.nextPlayer) {
      if(!await page.locator('[data-action="open-private"]').count())await click('home');
      await click('open-private');
      if(visits===0)await session.act({action:'observe'});
      const targets=page.locator('[data-action="target"]:not(.selected)');
      // Target buttons are ordinary visible controls. Select until Finish is enabled.
      for(let i=0;await page.locator('[data-action="finish"]').isDisabled()&&await targets.count()&&i<3;i++) {
        assert.ok(await targets.count(),'A required target must be selectable');
        await targets.first().click();
      }
      await page.locator('[data-action="finish"]').waitFor();
      await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[data-action="finish"]')?.disabled,{},{timeout:20000});
      await click('finish');
      // Ravenkeeper can require a second confirmation after receiving information.
      if(await page.locator('[data-action="finish"]').count())await click('finish');
      visits++;
    } else if(g.phase==='discussion') {
      if(!await page.locator('[data-action="nominations"]').count())await click('assistant');
      await click('timer-toggle');
      await click('plus-minute');
      await click('attention');
      await click('nominations');
    } else if(g.phase==='nominations') {
      if(!await page.locator('.assistant-layout').count())await click('assistant');
      if(g.nomination) {
        const voters=g.players.filter(p=>p.alive||p.ghostVote);
        for(const voter of voters) {
          await page.locator(`[data-voter="${voter.id}"]`).check();
          await page.locator('.working').waitFor({state:'hidden',timeout:55000});
        }
        assert.equal(publicView(session.app.getGame()!).voteDraft.length,voters.length);
        await session.act({action:'observe'});
        await click('vote-confirm');
        assert.equal(publicView(session.app.getGame()!).ballots.at(-1)!.total,voters.length);
        ballots++;
      } else if(g.ballots.length===0) {
        const nominator=g.players.find(p=>p.alive&&!g.nominators.includes(p.id))!;
        const nominee=g.players.filter(p=>p.alive).at(-1)!;
        await page.locator('#nominator').selectOption(nominator.id);
        await page.locator('#nominee').selectOption(nominee.id);
        await click('nominate');
      } else {
        await click('confirm-close');await click('close-day');
      }
    } else throw new Error(`Unhandled phase ${g.phase}`);
  }
  assert.equal(result.status,'passed','Game must finish within the step limit');
  console.log(JSON.stringify({...result,output:session.output}));
} catch(error) {result={status:'failed',error:String(error),visits,ballots};throw error;} finally {await session.close(result);}
