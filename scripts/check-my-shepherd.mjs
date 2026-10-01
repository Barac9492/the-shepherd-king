import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:45551';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const results=[];
export async function installShepherdQA(){
 const g=window.GAME,d=document;window.__shepherdQA={errors:[],events:[]};const q=window.__shepherdQA;
 addEventListener('error',e=>q.errors.push(e.message));addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason?.message||e.reason)));
 g.loop=()=>{requestAnimationFrame(g.loop);g.renderer.render(g.scene,g.camera);};await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 g.saveProgress=()=>{};g.helpShown=true;g.fade=async()=>{};
 q.load=i=>{g.loadWorld(i);g.placePlayer(...g.ch.start);g.mode='play';g.paused=false;g.lock=false;d.querySelector('#title').hidden=true;d.querySelector('#card').hidden=true;d.querySelector('#menu').hidden=true;d.querySelector('#hud').hidden=false;d.querySelector('#touch').hidden=!matchMedia('(pointer:coarse)').matches;d.querySelector('#hudTitle').textContent=g.ch.title.ko;d.querySelector('#hudRef').textContent=g.ch.ref.ko;g.updateCamera(.04);q.finished=false;const token=g.tok;Promise.resolve(g.ch.run(g)).then(()=>{if(token===g.tok)q.finished=true;}).catch(e=>q.errors.push(String(e)));};
 q.step=(dt=.04)=>{if(g.paused)return;g.time+=dt;g.processTimers();g.updateDialog(dt);g.updateAim(dt);g.updateStones(dt);g.updateInteract();for(const a of g.actors)a.update(dt);g.updaters=g.updaters.filter(f=>f(dt)!==false);if(g.ch.ambient)g.ch.ambient(g,dt);g.syncDavid();g.david.update(dt,0);g.updateCamera(dt);g.updateCompass();d.body.classList.toggle('talking',!!g.dq||g.lock);g.input.consume();};
 q.drive=async(predicate,max=4000)=>{for(let i=0;i<max;i++){if(q.errors.length)throw Error(q.errors.join('\n'));if(predicate())return;if(g.dq)g.input.act=true;q.step();if(i%10===0)await new Promise(r=>setTimeout(r,0));}throw Error('QA bounded timeout '+g.ch.s.phase);};
 q.state=()=>({phase:g.ch.s.phase,collected:g.ch.s.collected,safeCount:g.ch.s.safeCount,called:g.ch.s.called,returned:g.ch.s.returned,history:g.ch.s.history,camera:g.ch.s.diagnostics?.camera,drift:g.ch.s.diagnostics?.maxSafeSheepDrift,errors:q.errors});
 q.load(10);return q.state();
}
try{
 for(const [name,viewport,mobile,query] of [['desktop',{width:1280,height:720},false,''],['phone-emulation',{width:390,height:844},true,''],['legacy',{width:1280,height:720},false,'&graphics=legacy']]){
  const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?test=1'+query);await page.waitForFunction(()=>window.GAME?.mode==='title'&&!document.getElementById('loading'),null,{timeout:45000});
  assert.equal(await page.evaluate(()=>GRAPHICS_TEST.chapters.length),11);
  const initial=await page.evaluate(installShepherdQA);assert.equal(initial.phase,'gather');assert.equal(initial.collected,0);assert.equal(await page.evaluate(()=>GAME.ch.id),11);
  for(let i=0;i<9;i++){await page.evaluate(()=>{const g=GAME,s=g.ch.s.sheep[g.ch.s.nextIndex];g.placePlayer(s.actor.pos.x,s.actor.pos.z,GAME.player.yaw);});if(mobile)await page.locator('#tAct').tap();else await page.keyboard.press('e');await page.evaluate(()=>__shepherdQA.step());assert.equal(await page.evaluate(()=>GAME.ch.id),11);assert.equal(await page.evaluate(()=>GAME.ch.s.collected),i+1);}
  await page.evaluate(()=>{const g=GAME,S=g.ch.s;g.placePlayer(S.fold.x,S.fold.z,g.player.yaw);__shepherdQA.step();});
  await page.evaluate(()=>__shepherdQA.drive(()=>GAME.ch.s.phase==='lost_call'));
  const lost=await page.evaluate(()=>{GAME.renderer.render(GAME.scene,GAME.camera);return __shepherdQA.state();});assert.equal(lost.safeCount,9);assert.equal(lost.camera.viewpoint,'lost-sheep');assert.ok(lost.camera.povHeight<.8);
  const call=page.getByRole('button',{name:'불러보기',exact:true});await call.waitFor({state:'visible'});await call.click();await page.evaluate(()=>__shepherdQA.step());assert.equal(await page.evaluate(()=>GAME.ch.s.called),true);
  await page.evaluate(()=>__shepherdQA.drive(()=>GAME.ch.s.completed));
  const final=await page.evaluate(()=>{GAME.renderer.render(GAME.scene,GAME.camera);return {...__shepherdQA.state(),runFinished:__shepherdQA.finished};});assert.equal(final.runFinished,true);assert.equal(final.returned,10);assert.equal(final.drift,0);assert.ok(final.camera.minBehindDot>.7);assert.deepEqual(final.errors,[]);assert.deepEqual(errors,[]);
  const cleanup=await page.evaluate(()=>{const old=GAME.ch.s;GAME.loadWorld(0);return{cancelled:old.cancelled,button:!!document.querySelector('#my-shepherd-call'),davidVisible:GAME.david.root.visible,chapter:GAME.ch.id};});assert.equal(cleanup.cancelled,true);assert.equal(cleanup.button,false);assert.equal(cleanup.davidVisible,true);assert.equal(cleanup.chapter,1);
  results.push({name,pass:true,lost,final,cleanup});console.log('PASS',name);await context.close();
 }
 console.log('MY_SHEPHERD_RESULT '+JSON.stringify({passed:results.length,results}));
}finally{await browser.close();}
