import {openTitleSection} from './title-menu-test-helpers.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:44026';
const output=process.env.SCREENSHOT_DIR||'test-results/engedi';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const errors=[],results=[],requests=[];
const check=async(name,fn)=>{await fn();results.push({name,pass:true});console.log('PASS',name);};
const ready=p=>p.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending&&!document.getElementById('title').hidden);
const enter=async p=>{await openTitleSection(p,'challenge');await p.click('#bEngedi');await p.waitForFunction(()=>GAME.engediChallenge.phase==='lobby');};
const start=async p=>{await p.click('#engediStart');await p.waitForFunction(()=>GAME.engediChallenge.phase==='playing');};
const state=p=>p.evaluate(()=>({...GAME.engediChallenge.state,speed:GAME.engediChallenge.speed,pointer:GAME.engediChallenge.pointerId}));
const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.method()+' '+new URL(r.url()).pathname);});};
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});observe(page);
  await page.goto(base+'/?test=1');await ready(page);
  await page.evaluate(()=>localStorage.setItem('david-progress','6'));
  await enter(page);
  await check('entry clearly separates local timing and Saul-spared narrative',async()=>{
    assert.equal(await page.locator('#bEngedi').innerText(),'엔게디 잠입 챌린지');assert.match(await page.locator('[data-ranking=engedi]').innerText(),/엔게디 잠입 챌린지 TOP 10/);assert.match(await page.locator('#engediIntro').innerText(),/하나님께 맡겼/);assert.equal(await page.evaluate(()=>GAME.renderer.shadowMap.enabled),false);
    await page.locator('#engediPolicyTitle').click();
    assert.match(await page.locator('#engediPanel').innerText(),/10ms/);
    assert.match(await page.locator('#engediPanel').innerText(),/새로고침하면 사라/);
    await page.screenshot({path:`${output}/desktop-intro.png`});
  });
  await check('scene preparation excludes input/time and cancels without delayed restart',async()=>{
    await page.click('#engediStart');await page.waitForFunction(()=>GAME.engediChallenge.phase==='preparing');
    await page.keyboard.down('d');await page.waitForTimeout(100);await page.keyboard.up('d');
    assert.equal((await state(page)).tick,0);assert.equal((await state(page)).progress,0);
    await page.keyboard.press('Escape');assert.equal((await state(page)).status,'invalid');
    await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>GAME.engediChallenge.phase),'result');
  });
  await start(page);
  await check('keyboard release stops cutting while timer and recovery continue',async()=>{
    await page.keyboard.down('d');await page.waitForTimeout(700);await page.keyboard.up('d');
    const before=await state(page);await page.waitForTimeout(200);const after=await state(page);
    assert.equal(after.status,'playing',JSON.stringify(after));assert.equal(after.speed,0);assert.equal(after.progress,before.progress);assert.ok(after.tick>before.tick);assert.ok(after.alert<before.alert);
    await page.screenshot({path:`${output}/desktop-playing.png`});
  });
  await check('all-fast run fails at alert 100 and restart is clean',async()=>{
    await page.click('#engediRetry');await page.waitForFunction(()=>GAME.engediChallenge.phase==='playing');await page.keyboard.down('d');await page.waitForFunction(()=>GAME.engediChallenge.phase==='result',{},{timeout:15000});await page.keyboard.up('d');
    assert.equal((await state(page)).reason,'noticed');assert.equal(await page.evaluate(()=>GAME.engediChallenge.best),null);
    await start(page);assert.equal((await state(page)).progress,0);assert.equal((await state(page)).speed,0);
  });
  await check('course-aware real-time keyboard run succeeds and shows the moral ending',async()=>{
    // Real KeyboardEvents through the same capture handler; no state/time mutation.
    await page.evaluate(()=>{
      window.__engediPilot=setInterval(()=>{const c=GAME.engediChallenge;if(c.phase!=='playing'){clearInterval(window.__engediPilot);return;}const p=c.state.progress;const tight=[[180000,270000],[490000,580000],[760000,850000]].some(([a,b])=>p>=a-1800&&p<b);const code=tight?'KeyA':'KeyD';if(window.__engediPilotKey===code)return;if(window.__engediPilotKey)window.dispatchEvent(new KeyboardEvent('keyup',{code:window.__engediPilotKey,bubbles:true}));window.__engediPilotKey=code;window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));},16);
    });
    await page.waitForFunction(()=>GAME.engediChallenge.phase==='result',{},{timeout:40000});
    const s=await state(page);assert.equal(s.status,'success');assert.ok(s.tick>2000&&s.tick<3000);
    assert.match(await page.locator('#engediRecord').innerText(),/^\d+\.\d{3} s$/);assert.match(await page.locator('#engediEnding').innerText(),/마음이 찔렸/);assert.match(await page.locator('#engediEnding').innerText(),/판단은 하나님께/);
    await page.screenshot({path:`${output}/desktop-success.png`});
    console.log('REAL_TIME_FINISH',s.tick*10);
  });
  await check('escape, blur, visibility, and long render gaps invalidate without saving',async()=>{
    const best=await page.evaluate(()=>GAME.engediChallenge.best);
    for(const type of ['escape','blur','hidden','gap']){
      await start(page);await page.keyboard.down('d');await page.waitForTimeout(80);
      if(type==='escape')await page.keyboard.press('Escape');
      if(type==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      if(type==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
      if(type==='gap')await page.evaluate(()=>{const end=performance.now()+300;while(performance.now()<end){/* deliberately block main thread */}});
      await page.keyboard.up('d');await page.waitForFunction(()=>GAME.engediChallenge.phase==='result');
      assert.equal((await state(page)).status,'invalid',type);assert.equal((await state(page)).speed,0);assert.equal(await page.evaluate(()=>GAME.engediChallenge.best),best);
    }
  });
  await check('title return aborts input listeners and frees scene resources across repeated visits',async()=>{
    for(let i=0;i<3;i++){
      await start(page);
      await page.evaluate(()=>{const mats=new Set(),geos=new Set();GAME.root.traverse(o=>{if(o.material?.userData.engediOwned)mats.add(o.material);if(o.geometry&&!o.userData.keepGeo)geos.add(o.geometry);});window.__engediDisposal={expected:mats.size+geos.size,disposed:0};for(const resource of [...mats,...geos])resource.addEventListener('dispose',()=>window.__engediDisposal.disposed++);});
      await page.keyboard.down('d');await page.click('#engediExit');await page.keyboard.up('d');await ready(page);
      assert.deepEqual(await page.evaluate(()=>({active:GAME.engediChallenge.active,phase:GAME.engediChallenge.phase,listeners:GAME.engediChallenge.listeners,world:GAME.engediChallenge.world,held:GAME.input.keys.size})),{active:false,phase:'closed',listeners:null,world:null,held:0});
      assert.ok(await page.evaluate(()=>window.__engediDisposal.expected>20&&window.__engediDisposal.expected===window.__engediDisposal.disposed),'owned geometry/material disposal');
      assert.equal(await page.locator('#engedi').isVisible(),false);assert.equal(await page.evaluate(()=>GAME.renderer.shadowMap.enabled),true);assert.equal(await page.evaluate(()=>GAME.renderer.getPixelRatio()),1);assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
      if(i<2)await enter(page);
    }
  });
  await check('story chapter 5 and existing sling mode remain reachable without save changes',async()=>{
    await openTitleSection(page,'story');await page.click('#bChapters');await page.locator('#chapterList button').nth(4).click();
    await page.waitForFunction(()=>GAME.mode==='introCard'&&GAME.chIdx===4);assert.equal(await page.locator('#engedi').isVisible(),false);
    await page.evaluate(()=>void GAME.showTitle());await ready(page);
    await openTitleSection(page,'challenge');await page.click('#bChallenge');await page.click('#challengeStart');await page.waitForFunction(()=>GAME.slingChallenge.phase==='playing');
    assert.equal(await page.evaluate(()=>GAME.engediChallenge.active),false);assert.equal(await page.locator('#challengeHud').isVisible(),true);
    await page.keyboard.press('Escape');await page.click('#mTitleBtn');await ready(page);
    assert.equal(await page.evaluate(()=>localStorage.getItem('david-progress')),'6');
  });
  await check('reload clears visit record',async()=>{await page.reload();await ready(page);assert.equal(await page.evaluate(()=>GAME.engediChallenge.best),null);});
  await page.goto('about:blank');
  for(const width of [390,320]) {
    const context=await browser.newContext({viewport:{width,height:width===390?844:568},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    const p=await context.newPage();observe(p);await p.goto(base+'/?test=1');await ready(p);await enter(p);
    await check(`${width}px intro and controls fit with no horizontal overflow`,async()=>{
      await p.screenshot({path:`${output}/mobile-${width}-intro.png`,fullPage:true});
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await start(p);
      for(const id of ['engediHud','engediControls','engediPad']){const r=await p.locator('#'+id).boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width+.5,id);assert.ok(r.y>=0&&r.y+r.height<=(width===390?844:568)+.5,id);}
      const r=await p.locator('#engediPad').boundingBox();
      const pointer={pointerId:41,pointerType:'touch',clientX:r.x+r.width*.8,clientY:r.y+30};
      await p.dispatchEvent('#engediPad','pointerdown',pointer);await p.waitForTimeout(300);await p.screenshot({path:`${output}/mobile-${width}-playing.png`});
      assert.ok((await state(p)).speed>70);
      await p.dispatchEvent('#engediPad','pointercancel',pointer);const stopped=await state(p);await p.waitForTimeout(100);
      assert.equal((await state(p)).progress,stopped.progress);assert.equal((await state(p)).speed,0);
    });
    await check(`${width}px cancel, lost capture, second pointer and release never leave held input`,async()=>{
      const r=await p.locator('#engediPad').boundingBox(),a={pointerId:42,pointerType:'touch',clientX:r.x+10,clientY:r.y+20},b={...a,pointerId:43,clientX:r.x+r.width-5};
      await p.dispatchEvent('#engediPad','pointerdown',a);await p.dispatchEvent('#engediPad','pointerdown',b);assert.equal((await state(p)).pointer,42);
      await p.dispatchEvent('#engediPad','pointerup',b);assert.equal((await state(p)).pointer,42);
      await p.dispatchEvent('#engediPad','lostpointercapture',a);assert.equal((await state(p)).speed,0);
      await p.dispatchEvent('#engediPad','pointerdown',b);await p.dispatchEvent('#engediPad','pointerup',b);assert.equal((await state(p)).pointer,null);
      const cdp=await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+20,y:r.y+30,id:1}]});
      assert.ok((await state(p)).pointer!==null,'real touch owns capture');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width-20,y:r.y+30,id:1}]});
      assert.ok((await state(p)).speed>80,'real touch drag changes speed without pressure');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await state(p)).speed,0);await cdp.detach();
      await p.click('#engediRetry');assert.equal((await state(p)).progress,0);assert.equal((await state(p)).speed,0);
      await p.evaluate(()=>GAME.setLang('en'));assert.match(await p.locator('#engediControls').innerText(),/Release to rest/);
      await p.click('#engediExit');await ready(p);assert.equal(await p.locator('#engedi').isVisible(),false);
    });
    await context.close();
  }
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(r=>r==='GET /api/sling-challenge/record'),'Engedi never posts scores or writes data');
  const report={passed:results.length,results,errors,requests};await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log('ENGEDI_RESULT '+JSON.stringify(report));
}catch(error){console.error('ENGEDI_QA_STATE',await browser.contexts()[0]?.pages()[0]?.evaluate(()=>({phase:GAME.engediChallenge.phase,state:GAME.engediChallenge.state,gaps:GAME.engediChallenge.prepareGaps,ratio:GAME.renderer.getPixelRatio(),render:GAME.renderer.info.render})).catch(()=>({})));throw error;}finally{for(const context of browser.contexts())await context.close();await browser.close();}
