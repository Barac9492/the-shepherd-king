import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { installSlingChallenge } from '../src/sling-challenge.js';
import { CHALLENGE_COURSE_SEED, CHALLENGE_RULES } from '../src/sling-challenge-core.js';

class Element {
  constructor(document,id=''){this.document=document;this.id=id;this.hidden=false;this.disabled=false;this.style={};this.value='';this.checked=false;this.children=[];this.handlers=new Map();this.firstChild={style:{}};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
  set innerHTML(text){for(const tag of text.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const child=this.document.getElementById(tag[1]);child.hidden=/\bhidden\b/.test(tag[0]);this.children.push(child);}}
  setAttribute(){} append(...nodes){this.children.push(...nodes);for(const node of nodes)if(node.id)this.document.register(node);} replaceChildren(...nodes){this.children=nodes;}
  addEventListener(event,fn){const handlers=this.handlers.get(event)||[];handlers.push(fn);this.handlers.set(event,handlers);}
  emit(event,detail={}){for(const fn of this.handlers.get(event)||[])fn({preventDefault(){},...detail});}
  focus(){this.document.activeElement=this;} querySelectorAll(){return this.children;} getClientRects(){return this.hidden?[]:[{}];}
}
function fixture(t,fetchImpl=async()=>({ok:false,status:404,json:async()=>({})})) {
  const saved=new Map();const global=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const elements=new Map();const document={hidden:false,activeElement:null,register:node=>elements.set(node.id,node),getElementById(id){if(!elements.has(id))elements.set(id,new Element(document,id));return elements.get(id);},createElement(){return new Element(document);},addEventListener(...args){document.events.addEventListener(...args);}};
  document.body=new Element(document);document.events=new Element(document);const window=new Element(document);let now=100000;global('document',document);global('window',window);global('fetch',fetchImpl);global('performance',{now:()=>now});const storage=new Map();global('localStorage',{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))});
  const $=id=>document.getElementById(id);const env={};
  class Game {
    constructor(){this.mode='title';this.paused=false;this.root=new THREE.Group();this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera();this.cam={yaw:0,pitch:0};this.camLook=new THREE.Vector3();this.player={speed:0,yaw:0};this.audio={init(){},setMood(){},sfx(){}};this.input={keys:new Set(),lookX:0,lookY:0,aim:false,clearHeld:()=>{this.input.aim=false;this.aiming=false;this.input.keys.clear();}};this.canvas=new Element(document);this.stonesInAir=[];this.disposers=[];this.storyStarts=[];this.saves=[];this.particles={emit(){}};this.setupUI();}
    setupUI(){$('mRestart').onclick=()=>this.startChapter(0);} applyLang(){$('mRestart').textContent='Restart this chapter';$('mTitleBtn').textContent='Title screen';} showTitle(){this.mode='title';$('title').hidden=false;this.clearChapter();}
    startChapter(i){this.storyStarts.push(i);this.mode='intro';this.clearChapter();} updateAim(dt){if(this.input.aim){this.aiming=true;this.aimCharge=(this.aimCharge||0)+dt*1.8;}else if(this.aiming){this.aiming=false;if(this.aimCharge>.3)this.throwStone();this.aimCharge=0;}}
    updatePlayer(){} updateCamera(){} throwStone(){this.stonesInAir.push({});} aimRay(){return null;}
    toggleMenu(force){if(!$('help').hidden)return;this.input.clearHeld();this.paused=force??!this.paused;$('menu').hidden=!this.paused;}
    showHelp(){} clearChapter(){for(const d of this.disposers)d();this.disposers=[];this.root=new THREE.Group();this.stonesInAir=[];}
    applyEnv(){} setDavid(){this.david={pose:'auto',update(){}};} placePlayer(){} syncDavid(){} onChapterCleanup(fn){this.disposers.push(fn);} setObjective(){} enableSling(on){this.sling=on;} setStones(n){this.stones=n;} saveProgress(n){this.saves.push(n);}
  }
  for(const id of ['help','menu','title'])$(id).hidden=id!=='title';
  installSlingChallenge({Game,THREE,CH1:{env},getLanguage:()=> 'en',isTouch:false});const g=new Game();
  t.after(()=>{g.slingChallenge.cancelRequests();for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
  return{g,c:g.slingChallenge,$,document,window,storage,advance:ms=>{now+=ms;},setFetch:fn=>{globalThis.fetch=fn;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const json=data=>({ok:true,status:200,json:async()=>({ruleVersion:CHALLENGE_RULES.version,...data})});

test('offline lobby is explicit and starting/retrying/back never changes story progress',async t=>{
  const f=fixture(t);f.c.open();await flush();assert.equal(f.c.phase,'lobby');assert.match(f.$('challengeStatus').textContent,/not connected/);assert.equal(f.$('challengeTest').hidden,true);
  await f.c.start();assert.equal(f.c.phase,'playing');assert.equal(f.c.arena,true);assert.equal(f.g.ch.id,90);assert.equal(f.g.root.children.length>20,true);assert.equal(f.c.state.onlineEligible,false);
  assert.match(f.$('challengeMode').textContent,/PRACTICE/);assert.equal(f.c.targetMesh.name,'sling-challenge-target');await f.c.start();assert.equal(f.c.state.score,0);f.c.back();assert.equal(f.g.mode,'title');assert.equal(f.c.arena,false);assert.deepEqual(f.g.saves,[]);assert.deepEqual(f.g.storyStarts,[]);
});
test('an outstanding record read cannot reopen a closed lobby',async t=>{
  let reply;const f=fixture(t,()=>new Promise(resolve=>{reply=resolve;}));f.c.open();f.c.back();reply(json({mode:'local-mock',record:{initials:'ABC',score:123}}));await flush();assert.equal(f.c.phase,'closed');assert.equal(f.$('challengeTest').hidden,true);
});
test('double start is single-flight and back invalidates a pending server attempt',async t=>{
  let reply,calls=0;const f=fixture(t,()=>{calls++;return new Promise(resolve=>{reply=resolve;});});const pending=f.c.start(true);await f.c.start(true);assert.equal(calls,1);f.c.back();reply(json({mode:'local-mock',attempt:{id:'id',seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version}}));await pending;assert.equal(f.c.phase,'closed');assert.equal(f.c.arena,false);assert.equal(f.g.mode,'title');
});
test('pause cancels held throw, freezes challenge time, and resume permits fresh throw',async t=>{
  const f=fixture(t);await f.c.start();f.g.input.aim=true;f.advance(30);f.g.updateAim(.03);f.advance(300);f.g.updateAim(.3);f.g.toggleMenu(true);const time=f.c.state.activeMs;f.advance(5000);f.g.toggleMenu(false);assert.equal(f.c.state.activeMs,time);f.g.updateAim(.016);assert.equal(f.c.shots.length,0);f.g.input.aim=true;f.advance(20);f.g.updateAim(.02);f.advance(300);f.g.updateAim(.3);f.g.input.aim=false;f.advance(20);f.g.updateAim(.02);assert.equal(f.c.shots.length,1);assert.ok(f.c.state.activeMs<1000);
});
test('blur auto-pauses and arrow aiming never moves the fixed player',async t=>{
  const f=fixture(t);await f.c.start();f.g.input.keys.add('ArrowRight');f.g.updateCamera(.1);assert.ok(f.g.cam.yaw<0);assert.deepEqual(f.g.camera.position.toArray(),[0,2.8,10]);f.g.updatePlayer(.1);assert.equal(f.g.player.speed,0);f.window.emit('blur');assert.equal(f.g.paused,true);assert.equal(f.g.input.keys.size,0);
});
test('help keeps pause state until explicit dismissal and cancels the charge',async t=>{
  const f=fixture(t);await f.c.start();f.g.input.aim=true;f.g.aiming=true;const pending=f.g.showHelp();assert.equal(f.g.paused,true);assert.equal(f.g.input.aim,false);f.g.toggleMenu();assert.equal(f.g.paused,true);f.advance(10000);f.$('hOk').onclick();await pending;f.g.updateAim(.016);assert.equal(f.g.paused,false);assert.equal(f.c.state.activeMs,0);
});
test('practice timeout ends with no initials entry and retry resets all score state',async t=>{
  const f=fixture(t);await f.c.start();f.advance(36000);f.g.updateAim(.05);assert.equal(f.c.phase,'result');assert.equal(f.c.state.status,'ended');assert.equal(f.$('challengeForm').hidden,true);assert.equal(f.c.resultPayload.endedAtMs,36000);assert.equal(f.g.paused,true);await f.c.start();assert.equal(f.c.phase,'playing');assert.equal(f.c.state.lives,3);assert.equal(f.c.state.activeMs,0);
});
test('only server-qualified result offers initials, and a concurrent winner is shown accurately',async t=>{
  let submissions=0;const f=fixture(t,async path=>json(path.endsWith('/attempts')?{mode:'local-mock',attempt:{id:'abc',seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version}}:path.endsWith('/finish')?{mode:'local-mock',qualifies:true,record:null}:{mode:'local-mock',accepted:false,record:{initials:'WIN',score:999}}));
  await f.c.start(true);f.advance(36000);f.g.updateAim(.05);await flush();assert.equal(f.$('challengeForm').hidden,false);assert.match(f.$('challengeTestNotice').textContent,/not to an online board/);
  f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.equal(f.$('challengeForm').hidden,true);assert.match(f.$('challengeStatus').textContent,/higher record/);assert.equal(f.$('challengeRecord').textContent,'WIN · 999');
});
test('nonqualifying server result never asks for initials',async t=>{
  const f=fixture(t,async path=>json(path.endsWith('/attempts')?{mode:'local-mock',attempt:{id:'abc',seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version}}:{mode:'local-mock',qualifies:false}));await f.c.start(true);f.advance(36000);f.g.updateAim(.05);await flush();assert.equal(f.$('challengeForm').hidden,true);assert.match(f.$('challengeStatus').textContent,/verified/);
});
test('initials form filters HTML and non-ASCII without rendering untrusted record markup',t=>{
  const f=fixture(t);f.$('challengeInitials').value='<b>한ab9';f.$('challengeInitials').emit('input');assert.equal(f.$('challengeInitials').value,'BAB');f.c.record={initials:'<script>',score:100};f.c.renderRecord();assert.equal(f.$('challengeRecord').textContent,'<script> · 100');
});

test('canonical charge avoids a ready/throw exception at coarse first-frame boundaries',async t=>{
  const f=fixture(t);await f.c.start();f.g.input.aim=true;
  for(let i=0;i<4;i++){f.advance(50);f.g.updateAim(.05);}
  f.g.input.aim=false;f.advance(10);assert.doesNotThrow(()=>f.g.updateAim(.01));assert.equal(f.c.shots.length,0);
  f.g.input.aim=true;f.advance(50);f.g.updateAim(.05);f.advance(200);f.g.updateAim(.2);f.g.input.aim=false;f.advance(10);f.g.updateAim(.01);assert.equal(f.c.shots.length,1);
});
test('too-short direct release never reaches verifier or fires a projectile',async t=>{
  const f=fixture(t);await f.c.start();f.c.chargeStarted=0;f.c.state.activeMs=160;assert.doesNotThrow(()=>f.c.throw());assert.equal(f.c.shots.length,0);assert.equal(f.g.stonesInAir.length,0);
});
test('hit projectiles are marked so the story cue cannot call them misses',async t=>{
  const f=fixture(t);await f.c.start();const {challengeTarget}=await import('../src/sling-challenge-core.js');f.c.state.activeMs=500;f.c.chargeStarted=0;const target=challengeTarget(f.c.state);f.g.camera.position.set(0,2.8,10);f.g.camera.lookAt(...target.position);let marked=0;f.g.gameplayCues={hit(){marked++;}};f.c.throw();assert.equal(f.c.state.hits,1);assert.equal(marked,1);
});
test('every new attempt clears initials and requires a new public consent',async t=>{
  const f=fixture(t);f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;await f.c.start();assert.equal(f.$('challengeInitials').value,'');assert.equal(f.$('challengeConsent').checked,false);
});
test('challenge entry waits for story/title navigation to settle',async t=>{
  const f=fixture(t);f.c.navigationPending=true;f.c.open();assert.equal(f.c.phase,'closed');f.c.navigationPending=false;f.c.open();await flush();assert.equal(f.c.phase,'lobby');
});

test('accepted idempotent submission refreshes the current higher record',async t=>{
  const f=fixture(t,async path=>json(path.endsWith('/record')?{mode:'local-mock',record:{initials:'BBB',score:1201}}:{}));
  f.c.phase='result';f.c.attempt={id:'a'};f.$('challengeInitials').value='AAA';f.$('challengeConsent').checked=true;
  f.setFetch(async(path,options)=>json(options.method==='POST'?{mode:'local-mock',accepted:true,record:{initials:'AAA',score:590}}:{mode:'local-mock',record:{initials:'BBB',score:1201}}));
  await f.c.submit({preventDefault(){}});assert.equal(f.$('challengeRecord').textContent,'BBB · 1,201');assert.match(f.$('challengeStatus').textContent,/were saved/);
});
test('uncertain submission retries the same initials even if text changes',async t=>{
  const bodies=[];let first=true;const f=fixture(t,async(path,options)=>{if(options.method==='POST'){bodies.push(JSON.parse(options.body));if(first){first=false;throw new Error('connection lost');}return json({mode:'local-mock',accepted:true,record:{initials:'AAA',score:590}});}return json({mode:'local-mock',record:{initials:'AAA',score:590}});});
  f.c.phase='result';f.c.attempt={id:'a'};f.$('challengeInitials').value='AAA';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.equal(f.$('challengeInitials').disabled,true);f.$('challengeInitials').value='BBB';await f.c.submit({preventDefault(){}});assert.deepEqual(bodies,[{initials:'AAA',publicConsent:true},{initials:'AAA',publicConsent:true}]);
});
test('saved record plus failed current-record fetch offers safe read-only refresh',async t=>{
  const f=fixture(t,async(path,options)=>{if(options.method==='POST')return json({mode:'local-mock',accepted:true,record:{initials:'AAA',score:590}});throw new Error('offline');});f.c.phase='result';f.c.attempt={id:'a'};f.$('challengeInitials').value='AAA';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.equal(f.$('challengeRefresh').hidden,false);assert.match(f.$('challengeStatus').textContent,/saved, but/);f.setFetch(async()=>json({mode:'local-mock',record:{initials:'BBB',score:1201}}));await f.c.refreshCurrentRecord();assert.equal(f.$('challengeRecord').textContent,'BBB · 1,201');
});

test('lost race plus failed refresh never claims that the record was saved',async t=>{
  const f=fixture(t,async(path,options)=>{if(options.method==='POST')return json({mode:'local-mock',accepted:false,record:{initials:'BBB',score:1201}});throw new Error('offline');});f.c.phase='result';f.c.attempt={id:'a'};f.$('challengeInitials').value='AAA';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.match(f.$('challengeStatus').textContent,/not recorded/);f.setFetch(async()=>json({mode:'local-mock',record:{initials:'BBB',score:1201}}));await f.c.refreshCurrentRecord();assert.match(f.$('challengeStatus').textContent,/higher record/);
});

test('rapid repeat charge explains cooldown instead of promising a ready throw',async t=>{
  const f=fixture(t);await f.c.start();f.g.aiming=true;f.c.state.lastShotAtMs=200;f.c.state.activeMs=350;f.$('cross').classList.add('sling-ready');f.c.decorateReadiness();assert.equal(f.$('cross').classes.has('sling-ready'),false);assert.match(f.$('slingCue').textContent,/preparing/);
});

test('online labels and eligibility require an explicit global service response',async t=>{
  const f=fixture(t,async path=>json(path.endsWith('/attempts')?{mode:'online',onlineEligible:true,recordScope:'global',attempt:{id:'a'.repeat(48),seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version}}:{mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'ABC',score:590}}));f.c.open();await flush();assert.equal(f.c.mode,'online');assert.equal(f.$('challengeTest').textContent,'Play online');assert.match(f.$('challengeStatus').textContent,/shared online/);await f.c.start(true);assert.equal(f.c.state.onlineEligible,true);assert.match(f.$('challengeMode').textContent,/ONLINE CHALLENGE/);
});
test('an incomplete online declaration fails closed to practice',async t=>{
  const f=fixture(t,async()=>json({mode:'online',record:null}));f.c.open();await flush();assert.equal(f.c.mode,null);assert.equal(f.$('challengeTest').hidden,true);assert.match(f.$('challengeStatus').textContent,/not connected/);
});
test('online finish and submission keep attempt capabilities out of URLs',async t=>{
  const requests=[];const f=fixture(t,async(path,options)=>{requests.push({path,body:options.body?JSON.parse(options.body):null});return json(path.endsWith('/finish')?{mode:'online',onlineEligible:true,recordScope:'global',qualifies:true}:path.endsWith('/submit')?{mode:'online',onlineEligible:true,recordScope:'global',accepted:true,record:null}:{mode:'online',onlineEligible:true,recordScope:'global',record:null});});
  f.c.phase='result';f.c.mode='online';f.c.attempt={id:'a'.repeat(48)};f.c.resultPayload={shots:[],endedAtMs:36000};await f.c.verify();f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.ok(requests.every(r=>!r.path.includes(f.c.attempt.id)));assert.deepEqual(requests[0],{path:'/api/sling-challenge/finish',body:{attemptId:f.c.attempt.id,shots:[],endedAtMs:36000}});assert.deepEqual(requests[1],{path:'/api/sling-challenge/submit',body:{attemptId:f.c.attempt.id,initials:'ABC',publicConsent:true}});
});

test('an online result refuses a local-mock verification or submission downgrade',async t=>{
  const f=fixture(t,async()=>json({mode:'local-mock',qualifies:true,accepted:true,record:{initials:'BAD',score:123}}));f.c.mode='online';f.c.phase='result';f.c.attempt={id:'a'.repeat(48)};f.c.resultPayload={shots:[],endedAtMs:36000};f.$('challengeForm').hidden=true;await f.c.verify();assert.equal(f.$('challengeForm').hidden,true);assert.match(f.$('challengeStatus').textContent,/interrupted/);f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.notEqual(f.c.submitted,true);assert.match(f.$('challengeStatus').textContent,/interrupted/);
});
test('an online record refresh refuses mock/global scope changes',async t=>{
  const f=fixture(t,async()=>json({mode:'local-mock',record:{initials:'BAD',score:123}}));f.c.mode='online';f.c.phase='result';f.c.submitted=true;f.c.submissionStatusKey='saved';f.c.record={initials:'ABC',score:590};await f.c.refreshCurrentRecord();assert.equal(f.c.record.initials,'ABC');assert.match(f.$('challengeStatus').textContent,/could not be loaded/);
});

test('chapter-one completion detour returns to chapter two without writing story save',async t=>{
  const f=fixture(t);f.g.mode='endCard';f.g.chIdx=0;f.c.navigationPending=true;f.storage.set('david-progress','6');f.c.openFromStory(1);await flush();assert.equal(f.c.phase,'lobby');assert.equal(f.c.returnChapter,1);assert.equal(f.$('challengeBack').textContent,'Continue to Chapter 2');await f.c.start();await f.c.start();f.c.back();assert.deepEqual(f.g.storyStarts,[1]);assert.deepEqual(f.g.saves,[]);assert.equal(f.storage.get('david-progress'),'6');assert.equal(f.c.returnChapter,null);
});
test('story detour rejects an in-progress chapter or another chapter',t=>{
  const f=fixture(t);f.g.mode='play';f.g.chIdx=0;f.c.openFromStory(1);assert.equal(f.c.phase,'closed');f.g.mode='endCard';f.g.chIdx=1;f.c.openFromStory(1);assert.equal(f.c.phase,'closed');f.g.chIdx=0;f.c.openFromStory(2);assert.equal(f.c.phase,'closed');
});
test('first UI start teaches three untimed targets without score, life loss or network',async t=>{
  let calls=0;const f=fixture(t,async()=>{calls++;return json({});});f.storage.set('david-progress','4');await f.c.chooseStart();assert.equal(f.c.tutorial,true);f.advance(900000);f.g.updateAim(.05);assert.equal(f.c.phase,'playing');assert.equal(f.c.state.score,0);assert.equal(f.c.state.lives,3);assert.equal(f.$('challengeTimer').hidden,true);
  f.c.chargeStarted=f.c.state.activeMs-500;f.g.camera.lookAt(100,50,10);f.c.throw();assert.equal(f.c.tutorialHits,0);assert.equal(f.c.state.lives,3);
  for(let i=0;i<3;i++){f.advance(500);f.g.updateAim(.05);f.c.chargeStarted=f.c.state.activeMs-500;f.g.camera.lookAt(...f.c.target().position);f.c.throw();}
  await flush();assert.equal(f.c.tutorial,false);assert.equal(f.c.phase,'playing');assert.equal(f.c.state.score,0);assert.equal(f.c.shots.length,0);assert.equal(calls,0);assert.equal(f.storage.get('sling-challenge-tutorial-v2'),'1');assert.equal(f.storage.get('david-progress'),'4');assert.deepEqual(f.g.saves,[]);
});
test('tutorial skip issues the selected online attempt once, and back cancels its stale reply',async t=>{
  let calls=0,reply;const f=fixture(t,()=>{calls++;return new Promise(resolve=>{reply=resolve;});});await f.c.chooseStart(true);assert.equal(calls,0);const pending=f.c.completeTutorial();await f.c.completeTutorial();assert.equal(calls,1);f.c.back();reply(json({mode:'online',onlineEligible:true,recordScope:'global',attempt:{id:'a'.repeat(48),seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version}}));await pending;assert.equal(f.c.phase,'closed');assert.equal(f.g.mode,'title');assert.equal(f.c.arena,false);
});
test('completed tutorial is skipped next time and optional relearn returns to lobby',async t=>{
  const f=fixture(t);f.storage.set('sling-challenge-tutorial-v2','1');await f.c.chooseStart();assert.equal(f.c.tutorial,false);await f.c.startTutorial();assert.equal(f.c.tutorial,true);await f.c.completeTutorial();assert.equal(f.c.phase,'lobby');assert.equal(f.c.tutorial,false);assert.equal(f.c.attempt,null);assert.match(f.$('challengeStatus').textContent,/Ready/);
});
test('story detour restores normal pause menu labels before Chapter 2',async t=>{
  const f=fixture(t);f.g.mode='endCard';f.g.chIdx=0;f.c.openFromStory(1);await flush();await f.c.startTutorial();assert.match(f.$('mRestart').textContent,/Learn the controls/);await f.c.completeTutorial();assert.match(f.$('mTitleBtn').textContent,/Continue to Chapter 2/);f.c.back();assert.deepEqual(f.g.storyStarts,[1]);assert.equal(f.$('mRestart').textContent,'Restart this chapter');assert.equal(f.$('mTitleBtn').textContent,'Title screen');assert.equal(f.c.arena,false);
});
test('tutorial pause cancels charge and back preserves its unfinished first-time status',async t=>{
  const f=fixture(t);await f.c.startTutorial();f.g.input.aim=true;f.advance(500);f.g.updateAim(.05);f.g.toggleMenu(true);const at=f.c.state.activeMs;f.advance(10000);f.g.toggleMenu(false);f.g.updateAim(.016);assert.equal(f.c.state.activeMs,at);assert.equal(f.c.tutorialHits,0);assert.equal(f.c.shots.length,0);f.c.back();assert.equal(f.storage.has('sling-challenge-tutorial-v2'),false);
});
test('Escape cancels a lobby record fetch without resuming or saving a challenge',async t=>{
  let reply;const f=fixture(t,()=>new Promise(resolve=>{reply=resolve;}));f.c.open();f.document.body.children.find(el=>el.id==='challengePanel').emit('keydown',{key:'Escape'});reply(json({mode:'local-mock',record:null}));await flush();assert.equal(f.c.phase,'closed');assert.equal(f.g.mode,'title');assert.deepEqual(f.g.saves,[]);
});
test('offline record is unavailable rather than an invented empty global record',async t=>{
  const f=fixture(t);f.c.open();assert.equal(f.$('challengeRecord').textContent,'Loading record…');await flush();assert.equal(f.$('challengeRecord').textContent,'Online record unavailable');
});
test('server attempt with wrong course or version cannot start',async t=>{
  const f=fixture(t,async()=>json({mode:'online',onlineEligible:true,recordScope:'global',attempt:{id:'a'.repeat(48),seed:CHALLENGE_COURSE_SEED,version:'sling-challenge-v1'}}));await f.c.start(true);assert.equal(f.c.phase,'lobby');assert.equal(f.c.arena,false);assert.equal(f.c.state,null);
});
test('v1 online record cannot appear in the v2 lobby',async t=>{
  const f=fixture(t,async()=>json({mode:'online',ruleVersion:'sling-challenge-v1',onlineEligible:true,recordScope:'global',record:{initials:'OLD',score:80000}}));f.c.open();await flush();assert.equal(f.c.mode,null);assert.equal(f.c.record,null);assert.equal(f.$('challengeTest').hidden,true);assert.equal(f.$('challengeRecord').textContent,'Online record unavailable');
});
test('online issuance failure after tutorial restores explicit practice and online choices',async t=>{
  let calls=0;const f=fixture(t,async()=>{calls++;return {ok:false,status:503,json:async()=>({error:{code:'unavailable'}})};});f.c.mode='online';f.c.returnChapter=1;await f.c.chooseStart(true);await f.c.completeTutorial();assert.equal(calls,1);assert.equal(f.c.phase,'lobby');assert.equal(f.c.tutorial,false);assert.equal(f.c.attempt,null);assert.equal(f.$('challengeHud').hidden,true);assert.equal(f.$('challengeStart').textContent,'Start practice');assert.equal(f.$('challengeTest').hidden,false);assert.equal(f.$('challengeTest').textContent,'Play online');assert.equal(f.$('challengeBack').textContent,'Continue to Chapter 2');await f.$('challengeStart').onclick();assert.equal(calls,1);assert.equal(f.c.serverAttempt,false);assert.equal(f.c.phase,'playing');
});
test('optional tutorial restarts a cancelled record load instead of leaving a loading board',async t=>{
  let calls=0,oldReply;const f=fixture(t,()=>{calls++;return calls===1?new Promise(resolve=>{oldReply=resolve;}):Promise.resolve(json({mode:'online',onlineEligible:true,recordScope:'global',record:null}));});f.c.open();await f.c.startTutorial();await f.c.completeTutorial();await flush();assert.equal(calls,2);assert.equal(f.c.recordState,'loaded');assert.equal(f.$('challengeTest').hidden,false);assert.equal(f.$('challengeRecord').textContent,'No record yet');oldReply(json({mode:'local-mock',record:{initials:'OLD',score:500}}));await flush();assert.equal(f.c.mode,'online');assert.equal(f.c.record,null);
});

test('ranking entry reads the global best without an attempt, tutorial, or consent',async t=>{
  const requests=[];let reply;const f=fixture(t,(path,options)=>{requests.push({path,method:options.method});return new Promise(resolve=>{reply=resolve;});});
  f.$('bChallengeRanking').onclick();
  assert.equal(f.c.phase,'ranking');assert.equal(f.$('challengeRecord').textContent,'Loading record…');assert.equal(f.$('challengeRefresh').disabled,true);
  for(const id of ['challengeIntro','challengeStart','challengeTest','challengeForm'])assert.equal(f.$(id).hidden,true);
  reply(json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'ABC',score:1234}}));await flush();
  assert.equal(f.$('challengeRecord').textContent,'ABC · 1,234');assert.equal(f.$('challengeRecordLabel').textContent,'Global best record');assert.match(f.$('challengeStatus').textContent,/single global best/);assert.equal(f.$('challengeTest').hidden,true);
  assert.deepEqual(requests,[{path:'/api/sling-challenge/record',method:'GET'}]);assert.equal(f.c.attempt,null);assert.equal(f.storage.size,0);
  await f.c.back();assert.equal(f.document.activeElement,f.$('bChallengeRanking'));assert.deepEqual(f.g.saves,[]);
  f.setFetch(async()=>json({mode:'local-mock',record:null}));f.c.open();await flush();assert.equal(f.$('challengeIntro').hidden,false);assert.equal(f.$('challengeStart').hidden,false);
});
test('ranking distinguishes empty, failure, retry and stale record responses',async t=>{
  const f=fixture(t,async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:null}));f.c.openRanking();await flush();assert.equal(f.$('challengeRecord').textContent,'No record yet');
  f.setFetch(async()=>{throw new Error('offline');});await f.c.loadRecord();assert.equal(f.$('challengeRecord').textContent,'Online record unavailable');assert.match(f.$('challengeStatus').textContent,/Could not load the ranking/);assert.equal(f.$('challengeRefresh').disabled,false);
  f.setFetch(async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'NEW',score:55}}));await f.$('challengeRefresh').onclick();assert.equal(f.$('challengeRecord').textContent,'NEW · 55');
  let reply;f.setFetch(()=>new Promise(resolve=>{reply=resolve;}));const pending=f.c.loadRecord();f.document.body.children.find(el=>el.id==='challengePanel').emit('keydown',{key:'Escape'});reply(json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'OLD',score:10}}));await pending;await flush();assert.equal(f.c.phase,'closed');assert.equal(f.$('challengeRecord').textContent,'NEW · 55');assert.equal(f.document.activeElement,f.$('bChallengeRanking'));
});
test('ranking refuses an incompatible ruleset and clears an outdated record on failure',async t=>{
  const f=fixture(t,async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'ABC',score:123}}));f.c.openRanking();await flush();f.setFetch(async()=>json({mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:'old',record:{initials:'OLD',score:999}}));await f.c.loadRecord();assert.equal(f.c.record,null);assert.equal(f.$('challengeRecord').textContent,'Online record unavailable');assert.equal(f.$('challengeTest').hidden,true);
});

