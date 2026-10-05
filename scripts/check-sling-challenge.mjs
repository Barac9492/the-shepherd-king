import {openTitleSection} from './title-menu-test-helpers.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHALLENGE_COURSE_SEED, CHALLENGE_RULES } from '../src/sling-challenge-core.js';

const base=process.env.BASE_URL||'http://127.0.0.1:43981';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const errors=[],results=[],consoleErrors=[];
const tutorialKey='sling-challenge-tutorial-v2';
const observe=page=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().slice(0,1000));});};
const check=async(name,fn)=>{await fn();results.push({name,pass:true});console.log('PASS',name);};
const ready=async page=>{try{await page.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);}catch(error){const state=await page.evaluate(()=>({game:!!window.GAME,mode:window.GAME?.mode,challengePhase:window.GAME?.slingChallenge?.phase,navigationPending:window.GAME?.slingChallenge?.navigationPending,loading:document.getElementById('loading')?.textContent?.slice(0,1000)})).catch(()=>null);throw new Error(`Title did not become ready: ${JSON.stringify({state,errors,consoleErrors:consoleErrors.slice(-10)})}`,{cause:error});}};
const playing=page=>page.waitForFunction(()=>GAME.slingChallenge.phase==='playing'&&!GAME.slingChallenge.tutorial);
const aim=async(page,hit)=>page.evaluate(hit=>{
  const g=GAME,c=g.slingChallenge;
  if(hit){const target=c.target().position;const d=new window.GRAPHICS_TEST.THREE.Vector3(...target).sub(g.camera.position).normalize();g.cam.yaw=-Math.atan2(d.x,-d.z);g.cam.pitch=-Math.asin(d.y);}else{g.cam.yaw=.8;g.cam.pitch=.4;}
  c.camera(0);
},hit);
const release=async(page,hit)=>{await page.keyboard.down('f');await page.waitForFunction(()=>GAME.aiming&&GAME.aimCharge>.6);await aim(page,hit);await page.keyboard.up('f');await page.waitForFunction(()=>!GAME.aiming);};
const shot=async(page,hit)=>{const before=await page.evaluate(()=>GAME.slingChallenge.shots.length);await release(page,hit);await page.waitForFunction(before=>GAME.slingChallenge.shots.length>before,before);};
const tutorialShot=async page=>{const before=await page.evaluate(()=>GAME.slingChallenge.tutorialHits);await release(page,true);await page.waitForFunction(before=>GAME.slingChallenge.tutorialHits>before||(!GAME.slingChallenge.tutorial&&GAME.slingChallenge.phase==='playing'),before);};
const course=page=>page.evaluate(()=>{const c=GAME.slingChallenge,t=c.target();return{seed:c.state.seed,version:c.state.version,position:t.position,radius:t.radius,phase:t.phase,budgetMs:t.budgetMs};});

