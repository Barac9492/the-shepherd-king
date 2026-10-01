import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createMyShepherdChapter,installMyShepherdCamera} from '../src/my-shepherd.js';

class FakeActor{
  constructor(g,m,x,z,yaw=0){this.g=g;this.m=m;this.pos=new THREE.Vector3(x,g.groundAt(x,z),z);this.yaw=yaw;this.speed=0;this.dest=null;this.walkSpeed=0;this.m.root.position.copy(this.pos);this.m.root.rotation.y=yaw;g.root.add(this.m.root);g.actors.push(this);}
  stop(){this.dest=null;this.speed=0;}
  sync(){this.m.root.position.copy(this.pos);this.m.root.rotation.y=this.yaw;}
  update(dt){
    if(this.dest){const dx=this.dest.x-this.pos.x,dz=this.dest.z-this.pos.z,d=Math.hypot(dx,dz);if(d<.12){this.dest=null;this.speed=0;}else{const speed=Math.min(this.walkSpeed,d/Math.max(dt,1e-4));this.pos.x+=dx/d*speed*dt;this.pos.z+=dz/d*speed*dt;this.pos.y=this.g.groundAt(this.pos.x,this.pos.z);this.yaw=Math.atan2(dx,dz);this.speed=speed;}}
    this.sync();this.m.update(dt,this.speed);
  }
}
function fakeQuadruped(kind,o={}){const root=new THREE.Group();root.name=kind;root.scale.setScalar(o.scale??1);const body=new THREE.Mesh(new THREE.BoxGeometry(.7,.55,1),new THREE.MeshBasicMaterial());body.position.y=.55;root.add(body);return{root,body,legs:[],graze:0,update(){}};}
function fakeHuman(){const root=new THREE.Group(),body=new THREE.Group();root.add(body);const h={root,body,pose:'auto',update(){}};for(const name of ['legL','legR','armL','armR','head','handL','handR']){h[name]=new THREE.Group();body.add(h[name]);}h.head.add(new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial()));h.staff=new THREE.Group();h.handL.add(h.staff);return h;}
class FakeGame{
  constructor(chapter){
    this.chapter=chapter;this.ch=chapter;this.chIdx=10;this.tok=1;this.mode='play';this.paused=false;this.lock=false;this.dq=null;this.time=0;
    this.root=new THREE.Group();this.scene=new THREE.Scene();this.scene.add(this.root);this.actors=[];this.updaters=[];this.cleanups=[];
    this.player={pos:new THREE.Vector3(chapter.start[0],0,chapter.start[1]),yaw:chapter.start[2],speed:0};
    this.input={act:false,lookX:4,lookY:-2,zoom:3};this.david={root:new THREE.Group()};this.david.root.visible=true;this.scene.add(this.david.root);
    this.camera=new THREE.PerspectiveCamera(55,16/9,.1,1000);this.camera.position.set(8,5,8);this.cam={yaw:.7,pitch:.4,dist:11,tgt:new THREE.Vector3()};this.camLook=new THREE.Vector3();this.sky={mesh:new THREE.Group()};
    this.objectives=[];this.toasts=[];this.sfx=[];this.audio={sfx:name=>this.sfx.push(name)};this.rendered=[];this.renderer={render:(scene,camera)=>{this.rendered.push({scene,camera,position:camera.position.clone()});}};
  }
  groundAt(x,z){return this.chapter.height(x,z);}
  add(o){this.root.add(o);return o;}
  every(fn){this.updaters.push(fn);}
  onChapterCleanup(fn){this.cleanups.push(fn);}
  setWaypoint(p){this.waypoint=p;}
  setObjective(text,count){this.objective={text,count};this.objectives.push(this.objective);}
  toast(...args){this.toasts.push(args);}
  syncDavid(){this.david.root.position.copy(this.player.pos);this.david.root.rotation.y=this.player.yaw;}
  updateCamera(){this.nativeCameraCalls=(this.nativeCameraCalls||0)+1;}
  loadWorld(){this.ch=this.chapter;this.chapter.build(this);}
  step(dt=.05){this.time+=dt;for(const a of [...this.actors])a.update(dt);this.updaters=this.updaters.filter(fn=>fn(dt)!==false);}
  clearChapter(){for(const fn of this.cleanups.splice(0))fn();this.tok++;this.updaters=[];this.actors=[];this.scene.remove(this.root);this.root=new THREE.Group();this.scene.add(this.root);}
}
function makeChapter(){return createMyShepherdChapter({THREE,Actor:FakeActor,makeQuadruped:fakeQuadruped,makeHuman:fakeHuman,getLanguage:()=> 'ko',translate:value=>value.ko});}
function fixture(){const chapter=makeChapter(),g=new FakeGame(chapter);chapter.build(g);g.player.pos.set(chapter.start[0],g.groundAt(chapter.start[0],chapter.start[1]),chapter.start[1]);return{chapter,g,S:chapter.s};}
function phaseIndex(history,name){const i=history.indexOf(name);assert.notEqual(i,-1,`missing phase ${name}`);return i;}
function createDomStub(){
  class Element{
    constructor(tag,id=''){this.tagName=tag.toUpperCase();this.id=id;this.hidden=true;this.textContent='';this.type='';this.style={};this.children=[];this.parentNode=null;this.attributes={};this.listeners=new Map();}
    setAttribute(name,value){this.attributes[name]=String(value);}
    appendChild(child){child.parentNode=this;this.children.push(child);return child;}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    removeEventListener(type,fn){const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(x=>x!==fn));}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
    click(){for(const fn of [...(this.listeners.get('click')||[])])fn({preventDefault(){},stopPropagation(){}});}
  }
  const body=new Element('body','body'),label=new Element('span','tActL'),menu=new Element('div','menu'),touch=new Element('div','touch');label.textContent='행동';menu.hidden=true;touch.hidden=false;const byId=new Map([[label.id,label],[menu.id,menu],[touch.id,touch]]);
  const document={body,createElement:tag=>new Element(tag),getElementById:id=>byId.get(id)||body.children.find(x=>x.id===id)||null};return{document,body,label,menu,touch};
}

