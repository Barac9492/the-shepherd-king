import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {harpCameraFrame,installHarpCamera} from '../src/harp-camera.js';
const player={x:1.5,z:416},saul={x:0,z:406.85};
function camera(aspect,eye,look){const c=new THREE.PerspectiveCamera(55,aspect,.1,2000);c.position.copy(eye);c.lookAt(look);c.updateMatrixWorld(true);return c;}
const eye=new THREE.Vector3(-6.5,3.2,419),look=new THREE.Vector3(.7,1.3,411.5);
test('original side camera reproducibly excludes David in portrait',()=>{const c=camera(390/844,eye,look);const p=new THREE.Vector3(1.5,1.4,416).project(c);assert.ok(p.x>1);});
for(const [width,height]of [[320,568],[360,640],[390,844],[568,320],[667,320],[844,390]])test(`harp composition fits ${width}x${height} without changing wide framing`,()=>{
 const aspect=width/height,frame=harpCameraFrame(aspect,player,saul);
 if(aspect>=1.2){assert.equal(frame,null);return;}
 const c=camera(aspect,new THREE.Vector3(frame.position.x,frame.position.y,frame.position.z),new THREE.Vector3(frame.look.x,frame.look.y,frame.look.z));
 for(const p of [new THREE.Vector3(1.5,0,416),new THREE.Vector3(1.5,.9,416),new THREE.Vector3(1.5,2.1,416),new THREE.Vector3(0,2.1,406.85)]){const ndc=p.project(c);assert.ok(Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.95&&ndc.z<1);}
});
test('both dodge offsets keep player and Saul in portrait',()=>{for(const x of[.2,1.5,2.8]){const f=harpCameraFrame(390/844,{x,z:416},saul),c=camera(390/844,new THREE.Vector3(...Object.values(f.position)),new THREE.Vector3(...Object.values(f.look)));for(const p of[new THREE.Vector3(x,1.4,416),new THREE.Vector3(0,2.1,406.85)])assert.ok(Math.abs(p.project(c).x)<.95);}});
function wrapped(chIdx=2){class Fake{updateCamera(dt){this.seen=this.cine;this.dt=dt;if(this.throwNow)throw new Error('camera failure');return 42;}}installHarpCamera(Fake,THREE);const g=new Fake();Object.assign(g,{chIdx,mode:'play',lock:true,player:{pos:{...player}},ch:{s:{saulIn:{pos:{...saul}}}},camera:{aspect:390/844},cine:{pos:eye.clone(),look:look.clone(),k:3}});return g;}
test('wrapper changes only narrow locked chapter-three palace camera, restoring source target',()=>{const g=wrapped(),source=g.cine,before=JSON.stringify([g.player,g.ch]);assert.equal(g.updateCamera(.04),42);assert.notEqual(g.seen,source);assert.equal(g.cine,source);assert.equal(g.seen.k,3);assert.equal(JSON.stringify([g.player,g.ch]),before);});
test('other chapters, outside palace, review/title, unlocked and wide screens are untouched',()=>{
 for(let chapter=0;chapter<10;chapter++)if(chapter!==2){const g=wrapped(chapter),s=g.cine;g.updateCamera(.04);assert.equal(g.seen,s);}
 for(const change of [g=>g.player.pos.z=20,g=>g.mode='title',g=>g.lock=false,g=>g.camera.aspect=667/320,g=>g.ch.s.saulIn=null,g=>g.cine=null]){const g=wrapped();change(g);const s=g.cine;g.updateCamera(.04);assert.equal(g.seen,s);}
});
test('cinematic source restored even when original camera throws',()=>{const g=wrapped(),s=g.cine;g.throwNow=true;assert.throws(()=>g.updateCamera(.04),/camera failure/);assert.equal(g.cine,s);});
test('invalid aspect or missing actors fails closed to original camera',()=>{for(const aspect of[NaN,0,-1,Infinity])assert.equal(harpCameraFrame(aspect,player,saul),null);assert.equal(harpCameraFrame(.5,null,saul),null);});
