import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeStorybookLyreFactory} from '../src/storybook-props.js';
test('Lyre support contact coincides with the palm under the original story attachment transform',()=>{
 const factory=makeStorybookLyreFactory({THREE,G:g=>g,merge:parts=>parts[0],mesh:g=>new THREE.Mesh(g,new THREE.MeshBasicMaterial())});
 const root=factory();root.position.set(.1,.1,.25);root.rotation.set(-.4,0,.3);root.updateMatrixWorld(true);
 const grip=root.children[0].localToWorld(new THREE.Vector3(.2,.04,.015));
 assert.ok(grip.distanceTo(new THREE.Vector3(0,-.015,0))<.000001);
});
