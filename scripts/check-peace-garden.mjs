import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:44018';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const checks=[],errors=[],network=[],evidence=[];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const ready=p=>p.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);
const active=p=>p.waitForFunction(()=>GAME.peaceGarden.active&&!GAME.paused);
const capture=async(p,name)=>{if(!process.env.SHOTS)return;await p.locator('#loading').waitFor({state:'detached'});await fs.mkdir(process.env.SHOTS,{recursive:true});await p.screenshot({path:`${process.env.SHOTS}/${name}.png`});};
const approach=(p,kind)=>p.evaluate(kind=>{const c=GAME.peaceGarden;c.select(kind);document.getElementById('gardenChoice').value=kind;const a=c.session.selected.a;GAME.placePlayer(a.pos.x,a.pos.z+3,Math.PI);c.resetCamera();c.interactFrame(false);},kind);
async function observe(p){p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/api/'))network.push({url:r.url(),method:r.method()});});await p.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});}
try{
 const p=await browser.newPage({viewport:{width:1280,height:800}});await observe(p);await p.goto(base+'/?test=1');await ready(p);
 await p.evaluate(()=>localStorage.setItem('david-progress','6'));await p.click('#bExplore');
 await check('optional intro has exact scripture, safe links, focus and cancel without replacing walk',async()=>{
  const tok=await p.evaluate(()=>GAME.tok);await p.click('#walkGarden');assert.equal(await p.locator('#gardenCard').getAttribute('open'),'');
  assert.equal(await p.locator('#gardenCard blockquote').innerText(),'나의 거룩한 산 모든 곳에서 해됨도 없고 상함도 없을 것이니');
  assert.equal(await p.locator('.garden-cite').innerText(),'이사야 11:9 · 개역한글');
  assert.match(await p.locator('.garden-context').innerText(),/창작 표현/);assert.equal(await p.locator('#gardenCard a').count(),2);
  await p.keyboard.down('w');await p.keyboard.up('w');assert.equal(await p.evaluate(()=>GAME.input.keys.size),0);
  for(let i=0;i<8;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.getElementById('gardenCard').contains(document.activeElement)),true);}
  await capture(p,'peace-garden-intro');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>GAME.tok),tok);assert.equal(await p.evaluate(()=>GAME.paused),false);assert.equal(await p.locator('#menu').isVisible(),false);
 });
 await check('garden entry owns a separate harmless world and leaves saved progress untouched',async()=>{
  await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);
  assert.deepEqual(await p.evaluate(()=>[GAME.exploration.active,GAME.sling,GAME.targets.length,GAME.timers.length,GAME.waiters.length,!!GAME.sheepTutorial,GAME.slingChallenge.phase,localStorage.getItem('david-progress')]),[false,false,0,0,0,false,'closed','6']);
  assert.equal(network.length,0);assert.equal(await p.locator('#gardenAction').isVisible(),false);await capture(p,'peace-garden-desktop');
 });
 await check('keyboard move, run and camera drag work',async()=>{
  const pos=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.down('w');await p.waitForFunction(pos=>Math.hypot(GAME.player.pos.x-pos[0],GAME.player.pos.z-pos[2])>1,pos);await p.keyboard.up('w');
  await p.keyboard.down('Shift');await p.keyboard.down('w');await p.waitForFunction(()=>GAME.player.speed>7);await p.keyboard.up('w');await p.keyboard.up('Shift');
  const yaw=await p.evaluate(()=>GAME.cam.yaw);await p.mouse.move(900,400);await p.mouse.down();await p.mouse.move(1050,400,{steps:6});await p.mouse.up();assert.notEqual(await p.evaluate(()=>GAME.cam.yaw),yaw);
 });
 await check('all species can be petted, played with, followed and rested without scores',async()=>{
  for(const kind of ['lion','lamb','wolf']){
   await approach(p,kind);await p.keyboard.press('e');await p.waitForFunction(()=>GAME.peaceGarden.session.selected.friend);
   await p.click('#gardenPlay');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.selected.state),'play');
   await p.click('#gardenFollow');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion.kind),kind);
   await p.click('#gardenRest');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion),null);assert.equal(await p.evaluate(()=>GAME.player.pose),'sit');
   await p.keyboard.down('s');await p.waitForFunction(()=>GAME.player.pose==='auto');await p.keyboard.up('s');
  }
  assert.equal(network.length,0);await approach(p,'lion');await p.click('#gardenPlay');await capture(p,'peace-garden-friends');
 });
 await check('selected companion follows a walk and changing selection lets it rest',async()=>{
  await p.click('#gardenFollow');const before=await p.evaluate(()=>GAME.peaceGarden.session.companion.a.pos.toArray());
  await p.keyboard.down('s');await p.waitForFunction(before=>GAME.peaceGarden.session.companion.a.pos.distanceTo(new GRAPHICS_TEST.THREE.Vector3(...before))>1,before);await p.keyboard.up('s');
  await p.selectOption('#gardenChoice','wolf');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion),null);
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals[0].state),'rest');
 });
 await check('companion takes a collision-safe detour and player collisions and bounds work',async()=>{
  const route=await p.evaluate(()=>{
   const g=GAME,c=g.peaceGarden,s=c.session;g.paused=true;const a=s.animals[0];s.selected=a;s.companion=a;a.state='follow';a.repath=0;a.a.pos.set(-12,0,-3);g.placePlayer(-2,-3,Math.PI/2);
   let minimum=Infinity;g.paused=false;
   for(let i=0;i<600;i++){c.tick(s,1/60);for(const o of g.colliders)minimum=Math.min(minimum,Math.hypot(a.a.pos.x-o.x,a.a.pos.z-o.z)-o.r);}
   const distance=a.a.pos.distanceTo(g.player.pos);g.moveTo(50,0);const bound=Math.hypot(g.player.pos.x,g.player.pos.z);
   g.placePlayer(-10,-3,Math.PI/2);for(let i=0;i<60;i++)g.moveTo(g.player.pos.x+.1,-3);
   const collision=g.player.pos.x;c.home();return{minimum,distance,bound,collision};
  });assert.ok(route.minimum>=.84,JSON.stringify(route));assert.ok(route.distance<4,JSON.stringify(route));assert.ok(route.bound<=24.001);assert.ok(route.collision<-7.9,JSON.stringify(route));evidence.push({pathing:route});
 });
 await check('verse modal pauses motion, closes by button or Escape, and restores focus/input',async()=>{
  for(const close of ['button','Escape']){await p.click('#gardenVerse');const position=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.press('w');assert.deepEqual(await p.evaluate(()=>GAME.player.pos.toArray()),position);assert.equal(await p.evaluate(()=>GAME.paused),true);assert.equal(await p.locator('#gardenEnter').isVisible(),false);if(close==='button')await p.click('#gardenClose');else await p.keyboard.press('Escape');await active(p);assert.equal(await p.evaluate(()=>document.activeElement.id),'gardenVerse');assert.equal(await p.evaluate(()=>GAME.input.keys.size),0);}
 });
 await check('pause/help, language and return-to-entrance preserve garden state',async()=>{
  await p.keyboard.press('Escape');assert.equal(await p.locator('#gardenPanel').isVisible(),false);await p.click('#mLang');assert.equal(await p.locator('#mRestart').innerText(),'Garden entrance');await p.click('#mHelp');await p.click('#hOk');await active(p);await p.keyboard.press('Escape');await p.click('#mLang');await p.click('#mRestart');assert.deepEqual(await p.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z]),[0,11]);
 });
 await check('repeated exits restore walk location and release old resources and inputs',async()=>{
  const counts=[];
  for(let i=0;i<4;i++){
   await p.evaluate(()=>{window.oldGarden=GAME.peaceGarden.session;window.oldRoot=GAME.root;GAME.input.keys.add('KeyW');});await p.click('#gardenBack');
   await p.waitForFunction(()=>GAME.exploration.active);assert.deepEqual(await p.evaluate(()=>[oldGarden.disposed,oldRoot.parent===null,GAME.peaceGarden.active,GAME.input.keys.size]),[true,true,false,0]);assert.deepEqual(await p.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z]),[6,40]);
   await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);await p.waitForTimeout(120);
   assert.equal(await p.evaluate(()=>GAME.peaceGarden.open()),false);
   counts.push(await p.evaluate(()=>({updaters:GAME.updaters.length,disposers:GAME.chapterDisposers.length,geometries:GAME.renderer.info.memory.geometries,textures:GAME.renderer.info.memory.textures,calls:GAME.renderer.info.render.calls,triangles:GAME.renderer.info.render.triangles})));
  }
  assert.deepEqual(counts.at(-1),counts[0]);evidence.push({resourceCounts:counts});assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');assert.equal(network.length,0);
 });
 await check('pause-menu title exit disposes the world after its fade and supports clean re-entry',async()=>{
  const before=await p.evaluate(()=>GAME.renderer.info.memory.geometries);
  for(let i=0;i<2;i++){
   await p.evaluate(()=>{window.exitingGarden=GAME.peaceGarden.session;window.exitingRoot=GAME.root;});
   await p.keyboard.press('Escape');await p.click('#mTitleBtn');
   await p.waitForFunction(()=>GAME.mode==='title'&&exitingRoot.parent===null&&exitingGarden.owned.disposed);
   assert.equal(await p.evaluate(()=>exitingGarden.disposed&&GAME.input.keys.size===0),true);await ready(p);
   await p.click('#bExplore');await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);await p.waitForTimeout(150);
   assert.equal(await p.evaluate(()=>GAME.renderer.info.memory.geometries),before);
  }
 });
 await check('story handoff restores Chapter 1 and challenge stays fixed after garden exit',async()=>{
  await p.click('#gardenBack');await p.evaluate(()=>{GAME.helpShown=true;GAME.placePlayer(-46,-43,Math.PI);});await p.click('#walkAction');await p.waitForFunction(()=>GAME.mode==='introCard');await p.click('#cRow .primary');await p.waitForFunction(()=>!!GAME.dq);assert.equal(await p.evaluate(()=>!!GAME.sheepTutorial&&GAME.ch.s.canFollow),true);assert.equal(await p.evaluate(()=>GAME.peaceGarden.active),false);
  await p.evaluate(()=>void GAME.showTitle());await ready(p);await p.click('#bChallenge');await p.waitForFunction(()=>GAME.slingChallenge.phase==='lobby');await p.click('#challengeLearn');await p.waitForFunction(()=>GAME.slingChallenge.phase==='playing');const pos=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.press('w');assert.deepEqual(await p.evaluate(()=>GAME.player.pos.toArray()),pos);await p.keyboard.press('Escape');await p.click('#mTitleBtn');await ready(p);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');
  assert.ok(network.every(r=>r.method==='GET'));await p.close();
 });
 const m=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await observe(m);await m.goto(base+'/?test=1');await ready(m);await m.tap('#bExplore');await m.tap('#walkGarden');await capture(m,'peace-garden-mobile-intro');await m.tap('#gardenEnter');await active(m);
 await check('mobile portrait supports touch interaction, simultaneous joystick/look, cancellation and verse return',async()=>{
  await capture(m,'peace-garden-mobile');await m.locator('#gardenInteractions summary').tap();await approach(m,'wolf');await m.tap('#tAct');await m.waitForFunction(()=>GAME.peaceGarden.session.selected.friend);await m.tap('#gardenFollow');
  const before=await m.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z,GAME.cam.yaw]);const box=await m.locator('#joy').boundingBox();
  await m.evaluate(box=>{const send=(el,type,id,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));send(document.getElementById('joy'),'pointerdown',41,box.x+box.width/2,box.y+box.height/2-42);send(GAME.canvas,'pointerdown',42,280,480);send(GAME.canvas,'pointermove',42,315,480);},box);
  await m.waitForFunction(([x,z])=>Math.hypot(GAME.player.pos.x-x,GAME.player.pos.z-z)>.7,before);assert.notEqual(await m.evaluate(()=>GAME.cam.yaw),before[2]);
  await m.evaluate(()=>{document.getElementById('joy').dispatchEvent(new PointerEvent('pointercancel',{pointerId:41,pointerType:'touch'}));window.dispatchEvent(new Event('orientationchange'));});assert.deepEqual(await m.evaluate(()=>[GAME.input.joy.x,GAME.input.joy.y,GAME.input.lookId]),[0,0,null]);
  await m.tap('#gardenVerse');await m.tap('#gardenClose');await active(m);assert.equal(await m.locator('#joy').isVisible(),true);
 });
 await check('mobile landscape controls stay reachable, scroll clear of joystick, and exit is clean',async()=>{
  await m.setViewportSize({width:844,height:390});await m.locator('#gardenInteractions summary').tap();await m.locator('#gardenGuide summary').tap();
  const box=await m.locator('#gardenPanel').boundingBox(),joy=await m.locator('#joy').boundingBox();assert.ok(box.y+box.height<=joy.y,JSON.stringify({box,joy}));
  await m.tap('#gardenHome');await m.locator('#gardenGuide summary').tap();await m.evaluate(()=>document.getElementById('gardenPanel').scrollTop=0);await capture(m,'peace-garden-mobile-landscape');
  await m.tap('#gardenVerse');await capture(m,'peace-garden-landscape-verse');await m.tap('#gardenClose');await m.tap('#gardenBack');await m.tap('#walkTitle');await ready(m);assert.equal(await m.evaluate(()=>localStorage.getItem('david-progress')),null);await m.close();
 });
 await check('legacy graphics and reduced motion support garden entry and cleanup',async()=>{
  const l=await browser.newPage({reducedMotion:'reduce'});await observe(l);await l.goto(base+'/?test=1&graphics=legacy');await ready(l);await l.click('#bExplore');await l.click('#walkGarden');await l.click('#gardenEnter');await active(l);await approach(l,'lion');await l.click('#gardenPlay');assert.equal(await l.evaluate(()=>GAME.peaceGarden.session.reducedMotion),true);await l.click('#gardenBack');await l.click('#walkTitle');await ready(l);await l.close();
 });
 assert.deepEqual(errors,[]);
 console.log('PEACE_GARDEN_RESULT '+JSON.stringify({browser:await browser.version(),checks:checks.length,passed:checks,errors,evidence,network,physicalDeviceTested:false}));
}finally{await browser.close();}