test('factory exposes chapter eleven metadata and explicitly labels the ten-sheep adaptation',()=>{
  const ch=makeChapter();assert.equal(ch.id,11);assert.equal(ch.hebrew,'יא');assert.equal(ch.mood,'pasture');assert.equal(ch.title.ko,'나의 목자');assert.match(ch.ref.ko,/누가복음 15:3–7/);assert.match(ch.ref.ko,/요한복음 10:11/);assert.match(ch.note.ko,/잃은 양 비유.*열 마리/);assert.match(ch.endNote.ko,/그 양은 나였습니다/);assert.equal(typeof ch.height,'function');assert.equal(typeof ch.groundColor,'function');assert.equal(typeof ch.build,'function');assert.equal(typeof ch.run,'function');
});

test('build creates a bespoke faceless rear-only shepherd and exactly ten identifiable sheep',()=>{
  const {g,S}=fixture();assert.equal(S.sheep.length,9);assert.ok(S.lastActor);assert.equal(S.lastActor.m.root.visible,false);assert.equal(S.total,10);assert.equal(g.actors.length,11);assert.equal(g.david.root.visible,false);assert.equal(S.shepherd.m.root.userData.faceless,true);assert.equal(S.shepherd.m.root.userData.rearOnly,true);
  const names=[];S.shepherd.m.root.traverse(o=>{if(o.isMesh)names.push(o.name.toLowerCase());});assert.equal(S.shepherd.m.root.userData.articulated,true);assert.ok(S.shepherd.m.legL&&S.shepherd.m.legR);assert.ok(S.shepherd.m.carryAnchor);assert.ok(names.includes('rear-shoulder-hair-shell'));assert.ok(names.includes('rear-back-neck-shell'));assert.equal(names.some(n=>/^(face|eye|eyes|nose|mouth|skin|head)$/.test(n)),false);assert.equal(S.shepherd.m.root.children.some(o=>o.geometry?.type==='SphereGeometry'),false);
  const trail=g.root.getObjectByName('readable-forgiving-trail'),lastMarker=trail.children[trail.children.length-1];assert.ok(lastMarker.position.distanceTo(S.fold)<.05);assert.ok(trail.children.every(mark=>mark.position.distanceTo(S.last)>15));assert.deepEqual(S.trailPoints[S.trailPoints.length-1],{x:S.fold.x,z:S.fold.z});
});

