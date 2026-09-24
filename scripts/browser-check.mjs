import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:43871';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
async function check(name,fn){await fn();results.push({name,pass:true});console.log('PASS',name);}
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' @ '+m.location().url);});
try{
 await page.goto(`${base}/?review=fold`);
 await page.waitForFunction(()=>window.GAME?.reviewShot==='fold',{timeout:30000});
 await check('upgraded assets loaded, review does not save progress',async()=>{
  const r=await page.evaluate(()=>({assets:GAME.graphicsAssets,progress:localStorage.getItem('david-progress'),paused:GAME.paused}));
  assert.equal(r.assets,'ready');assert.equal(r.progress,null);assert.equal(r.paused,true);
 });
 await check('all four chapters render, original chapters retain their lighting',async()=>{
  for(let i=0;i<4;i++){
   const r=await page.evaluate(i=>{const g=GAME;g.loadWorld(i);g.mode='play';g.paused=true;g.placePlayer(...g.ch.start);g.updateCamera(1);g.renderer.render(g.scene,g.camera);let meshes=0;g.root.traverse(o=>{if(o.isMesh)meshes++});return{chapter:g.ch.id,meshes,sun:g.sun.intensity,expectedSun:g.ch.env.sunInt,position:g.player.pos.toArray()};},i);
   assert.equal(r.chapter,i+1);assert.ok(r.meshes>10);if(i>0)assert.equal(r.sun,r.expectedSun);assert.ok(r.position.every(Number.isFinite));
  }
 });
 await check('sheep follow and sheepfold counting still work',async()=>{
  const r=await page.evaluate(()=>{const g=GAME;g.loadWorld(0);g.mode='play';g.paused=true;g.lock=false;g.placePlayer(-4,30,0);const s=g.ch.s.sheep[0];s.a.pos.copy(g.player.pos);s.a.dest=null;for(const f of g.updaters)f(0.016);const follow=s.st;s.a.pos.set(0,g.groundAt(0,-8),-8);for(const f of g.updaters)f(0.016);return{follow,end:s.st,count:g.ch.s.inFold,staff:!!g.david.staff,hand:!!g.david.handR,root:g.david.root.name};});
  assert.equal(r.follow,'follow');assert.equal(r.end,'fold');assert.equal(r.count,1);assert.ok(r.staff&&r.hand);
 });
 await check('new hero accepts all story poses without invalid transforms',async()=>{
  const invalid=await page.evaluate(()=>{let invalid=[];for(const pose of ['auto','walk','sling','carry','cheer','wave','dance','sit','kneel','bow','play','point','roar','anoint','pray','still']){GAME.david.pose=pose;for(let i=0;i<20;i++)GAME.david.update(1/60,pose==='walk'?4.8:0);GAME.david.root.updateMatrixWorld(true);GAME.david.root.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))invalid.push(pose+':'+o.name)});}return invalid;});assert.deepEqual(invalid,[]);
 });
 await check('chapter-one reload does not accumulate scene geometry',async()=>{
  const counts=await page.evaluate(()=>{const a=[];for(let i=0;i<4;i++){GAME.loadWorld(0);GAME.placePlayer(3,3,0);GAME.updateCamera(1);GAME.renderer.render(GAME.scene,GAME.camera);a.push(GAME.renderer.info.memory.geometries);}return a;});
  console.log('reload geometries',counts);assert.ok(counts.at(-1)<=counts[1]+4,JSON.stringify(counts));
 });
 await check('normal UI boots and starts first chapter',async()=>{
  await page.goto(base+'/');await page.waitForFunction(()=>window.GAME?.mode==='title');
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByRole('button',{name:'Begin the journey',exact:true}).click();
  await page.getByRole('button',{name:'Begin',exact:true}).click();
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>!!GAME.dq);
  // Send the normal continue key, then wait for the game loop to consume it.
  for(let i=0;i<8;i++){
    const state=await page.evaluate(()=>GAME.dq ? `${GAME.dq.i}:${GAME.dq.typing}` : null);
    if(state===null)break;
    await page.keyboard.press('e');
    await page.waitForFunction(previous=>!GAME.dq || `${GAME.dq.i}:${GAME.dq.typing}`!==previous,state);
  }
  await page.waitForFunction(()=>GAME.mode==='play'&&!GAME.dq);
  const before=await page.evaluate(()=>GAME.player.pos.toArray());
  await page.keyboard.down('w');
  await page.waitForFunction(before=>Math.hypot(GAME.player.pos.x-before[0],GAME.player.pos.z-before[2])>.15,before,{timeout:15000});
  await page.keyboard.up('w');
  const after=await page.evaluate(()=>GAME.player.pos.toArray());assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2])>0.15);
 });
 await check('sling input still throws a stone with upgraded hand attachment',async()=>{
  await page.evaluate(()=>{GAME.enableSling(true,5,5);GAME.player.pose='auto';});
  await page.keyboard.down('f');await page.waitForFunction(()=>GAME.aiming && GAME.aimCharge>.45);await page.keyboard.up('f');
  await page.waitForFunction(()=>GAME.stones<5);assert.ok(await page.evaluate(()=>GAME.stones===4));
 });
 await check('touch layout boots and renders upgraded scene',async()=>{
  await page.goto('about:blank');
  const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const p=await phone.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/?review=gameplay',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.GAME?.reviewShot==='gameplay');
  const r=await p.evaluate(()=>({ratio:GAME.renderer.getPixelRatio(),assets:GAME.graphicsAssets,width:innerWidth}));assert.ok(r.ratio<=1.5);assert.equal(r.assets,'ready');console.log('emulated touch',r);await phone.close();
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,errors,renderer:'Headless SwiftShader; NOT hardware performance evidence'},null,2));
} finally{await browser.close();}
