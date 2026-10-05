import {openTitleSection} from './title-menu-test-helpers.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {VERSES,SCORE_KEY} from '../src/david-dance-core.js';
import {CHALLENGE_RULES} from '../src/sling-challenge-core.js';
const base=process.env.BASE_URL||'http://127.0.0.1:44025';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local only');
const out=process.env.SHOTS||'test-results/david-dance';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],errors=[],requests=[];let observeDance=true;
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const context=await browser.newContext({viewport:{width:1280,height:1000}});
const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(observeDance&&r.url().startsWith('http')&&!r.url().startsWith(base))requests.push(r.url());});
const shot=async(name,page=p)=>page.screenshot({path:`${out}/${name}.png`,fullPage:true});
const submit=async(text,page=p)=>{await page.fill('#answer',text);await page.click('#check');};
const clickNext=async(page=p)=>page.click((await page.viewportSize()).width<=760?'#sceneContinue':'#next');
try{
 await p.goto(`${base}/dance.html`);
 await check('practice source is visible, audio muted, no camera/mic, no network',async()=>{
  assert.equal(await p.locator('#verse').innerText(),VERSES[0]);assert.equal(await p.locator('#hint').isVisible(),false);
  assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');assert.equal(requests.length,0);await shot('desktop-practice');
 });
 await check('challenge hides verse, wrong word and edits are explained accurately',async()=>{
  await p.click('#challenge');await submit(' ! ');assert.match(await p.locator('#feedback').innerText(),/먼저 입력/);assert.equal(await p.locator('#verse').textContent(),'');
  await submit(VERSES[0].replace('목자','목사'));assert.match(await p.locator('#feedback').innerText(),/본문:.*목자/);assert.match(await p.locator('#feedback').innerText(),/입력:.*목사/);
  await shot('desktop-correction');await p.click('#check');await p.click('#check');assert.equal(await p.locator('#duplicateNote').count(),1);
  await submit(VERSES[0]);assert.equal(await p.locator('#stage').getAttribute('data-level'),'1');assert.equal(await p.locator('#next').isVisible(),true);assert.match(await p.locator('#score').innerText(),/연속 0절/);
 });
 await check('duplicate success and next clicks cannot score or skip verses',async()=>{
  const score=await p.locator('#score').innerText();await p.evaluate(()=>{document.getElementById('answerForm').requestSubmit();document.getElementById('answerForm').requestSubmit();});assert.equal(await p.locator('#score').innerText(),score);
  await p.evaluate(()=>{document.getElementById('next').click();document.getElementById('next').click();});assert.equal(await p.locator('#verseLabel').innerText(),'시편 23편 2절');
 });
 await check('hint penalty is counted once, cancel mode/restart/leave preserve typed input',async()=>{
  await p.click('#hint');assert.equal(await p.locator('#verse').innerText(),VERSES[1]);assert.equal(await p.locator('#hint').isDisabled(),true);
  await p.fill('#answer','수정 중인 입력');
  for(const action of ['#practice','#restart','#leave']){await p.click(action);assert.equal(await p.locator('#confirm').isVisible(),true);for(let t=0;t<4;t++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.getElementById('confirm').contains(document.activeElement)),true);}await p.keyboard.press('Escape');assert.equal(await p.locator('#answer').inputValue(),'수정 중인 입력');}
  await p.click('#restart');await p.click('#confirmAction');assert.equal(await p.locator('#answer').inputValue(),'');assert.equal(await p.locator('#score').innerText(),'0점 · 연속 0절');
 });
 await check('Korean composition blocks submission; normal Enter is newline, shortcut checks after composition',async()=>{
  await p.fill('#answer',VERSES[0]);await p.dispatchEvent('#answer','compositionstart');
  assert.equal(await p.locator('#check').isDisabled(),true);
  await p.evaluate(()=>document.getElementById('answerForm').requestSubmit());await p.keyboard.press('Control+Enter');assert.equal(await p.locator('#stage').getAttribute('data-level'),'0');
  await p.dispatchEvent('#answer','compositionend');await p.keyboard.press('Enter');assert.match(await p.locator('#answer').inputValue(),/\n/);assert.equal(await p.locator('#stage').getAttribute('data-level'),'0');
  await p.waitForTimeout(130);await p.keyboard.press('Control+Enter');assert.equal(await p.locator('#stage').getAttribute('data-level'),'1');
 });
 await check('six verses unlock every stage, festival, 1110 points, one persistent local record',async()=>{
  for(let i=1;i<6;i++){await clickNext();await submit(VERSES[i].replaceAll(' ','')+'!');assert.equal(await p.locator('#stage').getAttribute('data-level'),String(i+1));}
  assert.match(await p.locator('#resultScore').innerText(),/1110점/);assert.equal(await p.locator('#result').isVisible(),true);
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('.friend-two')).opacity==='1');
  await p.evaluate(()=>document.getElementById('answerForm').requestSubmit());assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,SCORE_KEY),1);
  await shot('desktop-festival');await p.reload();assert.equal(await p.locator('#scores li').count(),1);assert.match(await p.locator('#scores').textContent(),/1110점/);
 });
 await check('mode confirmation resets round; practice completion does not write scores',async()=>{
  await p.fill('#answer','시작');await p.click('#challenge');await p.click('#confirmAction');assert.equal(await p.locator('#answer').inputValue(),'');
  await p.click('#practice');for(let i=0;i<6;i++){await submit(VERSES[i]);if(i<5)await clickNext();}
  assert.match(await p.locator('#saveStatus').innerText(),/연습 완주/);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,SCORE_KEY),1);
 });
 await check('sound only starts on gesture; toggle and pagehide close audio contexts',async()=>{
  await p.evaluate(()=>{window.testContexts=[];const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...a){super(...a);window.testContexts.push(this);}};});
  await p.click('#sound');assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'true');await p.click('#sound');
  assert.equal(await p.evaluate(()=>testContexts.every(c=>c.state==='closed')),true);await p.click('#sound');await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await p.evaluate(()=>testContexts.every(c=>c.state==='closed')),true);assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');
 });
 await check('clear records needs confirmation and affects only dance key',async()=>{
  await p.evaluate(()=>localStorage.setItem('david-progress','6'));
  await p.locator('summary').first().click();await p.click('#clearScores');await p.click('#cancelAction');assert.match(await p.locator('#scores').textContent(),/1110점/);
  await p.click('#clearScores');await p.click('#confirmAction');assert.equal(await p.evaluate(k=>localStorage.getItem(k),SCORE_KEY),null);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');
 });
 await check('blocked storage completes gracefully',async()=>{
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});const b=await blocked.newPage();await b.goto(`${base}/dance.html`);await b.click('#challenge');
  for(let i=0;i<6;i++){await submit(VERSES[i],b);if(i<5)await clickNext(b);}assert.match(await b.locator('#saveStatus').innerText(),/저장할 수 없어요/);await blocked.close();
 });
 for(const width of [320,390])await check(`${width}px touch, long verse, viewport shrink, restart and festival fit`,async()=>{
  const mobile=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(`${base}/dance.html`);
  await shot(`mobile-${width}-practice`,m);await m.tap('#challenge');await m.tap('#hint');
  for(let i=0;i<6;i++){
   if(i===3){await m.tap('#hint');await m.fill('#answer',VERSES[i]);await shot(`mobile-${width}-long-verse`,m);await m.setViewportSize({width,height:380});await m.locator('#answer').focus();assert.equal(await m.locator('#check').isVisible(),true);await m.setViewportSize({width,height:844});}
   await m.fill('#answer',VERSES[i]);await m.tap('#check');assert.equal(await m.locator('#stage').getAttribute('data-level'),String(i+1));if(i<5)await m.tap('#sceneContinue');
  }
  await m.waitForTimeout(550);assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(`mobile-${width}-festival`,m);
  await m.tap('#sceneContinue');await m.tap('#again');await m.fill('#answer','새 입력');await m.tap('#restart');await m.tap('#cancelAction');assert.equal(await m.locator('#answer').inputValue(),'새 입력');await mobile.close();
 });
 await check('reduced motion removes scene animations',async()=>{await p.emulateMedia({reducedMotion:'reduce'});await p.click('#again');await submit(VERSES[0]);assert.equal(await p.locator('#david').evaluate(el=>getComputedStyle(el).animationName),'none');});
 await check('entry and exit preserve story save; title accessible at 320px',async()=>{
  observeDance=false;await p.click('#leave');await p.click('#confirmAction');await p.waitForFunction(()=>window.GAME?.mode==='title');
  assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');await p.locator('#bDance').waitFor({state:'visible'});await p.setViewportSize({width:320,height:640});await p.locator('#bDance').scrollIntoViewIfNeeded();await shot('main-title-320');
  await openTitleSection(p,'challenge');await p.click('#bDance');await p.waitForURL('**/dance.html');assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');
 });
 await check('integrated PR16 top10 survives dance return and preserves local dance/story records',async()=>{
  await p.setViewportSize({width:1280,height:1000});await p.click('#challenge');
  for(let i=0;i<6;i++){await submit(VERSES[i]);if(i<5)await clickNext();}
  const saved=await p.evaluate(k=>localStorage.getItem(k),SCORE_KEY),rankingRequests=[];
  assert.ok(saved);await p.route('**/api/sling-challenge/**',async route=>{
   const r=route.request();rankingRequests.push(r.method()+' '+new URL(r.url()).pathname);
   if(r.method()!=='GET'||!r.url().endsWith('/record'))return route.abort();
   await route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:CHALLENGE_RULES.version,rankingVersion:'top10-v1',record:{initials:'ABC',score:1234},entries:Array.from({length:10},(_,i)=>({initials:'ABC',score:1234-i*10}))})});
  });
  await p.click('#leave');await openTitleSection(p,'challenge');await p.click('#bChallenge');await p.locator('#bChallengeRanking').waitFor({state:'visible'});await p.setViewportSize({width:320,height:640});
  await p.click('#bChallengeRanking');await p.waitForFunction(()=>document.querySelectorAll('#challengeRankingRows tr').length===10);
  await shot('rc-main-ranking-320');assert.ok(rankingRequests.length>0&&rankingRequests.every(r=>r==='GET /api/sling-challenge/record'));
  await p.click('#challengeBack');await p.click('#challengeBack');await p.locator('#bDance').waitFor({state:'visible'});await openTitleSection(p,'challenge');await p.click('#bDance');await p.waitForURL('**/dance.html');
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),SCORE_KEY),saved);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');
 });
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={checks:checks.length,names:checks,errors,externalRequests:requests,limitations:['Synthetic composition events, not an actual Korean OS keyboard.','Mobile emulation, not physical device performance.'],screenshots:out};
 await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('DAVID_DANCE_RESULT',JSON.stringify(report));
}finally{await context.close();await browser.close();}