test('real proximity/action gathers nine in order, parks them visibly, then completes the finite lost-sheep reveal',async()=>{
  const {chapter,g,S}=fixture(),run=chapter.run(g);
  for(let i=0;i<9;i++){
    const target=S.sheep[i].actor.pos;g.player.pos.copy(target);g.input.act=true;g.step(.05);
    assert.equal(S.collected,i+1);assert.equal(S.sheep[i].state,'following');assert.equal(g.input.act,false);g.step(.05);assert.equal(S.collected,i+1,'one action must not duplicate');
  }
  assert.equal(S.phase,'return_nine');assert.equal(g.objective.count,'9/10');g.player.pos.copy(S.fold);g.step(.05);assert.equal(S.phase,'nine_safe');assert.equal(S.safeCount,9);assert.ok(S.sheep.every(x=>x.state==='safe'&&x.actor.m.root.visible));
  const parked=S.sheep.map(x=>x.actor.pos.clone());for(let i=0;i<10;i++)g.step(.1);assert.equal(S.phase,'lost_call');assert.equal(S.control,'lost-sheep');assert.equal(S.viewpoint,'lost-sheep');assert.equal(S.lastActor.m.root.visible,false);assert.equal(g.objective.text.ko,'혼자 남겨졌어요. 소리를 내어 불러 보세요.');
  for(let i=0;i<30;i++)g.step(.1);S.sheep.forEach((x,i)=>assert.ok(x.actor.pos.distanceTo(parked[i])<1e-9));assert.equal(S.diagnostics.maxSafeSheepDrift,0);
  g.paused=true;g.input.act=true;g.step(.1);assert.equal(S.called,false);assert.equal(g.input.act,false);g.paused=false;g.dq={};g.input.act=true;g.step(.1);assert.equal(S.called,false);g.dq=null;
  g.input.act=true;g.step(.1);assert.equal(S.called,true);assert.equal(S.callCount,1);assert.deepEqual(g.sfx,['baa']);g.input.act=true;g.step(.1);assert.equal(S.callCount,1);assert.deepEqual(g.sfx,['baa']);assert.ok(['seeking','retrieved'].includes(S.phase));
  for(let i=0;i<1200&&!S.completed;i++)g.step(.05);await run;
  assert.equal(S.completed,true);assert.equal(S.returned,10);assert.equal(S.safeCount,10);assert.equal(g.objective.count,'10/10');assert.equal(S.carrying,true);assert.equal(S.lastActor.m.root.visible,false);assert.equal(S.carryModel.root.parent,S.shepherd.m.carryAnchor);assert.equal(S.revealText.ko,'나를 찾으러 오셨구나.');
  const order=['gather','return_nine','nine_safe','lost_call','seeking','retrieved','returning','complete'].map(p=>phaseIndex(S.history,p));for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1]);assert.ok(S.elapsed<70,'narrative must finish without an endless poll');
});

test('cleanup is idempotent, resolves an unfinished run, and restores David/input/camera state',async()=>{
  const {chapter,g,S}=fixture(),run=chapter.run(g);const before={yaw:.7,pitch:.4,dist:11,position:g.camera.position.clone(),look:g.camLook.clone(),target:g.cam.tgt.clone(),input:[4,-2,3]};g.cam.yaw=8;g.cam.pitch=-1;g.cam.dist=3;g.cam.tgt.set(80,90,100);g.camera.position.set(99,99,99);g.camLook.set(8,8,8);g.input.lookX=0;g.input.lookY=0;g.input.zoom=0;g.lock=true;g.input.act=true;S.cleanup();S.cleanup();await run;
  assert.equal(S.cancelled,true);assert.equal(S.phase,'cancelled');assert.equal(S.history.filter(x=>x==='cancelled').length,1);assert.equal(g.david.root.visible,true);assert.equal(g.input.act,false);assert.equal(g.cam.yaw,before.yaw);assert.equal(g.cam.pitch,before.pitch);assert.equal(g.cam.dist,before.dist);assert.deepEqual(g.cam.tgt.toArray(),before.target.toArray());assert.deepEqual(g.camera.position.toArray(),before.position.toArray());assert.deepEqual(g.camLook.toArray(),before.look.toArray());assert.deepEqual([g.input.lookX,g.input.lookY,g.input.zoom],before.input);assert.equal(g.lock,false);
});

