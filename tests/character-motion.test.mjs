import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {splitLeg} from '../src/character-motion.js';
test('Knee split clips crossing triangles at the joint instead of leaving diagonal strips',()=>{
 const geometry=new THREE.CapsuleGeometry(.068,.52,4,8);geometry.translate(0,-.43,0);
 const [upper,lower]=splitLeg(geometry);
 for(const y of Array.from({length:upper.attributes.position.count},(_,i)=>upper.attributes.position.getY(i)))assert.ok(y>=-.400001);
 for(const y of Array.from({length:lower.attributes.position.count},(_,i)=>lower.attributes.position.getY(i)))assert.ok(y<=.000001);
 for(const g of [upper,lower])for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
 assert.equal(splitLeg(geometry)[0],upper);
});

import {readFileSync} from 'node:fs';
import {articulateStorybookHuman} from '../src/character-motion.js';
// Exercise the unchanged game's actual pose targets, not a second copy of them.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const baseSource=html.slice(html.indexOf('function updateHuman('),html.indexOf('\nfunction makeQuadruped('));
const baseUpdate=new Function('dampF','clamp','lerp',`${baseSource};return updateHuman;`)((r,dt)=>1-Math.exp(-r*dt),THREE.MathUtils.clamp,THREE.MathUtils.lerp);
function human(){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData.storybookHuman=true;
 const h={root,body,phase:0,t:0,pose:'auto',tgt:{lL:0,lR:0,aL:0,aR:0,aLz:.1,aRz:-.1,by:0,bx:0,hx:0,hy:0}};
 for(const name of ['legL','legR','armL','armR','head','handL','handR']){h[name]=new THREE.Group();body.add(h[name]);}
 for(const [leg,x]of [[h.legL,.12],[h.legR,-.12]]){leg.position.set(x,.9,0);const g=new THREE.BoxGeometry(.17,.855,.29);g.translate(0,-.4275,.065);const m=new THREE.Mesh(g);m.userData.storybookHumanVisual=true;leg.add(m);}
 h.update=(dt,speed)=>baseUpdate(h,dt,speed);return articulateStorybookHuman(h);
}
function sample(h){return [h.legL.rotation.x,h.legR.rotation.x,...h.__storyKnees.map(k=>k.rotation.x),h.body.position.y,h.body.rotation.x];}
function feet(h){h.root.updateMatrixWorld(true);return h.__storyKnees.map(k=>k.localToWorld(new THREE.Vector3(0,-.455,.065)));}
function travel(h,seconds,hz,speed){for(let i=0;i<seconds*hz;i++){h.root.position.z+=speed/hz;h.update(1/hz,speed);}return sample(h);}
test('gait follows displacement, not requested speed; stationary residual speed settles',()=>{
 const a=human(),b=human();
 for(let i=0;i<90;i++){a.root.position.z+=4.8/60;b.root.position.z+=4.8/60;a.update(1/60,0);b.update(1/60,100);}
 assert.deepEqual(sample(a),sample(b));
 for(let i=0;i<60;i++)a.update(1/60,8.4);
 assert.ok(sample(a).slice(0,4).every(v=>Math.abs(v)<1e-6));
 const idle=human();for(let i=0;i<60;i++)idle.update(1/60,8.4);
 assert.ok(sample(idle).slice(0,4).every(v=>v===0));
});
test('distance gait and eased low poses agree at 30 and 60 Hz',()=>{
 for(const speed of [2,4.8,8.4]){const a=human(),b=human();const aa=travel(a,2,30,speed),bb=travel(b,2,60,speed);aa.forEach((v,i)=>assert.ok(Math.abs(v-bb[i])<.012,`${speed}: ${i}`));}
 for(const pose of ['sit','kneel']){const a=human(),b=human();a.pose=b.pose=pose;travel(a,1,30,0);travel(b,1,60,0);sample(a).forEach((v,i)=>assert.ok(Math.abs(v-sample(b)[i])<.012));}
});
test('teleports and suspended/invalid dt do not inject a stride or nonfinite angles',()=>{
 const h=human();h.root.position.z+=100;h.update(1/60,8.4);assert.ok(sample(h).slice(0,4).every(v=>v===0));
 for(const dt of [0,-1,NaN,Infinity,2]){h.root.position.z+=100;h.update(dt,8.4);assert.ok(sample(h).every(Number.isFinite));assert.ok(sample(h).slice(0,4).every(v=>Math.abs(v)<1e-6));}
});
test('sit, kneel and stand transitions stay bounded and clear the flat root plane',()=>{
 const h=human();let previous=sample(h);
 for(const pose of ['sit','auto','kneel','auto','sit','kneel','auto']){h.pose=pose;for(let i=0;i<120;i++){
   h.update(1/60,0);const values=sample(h);assert.ok(values.every(Number.isFinite));
   values.slice(0,4).forEach((v,j)=>assert.ok(Math.abs(v-previous[j])<.16,`${pose} joint jump`));
   assert.ok(Math.abs(values[4]-previous[4])<.08,`${pose} body jump`);
   for(const foot of feet(h))assert.ok(foot.y>=-.003,`${pose}: foot ${foot.y}`);
   previous=values;
 }}
});
test('flat-stage near-ground slip improves at walking and running speeds',()=>{
 for(const speed of [4.8,8.4]){const h=human();travel(h,1,60,speed);let previous=feet(h),ratios=[];
 for(let i=0;i<180;i++){h.root.position.z+=speed/60;h.update(1/60,speed);const now=feet(h);now.forEach((f,j)=>{if(f.y<.07&&previous[j].y<.07)ratios.push(Math.hypot(f.x-previous[j].x,f.z-previous[j].z)*60/speed);});previous=now;}
 ratios.sort((a,b)=>a-b);assert.ok(ratios.length>40);const median=ratios[Math.floor(ratios.length/2)];console.log(`flat-stage ${speed}: median slip/root ${median.toFixed(3)}, ${ratios.length} contact samples`);assert.ok(median<.65);
 }
});
test('sling/carry/bow/play arm targets and hand pivots remain supported',()=>{
 for(const pose of ['sling','carry','carryarms','bowaim','play']){const h=human();const hand=h.handR;h.pose=pose;travel(h,2,60,0);assert.equal(h.handR,hand);assert.ok(h.armR.rotation.x<-.7,pose);assert.ok(sample(h).every(Number.isFinite));if(pose==='play'){assert.ok(h.__playingBlend>.99);assert.ok(h.armR.rotation.z>.54);}}
});
test('Explicit one-second staged pose initialization settles seated characters',()=>{
 const h=human();h.pose='sit';h.update(1,0);
 assert.ok(Math.abs(h.legL.rotation.x+1.5)<.02);
 assert.ok(Math.abs(h.__storyKnees[0].rotation.x-1.5)<.02);
 for(const foot of feet(h))assert.ok(foot.y>=-.003);
});
