import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clothLoftGeometry, buildStorybookHumanVisuals, getStorybookHumanCacheStatus } from '../src/character-art.js';

function meshes(visuals) {
  return [visuals.body, visuals.legL, visuals.legR, visuals.armL, visuals.armR, visuals.head].filter(Boolean);
}

function assertFiniteGeometry(geometry) {
  for (const attribute of Object.values(geometry.attributes)) {
    assert.ok([...attribute.array].every(Number.isFinite), `${attribute.name} contains non-finite values`);
  }
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (const value of [min.x, min.y, min.z, max.x, max.y, max.z]) assert.ok(Number.isFinite(value));
}

test('human cloth and hand geometries remain finite with bounded standard silhouettes', () => {
  const standard = buildStorybookHumanVisuals({
    tunic: 0x745438, sleeve: 0x745438, sash: 0x3d281c, skin: 0xc58a5c,
    cloak: 0x3a2a4a, armor: false, robeLen: 1.35,
  }, { role: 'david-adult' });
  for (const visual of meshes(standard)) assertFiniteGeometry(visual.geometry);
  const box = standard.body.geometry.boundingBox;
  assert.ok(box.min.y >= 0.19, `robe hem must stay above the floor, got ${box.min.y}`);
  assert.ok(box.max.y <= 1.78, `body silhouette unexpectedly tall: ${box.max.y}`);
  assert.ok(box.max.x - box.min.x <= 1.16, `body silhouette unexpectedly wide: ${box.max.x - box.min.x}`);
  assert.ok(box.max.z - box.min.z <= 0.92, `body silhouette unexpectedly deep: ${box.max.z - box.min.z}`);
});

test('representative roles reuse cached shared geometry and retain mesh budgets', () => {
  const kingOptions = { tunic: 0x5f3948, sleeve: 0x5f3948, sash: 0x6b4a2b, skin: 0xc58a5c, cloak: 0x302344, hat: 'crown', armor: true };
  const kingA = buildStorybookHumanVisuals(kingOptions, { role: 'david-king' });
  const before = getStorybookHumanCacheStatus().geometries;
  const kingB = buildStorybookHumanVisuals(kingOptions, { role: 'david-king' });
  assert.equal(kingA.body.geometry, kingB.body.geometry);
  assert.equal(kingA.armL.geometry, kingB.armL.geometry);
  assert.equal(kingA.head.geometry, kingB.head.geometry);
  assert.equal(getStorybookHumanCacheStatus().geometries, before);
  assert.ok(meshes(kingA).length <= 6);
  assert.equal(kingA.metadata.meshCount, 6);

  const crowd = buildStorybookHumanVisuals({ simple: true, tunic: 0x8a6a4a, skin: 0xb97b52, hat: 'cloth' }, { role: 'crowd' });
  for (const visual of meshes(crowd)) assertFiniteGeometry(visual.geometry);
  assert.equal(meshes(crowd).length, 4);
  assert.equal(crowd.metadata.meshCount, 4);
});

test('Cloth caps point outwards for both ascending tunics and descending sleeves',()=>{
 for(const profile of [[{y:0,x:.3,z:.2},{y:1,x:.2,z:.15}],[{y:1,x:.2,z:.15},{y:0,x:.3,z:.2}]]){
 const g=clothLoftGeometry(profile,12),n=g.attributes.normal,count=n.count;
 assert.ok(n.getY(count-2)<-.99);assert.ok(n.getY(count-1)>.99);
 }
});

test('Neutral face/head/hair remain exactly at the user-correction checkpoint a32f998',()=>{
 const s=fs.readFileSync(new URL('../src/character-art.js',import.meta.url),'utf8');
 const face=s.slice(s.indexOf('function hairParts('),s.indexOf('export function buildStorybookHumanVisuals'));
 assert.equal(crypto.createHash('sha256').update(face).digest('hex'),'44282f5c7efda1c2edff3edbd966731c11822ea67c7c039c21a00f7998a7d0b3');
});
test('Left and right hand silhouettes mirror without changing attachment pivots',()=>{
 const v=buildStorybookHumanVisuals({},{role:'david-adult'});
 v.armL.geometry.computeBoundingBox();v.armR.geometry.computeBoundingBox();
 const a=v.armL.geometry.boundingBox,b=v.armR.geometry.boundingBox;
 assert.ok(Math.abs(a.min.x+b.max.x)<.000001);assert.ok(Math.abs(a.max.x+b.min.x)<.000001);
});

test('Seated cloth morphs have finite positions and normals without changing faces',()=>{
 const v=buildStorybookHumanVisuals({robeLen:1.35,cloak:0x334455},{role:'david-king'});
 for(const attributes of Object.values(v.body.geometry.morphAttributes))for(const a of attributes)assert.ok([...a.array].every(Number.isFinite));
 assert.equal(v.body.geometry.morphAttributes.position.length,1);
 assert.equal(v.head.geometry.morphAttributes.position,undefined);
});
