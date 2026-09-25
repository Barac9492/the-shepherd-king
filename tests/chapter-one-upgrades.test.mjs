import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createChapterOneSheepSteering} from '../src/sheep-steering.js';
import {installChapterOneUpgrades} from '../src/chapter-one-upgrades.js';
globalThis.DOMRect ??= class {constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});}};
function fixture(){
 const game={groundAt:()=>0};
 const make=(extra={})=>{const a={pos:new THREE.Vector3(),yaw:0,speed:0,dest:new THREE.Vector3(0,0,20),walkSpeed:4,ground:true,animScale:1,onArrive:null,nativeCalls:0,sync(){},m:{update(){}},update(dt){this.nativeCalls++;this.lastNativeDt=dt;}};return {a,st:'follow',...extra};};
 const sheep=[make(),make({lamb:true}),make({noFollow:true})];game.ch={s:{sheep}};return{game,sheep};
}
test('Yuka integrates full normal simulation elapsed time and caps speed',()=>{
 const {game,sheep}=fixture(),adapter=createChapterOneSheepSteering(game);assert.equal(adapter.records.length,1);
 sheep[0].a.update(.2);assert.ok(sheep[0].a.pos.z>0);assert.ok(sheep[0].a.pos.length()<=.8+1e-8);
 const p=sheep[0].a.pos.clone();sheep[0].a.update(1e20);assert.ok(sheep[0].a.pos.distanceTo(p)<=4+1e-8);assert.ok(adapter.finite());adapter.dispose();
});
test('Scripted, carried and stopped sheep keep native ownership and clear Yuka momentum',()=>{
 const {game,sheep}=fixture(),a=sheep[0].a,adapter=createChapterOneSheepSteering(game);const v=adapter.vehicles[0];
 for(const state of ['stopped','scripted','carried','airborne']){
  sheep[0].st='follow';a.dest=new THREE.Vector3(0,0,20);a.ground=true;a.onArrive=null;
  if(state==='stopped')a.dest=null;if(state==='scripted')a.onArrive=()=>{};if(state==='carried')sheep[0].st='carried';if(state==='airborne')a.ground=false;
  const n=a.nativeCalls;v.velocity.set(5,0,2);a.update(.2);assert.equal(a.nativeCalls,n+1);assert.equal(v.velocity.squaredLength(),0);assert.equal(a.lastNativeDt,.2);
 }
 adapter.dispose();
});
test('Zero invalid and suspended deltas remain finite; disposal restores actor methods exactly',()=>{
 const {game,sheep}=fixture(),a=sheep[0].a,original=a.update,adapter=createChapterOneSheepSteering(game);for(const dt of [0,-1,NaN,Infinity])a.update(dt);
 assert.equal(a.pos.length(),0);assert.ok(adapter.finite());adapter.dispose();adapter.dispose();assert.equal(a.update,original);
});
function cameraFixture(){
 const CH1={id:1,s:{sheep:[]}},other={id:2,s:{sheep:[]}};
 class Game{
  constructor(){this.camera=new THREE.PerspectiveCamera();this.camera.position.set(0,2,8);this.camLook=new THREE.Vector3(0,1,0);this.cinePos=this.camera.position.clone();this.cineLook=this.camLook.clone();this.cine=null;this.cineW=0;this.aiming=false;this.cleanups=[];this.groundAt=()=>0;this.nativeDavid={approved:'A'};this.david=this.nativeDavid;}
  onChapterCleanup(fn){this.cleanups.push(fn);}
  loadWorld(i){for(const f of this.cleanups)f();this.cleanups=[];this.ch=i===0?CH1:other;this.cine=null;this.cineW=0;}
  updateCamera(dt){const k=1-Math.exp(-2.5*dt);if(this.cine){this.cinePos.lerp(this.cine.pos,k);this.cineLook.lerp(this.cine.look,k);}const t=this.cineW,w=t*t*(3-2*t);this.camera.position.set(0,2,8).lerp(this.cinePos,w);this.camLook.set(0,1,0).lerp(this.cineLook,w);this.camera.lookAt(this.camLook);}
 }
 return {CH1,Game,other};
}
test('Installer is idempotent, Chapter1-only, restores camera and never replaces David',()=>{
 const {CH1,Game}=cameraFixture(),installed=installChapterOneUpgrades({THREE,Game,CH1});assert.equal(installChapterOneUpgrades({THREE,Game,CH1}),installed);
 const g=new Game(),native=Game.prototype.updateCamera;g.loadWorld(0);assert.ok(g.chapterOneUpgrades);assert.notEqual(g.updateCamera,native);assert.equal(g.david,g.nativeDavid);
 g.loadWorld(1);assert.equal(g.chapterOneUpgrades,null);assert.equal(g.updateCamera,native);assert.equal(Object.hasOwn(g,'updateCamera'),false);
 for(let i=0;i<5;i++){g.loadWorld(0);assert.equal(g.cleanups.length,1);g.loadWorld(1);}assert.equal(g.david,g.nativeDavid);
});
test('Camera changes only cinematic contribution, preserves targets, aiming and fade-out',()=>{
 const {CH1,Game}=cameraFixture();installChapterOneUpgrades({THREE,Game,CH1});const g=new Game();g.loadWorld(0);
 g.updateCamera(.016);assert.deepEqual(g.camera.position.toArray(),[0,2,8]);
 const cine=g.cine={pos:new THREE.Vector3(6,3,5),look:new THREE.Vector3(1,1,0),k:2.5},before=JSON.stringify([cine.pos.toArray(),cine.look.toArray()]);g.cineW=.7;
 for(let i=0;i<90;i++)g.updateCamera(1/60);assert.equal(JSON.stringify([cine.pos.toArray(),cine.look.toArray()]),before);assert.ok(g.chapterOneUpgrades.camera.active);assert.ok(g.chapterOneUpgrades.camera.finite());
 g.aiming=true;g.updateCamera(.016);assert.equal(g.chapterOneUpgrades.camera.active,false);
 g.aiming=false;g.cine=null;g.cineW=0;g.updateCamera(.016);assert.deepEqual(g.camera.position.toArray(),[0,2,8]);
});
test('Cinematic explicit rebases and pathological dt stay finite',()=>{
 const {CH1,Game}=cameraFixture();installChapterOneUpgrades({THREE,Game,CH1});const g=new Game();g.loadWorld(0);g.cine={pos:new THREE.Vector3(6,3,5),look:new THREE.Vector3(1,1,0),k:2.5};g.cineW=1;g.updateCamera(.016);
 g.cinePos.set(1,3,9);g.cineLook.set(0,2,0);g.updateCamera(.016);assert.ok(g.chapterOneUpgrades.camera.diagnostics.rebases>=2);
 for(const dt of [NaN,Infinity,-1,0,1e20])g.updateCamera(dt);assert.ok(g.camera.position.toArray().every(Number.isFinite));assert.ok(g.chapterOneUpgrades.camera.finite());
});
test('Production bootstrap offers rollback and avoids review/sandbox/character replacement',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/!params.has\('review'\) && params.get\('upgrades'\) !== 'off'/);assert.match(html,/installChapterOneUpgrades\(\{ THREE, Game, CH1 \}\)/);assert.doesNotMatch(html,/startChapterComparison|Rogue\.glb|comparison-player-rig/);
 const module=fs.readFileSync(new URL('../src/chapter-one-upgrades.js',import.meta.url),'utf8');assert.doesNotMatch(module,/setDavid|saveProgress|startChapter|makeHuman|GLTFLoader/);
});

