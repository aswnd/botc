import assert from 'node:assert/strict';
import { publicView } from '../server/engine.ts';
import { startSession } from './harness/session.ts';

const session=await startSession();
const page=session.pages.laptop;
let result:any={status:'failed'};
let confirmations=0,ballots=0;
const captured=new Set<string>();
async function click(action:string) {
  await page.locator(`[data-action="${action}"]`).first().click();
  await page.locator('.working').waitFor({state:'hidden',timeout:55000});
  assert.equal(await page.locator('[role="alert"]').count(),0,await page.locator('body').innerText());
}
try {
  if(process.argv.includes('--demo'))await page.locator('#demo').check();
  for(let i=1;i<=8;i++){
    const phone=await session.openPhone(`phone${i}`);await phone.locator('#name').fill(`Spielperson ${i}`);await phone.locator('#seat').selectOption(String(i));await phone.locator('[data-action="register"]').click();await phone.getByText(`Hallo Spielperson ${i}`).waitFor();
  }
  await page.bringToFront();await page.locator('#assistant').selectOption({label:'Spielperson 1'});await click('create');
  for(let step=0;step<500;step++) {
    const g=publicView(session.app.getGame()!);
    const checkpoint=`${g.phase}:${g.night}:${g.day}`;
    if(!captured.has(checkpoint)){await session.act({action:'observe'});captured.add(checkpoint);}
    if(g.phase==='ended') {
      assert.ok(g.winner);
      assert.ok(session.app.ai.service(session.app.getGame()).spent>0,'Real AI usage must be recorded');
      assert.ok(confirmations>=24,'All phones confirmed distribution and both shared night steps');
      assert.ok(ballots>0,'At least one ballot was confirmed');
      assert.ok(!session.events.some((e:any)=>e.kind==='pageerror'));
      await session.act({action:'resize',width:390,height:844});
      await session.act({action:'assert',noOverflow:true,noPageErrors:true});
      result={status:'passed',winner:g.winner,steps:step,confirmations,ballots,ai:session.app.ai.service(session.app.getGame())};
      break;
    }
    if(g.announcement) {
      if(!await page.locator('[data-action="ack"]').count())await click('assistant');
      await click('ack');
    } else if(['distribution','night_choices','night_results'].includes(g.phase)) {
      for(let i=1;i<=8;i++){
        const phone=session.pages[`phone${i}`];await phone.bringToFront();
        if(await phone.locator('[data-action="reveal"]').count())await phone.locator('[data-action="reveal"]').click();
        const submit=phone.locator('[data-action="submit"]');await submit.waitFor();
        for(let n=0;await submit.isDisabled()&&n<3;n++)await phone.locator('[data-target]:not(.selected)').first().click();
        await submit.click();await phone.locator('.working').waitFor({state:'hidden',timeout:55000});confirmations++;
      }
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
} catch(error) {result={status:'failed',error:String(error),confirmations,ballots};throw error;} finally {await session.close(result);}