// Simulate only CH1 gameplay completion. The real startChapter flow, intro/end
// cards, button dispatch, and destination chapter remain live. The full story
// suite owns gameplay completion; this is not an in-progress checkpoint resume.
const chapterOneEndCard=async page=>{
  await page.evaluate(()=>{
    const chapter=GRAPHICS_TEST.chapters[0];
    window.__challengeOriginalChapterRun=chapter.run;
    chapter.run=async()=>{};
    GAME.helpShown=true;
    void GAME.startChapter(0);
  });
  await page.waitForFunction(()=>GAME.mode==='introCard'&&GAME.chIdx===0);
  await page.click('#cRow .primary');
  await page.waitForFunction(()=>GAME.mode==='endCard'&&GAME.chIdx===0);
  await page.evaluate(()=>{GRAPHICS_TEST.chapters[0].run=window.__challengeOriginalChapterRun;delete window.__challengeOriginalChapterRun;});
  assert.ok(await page.locator('#cChallenge').isVisible());
  await page.click('#cChallenge');
  await page.waitForFunction(()=>GAME.slingChallenge.phase==='lobby'&&!GAME.slingChallenge.navigationPending);
};
const chapterTwoIntro=async page=>{
  await page.waitForFunction(()=>GAME.mode==='introCard'&&GAME.chIdx===1);
  assert.equal(await page.evaluate(()=>GAME.slingChallenge.phase),'closed');
  assert.equal(await page.locator('#card').isVisible(),true);
  assert.equal(await page.locator('#challengeHud').isVisible(),false);
  assert.equal(await page.locator('#challengePanel').isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
  await page.evaluate(()=>{void GAME.showTitle();});
  await ready(page);
};

try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});observe(page);
  const serverStarts=[];
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/sling-challenge/attempts')serverStarts.push(request.url());});
  await page.goto(base+'/?test=1');await ready(page);await page.evaluate(()=>localStorage.setItem('david-progress','6'));await openTitleSection(page,'challenge');await page.click('#bChallenge');
  await check('separate entry explains scoring, controls and test-only record scope',async()=>{await page.waitForFunction(()=>document.getElementById('challengeStatus').textContent.includes('로컬'));assert.ok(await page.locator('#challengeScoring').isVisible());assert.ok(await page.locator('#challengeTest').isVisible());});
  await check('first-time start completes three untimed tutorial targets before clean practice',async()=>{
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),tutorialKey),null);
    const starts=serverStarts.length;
    await page.click('#challengeStart');await page.waitForFunction(()=>GAME.slingChallenge.phase==='playing'&&GAME.slingChallenge.tutorial);
    for(const id of ['challengeScore','challengeLives','challengeTimer'])assert.equal(await page.locator('#'+id).isVisible(),false);
    assert.ok(await page.locator('#challengeSkip').isVisible());
    await release(page,false);
    assert.deepEqual(await page.evaluate(()=>({hits:GAME.slingChallenge.tutorialHits,score:GAME.slingChallenge.state.score,lives:GAME.slingChallenge.state.lives,shots:GAME.slingChallenge.shots.length})),{hits:0,score:0,lives:3,shots:0});
    for(let i=0;i<3;i++){
      await tutorialShot(page);
      if(i<2)assert.deepEqual(await page.evaluate(()=>({hits:GAME.slingChallenge.tutorialHits,score:GAME.slingChallenge.state.score,lives:GAME.slingChallenge.state.lives,shots:GAME.slingChallenge.shots.length})),{hits:i+1,score:0,lives:3,shots:0});
    }
    await playing(page);
    assert.deepEqual(await page.evaluate(()=>({round:GAME.slingChallenge.state.round,score:GAME.slingChallenge.state.score,lives:GAME.slingChallenge.state.lives,shots:GAME.slingChallenge.shots.length,server:GAME.slingChallenge.serverAttempt})),{round:1,score:0,lives:3,shots:0,server:false});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),tutorialKey),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
    assert.equal(serverStarts.length,starts);
    assert.equal(await page.locator('#challengeSkip').isVisible(),false);
    for(const id of ['challengeScore','challengeLives','challengeTimer'])assert.ok(await page.locator('#'+id).isVisible());
  });
  await check('fixed 3D arena and keyboard aim preserve story progress',async()=>{const before=await page.evaluate(()=>GAME.cam.yaw);await page.keyboard.down('ArrowRight');await page.waitForFunction(before=>GAME.cam.yaw<before-.05,before);await page.keyboard.up('ArrowRight');assert.deepEqual(await page.evaluate(()=>GAME.player.pos.toArray()),[-1,0,6]);assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');});
  await check('pause cancels charge and freezes time until resume',async()=>{await page.keyboard.down('f');await page.waitForFunction(()=>GAME.aimCharge>.45);await page.keyboard.press('Escape');await page.keyboard.up('f');const time=await page.evaluate(()=>GAME.slingChallenge.state.activeMs);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>GAME.slingChallenge.state.activeMs),time);await page.click('#mResume');assert.equal(await page.evaluate(()=>GAME.slingChallenge.shots.length),0);});
  await check('hit scores once, difficulty advances and three misses end practice',async()=>{await shot(page,true);assert.equal(await page.evaluate(()=>GAME.slingChallenge.state.hits),1);assert.equal(await page.evaluate(()=>GAME.slingChallenge.state.round),2);for(let i=0;i<3;i++)await shot(page,false);await page.waitForFunction(()=>GAME.slingChallenge.phase==='result');assert.equal(await page.locator('#challengeForm').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');});
  await check('retry creates a clean attempt and back restores title',async()=>{await page.click('#challengeStart');await playing(page);assert.equal(await page.evaluate(()=>GAME.slingChallenge.state.score),0);await page.keyboard.press('Escape');await page.click('#mTitleBtn');await ready(page);assert.equal(await page.locator('#challengeHud').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');});
  await check('server-validated local record qualifies, requires consent, and renders initials safely',async()=>{await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.waitForSelector('#challengeTest:not([hidden])');await page.click('#challengeTest');await playing(page);await shot(page,true);for(let i=0;i<3;i++)await shot(page,false);await page.waitForSelector('#challengeForm:not([hidden])');await page.fill('#challengeInitials','abc');await page.check('#challengeConsent');await page.click('#challengeSubmit');await page.waitForFunction(()=>document.getElementById('challengeStatus').textContent.includes('저장했'));assert.match(await page.locator('#challengeRecord').innerText(),/^ABC · /);await page.click('#challengeBack');await ready(page);});
  await check('optional control lesson can be skipped back to its lobby without a ranked attempt',async()=>{
    const starts=serverStarts.length;
    await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.waitForSelector('#challengeTest:not([hidden])');await page.click('#challengeLearn');
    await page.waitForFunction(()=>GAME.slingChallenge.tutorial&&GAME.slingChallenge.phase==='playing');
    await page.click('#challengeSkip');await page.waitForFunction(()=>GAME.slingChallenge.phase==='lobby');
    assert.equal(await page.evaluate(()=>GAME.slingChallenge.tutorial),false);
    assert.equal(await page.locator('#challengeHud').isVisible(),false);
    assert.equal(serverStarts.length,starts);
    await page.click('#challengeBack');await ready(page);
  });
  await check('practice and online-ranked fixture use the same course with distinct eligibility',async()=>{
    await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.waitForSelector('#challengeTest:not([hidden])');await page.click('#challengeStart');await playing(page);
    const practice=await course(page);
    assert.equal(practice.seed,CHALLENGE_COURSE_SEED);
    assert.deepEqual(await page.evaluate(()=>({server:GAME.slingChallenge.serverAttempt,eligible:GAME.slingChallenge.state.onlineEligible,attempt:GAME.slingChallenge.attempt})),{server:false,eligible:false,attempt:null});
    await page.keyboard.press('Escape');await page.click('#mTitleBtn');await ready(page);
    // Browser-only online UI fixture. Actual verification remains covered above
    // against the local server and separately by the online service tests.
    const requested=[];
    const onlineRoute=async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      requested.push(`${request.method()} ${path}`);
      const data={mode:'online',ruleVersion:CHALLENGE_RULES.version,onlineEligible:true,recordScope:'global'};
      if(request.method()==='GET'&&path.endsWith('/record'))data.record=null;
      else if(request.method()==='POST'&&path.endsWith('/attempts'))data.attempt={id:'b'.repeat(48),seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version};
      else return route.abort();
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    };
    await page.route('**/api/sling-challenge/**',onlineRoute);
    try{
      await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.waitForFunction(()=>GAME.slingChallenge.mode==='online');await page.click('#challengeTest');await playing(page);
      assert.deepEqual(await course(page),practice);
      assert.deepEqual(await page.evaluate(()=>({server:GAME.slingChallenge.serverAttempt,eligible:GAME.slingChallenge.state.onlineEligible})),{server:true,eligible:true});
      assert.match(await page.locator('#challengeMode').innerText(),/온라인/);
      assert.equal(requested.filter(request=>request==='POST /api/sling-challenge/attempts').length,1);
      assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
      await page.keyboard.press('Escape');await page.click('#mTitleBtn');await ready(page);
    }finally{await page.unroute('**/api/sling-challenge/**',onlineRoute);}
  });
  await check('chapter-one end-card challenge lobby returns to chapter-two intro without lowering save',async()=>{
    await chapterOneEndCard(page);
    assert.equal(await page.evaluate(()=>GAME.slingChallenge.returnChapter),1);
    assert.match(await page.locator('#challengeBack').innerText(),/2장/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
    await page.click('#challengeBack');await chapterTwoIntro(page);
  });
  await check('story challenge pause menu returns contextually to chapter-two intro',async()=>{
    await chapterOneEndCard(page);await page.click('#challengeStart');await playing(page);
    await page.keyboard.down('f');await page.waitForFunction(()=>GAME.aimCharge>.45);await page.keyboard.press('Escape');await page.keyboard.up('f');
    assert.match(await page.locator('#mTitleBtn').innerText(),/2장/);
    assert.equal(await page.evaluate(()=>GAME.slingChallenge.shots.length),0);
    await page.click('#mTitleBtn');await chapterTwoIntro(page);
  });
  if(process.env.SCREENSHOT_DIR){await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.click('#challengeStart');await playing(page);await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/sling-challenge-desktop.png`});}
  // Match the existing browser harness: release the desktop scene before the
  // phone starts. Two live WebGL scenes contend for the CI SwiftShader CPU.
  await page.goto('about:blank');
  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const phone=await mobile.newPage();observe(phone);await phone.goto(base+'/?test=1');await ready(phone);await openTitleSection(phone,'challenge');await phone.click('#bChallenge');await phone.click('#challengeStart');
  await check('first-time mobile tutorial pauses safely and skip starts clean practice',async()=>{
    await phone.waitForFunction(()=>GAME.slingChallenge.phase==='playing'&&GAME.slingChallenge.tutorial);
    assert.equal(await phone.evaluate(key=>localStorage.getItem(key),tutorialKey),null);
    assert.equal(await phone.locator('#challengeTimer').isVisible(),false);
    const p={pointerId:31,pointerType:'touch',clientX:320,clientY:650};
    await phone.dispatchEvent('#tSling','pointerdown',p);await phone.waitForFunction(()=>GAME.aimCharge>.45);await phone.click('#btnMenu');await phone.dispatchEvent('#tSling','pointerup',p);
    const time=await phone.evaluate(()=>GAME.slingChallenge.state.activeMs);await phone.waitForTimeout(300);
    assert.equal(await phone.evaluate(()=>GAME.slingChallenge.state.activeMs),time);
    await phone.click('#mResume');assert.equal(await phone.evaluate(()=>GAME.slingChallenge.tutorialHits),0);
    await phone.click('#challengeSkip');await playing(phone);
    assert.equal(await phone.evaluate(key=>localStorage.getItem(key),tutorialKey),'1');
    assert.deepEqual(await phone.evaluate(()=>({score:GAME.slingChallenge.state.score,lives:GAME.slingChallenge.state.lives,shots:GAME.slingChallenge.shots.length,server:GAME.slingChallenge.serverAttempt})),{score:0,lives:3,shots:0,server:false});
  });
  await check('portrait touch cancellation, pause and release use existing sling controls',async()=>{
    assert.ok(await phone.locator('#tSling').isVisible());assert.equal(await phone.locator('#joy').isVisible(),false);
    const p={pointerId:32,pointerType:'touch',clientX:320,clientY:650};await phone.dispatchEvent('#tSling','pointerdown',p);await phone.waitForFunction(()=>GAME.aimCharge>.45);await phone.dispatchEvent('#tSling','pointercancel',p);assert.equal(await phone.evaluate(()=>GAME.slingChallenge.shots.length),0);
    await phone.dispatchEvent('#tSling','pointerdown',{...p,pointerId:33});await phone.waitForFunction(()=>GAME.aimCharge>.45);await phone.click('#btnMenu');await phone.dispatchEvent('#tSling','pointerup',{...p,pointerId:33});await phone.click('#mResume');assert.equal(await phone.evaluate(()=>GAME.slingChallenge.shots.length),0);
    await phone.dispatchEvent('#tSling','pointerdown',{...p,pointerId:34});await phone.waitForFunction(()=>GAME.aimCharge>.45);await aim(phone,true);await phone.dispatchEvent('#tSling','pointerup',{...p,pointerId:34});await phone.waitForFunction(()=>GAME.slingChallenge.shots.length===1);assert.equal(await phone.evaluate(()=>GAME.slingChallenge.state.hits),1);
  });
  await check('mobile HUD stays in viewport in portrait and landscape',async()=>{for(const viewport of [{width:390,height:844},{width:844,height:390}]){await phone.setViewportSize(viewport);const box=await phone.locator('#challengeHud').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width);assert.ok(box.y>=0&&box.y+box.height<=viewport.height);}});
  if(process.env.SCREENSHOT_DIR){await phone.setViewportSize({width:390,height:844});await phone.screenshot({path:`${process.env.SCREENSHOT_DIR}/sling-challenge-phone.png`});}
  assert.deepEqual(errors,[]);console.log('SLING_CHALLENGE_RESULT '+JSON.stringify({passed:results.length,results,errors}));
}finally{await browser.close();}