test('repeat builds own exactly seven explicit materials, dispose each once, and never dispose quadruped materials',()=>{
  const chapter=makeChapter(),g=new FakeGame(chapter);chapter.build(g);const first=chapter.s;
  assert.equal(first.ownedMaterials.length,7);assert.equal(new Set(first.ownedMaterials).size,7);
  const firstCounts=new Map(first.ownedMaterials.map(material=>[material,0]));for(const material of first.ownedMaterials)material.addEventListener('dispose',()=>firstCounts.set(material,firstCounts.get(material)+1));
  const firstQuadruped=[...first.sheep.map(entry=>entry.actor.m.body.material),first.lastActor.m.body.material];let firstQuadrupedDisposals=0;for(const material of firstQuadruped)material.addEventListener('dispose',()=>firstQuadrupedDisposals++);
  g.clearChapter();assert.equal(first.materialsDisposed,true);assert.equal(first.diagnostics.ownedMaterialDisposals,7);assert.ok([...firstCounts.values()].every(count=>count===1));assert.equal(firstQuadrupedDisposals,0);first.cleanup();assert.ok([...firstCounts.values()].every(count=>count===1));

  chapter.build(g);const second=chapter.s;assert.equal(second.ownedMaterials.length,7);assert.equal(new Set(second.ownedMaterials).size,7);assert.ok(second.ownedMaterials.every(material=>!first.ownedMaterials.includes(material)));
  const secondCounts=new Map(second.ownedMaterials.map(material=>[material,0]));for(const material of second.ownedMaterials)material.addEventListener('dispose',()=>secondCounts.set(material,secondCounts.get(material)+1));
  const secondQuadruped=[...second.sheep.map(entry=>entry.actor.m.body.material),second.lastActor.m.body.material];let secondQuadrupedDisposals=0;for(const material of secondQuadruped)material.addEventListener('dispose',()=>secondQuadrupedDisposals++);
  second.cleanup();second.cleanup();assert.equal(second.diagnostics.ownedMaterialDisposals,7);assert.ok([...secondCounts.values()].every(count=>count===1));assert.equal(secondQuadrupedDisposals,0);
});

