import { chromium } from '@playwright/test';
import { checkGuidancePanel } from './guidance-panel-checks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:44018';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const checks=[],errors=[],network=[],evidence=[];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const ready=p=>p.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending,null,{timeout:30000});
const active=p=>p.waitForFunction(()=>GAME.peaceGarden.active&&!GAME.paused,null,{timeout:30000});
const capture=async(p,name)=>{if(!process.env.SHOTS)return;await p.locator('#loading').waitFor({state:'detached'});await fs.mkdir(process.env.SHOTS,{recursive:true});await p.screenshot({path:`${process.env.SHOTS}/${name}.png`});};
const enter=async p=>{await p.click('#bExplore');await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);};
const approach=(p,kind)=>p.evaluate(kind=>{const c=GAME.peaceGarden,a=c.session.animals.find(a=>a.kind===kind).a;GAME.input.clearHeld();GAME.placePlayer(a.pos.x,a.pos.z+3,Math.PI);c.resetCamera();c.interactFrame(false);},kind);
const primary=async p=>{await p.keyboard.press('e');await p.waitForFunction(()=>!GAME.input.act,null,{timeout:10000});};
const tapAction=async p=>{await p.tap('#tAct');await p.waitForFunction(()=>!GAME.input.act,null,{timeout:10000});};
const start=async(p,kind)=>{await approach(p,kind);await primary(p);await p.waitForFunction(kind=>GAME.peaceGarden.session.activity?.animal.kind===kind,kind,{timeout:10000});};
// Assisted positioning is used to cover all routes deterministically; movement,
// keyboard and touch handlers are independently exercised below. Animals are never teleported.
const travel=async p=>{
 const route=await p.evaluate(()=>{
  const g=GAME,c=g.peaceGarden,s=c.session,goal=c.goal(),path=s.nav.path(g.player.pos,goal);let steps=0,minClearance=Infinity;
  if(!path.length)throw Error('No safe player route to activity destination');
  for(;steps<4000;steps++){
   let target=path[0];if(target&&Math.hypot(target.x-g.player.pos.x,target.z-g.player.pos.z)<.12){path.shift();target=path[0];}
   if(target){const dx=target.x-g.player.pos.x,dz=target.z-g.player.pos.z,d=Math.hypot(dx,dz),step=Math.min(d,4.8/60);g.player.yaw=Math.atan2(dx,dz);g.moveTo(g.player.pos.x+dx/d*step,g.player.pos.z+dz/d*step);}
   c.tick(s,1/60);for(const o of g.colliders)minClearance=Math.min(minClearance,Math.hypot(s.activity.animal.a.pos.x-o.x,s.activity.animal.a.pos.z-o.z)-o.r);
   if(!path.length&&c.canAdvance())break;
  }
  g.syncDavid();c.resetCamera();c.interactFrame(false);return{steps,minClearance,ready:c.canAdvance()};
 });assert.ok(route.ready,JSON.stringify(route));assert.ok(route.minClearance>=.84,JSON.stringify(route));return route;
};
const advance=async p=>{await travel(p);await primary(p);};
async function observe(p){p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/api/'))network.push({url:r.url(),method:r.method()});});await p.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});}
try{
 const p=await browser.newPage({viewport:{width:1280,height:800}});await observe(p);await p.goto(base+'/?test=1');await ready(p);
 await p.evaluate(()=>localStorage.setItem('david-progress','6'));await p.click('#bExplore');
 await check('scripture and creative-activity explanation remain exact, accessible and cancellable',async()=>{
  const tok=await p.evaluate(()=>GAME.tok);await p.click('#walkGarden');
  assert.equal(await p.locator('#gardenCard blockquote').innerText(),'나의 거룩한 산 모든 곳에서 해됨도 없고 상함도 없을 것이니');assert.equal(await p.locator('.garden-cite').innerText(),'이사야 11:9 · 개역한글');
  assert.match(await p.locator('.garden-context').innerText(),/작은 만남과 놀이도/);assert.equal(await p.locator('#gardenCard a').count(),2);
  await p.keyboard.press('w');assert.equal(await p.evaluate(()=>GAME.input.keys.size),0);for(let i=0;i<8;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.getElementById('gardenCard').contains(document.activeElement)),true);}
  await capture(p,'garden-encounters-scripture');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>GAME.tok),tok);assert.equal(await p.evaluate(()=>GAME.paused),false);
 });
 await check('fresh garden has no pet picker, initial beacon, friendship or forced activity',async()=>{
  await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);
  assert.equal(await p.locator('#gardenChoice').count(),0);
  assert.deepEqual(await p.evaluate(()=>[GAME.peaceGarden.session.selected,GAME.peaceGarden.session.activity,GAME.peaceGarden.session.companion,GAME.waypoint,GAME.peaceGarden.session.animals.filter(a=>a.friend).length]),[null,null,null,null,0]);
  assert.deepEqual(await p.evaluate(()=>[GAME.exploration.active,GAME.sling,GAME.targets.length,GAME.timers.length,GAME.waiters.length,!!GAME.sheepTutorial,GAME.slingChallenge.phase,localStorage.getItem('david-progress')]),[false,false,0,0,0,false,'closed','6']);
  assert.equal(network.length,0);assert.equal(await p.locator('#gardenAction').isVisible(),false);await capture(p,'garden-encounters-exploration');
 });
 await check('desktop garden guidance stays collapsed across updates, language and keyboard toggles',()=>checkGuidancePanel(p,'garden'));
 await check('keyboard movement, run and camera remain usable during exploration',async()=>{
  const pos=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.down('w');await p.waitForFunction(pos=>Math.hypot(GAME.player.pos.x-pos[0],GAME.player.pos.z-pos[2])>1,pos,{timeout:10000});await p.keyboard.up('w');
  await p.keyboard.down('Shift');await p.keyboard.down('w');await p.waitForFunction(()=>GAME.player.speed>7,null,{timeout:10000});await p.keyboard.up('w');await p.keyboard.up('Shift');
  const yaw=await p.evaluate(()=>GAME.cam.yaw);await p.mouse.move(900,400);await p.mouse.down();await p.mouse.move(1050,400,{steps:6});await p.mouse.up();assert.notEqual(await p.evaluate(()=>GAME.cam.yaw),yaw);
 });
 await check('in-world encounter offers an optional activity; pet/follow cannot bypass earning friendship',async()=>{
  await approach(p,'lamb');assert.match(await p.locator('#gardenStart').innerText(),/양 무리/);assert.equal(await p.locator('#gardenInteractions').isVisible(),false);
  await p.evaluate(()=>{GAME.peaceGarden.act('follow');GAME.peaceGarden.act('pet');});assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals.find(a=>a.kind==='lamb').friend),false);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion),null);
  await primary(p);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity.animal.kind),'lamb');assert.equal(await p.evaluate(()=>GAME.peaceGarden.canAdvance()),false);
  await p.click('#gardenCancel');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity),null);assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('lamb').step),0);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');
 });
 await check('lamb follows safely to its visible flock and friendship is earned only at reunion',async()=>{
  await start(p,'lamb');await p.click('#gardenGuidanceToggle');await capture(p,'garden-guide-collapsed-activity');assert.equal(await p.locator('#gardenGuidanceToggle').getAttribute('aria-expanded'),'false');evidence.push({lambRoute:await travel(p)});
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),false);await primary(p);
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),true);assert.equal(await p.locator('#gardenGuidanceToggle').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#gardenAction').isVisible(),true);await p.click('#gardenGuidanceToggle');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity),null);assert.match(await p.locator('#gardenMessage').innerText(),/친구가 되었어요/);await capture(p,'garden-encounters-lamb-friend');
 });
 await check('lion checkpoint survives cancel, mid-task departure, re-entry and page reload',async()=>{
  await start(p,'lion');await advance(p);assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('lion').step),1);assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('lion').friend),false);
  await p.click('#gardenCancel');await start(p,'lion');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity.step),1);
  await p.click('#gardenVerse');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity.step),1);await p.click('#gardenClose');
  await p.evaluate(()=>{window.cancelledGarden=GAME.peaceGarden.session;});await p.click('#gardenBack');assert.equal(await p.evaluate(()=>cancelledGarden.activity),null);
  await p.reload();await ready(p);await enter(p);await approach(p,'lion');assert.equal(await p.locator('#gardenStart').innerText(),'이어서 함께하기');await primary(p);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity.step),1);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');
 });
 await check('lion second shared stop earns friendship once, without forced replay',async()=>{
  await advance(p);assert.deepEqual(await p.evaluate(()=>{const a=GAME.peaceGarden.journal.get('lion');return[a.step,a.friend];}),[2,true]);
  await capture(p,'garden-encounters-lion-friend');await primary(p);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.activity),null);assert.equal(await p.locator('#gardenStart').isVisible(),false);
 });
 await check('wolf hide-and-seek has two discoverable rounds, optional hints and no premature completion',async()=>{
  await start(p,'wolf');assert.equal(await p.evaluate(()=>GAME.waypoint),null);assert.equal(await p.evaluate(()=>GAME.peaceGarden.canAdvance()),false);
  await primary(p);assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('wolf').step),0);
  await p.click('#gardenCancel');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals.find(a=>a.kind==='wolf').state),'rest');await start(p,'wolf');
  await p.click('#gardenHint');assert.ok(await p.evaluate(()=>!!GAME.waypoint));await capture(p,'garden-encounters-wolf-hint');await advance(p);
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('wolf').step),1);assert.equal(await p.evaluate(()=>GAME.waypoint),null);await advance(p);
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.journal.get('wolf').friend),true);assert.match(await p.locator('#gardenMessage').innerText(),/친구가 되었어요/);
 });
 await check('earned friends support pet/play/follow/rest and encountering another friend does not erase friendship',async()=>{
  for(const kind of ['lamb','lion','wolf']){
   await approach(p,kind);assert.equal(await p.locator('#gardenStart').isVisible(),false);await p.click('#gardenPet');await p.click('#gardenPlay');await p.click('#gardenFollow');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion.kind),kind);
   const before=await p.evaluate(()=>GAME.peaceGarden.session.companion.a.pos.toArray());await p.keyboard.down('s');await p.waitForFunction(before=>GAME.peaceGarden.session.companion.a.pos.distanceTo(new GRAPHICS_TEST.THREE.Vector3(...before))>1,before,{timeout:10000});await p.keyboard.up('s');
   await p.click('#gardenRelease');assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.companion),null);await approach(p,kind);await p.click('#gardenRest');assert.equal(await p.evaluate(()=>GAME.player.pose),'sit');await p.keyboard.down('s');await p.waitForFunction(()=>GAME.player.pose==='auto',null,{timeout:10000});await p.keyboard.up('s');
  }
  assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals.filter(a=>a.friend).length),3);assert.equal(network.length,0);
 });
 await check('companion detours, player colliders and bounds remain enforced',async()=>{
  const route=await p.evaluate(()=>{
   const g=GAME,c=g.peaceGarden,s=c.session,a=s.animals.find(a=>a.kind==='lion');s.companion=a;a.state='follow';a.repath=0;a.a.pos.set(-12,0,-3);g.placePlayer(-2,-3,Math.PI/2);let minimum=Infinity;
   for(let i=0;i<600;i++){c.tick(s,1/60);for(const o of g.colliders)minimum=Math.min(minimum,Math.hypot(a.a.pos.x-o.x,a.a.pos.z-o.z)-o.r);}
   const distance=a.a.pos.distanceTo(g.player.pos);g.moveTo(50,0);const bound=Math.hypot(g.player.pos.x,g.player.pos.z);g.placePlayer(-10,-3,Math.PI/2);for(let i=0;i<60;i++)g.moveTo(g.player.pos.x+.1,-3);const collision=g.player.pos.x;c.home();return{minimum,distance,bound,collision};
  });assert.ok(route.minimum>=.84,JSON.stringify(route));assert.ok(route.distance<4,JSON.stringify(route));assert.ok(route.bound<=24.001);assert.ok(route.collision<-7.9,JSON.stringify(route));evidence.push({pathing:route});
 });
 await check('verse pause/focus, help, language and home preserve all earned memories',async()=>{
  for(const close of ['button','Escape']){await p.click('#gardenVerse');const position=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.press('w');assert.deepEqual(await p.evaluate(()=>GAME.player.pos.toArray()),position);if(close==='button')await p.click('#gardenClose');else await p.keyboard.press('Escape');await active(p);assert.equal(await p.evaluate(()=>document.activeElement.id),'gardenVerse');assert.equal(await p.evaluate(()=>GAME.input.keys.size),0);}
  await p.keyboard.press('Escape');await p.click('#mLang');assert.equal(await p.locator('#mRestart').innerText(),'Garden entrance');await p.click('#mHelp');await p.click('#hOk');await active(p);await p.keyboard.press('Escape');await p.click('#mLang');await p.click('#mRestart');assert.deepEqual(await p.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z]),[0,11]);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals.filter(a=>a.friend).length),3);
 });
 await check('repeated enter/exit cleans session resources and restores saved friendships and walking position',async()=>{
  const counts=[];
  for(let i=0;i<4;i++){
   await p.evaluate(()=>{window.oldGarden=GAME.peaceGarden.session;window.oldRoot=GAME.root;GAME.input.keys.add('KeyW');});await p.click('#gardenBack');await p.waitForFunction(()=>GAME.exploration.active,null,{timeout:10000});
   assert.deepEqual(await p.evaluate(()=>[oldGarden.disposed,oldGarden.owned.disposed,oldRoot.parent===null,GAME.peaceGarden.active,GAME.input.keys.size]),[true,true,true,false,0]);assert.deepEqual(await p.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z]),[6,40]);
   await p.click('#walkGarden');await p.click('#gardenEnter');await active(p);await p.waitForTimeout(120);assert.equal(await p.evaluate(()=>GAME.peaceGarden.open()),false);assert.equal(await p.evaluate(()=>GAME.peaceGarden.session.animals.filter(a=>a.friend).length),3);
   counts.push(await p.evaluate(()=>({updaters:GAME.updaters.length,disposers:GAME.chapterDisposers.length,geometries:GAME.renderer.info.memory.geometries,textures:GAME.renderer.info.memory.textures,calls:GAME.renderer.info.render.calls,triangles:GAME.renderer.info.render.triangles})));
  }
  assert.deepEqual(counts.at(-1),counts[0]);evidence.push({resourceCounts:counts});assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');assert.equal(network.length,0);
 });
 await check('direct pause-menu title exits dispose after fade and allow clean re-entry',async()=>{
  for(let i=0;i<2;i++){await p.evaluate(()=>{window.exitingGarden=GAME.peaceGarden.session;window.exitingRoot=GAME.root;});await p.keyboard.press('Escape');await p.click('#mTitleBtn');await p.waitForFunction(()=>GAME.mode==='title'&&exitingRoot.parent===null&&exitingGarden.owned.disposed,null,{timeout:10000});await ready(p);await enter(p);assert.equal(await p.locator('#gardenGuidanceToggle').getAttribute('aria-expanded'),'true');}
 });
 await check('original story, saved chapter and fixed challenge lesson remain intact',async()=>{
  await p.click('#gardenBack');await p.evaluate(()=>{GAME.helpShown=true;GAME.placePlayer(-46,-43,Math.PI);});await p.click('#walkAction');await p.waitForFunction(()=>GAME.mode==='introCard',null,{timeout:10000});await p.click('#cRow .primary');await p.waitForFunction(()=>!!GAME.dq,null,{timeout:10000});assert.equal(await p.evaluate(()=>!!GAME.sheepTutorial&&GAME.ch.s.canFollow),true);assert.equal(await p.evaluate(()=>GAME.peaceGarden.active),false);
  await p.evaluate(()=>void GAME.showTitle());await ready(p);await p.click('#bChallenge');await p.waitForFunction(()=>GAME.slingChallenge.phase==='lobby',null,{timeout:10000});await p.click('#challengeLearn');await p.waitForFunction(()=>GAME.slingChallenge.phase==='playing',null,{timeout:10000});const pos=await p.evaluate(()=>GAME.player.pos.toArray());await p.keyboard.press('w');assert.deepEqual(await p.evaluate(()=>GAME.player.pos.toArray()),pos);await p.keyboard.press('Escape');await p.click('#mTitleBtn');await ready(p);assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');assert.ok(network.every(r=>r.method==='GET'));await p.close();
 });
 const m=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await observe(m);await m.goto(base+'/?test=1');await ready(m);await enter(m);
 await check('mobile garden guidance stays compact through touch movement and rotation',()=>checkGuidancePanel(m,'garden',true));
 await check('mobile encounters, activities, earning friendship and touch follow/rest work',async()=>{
  await capture(m,'garden-encounters-mobile-explore');await approach(m,'lamb');await tapAction(m);assert.equal(await m.evaluate(()=>GAME.peaceGarden.session.activity.animal.kind),'lamb');await capture(m,'garden-encounters-mobile-task');
  await m.tap('#gardenCancel');await approach(m,'lamb');await m.tap('#gardenStart');await m.tap('#gardenVerse');await m.tap('#gardenClose');assert.equal(await m.evaluate(()=>GAME.peaceGarden.session.activity.animal.kind),'lamb');
  await m.tap('#gardenGuidanceToggle');await travel(m);assert.equal(await m.locator('#tAct').isVisible(),true);await tapAction(m);assert.equal(await m.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),true);assert.equal(await m.locator('#gardenGuidanceToggle').getAttribute('aria-expanded'),'false');await capture(m,'garden-guide-collapsed-mobile-completion');await m.tap('#gardenGuidanceToggle');await capture(m,'garden-encounters-mobile-friend');await m.locator('#gardenInteractions summary').tap();await m.tap('#gardenFollow');assert.equal(await m.evaluate(()=>GAME.peaceGarden.session.companion.kind),'lamb');await m.tap('#gardenRest');assert.equal(await m.evaluate(()=>GAME.player.pose),'sit');
 });
 await check('mobile joystick/look cancellation, landscape layout and departure mid-activity recover cleanly',async()=>{
  const before=await m.evaluate(()=>[GAME.player.pos.x,GAME.player.pos.z,GAME.cam.yaw]),box=await m.locator('#joy').boundingBox();
  await m.evaluate(box=>{const send=(el,type,id,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));send(document.getElementById('joy'),'pointerdown',41,box.x+box.width/2,box.y+box.height/2-42);send(GAME.canvas,'pointerdown',42,280,480);send(GAME.canvas,'pointermove',42,315,480);},box);
  await m.waitForFunction(([x,z])=>Math.hypot(GAME.player.pos.x-x,GAME.player.pos.z-z)>.7,before,{timeout:10000});assert.notEqual(await m.evaluate(()=>GAME.cam.yaw),before[2]);await m.evaluate(()=>{document.getElementById('joy').dispatchEvent(new PointerEvent('pointercancel',{pointerId:41,pointerType:'touch'}));window.dispatchEvent(new Event('orientationchange'));});assert.deepEqual(await m.evaluate(()=>[GAME.input.joy.x,GAME.input.joy.y,GAME.input.lookId]),[0,0,null]);
  await approach(m,'wolf');await tapAction(m);await m.setViewportSize({width:844,height:390});const panel=await m.locator('#gardenPanel').boundingBox(),joy=await m.locator('#joy').boundingBox();assert.ok(panel.y+panel.height<=joy.y,JSON.stringify({panel,joy}));await m.evaluate(()=>document.getElementById('gardenBody').scrollTop=0);await capture(m,'garden-encounters-mobile-landscape');
  await m.tap('#gardenBack');await m.tap('#walkGarden');await m.tap('#gardenEnter');await active(m);assert.equal(await m.evaluate(()=>GAME.peaceGarden.session.activity),null);assert.equal(await m.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),true);await m.tap('#gardenBack');await m.tap('#walkTitle');await ready(m);assert.equal(await m.evaluate(()=>localStorage.getItem('david-progress')),null);await m.close();
 });
 await check('legacy/reduced-motion and denied journal storage still allow the full friendship flow',async()=>{
  const l=await browser.newPage({reducedMotion:'reduce'});await observe(l);await l.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='david-peace-garden-v1')throw Error('blocked test storage');return original.call(this,k,v);};});await l.goto(base+'/?test=1&graphics=legacy');await ready(l);await enter(l);await start(l,'lamb');await advance(l);assert.equal(await l.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),true);assert.equal(await l.evaluate(()=>GAME.peaceGarden.journal.persistent),false);assert.match(await l.locator('#gardenMemory').textContent(),/페이지를 열어 둔 동안/);assert.equal(await l.evaluate(()=>GAME.peaceGarden.session.reducedMotion),true);await l.click('#gardenBack');await l.click('#walkGarden');await l.click('#gardenEnter');await active(l);assert.equal(await l.evaluate(()=>GAME.peaceGarden.journal.get('lamb').friend),true);await l.click('#gardenBack');await l.click('#walkTitle');await ready(l);await l.close();
 });
 assert.deepEqual(errors,[]);console.log('PEACE_GARDEN_RESULT '+JSON.stringify({browser:await browser.version(),checks:checks.length,passed:checks,errors,evidence,network,physicalDeviceTested:false}));
}finally{await browser.close();}
