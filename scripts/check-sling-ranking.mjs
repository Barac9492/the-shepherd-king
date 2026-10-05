import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHALLENGE_RULES } from '../src/sling-challenge-core.js';

const base=process.env.BASE_URL||'http://127.0.0.1:43983';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Use a local preview; ranking responses are browser fixtures.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const results=[],requests=[],errors=[];
const data=(record,entries=record?[{initials:'ABC',score:1234},{initials:'ABC',score:1200}]:[])=>({mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:CHALLENGE_RULES.version,record,rankingVersion:'top10-v1',entries});
const record={initials:'ABC',score:1234};
const ready=page=>page.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
await fs.mkdir('test-results/sling-ranking',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',error=>errors.push(error.message));
  let response=data(record),status=200,release;
  await page.route('**/api/sling-challenge/**',async route=>{
    const req=route.request();requests.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if(req.method()!=='GET'||!req.url().endsWith('/record'))return route.abort();
    if(response==='pending')await new Promise(resolve=>{release=resolve;});
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(response)}).catch(()=>{});
  });
  await page.goto(base);await ready(page);
  await check('title ranking entry opens top 10 records without playing or submitting',async()=>{
    await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeRecord')).toHaveText('ABC · 1,234');
    await expect(page.getByRole('dialog',{name:'물맷돌 챌린지 랭킹'})).toBeVisible();
    for(const id of ['challengeStart','challengeTest','challengeLearn','challengeForm'])await expect(page.locator('#'+id)).toBeHidden();
    await expect(page.locator('#challengeRankingRows tr')).toHaveCount(2);await expect(page.locator('#challengeRankingScope')).toContainText('같은 이니셜도 별개');await expect(page.locator('#challengeRankingRows')).toContainText('ABC');
    assert.equal(await page.evaluate(()=>GAME.slingChallenge.attempt),null);
    await page.screenshot({path:'test-results/sling-ranking/desktop.png'});
  });
  await check('keyboard focus is contained and Escape restores the ranking button',async()=>{
    await page.locator('#challengeBack').focus();await page.keyboard.press('Tab');await expect(page.locator('#challengeRefresh')).toBeFocused();
    await page.keyboard.press('Shift+Tab');await expect(page.locator('#challengeBack')).toBeFocused();
    await page.keyboard.press('Escape');await ready(page);await expect(page.locator('#bChallengeRanking')).toBeFocused();
  });
  await check('empty record, HTTP failure and retry have distinct states',async()=>{
    response=data(null);await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeRankingEmpty')).toHaveText('아직 공개 순위표에 제출된 기록이 없어요.');
    status=503;response={error:{code:'unavailable'}};await page.locator('#challengeRefresh').click();await expect(page.locator('#challengeStatus')).toContainText('랭킹을 불러오지 못했어요');await expect(page.locator('#challengeRefresh')).toBeEnabled();
    status=200;response=data(record);await page.locator('#challengeRefresh').click();await expect(page.locator('#challengeRecord')).toHaveText('ABC · 1,234');
  });
  await check('closing a pending read keeps the title closed to late responses',async()=>{
    await page.locator('#challengeBack').click();await ready(page);response='pending';
    await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeRecord')).toHaveText('기록을 불러오는 중…');await expect(page.locator('#challengeRefresh')).toBeDisabled();
    await page.locator('#challengeBack').click();await ready(page);response=data(record);release();await expect(page.locator('#challengePanel')).toBeHidden();
  });
  await check('English labels and ordinary challenge entry remain available',async()=>{
    await page.locator('#lEn').click();await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeTitle')).toHaveText('Sling Challenge ranking');await expect(page.locator('#challengeRecordLabel')).toHaveText('Global best · includes earlier records');
    await page.locator('#challengeBack').click();await ready(page);await page.locator('#bChallenge').click();await expect(page.locator('#challengeStart')).toBeVisible();await expect(page.locator('#challengeTest')).toBeVisible();
    await page.locator('#challengeBack').click();await ready(page);await page.locator('#lKo').click();
  });
  await check('legacy API remains an explicit single-best fallback, never an invented top 10',async()=>{
    response={mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:CHALLENGE_RULES.version,record};
    await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeRecord')).toHaveText('ABC · 1,234');await expect(page.locator('#challengeRanking')).toBeHidden();await expect(page.locator('#challengeStatus')).toContainText('전체 최고 기록 1건');
    await page.locator('#challengeBack').click();await ready(page);
  });
  response=data(record,Array.from({length:10},(_,i)=>({initials:'ABC',score:1234-i*10})));
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await check(`mobile ${viewport.width}x${viewport.height}: visible entry, scrolling, touch targets and back`,async()=>{
      await page.setViewportSize(viewport);await page.locator('#bChallengeRanking').click();await expect(page.locator('#challengeRecord')).toHaveText('ABC · 1,234');
      await expect(page.locator('#challengeRankingRows tr')).toHaveCount(10);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#challengeTitle').scrollIntoViewIfNeeded();const titleBox=await page.locator('#challengeTitle').boundingBox();assert.ok(titleBox.y>=0);
      for(const id of ['challengeBack','challengeRefresh']){await page.locator('#'+id).scrollIntoViewIfNeeded();const box=await page.locator('#'+id).boundingBox();assert.ok(box.height>=44&&box.width>=44);assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1);}
      await page.screenshot({path:`test-results/sling-ranking/mobile-${viewport.width}.png`});
      await page.locator('#challengeBack').click();await ready(page);await expect(page.locator('#bChallengeRanking')).toBeFocused();
    });
  }
  await page.close();
  await check('touch phone opens and closes ranking without writing a score',async()=>{
    const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    phone.on('pageerror',error=>errors.push(error.message));
    await phone.route('**/api/sling-challenge/**',route=>{
      const req=route.request();requests.push(`${req.method()} ${new URL(req.url()).pathname}`);
      return req.method()==='GET'&&req.url().endsWith('/record')?route.fulfill({contentType:'application/json',body:JSON.stringify(data(record))}):route.abort();
    });
    await phone.goto(base);await ready(phone);await phone.locator('#bChallengeRanking').tap();await expect(phone.locator('#challengeRecord')).toHaveText('ABC · 1,234');
    await phone.locator('#challengeRefresh').tap();await expect(phone.locator('#challengeRefresh')).toBeEnabled();
    await phone.locator('#challengeBack').tap();await ready(phone);await expect(phone.locator('#bChallengeRanking')).toBeFocused();await phone.close();
  });
  assert.ok(requests.length>0&&requests.every(req=>req==='GET /api/sling-challenge/record'));
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/sling-ranking/report.json',JSON.stringify({results,requests,errors},null,2));
} finally {await browser.close();}