test('top 10 renders separate equal initials safely and keeps legacy best separate',async t=>{
  const f=fixture(t,async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'OLD',score:5000},rankingVersion:'top10-v1',entries:[{initials:'ABC',score:1000},{initials:'ABC',score:999}]}));
  f.c.openRanking();await flush();assert.equal(f.$('challengeRanking').hidden,false);assert.equal(f.$('challengeRankingRows').children.length,2);assert.equal(f.$('challengeRecord').textContent,'OLD · 5,000');assert.match(f.$('challengeRankingScope').textContent,/Earlier submissions win ties/);
  f.setFetch(async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:{initials:'OLD',score:5000},rankingVersion:'top10-v1',entries:[]}));await f.c.loadRecord();assert.equal(f.$('challengeRankingTable').hidden,true);assert.match(f.$('challengeRankingEmpty').textContent,/No records have been submitted/);assert.equal(f.$('challengeRecord').textContent,'OLD · 5,000');
  f.setFetch(async()=>json({mode:'online',onlineEligible:true,recordScope:'global',record:null,rankingVersion:'top10-v1',entries:[{initials:'<b>',score:1000}]}));await f.c.loadRecord();assert.equal(f.c.recordState,'unavailable');assert.equal(f.$('challengeRankingRows').children.length,0);
});
test('non-highest ranked result requires explicit new consent and double clicks submit once',async t=>{
  const requests=[];let submitReply;
  const f=fixture(t,async(path,options)=>{requests.push({path,method:options.method,body:options.body?JSON.parse(options.body):null});if(path.endsWith('/submit'))return new Promise(resolve=>{submitReply=resolve;});return json({mode:'online',onlineEligible:true,recordScope:'global',qualifies:false,rankingEligible:true,rankingVersion:'top10-v1',entries:[],record:null});});
  f.c.phase='result';f.c.mode='online';f.c.attempt={id:'b'.repeat(48)};f.c.resultPayload={shots:[],endedAtMs:36000};await f.c.verify();assert.equal(f.$('challengeForm').hidden,false);assert.match(f.$('challengeConsentText').textContent,/public top 10/);assert.equal(f.$('challengeConsent').checked,false);
  f.$('challengeInitials').value='ABC';await f.c.submit({preventDefault(){}});assert.equal(requests.length,1);
  f.$('challengeConsent').checked=true;const pending=f.c.submit({preventDefault(){}});await f.c.submit({preventDefault(){}});assert.equal(requests.filter(r=>r.path.endsWith('/submit')).length,1);assert.equal(requests[1].body.rankingConsent,'top10-v1');
  submitReply(json({mode:'online',onlineEligible:true,recordScope:'global',rankingVersion:'top10-v1',accepted:true,record:null}));await pending;assert.match(f.$('challengeStatus').textContent,/Ranking submission confirmed/);assert.equal(f.$('challengeForm').hidden,true);
});
test('ranked network retry preserves consent payload and cancellation ignores a late reply',async t=>{
  let first=true,reply;const bodies=[];const f=fixture(t,async(path,options)=>{if(path.endsWith('/submit')){bodies.push(JSON.parse(options.body));if(first){first=false;throw new Error('offline');}return new Promise(resolve=>{reply=resolve;});}return json({mode:'online',onlineEligible:true,recordScope:'global',rankingVersion:'top10-v1',entries:[],record:null});});
  f.c.phase='result';f.c.mode='online';f.c.rankedResult=true;f.c.attempt={id:'c'.repeat(48)};f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;
  await f.c.submit({preventDefault(){}});assert.match(f.$('challengeStatus').textContent,/Connection interrupted/);f.$('challengeInitials').value='XYZ';const pending=f.c.submit({preventDefault(){}});await f.c.back();reply(json({mode:'online',onlineEligible:true,recordScope:'global',rankingVersion:'top10-v1',accepted:true,record:null}));await pending;assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[1].initials,'ABC');assert.equal(f.c.phase,'closed');assert.notEqual(f.c.submitted,true);
});
test('ranked outside-top-ten and failed refresh never claim a saved highest record',async t=>{
  const f=fixture(t,async(path,options)=>{if(options.method==='POST')return json({mode:'online',onlineEligible:true,recordScope:'global',rankingVersion:'top10-v1',accepted:false,record:null});throw new Error('offline');});
  f.c.phase='result';f.c.mode='online';f.c.rankedResult=true;f.c.attempt={id:'d'.repeat(48)};f.$('challengeInitials').value='ABC';f.$('challengeConsent').checked=true;await f.c.submit({preventDefault(){}});assert.match(f.$('challengeStatus').textContent,/Submission result confirmed, but/);assert.equal(f.$('challengeRefresh').hidden,false);
  f.setFetch(async()=>json({mode:'online',onlineEligible:true,recordScope:'global',rankingVersion:'top10-v1',entries:[],record:null}));await f.c.refreshCurrentRecord();assert.match(f.$('challengeStatus').textContent,/outside the top 10/);
});