test('standalone lost-sheep call button works outside hidden touch HUD and fails closed for pause, menu, token, chapter and cleanup',()=>{
  const previous=globalThis.document,{document,body,label,menu,touch}=createDomStub();globalThis.document=document;
  try{
    const first=fixture();first.S.phase='lost_call';first.g.step(.01);const button=first.S.ui.callButton,panel=first.S.ui.callPanel;
    assert.ok(button);assert.equal(button.type,'button');assert.equal(button.textContent,'불러보기');assert.equal(button.attributes['aria-label'],'불러보기');assert.equal(panel.parentNode,body);assert.notEqual(panel.parentNode,touch);assert.equal(panel.style.width,'min(18rem, calc(100vw - 24px))');assert.equal(panel.style.maxWidth,'calc(100vw - 24px)');assert.equal(panel.style.whiteSpace,'normal');assert.equal(button.style.pointerEvents,'auto');assert.equal(label.textContent,'불러보기');
    button.click();button.click();assert.equal(first.g.input.act,true);assert.equal(first.S.diagnostics.buttonActivations,1);first.g.step(.01);assert.equal(first.S.called,true);assert.equal(first.S.ui.callButton,null);assert.equal(panel.parentNode,null);assert.equal(label.textContent,'행동');first.S.cleanup();assert.equal(label.textContent,'행동');

    const paused=fixture();paused.S.phase='lost_call';paused.g.paused=true;paused.g.input.act=true;paused.g.step(.01);assert.equal(paused.S.ui.callButton,null);assert.equal(paused.g.input.act,false);paused.g.paused=false;paused.g.step(.01);const pausedButton=paused.S.ui.callButton;assert.ok(pausedButton);paused.g.paused=true;paused.g.step(.01);assert.equal(paused.S.ui.callButton,null);pausedButton.click();assert.equal(paused.g.input.act,false);paused.g.paused=false;paused.g.step(.01);assert.equal(paused.g.input.act,false,'paused action must not buffer into resume');paused.S.cleanup();assert.equal(label.textContent,'행동');

    const guarded=fixture();guarded.S.phase='lost_call';guarded.g.step(.01);const menuButton=guarded.S.ui.callButton;menu.hidden=false;guarded.g.input.act=true;guarded.g.step(.01);assert.equal(guarded.S.ui.callButton,null);assert.equal(guarded.g.input.act,false);menuButton.click();assert.equal(guarded.g.input.act,false);menu.hidden=true;guarded.g.step(.01);const tokenButton=guarded.S.ui.callButton;guarded.g.tok++;guarded.g.step(.01);assert.equal(guarded.S.ui.callButton,null);tokenButton.click();assert.equal(guarded.g.input.act,false);guarded.S.cleanup();assert.equal(label.textContent,'행동');

    const wrongChapter=fixture();wrongChapter.S.phase='lost_call';wrongChapter.g.step(.01);const chapterButton=wrongChapter.S.ui.callButton;wrongChapter.g.ch={id:1};wrongChapter.g.step(.01);assert.equal(wrongChapter.S.ui.callButton,null);chapterButton.click();assert.equal(wrongChapter.g.input.act,false);wrongChapter.S.cleanup();assert.equal(label.textContent,'행동');

    const wrongMode=fixture();wrongMode.S.phase='lost_call';wrongMode.g.step(.01);const modeButton=wrongMode.S.ui.callButton;wrongMode.g.mode='intro';wrongMode.g.step(.01);assert.equal(wrongMode.S.ui.callButton,null);modeButton.click();assert.equal(wrongMode.g.input.act,false);wrongMode.S.cleanup();assert.equal(label.textContent,'행동');

    const cleaned=fixture();cleaned.S.phase='lost_call';cleaned.g.step(.01);const cleanupButton=cleaned.S.ui.callButton;cleaned.S.cleanup();assert.equal(cleaned.S.ui.callButton,null);cleanupButton.click();assert.equal(cleaned.g.input.act,false);assert.equal(label.textContent,'행동');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('camera installer is idempotent, chapter-only, and enforces a positive rear dot for portrait, wide, intro, end, review, legacy and reload renders',()=>{
  const chapter=makeChapter();class CameraGame extends FakeGame{}
  const installed=installMyShepherdCamera({Game:CameraGame,chapter});assert.equal(installMyShepherdCamera({Game:CameraGame,chapter}),installed);
  const g=new CameraGame(chapter);g.loadWorld();const modes=['intro','introCard','play','endCard','review'];const aspects=[390/844,16/9];
  for(const graphicsAssets of ['legacy','ready'])for(const mode of modes)for(const aspect of aspects){g.graphicsAssets=graphicsAssets;g.mode=mode;g.camera.aspect=aspect;chapter.s.shepherd.yaw=(mode.length*.41)%6;g.camera.position.copy(chapter.s.shepherd.pos).add(new THREE.Vector3(Math.sin(chapter.s.shepherd.yaw),1,Math.cos(chapter.s.shepherd.yaw)));g.renderer.render(g.scene,g.camera);const forward=new THREE.Vector3(Math.sin(chapter.s.shepherd.yaw),0,Math.cos(chapter.s.shepherd.yaw)),view=g.camera.position.clone().sub(chapter.s.shepherd.pos).normalize();assert.ok(-view.dot(forward)>.9,`${graphicsAssets}/${mode}/${aspect}`);assert.ok(chapter.s.diagnostics.camera.behindDot>.9);}
  g.input.lookX=99;g.input.lookY=99;g.input.zoom=99;g.updateCamera(.016);assert.equal(g.nativeCameraCalls,undefined);assert.deepEqual([g.input.lookX,g.input.lookY,g.input.zoom],[0,0,0]);
  const other={id:1};g.ch=other;g.updateCamera(.016);assert.equal(g.nativeCameraCalls,1);g.ch=chapter;
  g.clearChapter();g.loadWorld();g.mode='intro';g.camera.aspect=390/844;g.renderer.render(g.scene,g.camera);assert.ok(chapter.s.diagnostics.camera.behindDot>.9);assert.equal(g.__myShepherdRenderBoundary,true);
});

test('camera stays behind during the complete travel sequence while nine sheep remain parked behind',()=>{
  const chapter=makeChapter();class TravelGame extends FakeGame{}installMyShepherdCamera({Game:TravelGame,chapter});const g=new TravelGame(chapter);g.loadWorld();const S=chapter.s;
  S.collected=9;S.nextIndex=9;S.sheep.forEach(x=>x.state='following');S.phase='return_nine';g.player.pos.copy(S.fold);g.step(.05);for(let i=0;i<10;i++)g.step(.1);g.input.act=true;g.step(.1);
  const parked=S.sheep.map(x=>x.actor.pos.clone());let sawPov=false,sawCarry=false;for(let i=0;i<900&&!S.completed;i++){g.step(.05);g.renderer.render(g.scene,g.camera);if(['lost_call','seeking'].includes(S.phase)){sawPov=true;assert.equal(S.diagnostics.camera.viewpoint,'lost-sheep');assert.ok(g.camera.position.distanceTo(S.lastActor.pos)<.75);assert.ok(S.diagnostics.camera.povHeight>.35&&S.diagnostics.camera.povHeight<.65);assert.equal(S.shepherd.m.root.visible,false);}else{assert.ok(S.diagnostics.camera.behindDot>.9);if(['retrieved','returning'].includes(S.phase)){sawCarry=true;assert.equal(S.shepherd.m.root.visible,true);}}S.sheep.forEach((x,j)=>assert.ok(x.actor.pos.distanceTo(parked[j])<1e-9));}
  assert.equal(S.completed,true);assert.equal(sawPov,true);assert.equal(sawCarry,true);assert.equal(S.diagnostics.camera.minBehindDot>.9,true);
});

// Real game's movement method, not a replacement that can hide camera feedback.
const gameHTML=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nativePlayerBody=gameHTML.slice(gameHTML.indexOf('  updatePlayer(dt) {')+'  updatePlayer(dt) {'.length,gameHTML.indexOf('\n  moveTo(nx, nz) {'));
const nativePlayer=new Function('lerp','dampF','wrapA',`return function(dt){${nativePlayerBody.slice(0,nativePlayerBody.lastIndexOf('}'))}}`)(THREE.MathUtils.lerp,(rate,dt)=>1-Math.exp(-rate*dt),a=>Math.atan2(Math.sin(a),Math.cos(a)));
test('native held D and diagonal gestures converge rather than spinning with the rear camera; other chapters forward unchanged',()=>{
 for(const direction of [{x:1,y:0,m:1},{x:Math.SQRT1_2,y:Math.SQRT1_2,m:1},{x:0,y:1,m:1}]){
  const chapter=makeChapter();class MoveGame extends FakeGame{updatePlayer(dt){return nativePlayer.call(this,dt);}moveTo(x,z){this.player.pos.set(x,this.groundAt(x,z),z);}}
  const original=MoveGame.prototype.updatePlayer;installMyShepherdCamera({Game:MoveGame,chapter});const g=new MoveGame(chapter);g.loadWorld();g.player.yaw=0;g.player.speed=0;g.player.knock=new THREE.Vector3();g.player.pose='auto';g.david.update=()=>{};g.input.moveVec=()=>direction;g.input.running=()=>false;g.ch.s.shepherd.yaw=0;g.updateCamera(.016);
  const initial=g.player.pos.clone(),target=Math.atan2(-direction.x,direction.y),samples=[];
  for(let i=0;i<120;i++){g.updatePlayer(1/60);g.step(1/60);g.updateCamera(1/60);samples.push(g.player.yaw);}
  assert.ok(Math.abs(g.player.yaw-target)<.005,'held heading must converge instead of following a moving target');
  assert.ok(Math.abs(samples.at(-1)-samples.at(-30))<.001,'no continuing spin');assert.ok(g.player.pos.distanceTo(initial)>5);
  assert.ok(chapter.s.diagnostics.camera.minBehindDot>.9);
  g.input.moveVec=()=>({x:0,y:0,m:0});g.updatePlayer(1/60);assert.equal(chapter.s.moveYaw,null);
  g.input.moveVec=()=>direction;g.updatePlayer(1/60);g.paused=true;g.renderer.render(g.scene,g.camera);assert.equal(chapter.s.moveYaw,null);g.paused=false;
  g.ch={id:1};const before=g.cam.yaw;g.updatePlayer(1/60);assert.equal(g.cam.yaw,before);assert.equal(MoveGame.prototype.updatePlayer.__myShepherdOriginal,original);
 }
});
