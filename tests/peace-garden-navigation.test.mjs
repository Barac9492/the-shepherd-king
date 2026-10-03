import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenNavigation } from '../src/peace-garden-navigation.js';
test('companions route around obstacles with body clearance and stay inside the garden',()=>{
  const obstacles=[{x:0,z:0,r:2},{x:3,z:0,r:1.2}],nav=createGardenNavigation(obstacles);
  const from={x:-8,z:0},to={x:8,z:0},path=nav.path(from,to);
  assert.ok(path.length>1);let cursor=from;
  for(const target of path){assert.ok(nav.segment(cursor,target));assert.ok(nav.clear(target.x,target.z));cursor=target;}
  assert.deepEqual(path.at(-1),to);
  assert.deepEqual(nav.path(from,{x:0,z:0}),[]);
  assert.deepEqual(nav.path(from,{x:25,z:0}),[]);
  assert.deepEqual(nav.path({x:0,z:0},to),[]);
});
test('all representative reachable positions have safe routes around garden scenery',()=>{
  const nav=createGardenNavigation([{x:-7,z:-3,r:.7475},{x:-12,z:-9,r:.5525},{x:6,z:-5,r:1.62},{x:8.5,z:-5,r:1.08}]);
  for(let i=0;i<24;i++){const a=i*Math.PI/12,from={x:Math.sin(a)*21,z:Math.cos(a)*21},to={x:-from.x,z:-from.z};const path=nav.path(from,to);assert.ok(path.length);let p=from;for(const q of path){assert.ok(nav.segment(p,q));p=q;}}
});
