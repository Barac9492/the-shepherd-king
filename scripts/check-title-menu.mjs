import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openTitleSection,openSlingRanking} from './title-menu-test-helpers.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:44935';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local preview only');
const out='test-results/title-menu';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const checks=[],requests=[],errors=[];
const ready=p=>p.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending&&!document.getElementById('title').hidden);
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
try{
 for(const width of [1280,390,320]){
  const context=await browser.newContext({viewport:{width,height:width===1280?900:width===390?844:700},hasTouch:width<600,isMobile:width<600});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;requests.push(req.method()+' '+path);assert.equal(req.method(),'GET');const mode=path.includes('/dance-')?'dance':path.includes('/engedi-')?'engedi':'sling';const data=mode==='sling'?{mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:'sling-challenge-v2',record:null,rankingVersion:'top10-v1',entries:[]}:{mode,version:'side-top10-v1',entries:[]};await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
  await p.goto(base+'/?test=1');await ready(p);await p.evaluate(()=>localStorage.setItem('david-progress','6'));
  await check(`${width}: exactly three main entries, no top-level rankings`,async()=>{
   assert.deepEqual(await p.locator('#mainMenu button').allTextContents(),['스토리','챌린지','산책']);
   for(const id of ['bStart','bChapters','bExplore','bChallenge','bDance','bEngedi','bKeilah','bChallengeRanking'])await expect(p.locator('#'+id)).toBeHidden();
   for(const id of ['bStoryMenu','bChallengeMenu','bWalkMenu']){const box=await p.locator('#'+id).boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width+.5);}
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${out}/main-${width}.png`});
  });
  await check(`${width}: story chapters, Escape and focus restoration`,async()=>{
   await p.locator('#bStoryMenu')[width<600?'tap':'click']();await expect(p.locator('#menuHeading')).toBeFocused();await p.click('#bChapters');await expect(p.locator('#chapterList button')).toHaveCount(11);
   await expect(p.locator('#bChapters')).toHaveAttribute('aria-expanded','true');await p.keyboard.press('Escape');await expect(p.locator('#bStoryMenu')).toBeFocused();await expect(p.locator('#chapterList')).toBeHidden();
  });
  await check(`${width}: challenge selection and sling internal ranking round-trip`,async()=>{
   await p.locator('#bChallengeMenu')[width<600?'tap':'click']();assert.deepEqual(await p.locator('#menuChallenge > .btn').allTextContents(),['물맷돌 챌린지','다윗 댄스 챌린지','엔게디 잠입 챌린지','그일라 2인 구출전']);
   await expect(p.locator('#bChallengeRanking')).toBeHidden();await p.screenshot({path:`${out}/challenges-${width}.png`});await p.click('#bChallenge');await openSlingRanking(p,width<600);
   await expect(p.locator('#challengeRankingEmpty')).toContainText('아직 공개');assert.equal(await p.evaluate(()=>GAME.slingChallenge.attempt),null);
   await p.click('#challengeBack');await expect(p.locator('#bChallengeRanking')).toBeFocused();await expect(p.locator('#challengeStart')).toBeVisible();
   await p.click('#challengeBack');await ready(p);await expect(p.locator('#bChallenge')).toBeFocused();
  });
  await check(`${width}: local-only dance selection and En-Gedi ranking remain reachable`,async()=>{
   await p.click('#bDance');await p.goBack();await ready(p);await openTitleSection(p,'challenge');const beforeDanceRequests=requests.length;await p.click('#bDance');await expect(p.locator('[data-psalm]')).toHaveCount(3);assert.deepEqual(await p.locator('[data-psalm]').evaluateAll(buttons=>buttons.map(b=>b.dataset.psalm)),['psalm23','psalm3','psalm51']);await expect(p.locator('[data-ranking]')).toHaveCount(0);await expect(p.locator('.local-only-note')).toContainText('기존 온라인 순위에는 새 기록을 보내지');assert.equal(requests.length,beforeDanceRequests);await p.click('#leave');await ready(p);await expect(p.locator('#menuChallenge')).toBeVisible();
   await p.click('#bEngedi');await p.locator('[data-ranking=engedi] [data-rank=read]').click();await expect(p.locator('[data-ranking=engedi] [data-rank=status]')).toContainText('아직 공개');await p.click('#engediBack');await ready(p);await expect(p.locator('#bEngedi')).toBeFocused();
  });
  await check(`${width}: walk and garden are reachable, return preserves progress`,async()=>{
   await openTitleSection(p,'walk');await p.screenshot({path:`${out}/walk-${width}.png`});await p.click('#bGardenMenu');await expect(p.locator('#gardenCard')).toBeVisible();await p.click('#gardenEnter');await p.waitForFunction(()=>GAME.peaceGarden.active);
   await p.click('#gardenBack');await p.waitForFunction(()=>GAME.exploration.active&&!GAME.peaceGarden.active);await p.click('#walkTitle');await ready(p);await expect(p.locator('#menuWalk')).toBeVisible();await expect(p.locator('#bGardenMenu')).toBeFocused();
   await p.click('#bExplore');await p.waitForFunction(()=>GAME.exploration.active);await p.click('#walkTitle');await ready(p);await expect(p.locator('#bExplore')).toBeFocused();
   assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');await p.click('#menuBack');await expect(p.locator('#bWalkMenu')).toBeFocused();
   await p.click('#lEn');assert.deepEqual(await p.locator('#mainMenu button').allTextContents(),['Story','Challenges','Walk']);await p.click('#lKo');
  });
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith('GET ')));
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,requests,errors,scope:'local fixtures, no real scores'},null,2));console.log('PASS',checks.length,'checks');
}finally{for(const context of browser.contexts())await context.close();await browser.close();}