test('Cinematic rebase and aiming resume produce the same first step as a fresh controller (no stale momentum)',()=>{
 for(const scenario of ['new-target','explicit-rebase','aim-resume']){
  const {CH1,Game}=cameraFixture();installChapterOneUpgrades({THREE,Game,CH1});const a=new Game(),b=new Game();a.loadWorld(0);b.loadWorld(0);
  a.cine={pos:new THREE.Vector3(20,8,-10),look:new THREE.Vector3(5,2,0),k:2.5};a.cineW=1;
  for(let i=0;i<12;i++)a.updateCamera(1/60);
  if(scenario==='aim-resume'){a.aiming=true;a.updateCamera(1/60);a.aiming=false;}
  const next={pos:new THREE.Vector3(-8,4,9),look:new THREE.Vector3(-1,2,0),k:2.5};
  if(scenario==='explicit-rebase'){a.cine.pos.copy(next.pos);a.cine.look.copy(next.look);}else a.cine=next;
  b.cine={pos:next.pos.clone(),look:next.look.clone(),k:next.k};
  for(const g of [a,b]){g.cinePos.set(1,3,8);g.cineLook.set(0,1,0);g.cineW=1;g.updateCamera(1/60);}
  assert.ok(a.camera.position.distanceTo(b.camera.position)<1e-8,scenario+' retains previous damping velocity');
  assert.ok(a.camLook.distanceTo(b.camLook)<1e-8,scenario+' target retains previous damping velocity');
 }
});
test('cineOff retains last smoothed frame and continuously returns by native blend weight',()=>{
 const {CH1,Game}=cameraFixture();installChapterOneUpgrades({THREE,Game,CH1});const g=new Game();g.loadWorld(0);g.cine={pos:new THREE.Vector3(7,5,-3),look:new THREE.Vector3(1,1,0),k:2.5};g.cineW=1;
 for(let i=0;i<60;i++)g.updateCamera(1/60);const last=g.camera.position.clone(),lastLook=g.camLook.clone();g.cine=null;g.updateCamera(0);
 assert.ok(g.camera.position.distanceTo(last)<1e-9);assert.ok(g.camLook.distanceTo(lastLook)<1e-9);
 for(const w of [.9,.5,.1,0]){g.cineW=w;g.updateCamera(1/60);const smooth=w*w*(3-2*w);const expected=new THREE.Vector3(0,2,8).lerp(last,smooth);assert.ok(g.camera.position.distanceTo(expected)<1e-9);}
});
