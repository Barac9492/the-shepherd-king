import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {decoratePalaceSurface} from '../src/surface-art.js';
test('Palace surface layers preserve existing shader hooks without textures or emissive changes',()=>{
 const keys=[];
 for(const kind of ['floor','wall','linen','stone']){
  const m=new THREE.MeshStandardMaterial({vertexColors:true});let calls=0;m.onBeforeCompile=()=>{calls++;};
  const emissive=m.emissive.getHex();decoratePalaceSurface(m,kind);
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
  m.onBeforeCompile(shader,{});assert.equal(calls,1);assert.match(shader.vertexShader,/vCraftPosition=/);assert.match(shader.fragmentShader,/diffuseColor.rgb\*=/);
  assert.equal(m.map,null);assert.equal(m.normalMap,null);assert.equal(m.emissive.getHex(),emissive);keys.push(m.customProgramCacheKey());
 }
 assert.equal(new Set(keys).size,4);assert.throws(()=>decoratePalaceSurface(new THREE.MeshStandardMaterial(),'unknown'));
});
