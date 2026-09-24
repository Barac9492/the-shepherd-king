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
