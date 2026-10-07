/**
 * Bethlehem water episode — 3D world (rendering only).
 * Owns aesthetic lights, scenery, characters; parent owns camera/renderer/UI.
 * Layout contract from core (obstacles/shelters/well/start); ground walkable at y=0.
 */
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
// Read-only reuse of the art lab's existing runtime arm/prop IK. This file is
// not owned by world and is never edited here -- the raw six GLB clips do not
// drive the arms at all (bind pose), so without this pass every clip shows a
// T-pose; createArtPoseRefiner is what actually places the hands/prop.
import { createArtPoseRefiner } from './bethlehem-art-pose.js';
// Namespace import: core's new stealth exports (CONFIG/sightPolygon/stealthInfo)
// may not exist yet while core and world are built in parallel branches off the
// same contract. A namespace import never throws for a missing named export --
// every use below feature-detects with `typeof core.x === 'function'` first and
// falls back to an equivalent local computation when core hasn't shipped it yet.
import * as core from './bethlehem-water-core.js';
import { SIGHT_COLORS, SIGHT_OPACITY } from './bethlehem-stealth-palette.js';

const FALLBACK_LAYOUT = Object.freeze({
  start: { x: 0, z: 23 },
  well: { x: 0, z: -23 },
  bounds: { minX: -21, maxX: 21, minZ: -32, maxZ: 27 },
  obstacles: [
    { x: -12, z: -15, w: 16, d: 2, h: 5 },
    { x: 12, z: -15, w: 16, d: 2, h: 5 },
    { x: -12, z: -24, w: 7, d: 7, h: 5 },
    { x: 12, z: -24, w: 7, d: 7, h: 5 },
  ],
  shelters: [
    { x: -8, z: 10, r: 2.5 },
    { x: 8, z: 1, r: 2.5 },
    { x: -7, z: -8, r: 2.5 },
    { x: 6, z: -21, r: 2.5 },
  ],
});

const PALETTE = Object.freeze({
  sand: 0xd4c19a,
  sandDeep: 0xb89a72,
  stone: 0xd9cbb0,
  stoneShade: 0x9a8462,
  stoneCool: 0xa8a090,
  olive: 0x718650,
  oliveDark: 0x4a5734,
  leaf: 0x92a878,
  clothCream: 0xe8dcc4,
  clothTerracotta: 0xb86a48,
  clothIndigo: 0x4a5568,
  terracotta: 0xa96e49,
  bronze: 0x8a6a3a,
  water: 0x4a7a8a,
  waterDeep: 0x2a4a58,
  skin: 0xc58a5c,
  skinShade: 0xa87248,
  hair: 0x3a2820,
  tunicWarrior: 0x8b6a48,
  tunicCompanion: 0x9a7a52,
  tunicCompanion2: 0x7a6548,
  tunicGuard: 0x5a4a3a,
  tunicDavid: 0x6b4a5a,
  cloakDavid: 0x3a2a4a,
  sash: 0x5a3a28,
  sandal: 0x4d3020,
  eye: 0x17120f,
  torch: 0xffaa55,
  fog: 0xbccdd2,
  skyTop: 0x91bbd8,
  skyHorizon: 0xf5d9bd,
});

function hash2(x, z, salt = 0) {
  let n = (Math.round(x * 1000) ^ Math.imul(Math.round(z * 1000), 374761393) ^ salt) | 0;
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function transformGeo(geometry, {
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1,
} = {}) {
  const g = geometry.clone();
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(sx, sy, sz);
  o.updateMatrix();
  g.applyMatrix4(o.matrix);
  return g;
}

function paintVertexColors(geometry, colorHex, shadeFn) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  // All authored parts share exactly position/normal/color. Procedural lofts have
  // no UVs whereas Three primitives do; retaining UVs makes merges return null.
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
  }
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(colorHex);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.copy(c);
    if (shadeFn) shadeFn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function clothLoft(profile, segments = 12, folds = 0.04) {
  if (profile[0].y > profile[profile.length - 1].y) profile = profile.slice().reverse();
  const positions = [];
  const rings = profile.length;
  for (let row = 0; row < rings; row++) {
    const { y, x, z } = profile[row];
    for (let col = 0; col < segments; col++) {
      const angle = (col / segments) * Math.PI * 2;
      const front = Math.max(0, Math.sin(angle));
      const fold = folds ? Math.sin(angle * 4) * front * folds : 0;
      positions.push(Math.cos(angle) * x * (1 + fold), y, Math.sin(angle) * z * (1 + fold));
    }
  }
  const indices = [];
  for (let row = 0; row < rings - 1; row++) {
    for (let col = 0; col < segments; col++) {
      const n = (col + 1) % segments;
      const a = row * segments + col;
      const b = row * segments + n;
      const c = (row + 1) * segments + col;
      const d = (row + 1) * segments + n;
      indices.push(a, c, b, b, c, d);
    }
  }
  const bottom = positions.length / 3;
  positions.push(0, profile[0].y, 0);
  const top = positions.length / 3;
  positions.push(0, profile[rings - 1].y, 0);
  for (let col = 0; col < segments; col++) {
    const n = (col + 1) % segments;
    indices.push(bottom, col, n);
    const a = (rings - 1) * segments + col;
    const b = (rings - 1) * segments + n;
    indices.push(top, b, a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function drapedCloak(topY, bottomY, shoulder, waist, segments = 10) {
  const positions = [];
  const rows = 5;
  const columns = segments + 1;
  for (let side = 0; side < 2; side++) {
    for (let row = 0; row < rows; row++) {
      const t = row / (rows - 1);
      const y = topY + (bottomY - topY) * t;
      const width = 0.38 * shoulder + 0.12 * waist * t;
      const depth = t === 0 ? 0.12 : 0.29 + 0.045 * t;
      for (let col = 0; col < columns; col++) {
        const angle = -1.45 + (col / segments) * 2.9;
        const wave = Math.sin(angle * 2) * 0.018 * (0.25 + t);
        positions.push(
          Math.sin(angle) * width,
          y + wave + (1 - t) * 0.08 * Math.cos(angle),
          -0.015 - Math.cos(angle) * depth + (side ? 0.014 : 0),
        );
      }
    }
  }
  const indices = [];
  const sideSize = rows * columns;
  for (let side = 0; side < 2; side++) {
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const a = side * sideSize + row * columns + col;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if (side) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeMat(shared, opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  shared.materials.push(m);
  return m;
}

function trackGeo(shared, geo) {
  shared.geometries.push(geo);
  return geo;
}

function mergePainted(parts, colorHex, shadeFn) {
  const painted = parts.map((g) => paintVertexColors(g, colorHex, shadeFn));
  const merged = mergeGeometries(painted, false);
  for (const g of painted) {
    if (g !== merged) g.dispose();
  }
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/* ─── Characters ─────────────────────────────────────────────── */

function buildHuman(shared, options = {}) {
  const {
    skin = PALETTE.skin,
    tunic = PALETTE.tunicWarrior,
    sash = PALETTE.sash,
    hair = PALETTE.hair,
    cloak = null,
    armor = false,
    beard = false,
    hat = null,
    scale = 1,
    name = 'human',
  } = options;

  const root = new THREE.Group();
  root.name = name;
  root.scale.setScalar(scale);

  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = 0;
  root.add(body);

  const mat = makeMat(shared, {
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    name: `${name}-vc`,
  });

  const hemY = 0.28;
  const tunicGeo = clothLoft([
    { y: hemY, x: 0.42, z: 0.29 },
    { y: 0.55, x: 0.39, z: 0.27 },
    { y: 0.85, x: 0.35, z: 0.25 },
    { y: 1.12, x: 0.34, z: 0.24 },
    { y: 1.38, x: 0.38, z: 0.26 },
    { y: 1.52, x: 0.32, z: 0.22 },
    { y: 1.62, x: 0.10, z: 0.10 },
  ], 12, 0.045);
  const sashGeo = clothLoft([
    { y: 1.08, x: 0.355, z: 0.26 },
    { y: 1.18, x: 0.36, z: 0.265 },
  ], 10, 0.02);
  const neckGeo = new THREE.CylinderGeometry(0.075, 0.088, 0.14, 8);
  neckGeo.translate(0, 1.62, 0);

  const bodyParts = [
    paintVertexColors(tunicGeo, tunic, (c, x, y) => {
      c.offsetHSL(0, 0, Math.sin(x * 8 + y * 3) * 0.03 - (y < 0.5 ? 0.04 : 0));
    }),
    paintVertexColors(sashGeo, sash),
    paintVertexColors(neckGeo, skin),
  ];
  if (cloak != null) {
    bodyParts.push(paintVertexColors(drapedCloak(1.5, 0.42, 1, 1, 10), cloak, (c, x, y) => {
      c.offsetHSL(0, 0, -0.04 + y * 0.02);
    }));
  }
  if (armor) {
    const breast = new THREE.CylinderGeometry(0.34, 0.38, 0.55, 12);
    breast.translate(0, 1.25, 0);
    bodyParts.push(paintVertexColors(breast, PALETTE.bronze, (c) => c.offsetHSL(0.02, 0.05, 0.02)));
  }

  const bodyMerged = mergeGeometries(bodyParts, false);
  for (const g of bodyParts) if (g !== bodyMerged) g.dispose();
  trackGeo(shared, bodyMerged);
  const bodyMesh = new THREE.Mesh(bodyMerged, mat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.name = 'tunic';
  body.add(bodyMesh);

  // Legs
  const legL = new THREE.Group();
  legL.name = 'legL';
  legL.position.set(0.12, 1.08, 0);
  body.add(legL);
  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(-0.12, 1.08, 0);
  body.add(legR);

  const thighGeo = paintVertexColors(
    transformGeo(new THREE.CapsuleGeometry(0.078, 0.42, 3, 8), { y: -0.32, sx: 0.95, sz: 0.9 }),
    skin,
  );
  const calfGeo = paintVertexColors(
    transformGeo(new THREE.CapsuleGeometry(0.068, 0.38, 3, 8), { y: -0.28, sx: 0.9, sz: 0.85 }),
    PALETTE.skinShade,
  );
  const footGeo = paintVertexColors(
    transformGeo(new THREE.BoxGeometry(0.16, 0.07, 0.28), { y: -0.52, z: 0.06 }),
    PALETTE.sandal,
  );

  for (const [pivot, side] of [[legL, 1], [legR, -1]]) {
    const upper = mergeGeometries([thighGeo.clone()], false);
    trackGeo(shared, upper);
    const uMesh = new THREE.Mesh(upper, mat);
    uMesh.castShadow = true;
    pivot.add(uMesh);

    const knee = new THREE.Group();
    knee.name = 'knee';
    knee.position.y = -0.55;
    pivot.add(knee);

    const lowerParts = [calfGeo.clone(), footGeo.clone()];
    const lower = mergeGeometries(lowerParts, false);
    for (const g of lowerParts) g.dispose();
    trackGeo(shared, lower);
    const lMesh = new THREE.Mesh(lower, mat);
    lMesh.castShadow = true;
    knee.add(lMesh);
    pivot.userData.knee = knee;
    pivot.userData.side = side;
  }
  thighGeo.dispose();
  calfGeo.dispose();
  footGeo.dispose();

  // Arms
  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.set(0.38, 1.45, 0);
  body.add(armL);
  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(-0.38, 1.45, 0);
  body.add(armR);

  for (const [arm, side] of [[armL, 1], [armR, -1]]) {
    const sleeve = clothLoft([
      { y: 0.02, x: 0.12, z: 0.11 },
      { y: -0.12, x: 0.125, z: 0.112 },
      { y: -0.32, x: 0.105, z: 0.095 },
    ], 8, 0.03);
    const forearm = transformGeo(new THREE.CapsuleGeometry(0.07, 0.22, 3, 7), { y: -0.48, sx: 0.9, sz: 0.8 });
    const palm = transformGeo(new THREE.SphereGeometry(0.075, 8, 6), { y: -0.64, sx: 0.76, sy: 1.15, sz: 0.62 });
    const thumb = transformGeo(new THREE.SphereGeometry(0.045, 6, 5), {
      x: 0.05 * side, y: -0.66, z: 0.01, sx: 0.7, sy: 1.05, sz: 0.7, rz: -0.3 * side,
    });
    const parts = [
      paintVertexColors(sleeve, tunic),
      paintVertexColors(forearm, skin),
      paintVertexColors(palm, skin),
      paintVertexColors(thumb, skin),
    ];
    const merged = mergeGeometries(parts, false);
    for (const g of parts) if (g !== merged) g.dispose();
    trackGeo(shared, merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    arm.add(mesh);

    const hand = new THREE.Group();
    hand.name = side > 0 ? 'handL' : 'handR';
    hand.position.set(0, -0.64, 0);
    arm.add(hand);
    arm.userData.hand = hand;
  }

  // Head
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.72, 0);
  body.add(head);

  const headParts = [
    paintVertexColors(new THREE.SphereGeometry(0.20, 14, 12), skin, (c, x, y, z) => {
      c.offsetHSL(0, 0, z * 0.08);
    }),
    paintVertexColors(transformGeo(new THREE.SphereGeometry(0.017, 7, 5), {
      x: 0.07, y: 0.02, z: 0.185, sy: 1.35, sz: 0.35, ry: 0.3,
    }), PALETTE.eye),
    paintVertexColors(transformGeo(new THREE.SphereGeometry(0.017, 7, 5), {
      x: -0.07, y: 0.02, z: 0.185, sy: 1.35, sz: 0.35, ry: -0.3,
    }), PALETTE.eye),
    paintVertexColors(transformGeo(new THREE.SphereGeometry(0.038, 7, 5), {
      x: 0.195, y: -0.01, sx: 0.5, sz: 0.68,
    }), skin),
    paintVertexColors(transformGeo(new THREE.SphereGeometry(0.038, 7, 5), {
      x: -0.195, y: -0.01, sx: 0.5, sz: 0.68,
    }), skin),
  ];

  // Hair shell
  if (hair != null) {
    const hairGeo = new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairGeo.translate(0, 0.04, -0.01);
    headParts.push(paintVertexColors(hairGeo, hair, (c, x, y, z) => {
      c.offsetHSL(0, 0, -0.05 + Math.abs(x) * 0.1);
    }));
  }
  if (beard) {
    const beardGeo = new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.48);
    beardGeo.translate(0, -0.04, 0.02);
    headParts.push(paintVertexColors(beardGeo, hair ?? PALETTE.hair));
  }
  if (hat === 'helmet') {
    const helm = new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48);
    helm.translate(0, 0.04, 0);
    headParts.push(paintVertexColors(helm, PALETTE.bronze));
    const crest = new THREE.BoxGeometry(0.05, 0.14, 0.36);
    crest.translate(0, 0.26, 0);
    headParts.push(paintVertexColors(crest, PALETTE.stoneShade));
  } else if (hat === 'cloth') {
    const cap = new THREE.SphereGeometry(0.225, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.46);
    cap.translate(0, 0.05, 0);
    headParts.push(paintVertexColors(cap, PALETTE.clothCream));
  }

  const headMerged = mergeGeometries(headParts, false);
  for (const g of headParts) if (g !== headMerged) g.dispose();
  trackGeo(shared, headMerged);
  const headMesh = new THREE.Mesh(headMerged, mat);
  headMesh.castShadow = true;
  head.add(headMesh);

  // Contact shadow disc
  const shadowGeo = trackGeo(shared, new THREE.CircleGeometry(0.42, 16));
  const shadowMat = makeMat(shared, {
    color: 0x1a2220,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  contactShadow.name = 'contact-shadow';
  root.add(contactShadow);

  const human = {
    root,
    body,
    legL,
    legR,
    armL,
    armR,
    head,
    handL: armL.userData.hand,
    handR: armR.userData.hand,
    contactShadow,
    pose: 'idle',
    carrying: false,
    crouching: false,
    phase: hash2(name.length, scale, 104) * Math.PI * 2,
    _prevX: 0,
    _prevZ: 0,
    waterSkin: null,
  };

  human.update = (dt, speedHint = 0) => {
    const px = root.position.x;
    const pz = root.position.z;
    const dist = Math.hypot(px - human._prevX, pz - human._prevZ);
    human._prevX = px;
    human._prevZ = pz;
    const moving = dist > 0.002 || speedHint > 0.08;
    const speed = moving ? Math.max(speedHint, dist / Math.max(dt, 0.001)) : 0;
    if (moving) human.phase += dt * (4.2 + clamp(speed, 0, 6) * 0.9);

    const crouch = human.crouching ? 1 : 0;
    body.position.y = lerp(body.position.y, crouch * -0.28, 1 - Math.exp(-10 * dt));
    body.rotation.x = lerp(body.rotation.x, crouch * 0.18, 1 - Math.exp(-8 * dt));

    const swing = moving ? Math.sin(human.phase) * 0.48 : Math.sin(human.phase * 0.4) * 0.04;
    const swingOpp = moving ? Math.sin(human.phase + Math.PI) * 0.48 : -swing * 0.3;
    const kneeBend = moving ? Math.max(0, Math.sin(human.phase)) * 0.55 : 0;
    const kneeBendR = moving ? Math.max(0, Math.sin(human.phase + Math.PI)) * 0.55 : 0;

    legL.rotation.x = swing;
    legR.rotation.x = swingOpp;
    if (legL.userData.knee) legL.userData.knee.rotation.x = kneeBend;
    if (legR.userData.knee) legR.userData.knee.rotation.x = kneeBendR;

    if (human.pose === 'pour') {
      armR.rotation.x = lerp(armR.rotation.x, -0.15, 1 - Math.exp(-5 * dt));
      armR.rotation.z = lerp(armR.rotation.z, 0.35, 1 - Math.exp(-5 * dt));
      armL.rotation.x = lerp(armL.rotation.x, -1.55, 1 - Math.exp(-5 * dt));
      armL.rotation.z = lerp(armL.rotation.z, -0.55, 1 - Math.exp(-5 * dt));
      head.rotation.x = lerp(head.rotation.x, 0.25, 1 - Math.exp(-4 * dt));
      body.rotation.x = lerp(body.rotation.x, 0.12, 1 - Math.exp(-4 * dt));
    } else if (human.carrying) {
      armL.rotation.x = lerp(armL.rotation.x, -0.85, 1 - Math.exp(-8 * dt));
      armR.rotation.x = lerp(armR.rotation.x, -0.85, 1 - Math.exp(-8 * dt));
      armL.rotation.z = lerp(armL.rotation.z, 0.25, 1 - Math.exp(-8 * dt));
      armR.rotation.z = lerp(armR.rotation.z, -0.25, 1 - Math.exp(-8 * dt));
    } else {
      const armSwing = moving ? swingOpp * 0.55 : Math.sin(human.phase * 0.35) * 0.06;
      armL.rotation.x = lerp(armL.rotation.x, armSwing, 1 - Math.exp(-10 * dt));
      armR.rotation.x = lerp(armR.rotation.x, -armSwing, 1 - Math.exp(-10 * dt));
      armL.rotation.z = lerp(armL.rotation.z, 0.12 + crouch * 0.15, 1 - Math.exp(-8 * dt));
      armR.rotation.z = lerp(armR.rotation.z, -0.12 - crouch * 0.15, 1 - Math.exp(-8 * dt));
      head.rotation.x = lerp(head.rotation.x, crouch * 0.15, 1 - Math.exp(-6 * dt));
    }

    contactShadow.material.opacity = 0.18 + (1 - crouch) * 0.12;
    contactShadow.scale.setScalar(lerp(contactShadow.scale.x, 0.85 + crouch * 0.25 + (moving ? 0.08 : 0), 0.2));
  };

  return human;
}

function attachWaterSkin(shared, human) {
  if (human.waterSkin) return human.waterSkin;
  const bag = clothLoft([
    { y: 0, x: 0.08, z: 0.06 },
    { y: 0.08, x: 0.12, z: 0.09 },
    { y: 0.22, x: 0.11, z: 0.085 },
    { y: 0.28, x: 0.06, z: 0.05 },
  ], 8, 0.02);
  const painted = paintVertexColors(bag, 0x6a4a32);
  trackGeo(shared, painted);
  const mat = makeMat(shared, { vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(painted, mat);
  mesh.castShadow = true;
  mesh.name = 'water-skin';
  human.handL.add(mesh);
  mesh.position.set(0.02, -0.02, 0.04);
  mesh.rotation.z = 0.4;
  human.waterSkin = mesh;
  return mesh;
}

/* ─── Scenery builders ───────────────────────────────────────── */

function buildGround(shared, layout) {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const w = 180;
  const d = 210;
  const segX = 120;
  const segZ = 140;
  const geo = new THREE.PlaneGeometry(w, d, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    // Subtle undulation outside playable path; keep walkable center flat at y≈0
    const edge = Math.max(
      Math.abs(x) / 24,
      Math.abs(z - 0) / 30,
    );
    const outside = Math.max(0, Math.abs(x) - 23, Math.abs(z + 2.5) - 33);
    const bump = Math.min(3.5, outside * 0.08) * (0.4 + Math.sin(x * .14 + z * .08) * .25 + Math.cos(z * .11) * .2);
    const path = Math.abs(x - Math.sin(z * .11) * .8) < 3.1 && z > -27 && z < 27;
    pos.setY(i, bump - .015);
    const patch = Math.sin(x * .27 + Math.sin(z * .14) * 2) * Math.cos(z * .22 - x * .1);
    c.setHex(path ? 0xddcfac : 0xc2bd96);
    if (!path) c.lerp(new THREE.Color(0x879b70), Math.max(0, patch) * .6);
    c.offsetHSL(
      (hash2(x, z, 1) - 0.5) * 0.02,
      (hash2(x, z, 2) - 0.5) * 0.04,
      (hash2(x, z, 4) - 0.5) * 0.05 - (z < -20 ? 0.03 : 0),
    );
    if (Math.abs(x) < 2.5 && Math.abs(z + 23) < 2.2) c.setHex(0xb8a882);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  trackGeo(shared, geo);
  geo.translate(cx, 0, cz);
  const mat = makeMat(shared, {
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

function buildMountains(shared) {
  const group = new THREE.Group(); group.name = 'rolling-judean-hills';
  // Broad, curved terrain ridges: no vertical sawtooth cards or naked boxes.
  const layers = [
    { z: -95, width: 240, depth: 65, height: 11, color: 0x8daabd },
    { z: -73, width: 205, depth: 43, height: 9, color: 0x8faba8 },
    { z: -53, width: 170, depth: 29, height: 6, color: 0xa0ad91 },
  ];
  for (let j = 0; j < layers.length; j++) {
    const layer = layers[j];
    const geometry = new THREE.PlaneGeometry(layer.width, layer.depth, 84, 24);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3), color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), localZ = positions.getZ(i);
      const ridge = Math.sin((localZ / layer.depth + 0.5) * Math.PI);
      const roll = 0.64 + Math.sin(x * 0.034 + j * 1.7) * 0.19 + Math.sin(x * 0.079 - j) * 0.1;
      const height = Math.max(0, ridge) * layer.height * roll;
      positions.setY(i, height - 0.9);
      color.setHex(layer.color).offsetHSL(0, 0, height * 0.004 + Math.sin(x * .13) * .015);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals(); trackGeo(shared, geometry);
    const material = makeMat(shared, { vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = layer.z; mesh.receiveShadow = true; group.add(mesh);
  }
  const rockGeo = new THREE.IcosahedronGeometry(1, 2);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const k = 1 + Math.sin(x * 6 + z * 4) * .12 + Math.cos(y * 7 - z * 3) * .08;
    rp.setXYZ(i, x * k, y * k, z * k);
  }
  rockGeo.computeVertexNormals(); trackGeo(shared, rockGeo);
  const rockMat = makeMat(shared, { color: 0xffffff, roughness: 1, metalness: 0 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 18); rocks.castShadow = true; rocks.receiveShadow = true;
  const object = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, n = Math.floor(i / 2);
    object.position.set(side * (26 + hash2(i, 1, 123) * 8), .6 + hash2(i, 2, 124), 24 - n * 8);
    object.scale.set(2.8 + hash2(i, 3, 125) * 2.5, 1.5 + hash2(i, 4, 126) * 2.6, 2.8 + hash2(i, 5, 127) * 2.4);
    object.rotation.set(.1, hash2(i, 6, 128) * 6, .08); object.updateMatrix(); rocks.setMatrixAt(i, object.matrix);
    color.setHex(0xc2b894).offsetHSL(0, -.03, (hash2(i, 7, 129) - .5) * .1); rocks.setColorAt(i, color);
  }
  rocks.instanceMatrix.needsUpdate = true; rocks.instanceColor.needsUpdate = true;
  shared.meshes.push(rocks); group.add(rocks); return group;
}

function archCutWall(w, h, d, archW, archH) {
  // Outer wall with arched opening via CSG-free composition: left/right/top slabs + arch ring
  const parts = [];
  const gap = archW;
  const leftW = (w - gap) * 0.5;
  if (leftW > 0.05) {
    parts.push(transformGeo(new THREE.BoxGeometry(leftW, h, d), { x: -w * 0.5 + leftW * 0.5, y: h * 0.5 }));
    parts.push(transformGeo(new THREE.BoxGeometry(leftW, h, d), { x: w * 0.5 - leftW * 0.5, y: h * 0.5 }));
  }
  const lintelH = Math.max(0.4, h - archH);
  parts.push(transformGeo(new THREE.BoxGeometry(gap + 0.15, lintelH, d * 0.92), {
    y: archH + lintelH * 0.5,
  }));
  // Arch voussoirs as merged wedge boxes
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI;
    const a1 = ((i + 1) / segments) * Math.PI;
    const mid = (a0 + a1) * 0.5;
    const r = gap * 0.5;
    const bx = Math.cos(mid) * (r + 0.18);
    const by = archH - r + Math.sin(mid) * (r + 0.18);
    parts.push(transformGeo(new THREE.BoxGeometry((r + 0.18) * Math.PI / segments + 0.05, 0.42, d), {
      x: bx, y: by, rz: mid - Math.PI * 0.5,
    }));
  }
  // Base sill
  parts.push(transformGeo(new THREE.BoxGeometry(gap + 0.3, 0.045, d * 1.05), { y: 0.02 }));
  return parts;
}

// Every obstacle in LAYOUT must render at its own x/z/w/d/h -- this file never
// hardcodes a specific map's coordinates, so the same code renders whichever
// obstacle list core ships (including a freshly added secondary gate/cover).
function classifyObstacle(obs) {
  if (obs.kind === 'cover' || obs.kind === 'wall' || obs.kind === 'house') return obs.kind;
  if (obs.h <= 1.6) return 'cover'; // knee-height: physical to both postures, visually never a full wall
  const thin = Math.min(obs.w, obs.d);
  const long = Math.max(obs.w, obs.d);
  if (thin <= 3 && long >= 6 && obs.h >= 4) return 'wall';
  if (obs.w >= 4 && obs.d >= 4) return 'house';
  return 'wall';
}

// Groups same-line wall obstacles (sharing a z-band) so gaps between them can
// be found generically, then returns every navigable gap in that line widest
// first. The widest gap gets the formal arch; narrower ones (side gates) stay
// open so a route never reads as a sealed decorative wall.
function clusterWallsByLine(walls) {
  const used = new Array(walls.length).fill(false);
  const lines = [];
  for (let i = 0; i < walls.length; i++) {
    if (used[i]) continue;
    const group = [walls[i]];
    used[i] = true;
    for (let j = i + 1; j < walls.length; j++) {
      if (used[j]) continue;
      if (Math.abs(walls[j].z - walls[i].z) <= Math.max(walls[j].d, walls[i].d, 2) + 1) {
        group.push(walls[j]);
        used[j] = true;
      }
    }
    lines.push(group);
  }
  return lines;
}

function findWallGateGaps(walls) {
  const gaps = [];
  for (const group of clusterWallsByLine(walls)) {
    if (group.length < 2) continue;
    const sorted = group.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i], next = sorted[i + 1];
      const gapStart = cur.x + cur.w / 2, gapEnd = next.x - next.w / 2;
      const width = gapEnd - gapStart;
      if (width > 1.2 && width < 16) {
        gaps.push({
          x: (gapStart + gapEnd) / 2, z: (cur.z + next.z) / 2, width,
          h: Math.min(cur.h, next.h), d: Math.min(cur.d, next.d),
        });
      }
    }
  }
  gaps.sort((a, b) => b.width - a.width);
  return gaps;
}

function buildBuildings(shared, layout) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const stoneParts = [];
  const detailParts = [];
  const roofParts = [];
  const obstacles = layout.obstacles || [];
  const kinds = obstacles.map(classifyObstacle);
  const walls = obstacles.filter((o, i) => kinds[i] === 'wall');
  const gateGaps = findWallGateGaps(walls);
  const mainGate = gateGaps[0] || null; // widest gap only -- the formal city gate

  obstacles.forEach((obs, i) => {
    const { x, z, w, d, h } = obs;
    const kind = kinds[i];

    if (kind === 'wall') {
      stoneParts.push(transformGeo(new THREE.BoxGeometry(w, h, d), { x, y: h * 0.5, z }));
      // Merlon-like parapet; offsets stay inside this obstacle's own half-width
      // (max 0.42w) so a segment can never visually spill into a neighbor's gap.
      for (let i2 = -3; i2 <= 3; i2++) {
        const px = x + (i2 / 3) * (w * 0.42);
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.55, 0.45, d * 0.7), {
          x: px, y: h + 0.2, z,
        }));
      }
    } else if (kind === 'house') {
      // Face the door/windows toward whichever side is closer to the walkable
      // spine, so a village house dropped anywhere in a new layout still looks
      // inhabited instead of presenting a blank wall to the player.
      const faceX = Math.abs(x) > Math.abs(z) * 0.6;
      const sign = faceX ? (x >= 0 ? -1 : 1) : (z >= 0 ? -1 : 1);
      const span = faceX ? d : w;
      const doorRy = faceX ? Math.PI / 2 : 0;
      const baseX = faceX ? x + sign * (w * 0.5 + 0.02) : x;
      const baseZ = faceX ? z : z + sign * (d * 0.5 + 0.02);

      stoneParts.push(transformGeo(new THREE.BoxGeometry(w, h, d), { x, y: h * 0.5, z }));
      roofParts.push(transformGeo(new THREE.BoxGeometry(w * 1.04, 0.28, d * 1.04), {
        x, y: h + 0.1, z,
      }));
      detailParts.push(transformGeo(new THREE.BoxGeometry(1.1, 2.1, 0.12), {
        x: baseX, y: 1.05, z: baseZ, ry: doorRy,
      }));
      for (const off of [-span * 0.22, span * 0.22]) {
        const wx = faceX ? baseX : baseX + off;
        const wz = faceX ? baseZ + off : baseZ;
        detailParts.push(transformGeo(new THREE.BoxGeometry(0.7, 0.85, 0.1), { x: wx, y: 2.6, z: wz, ry: doorRy }));
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.85, 0.18, 0.18), { x: wx, y: 3.1, z: wz, ry: doorRy }));
      }
      if (!faceX) {
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.45, h * 0.85, 0.45), {
          x: x - w * 0.5 - 0.1, y: h * 0.4, z: z + d * 0.2,
        }));
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.45, h * 0.85, 0.45), {
          x: x + w * 0.5 + 0.1, y: h * 0.4, z: z - d * 0.15,
        }));
      } else {
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.45, h * 0.85, 0.45), {
          x: x + w * 0.2, y: h * 0.4, z: z - d * 0.5 - 0.1,
        }));
        stoneParts.push(transformGeo(new THREE.BoxGeometry(0.45, h * 0.85, 0.45), {
          x: x - w * 0.15, y: h * 0.4, z: z + d * 0.5 + 0.1,
        }));
      }
    } else {
      // Low physical cover (crate/rubble garden wall height, exactly obs.h --
      // never routed through the wall/house builders, so it can never read as
      // a full wall or accidentally grow into a tower).
      const blocks = Math.max(1, Math.round(w / 0.9));
      for (let b = 0; b < blocks; b++) {
        const bw = w / blocks;
        const bx = x - w / 2 + bw * (b + 0.5);
        const jitter = (hash2(bx, z, 140 + b) - 0.5) * 0.08;
        const bh = clamp(h * (0.86 + hash2(bx, z, 141) * 0.2), h * 0.6, h);
        stoneParts.push(transformGeo(new THREE.BoxGeometry(Math.max(0.1, bw - 0.05), bh, Math.max(0.1, d - 0.05)), {
          x: bx + jitter, y: bh / 2, z,
        }));
      }
    }
  });

  // Edge pilasters mark every non-main gap as an obvious, intentionally open
  // route (half wall-height, set back from the opening) -- never a decorative
  // gate that could misread as resealing a side route core marks walkable.
  for (const gap of gateGaps) {
    if (gap === mainGate) continue;
    for (const side of [-1, 1]) {
      const px = gap.x + side * (gap.width / 2 - 0.21);
      stoneParts.push(transformGeo(new THREE.BoxGeometry(0.42, gap.h * 0.42, Math.max(1.2, gap.d)), {
        x: px, y: gap.h * 0.21, z: gap.z,
      }));
    }
  }

  // Small relief blocks and recessed mortar provide actual surface depth while
  // remaining in the single architecture draw call. Low cover never gets this
  // treatment -- a stacked-crate height has no meaningful brick courses.
  obstacles.forEach((obs, i) => {
    if (kinds[i] === 'cover') return;
    const rowHeight = 0.62;
    const rows = Math.floor(obs.h / rowHeight);
    for (let row = 0; row < rows; row++) {
      const count = Math.ceil(obs.w / 1.35);
      const width = obs.w / count;
      for (let col = 0; col < count; col++) {
        const offset = row % 2 ? width * 0.35 : 0;
        const left = -obs.w / 2 + col * width + offset;
        const available = Math.min(width - 0.045, obs.w / 2 - left);
        if (available < 0.15) continue;
        stoneParts.push(transformGeo(new THREE.BoxGeometry(available, rowHeight - 0.045, 0.065), {
          x: obs.x + left + available / 2,
          y: row * rowHeight + rowHeight / 2,
          z: obs.z + obs.d / 2 + 0.025 + hash2(row, col, 120) * 0.02,
        }));
      }
    }
    for (const side of [-1, 1]) {
      const columns = Math.ceil(obs.d / 1.3), depth = obs.d / columns;
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        stoneParts.push(transformGeo(new THREE.BoxGeometry(.065, rowHeight - .045, depth - .045), {
          x: obs.x + side * (obs.w / 2 + .025),
          y: row * rowHeight + rowHeight / 2,
          z: obs.z - obs.d / 2 + depth * (col + .5),
        }));
      }
      if (obs.d >= 5) for (const dz of [-1.3, 1.3]) detailParts.push(transformGeo(new THREE.BoxGeometry(.08, .78, .62), {
        x: obs.x + side * (obs.w / 2 + .08), y: 2.8, z: obs.z + dz,
      }));
    }
    if (obs.d >= 5) {
      // Cedar joist ends and roof baskets break the repeated house silhouette.
      for (let col = -2; col <= 2; col++) detailParts.push(transformGeo(new THREE.BoxGeometry(0.14, 0.16, 0.38), {
        x: obs.x + col * 0.8, y: obs.h - 0.24, z: obs.z + obs.d / 2 + 0.1,
      }));
    }
  });

  // City gate: a thin arch overlay spanning the single widest wall gap. The
  // gap itself is left open by the wall-obstacle loop above (no slab is drawn
  // across it); this only adds the decorative arch/doors over that real gap.
  if (mainGate) {
    const archDepth = Math.max(1.4, mainGate.d);
    const gateArchParts = archCutWall(mainGate.width + 0.2, mainGate.h, archDepth, mainGate.width, mainGate.h * 0.92);
    for (const bit of gateArchParts) {
      stoneParts.push(transformGeo(bit, { x: mainGate.x, z: mainGate.z }));
    }
    const doorMatColor = 0x6a5238;
    for (const side of [-1, 1]) {
      const door = transformGeo(new THREE.BoxGeometry(mainGate.width * 0.42, mainGate.h * 0.42, 0.14), {
        x: mainGate.x + side * mainGate.width * 0.22,
        y: mainGate.h * 0.21,
        z: mainGate.z,
        ry: Math.PI / 2,
      });
      detailParts.push(paintVertexColors(door, doorMatColor));
    }
  }

  // No unmodeled rectangular terrace bars on the approach. Low boulders and
  // patchy vegetation define its edges without implying invisible collisions.

  const stonePainted = stoneParts.map((g) => paintVertexColors(g, PALETTE.stone, (c, x, y, z) => {
    c.offsetHSL(0, -0.02, (hash2(x, z, 40) - 0.5) * 0.08 + y * 0.01 - 0.04);
  }));
  const stoneMerged = mergeGeometries(stonePainted, false);
  for (const g of stonePainted) if (g !== stoneMerged) g.dispose();
  for (const g of stoneParts) g.dispose?.();
  trackGeo(shared, stoneMerged);
  const stoneMesh = new THREE.Mesh(stoneMerged, makeMat(shared, {
    vertexColors: true, roughness: 0.94, metalness: 0.02,
  }));
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  stoneMesh.name = 'stone-architecture';
  group.add(stoneMesh);

  if (detailParts.length) {
    const detPainted = detailParts.map((g) => (g.getAttribute('color')
      ? g
      : paintVertexColors(g, PALETTE.stoneShade)));
    const detMerged = mergeGeometries(detPainted, false);
    for (const g of detPainted) if (g !== detMerged) g.dispose();
    trackGeo(shared, detMerged);
    const detMesh = new THREE.Mesh(detMerged, makeMat(shared, {
      vertexColors: true, roughness: 0.9, metalness: 0,
    }));
    detMesh.castShadow = true;
    detMesh.name = 'arch-details';
    group.add(detMesh);
  }

  if (roofParts.length) {
    const roofPainted = roofParts.map((g) => paintVertexColors(g, PALETTE.sandDeep, (c) => c.offsetHSL(0.02, 0, -0.05)));
    const roofMerged = mergeGeometries(roofPainted, false);
    for (const g of roofPainted) if (g !== roofMerged) g.dispose();
    trackGeo(shared, roofMerged);
    group.add(new THREE.Mesh(roofMerged, makeMat(shared, {
      vertexColors: true, roughness: 1, metalness: 0,
    })));
  }

  return group;
}

function buildWell(shared, layout) {
  const group = new THREE.Group();
  group.name = 'well';
  const wx = layout.well?.x ?? 0;
  const wz = layout.well?.z ?? -23;
  group.position.set(wx, 0, wz);

  const parts = [];
  // Cylindrical stone curb
  // Open curb: a capped cylinder would hide the water and rope entirely.
  const curb = new THREE.CylinderGeometry(1.35, 1.5, 0.85, 20, 1, true);
  curb.translate(0, 0.42, 0);
  parts.push(paintVertexColors(curb, PALETTE.stone, (c, x, y) => c.offsetHSL(0, 0, y * 0.05 - 0.05)));

  const lip = new THREE.TorusGeometry(1.18, 0.2, 6, 24);
  lip.rotateX(Math.PI / 2); lip.translate(0, 0.85, 0);
  parts.push(paintVertexColors(lip, PALETTE.stone));

  // Inner dark shaft ring
  const inner = new THREE.CylinderGeometry(1.05, 1.05, 0.5, 16, 1, true);
  inner.translate(0, 0.35, 0);
  parts.push(paintVertexColors(inner, 0x2a3030));

  // Posts
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.1, 0.12, 2.4, 8);
    post.translate(side * 1.15, 1.55, 0);
    parts.push(paintVertexColors(post, 0x6a5238));
  }
  // Crossbeam
  const beam = new THREE.BoxGeometry(2.5, 0.16, 0.16);
  beam.translate(0, 2.7, 0);
  parts.push(paintVertexColors(beam, 0x5a4230));

  // Pulley wheel
  const wheel = new THREE.TorusGeometry(0.22, 0.05, 6, 14);
  wheel.rotateY(Math.PI / 2);
  wheel.translate(0, 2.55, 0);
  parts.push(paintVertexColors(wheel, PALETTE.bronze));

  const merged = mergeGeometries(parts, false);
  for (const g of parts) if (g !== merged) g.dispose();
  trackGeo(shared, merged);
  const mesh = new THREE.Mesh(merged, makeMat(shared, {
    vertexColors: true, roughness: 0.9, metalness: 0.08,
  }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Water disc
  const waterGeo = trackGeo(shared, new THREE.CircleGeometry(1.0, 24));
  const waterMat = makeMat(shared, {
    color: PALETTE.water,
    roughness: 0.15,
    metalness: 0.35,
    transparent: true,
    opacity: 0.85,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.28;
  water.name = 'well-water';
  group.add(water);

  // Rope (tube along path)
  const ropeCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 2.55, 0),
    new THREE.Vector3(0.15, 1.8, 0.1),
    new THREE.Vector3(0.05, 1.0, -0.05),
    new THREE.Vector3(0, 0.45, 0),
  );
  const ropeGeo = trackGeo(shared, new THREE.TubeGeometry(ropeCurve, 12, 0.025, 5, false));
  const rope = new THREE.Mesh(ropeGeo, makeMat(shared, {
    color: 0x8a7a58, roughness: 1, metalness: 0,
  }));
  rope.name = 'well-rope';
  group.add(rope);

  // Bucket
  const bucketGeo = trackGeo(shared, new THREE.CylinderGeometry(0.18, 0.15, 0.32, 10));
  const bucket = new THREE.Mesh(bucketGeo, makeMat(shared, {
    color: PALETTE.terracotta, roughness: 0.85, metalness: 0,
  }));
  bucket.position.set(0, 0.55, 0);
  bucket.castShadow = true;
  bucket.name = 'well-bucket';
  group.add(bucket);

  // Surrounding paving ring (merged low stones)
  const paveParts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 1.9 + hash2(i, 0, 50) * 0.25;
    paveParts.push(transformGeo(new THREE.BoxGeometry(0.55, 0.12, 0.4), {
      x: Math.cos(a) * r, y: 0.06, z: Math.sin(a) * r, ry: a,
    }));
  }
  const paveMerged = mergeGeometries(paveParts.map((g) => paintVertexColors(g, PALETTE.sandDeep)), false);
  for (const g of paveParts) g.dispose();
  trackGeo(shared, paveMerged);
  const pave = new THREE.Mesh(paveMerged, makeMat(shared, { vertexColors: true, roughness: 1 }));
  pave.receiveShadow = true;
  group.add(pave);

  group.userData.water = water;
  group.userData.bucket = bucket;
  group.userData.rope = rope;
  return group;
}

function buildOliveTreePrototype(shared) {
  // One organic tree: trunk + branches merged; leaves instanced separately
  const trunkParts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 8);
  trunk.translate(0, 0.9, 0);
  // Mild bend via scaled skew approximation — stacked segments
  trunkParts.push(paintVertexColors(trunk, 0x5a4a32, (c, x, y) => c.offsetHSL(0, 0, y * 0.02)));

  const branchDefs = [
    { y: 1.5, ry: 0.4, rz: -0.7, len: 1.1, r: 0.08 },
    { y: 1.65, ry: -0.9, rz: -0.55, len: 0.95, r: 0.07 },
    { y: 1.8, ry: 2.1, rz: -0.65, len: 1.0, r: 0.07 },
    { y: 1.95, ry: 3.4, rz: -0.5, len: 0.75, r: 0.055 },
    { y: 1.4, ry: 1.5, rz: -0.85, len: 0.7, r: 0.06 },
    { y: 2.05, ry: 0.2, rz: -0.35, len: 0.55, r: 0.05 },
  ];
  for (const b of branchDefs) {
    const br = new THREE.CylinderGeometry(b.r * 0.55, b.r, b.len, 6);
    br.translate(0, b.len * 0.5, 0);
    const placed = transformGeo(br, {
      y: b.y, ry: b.ry, rz: b.rz,
    });
    // Extend outward
    const o = new THREE.Object3D();
    o.rotation.set(0, b.ry, b.rz);
    o.updateMatrix();
    const tip = new THREE.Vector3(0, b.len * 0.35, 0).applyMatrix4(o.matrix);
    placed.translate(tip.x * 0.3, 0, tip.z * 0.3);
    trunkParts.push(paintVertexColors(placed, 0x6a5840));
    br.dispose();
  }

  const trunkMerged = mergeGeometries(trunkParts, false);
  for (const g of trunkParts) if (g !== trunkMerged) g.dispose();
  trackGeo(shared, trunkMerged);

  const leafGeo = trackGeo(shared, new THREE.SphereGeometry(0.65, 12, 10));
  const leafPosition = leafGeo.attributes.position;
  for (let i = 0; i < leafPosition.count; i++) {
    const x = leafPosition.getX(i), y = leafPosition.getY(i), z = leafPosition.getZ(i);
    const r = 1 + Math.sin(x * 13 + y * 7) * .045 + Math.sin(z * 11 - y * 9) * .045;
    leafPosition.setXYZ(i, x * r, y * r * .85, z * r);
  }
  leafGeo.computeVertexNormals();
  return { trunkMerged, leafGeo };
}

function placeOlives(shared, layout, prototypes) {
  const group = new THREE.Group();
  group.name = 'olives';
  const matTrunk = makeMat(shared, { vertexColors: true, roughness: 0.95, metalness: 0 });
  const matLeaf = makeMat(shared, {
    // Instance colors already hold the olive palette. Multiplying it by another
    // green material made the canopy nearly black in the actual browser render.
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0,
  });

  const sites = [
    { x: -10, z: 16, s: 1.15 },
    { x: 11, z: 14, s: 1.0 },
    { x: -14, z: 8, s: 0.9 },
    { x: 13, z: 6, s: 1.05 },
    { x: -11, z: 0, s: 0.95 },
    { x: 10, z: -3, s: 1.1 },
    { x: -15, z: -6, s: 0.85 },
    { x: 14, z: -12, s: 1.0 },
    { x: -9, z: -14, s: 0.9 },
    { x: 8, z: -27, s: 0.8 },
    { x: -6, z: 20, s: 0.75 },
    { x: 5, z: 18, s: 0.7 },
    // Shelter olives
    ...(layout.shelters || []).map((s, i) => ({
      x: s.x + (i % 2 ? 0.8 : -0.6),
      z: s.z + (i % 2 ? -0.5 : 0.7),
      s: 0.85 + hash2(s.x, s.z, 60) * 0.25,
    })),
  ];

  // Merge all trunks into one mesh via instancing for draw-call savings
  const trunkMesh = new THREE.InstancedMesh(prototypes.trunkMerged, matTrunk, sites.length);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  trunkMesh.name = 'olive-trunks';
  const dummy = new THREE.Object3D();
  const leafCount = sites.length * 14;
  const leafMesh = new THREE.InstancedMesh(prototypes.leafGeo, matLeaf, leafCount);
  leafMesh.castShadow = true;
  leafMesh.name = 'olive-leaves';
  const color = new THREE.Color();
  let li = 0;
  sites.forEach((site, i) => {
    const ry = hash2(site.x, site.z, 61) * Math.PI * 2;
    dummy.position.set(site.x, 0, site.z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.setScalar(site.s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 14; k++) {
      const a = hash2(i, k, 62) * Math.PI * 2;
      const elev = 1.4 + hash2(i, k, 63) * 1.1;
      const rad = 0.35 + hash2(i, k, 64) * 0.85;
      dummy.position.set(
        site.x + Math.cos(a) * rad * site.s,
        elev * site.s,
        site.z + Math.sin(a) * rad * site.s,
      );
      dummy.rotation.set(hash2(i, k, 65), a, hash2(i, k, 66) * 0.5);
      const ls = (0.55 + hash2(i, k, 67) * 0.7) * site.s;
      dummy.scale.set(ls, ls * 0.75, ls);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(li, dummy.matrix);
      color.setHex(PALETTE.leaf).offsetHSL((hash2(i, k, 68) - 0.5) * 0.045, -0.04, (hash2(i, k, 69) - 0.3) * 0.13);
      leafMesh.setColorAt(li, color);
      li++;
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  group.add(trunkMesh);
  group.add(leafMesh);
  shared.meshes.push(trunkMesh, leafMesh);
  group.userData.leafMesh = leafMesh;
  group.userData.leafCount = li;
  group.userData.sites = sites;
  return group;
}

function buildShelterBushes(shared, layout) {
  const group = new THREE.Group();
  group.name = 'shelters';
  const shelters = layout.shelters || [];
  if (!shelters.length) return group;
  const geo = trackGeo(shared, new THREE.SphereGeometry(1, 8, 6));
  const mat = makeMat(shared, {
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
  });
  const count = shelters.length * 5;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'shelter-bushes';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let i = 0;
  for (const s of shelters) {
    const r = s.radius ?? s.r ?? 2.5;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + hash2(s.x, s.z, k) * 0.4;
      const rad = r * (0.25 + hash2(s.x, k, 70) * 0.45);
      dummy.position.set(s.x + Math.cos(a) * rad, 0.45 + hash2(k, s.z, 71) * 0.35, s.z + Math.sin(a) * rad);
      dummy.scale.set(
        0.7 + hash2(s.x, k, 72) * 0.5,
        0.55 + hash2(s.z, k, 73) * 0.45,
        0.7 + hash2(k, 0, 74) * 0.5,
      );
      dummy.rotation.y = a;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHex(k % 2 ? PALETTE.olive : PALETTE.oliveDark).offsetHSL(0, 0, (hash2(i, 0, 75) - 0.5) * 0.08);
      mesh.setColorAt(i, color);
      i++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
  shared.meshes.push(mesh);
  return group;
}

function buildGrass(shared, layout) {
  const group = new THREE.Group();
  group.name = 'grass';
  const tuftPositions = [];
  for (let j = 0; j < 4; j++) {
    const angle = j * Math.PI * .62, rx = Math.cos(angle), rz = Math.sin(angle);
    const height = .2 + j * .035, width = .055;
    const lean = .1 + j * .025;
    tuftPositions.push(-rx * width, 0, -rz * width, rx * width, 0, rz * width, rx * (width + lean * .5), height * .58, rz * (width + lean * .5));
    tuftPositions.push(-rx * width, 0, -rz * width, rx * (width + lean * .5), height * .58, rz * (width + lean * .5), rx * lean, height, rz * lean);
  }
  const blade = trackGeo(shared, new THREE.BufferGeometry());
  blade.setAttribute('position', new THREE.Float32BufferAttribute(tuftPositions, 3)); blade.computeVertexNormals();
  const mat = makeMat(shared, {
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const count = 1800;
  const mesh = new THREE.InstancedMesh(blade, mat, count);
  mesh.name = 'grass-blades';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  let placed = 0;
  for (let i = 0; i < count * 2 && placed < count; i++) {
    const patches = [[-10,16],[11,14],[-14,8],[13,6],[-11,0],[10,-3],[-15,-6],[14,-12],[-9,-11],[6,-27],[-6,20],[5,18],[-8,10],[8,1],[-7,-8],[6,-21]];
    const patch = patches[i % patches.length];
    const angle = hash2(i, 1, 80) * Math.PI * 2;
    const radius = Math.sqrt(hash2(i, 2, 81)) * 3.8;
    const x = i % 7 ? patch[0] + Math.cos(angle) * radius : lerp(minX + 1, maxX - 1, hash2(i, 1, 80));
    const z = i % 7 ? patch[1] + Math.sin(angle) * radius : lerp(minZ + 2, maxZ - 1, hash2(i, 2, 81));
    if ((layout.obstacles || []).some(o => Math.abs(x-o.x)<o.w/2+.3&&Math.abs(z-o.z)<o.d/2+.3)) continue;
    if (Math.abs(x) < 2.2 && z > -26 && z < 25) continue; // keep path clear
    if (Math.hypot(x - (layout.well?.x ?? 0), z - (layout.well?.z ?? -23)) < 2.5) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = hash2(i, 3, 82) * Math.PI * 2;
    dummy.rotation.z = (hash2(i, 4, 83) - 0.5) * 0.25;
    const s = 0.6 + hash2(i, 5, 84) * 0.9;
    dummy.scale.set(s, s * (0.8 + hash2(i, 6, 85) * 0.6), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHex(hash2(i, 7, 86) > 0.5 ? 0x8a9a58 : 0x6a7a40).offsetHSL(0, 0, (hash2(i, 8, 87) - 0.5) * 0.1);
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
  shared.meshes.push(mesh);
  group.userData.mesh = mesh;
  return group;
}

function buildProps(shared, layout) {
  const group = new THREE.Group();
  group.name = 'props';
  const swayItems = [];

  // Pots — instanced lathe jars
  const jar = trackGeo(shared, new THREE.LatheGeometry([
    [0, 0], [0.05, 0], [0.07, 0.04], [0.09, 0.1], [0.07, 0.18],
    [0.04, 0.22], [0.04, 0.25], [0.05, 0.255], [0.035, 0.255], [0.03, 0.22], [0, 0.18],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 10));
  const jarMat = makeMat(shared, { color: PALETTE.terracotta, roughness: 0.88, metalness: 0 });
  const jarSites = [
    { x: -10.5, z: -22.5 }, { x: -9.8, z: -23.2 }, { x: 10.2, z: -22.8 },
    { x: 11, z: -23.5 }, { x: -3, z: 22 }, { x: 2.5, z: 21.5 },
    { x: -13, z: -14 }, { x: 12.5, z: -14.5 }, { x: 0.8, z: -21.5 },
    { x: -1.2, z: -22 },
  ];
  const jars = new THREE.InstancedMesh(jar, jarMat, jarSites.length);
  jars.castShadow = true;
  jars.name = 'pots';
  const dummy = new THREE.Object3D();
  jarSites.forEach((s, i) => {
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.y = hash2(s.x, s.z, 90) * Math.PI;
    const sc = 2.5 + hash2(s.x, s.z, 91) * 1.5;
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    jars.setMatrixAt(i, dummy.matrix);
  });
  jars.instanceMatrix.needsUpdate = true;
  group.add(jars);
  shared.meshes.push(jars);

  // Awnings / cloth banners
  const clothMat = makeMat(shared, {
    color: PALETTE.clothTerracotta,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const clothMat2 = makeMat(shared, {
    color: PALETTE.clothCream,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const awningSites = [
    { x: -12, z: -20.5, w: 3.2, d: 1.8, mat: clothMat },
    { x: 12, z: -20.5, w: 3.0, d: 1.6, mat: clothMat2 },
    { x: -8, z: -14.2, w: 2.4, d: 1.2, mat: clothMat2 },
    { x: 7, z: -14.2, w: 2.2, d: 1.1, mat: clothMat },
  ];
  for (const a of awningSites) {
    const geo = trackGeo(shared, new THREE.PlaneGeometry(a.w, a.d, 6, 3));
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / a.w;
      const v = pos.getY(i) / a.d;
      pos.setZ(i, -Math.sin((u + 0.5) * Math.PI) * 0.15 - v * 0.08);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, a.mat);
    mesh.position.set(a.x, 3.4, a.z);
    mesh.rotation.x = -Math.PI / 2 + 0.2;
    mesh.castShadow = true;
    mesh.name = 'awning';
    group.add(mesh);
    swayItems.push({ mesh, baseY: 3.4, amp: 0.04, phase: hash2(a.x, a.z, 92) * Math.PI * 2, kind: 'awning' });
  }

  // Vertical cloth banners on gate
  for (const side of [-1, 1]) {
    const geo = trackGeo(shared, new THREE.PlaneGeometry(0.7, 2.2, 3, 8));
    const mesh = new THREE.Mesh(geo, side > 0 ? clothMat : clothMat2);
    mesh.position.set(side * 3.6, 2.8, -14.6);
    mesh.castShadow = true;
    mesh.name = 'banner';
    group.add(mesh);
    swayItems.push({ mesh, baseY: 2.8, amp: 0.08, phase: side, kind: 'banner' });
  }

  // Torches near gate and camp
  const torchGroup = new THREE.Group();
  torchGroup.name = 'torches';
  const torchSites = [
    { x: -4.6, z: -14.2 }, { x: 4.6, z: -14.2 },
    { x: -2.5, z: 22.5 }, { x: 2.5, z: 22.5 },
  ];
  const poleGeo = trackGeo(shared, new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6));
  const flameGeo = trackGeo(shared, new THREE.ConeGeometry(0.12, 0.35, 6));
  const poleMat = makeMat(shared, { color: 0x3a3028, roughness: 1 });
  const flameMat = makeMat(shared, {
    color: PALETTE.torch,
    emissive: PALETTE.torch,
    emissiveIntensity: 0.85,
    roughness: 0.6,
  });
  const torchLights = [];
  for (const t of torchSites) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(t.x, 0.8, t.z);
    pole.castShadow = true;
    torchGroup.add(pole);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(t.x, 1.75, t.z);
    flame.name = 'flame';
    torchGroup.add(flame);
    const light = new THREE.PointLight(0xff9944, 0.55, 8, 2);
    light.position.set(t.x, 1.9, t.z);
    torchGroup.add(light);
    torchLights.push({ light, flame, phase: hash2(t.x, t.z, 93) * 10 });
    swayItems.push({ mesh: flame, baseY: 1.75, amp: 0.05, phase: hash2(t.x, t.z, 94), kind: 'flame' });
  }
  group.add(torchGroup);
  group.userData.torchLights = torchLights;

  // Camp low wall / stones near David
  const campParts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI + 0.2;
    campParts.push(transformGeo(new THREE.BoxGeometry(0.5, 0.35, 0.4), {
      x: Math.cos(a) * 2.2,
      y: 0.18,
      z: 23 + Math.sin(a) * 1.4 - 1.2,
      ry: a,
    }));
  }
  const campMerged = mergeGeometries(campParts.map((g) => paintVertexColors(g, PALETTE.stoneShade)), false);
  for (const g of campParts) g.dispose();
  trackGeo(shared, campMerged);
  const camp = new THREE.Mesh(campMerged, makeMat(shared, { vertexColors: true, roughness: 1 }));
  camp.castShadow = true;
  camp.receiveShadow = true;
  group.add(camp);

  // Terrace foliage clumps (instanced)
  const foliageGeo = trackGeo(shared, new THREE.SphereGeometry(0.35, 6, 5));
  const foliageMat = makeMat(shared, { color: 0x5d7048, roughness: 0.9 });
  const foliageSites = [];
  for (const base of [[-16, 5], [15, -2], [-14, -10], [13, 12], [-12, -21], [12, -21]]) {
    for (let k = 0; k < 4; k++) {
      foliageSites.push({
        x: base[0] + (hash2(base[0], k, 95) - 0.5) * 2.5,
        z: base[1] + (hash2(base[1], k, 96) - 0.5) * 1.8,
      });
    }
  }
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, foliageSites.length);
  foliage.castShadow = true;
  foliageSites.forEach((s, i) => {
    dummy.position.set(s.x, 0.55, s.z);
    dummy.scale.setScalar(0.7 + hash2(s.x, s.z, 97) * 0.6);
    dummy.rotation.y = hash2(s.x, s.z, 98) * 6;
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
  });
  foliage.instanceMatrix.needsUpdate = true;
  group.add(foliage);
  shared.meshes.push(foliage);

  group.userData.swayItems = swayItems;
  return group;
}

/* ─── Stealth feedback (cones/suspicion/search/noise) ──────────────── */
// Warm parchment/bronze canvas glyphs, built once and reused every frame --
// deliberately not a flat neon HUD overlay. Keeping these as real in-world
// sprites (not DOM/CSS) also keeps them inside the owned render module.
function makeCanvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildStealthIconTextures() {
  const suspicion = makeCanvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(42,30,20,0.72)';
    ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.32, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c87a';
    ctx.font = `bold ${Math.round(s * 0.42)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', s / 2, s * 0.56);
  });
  const alert = makeCanvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(61,24,18,0.78)';
    ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.32, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0a25c';
    ctx.font = `bold ${Math.round(s * 0.46)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', s / 2, s * 0.57);
  });
  return { suspicion, alert };
}

// Per-guard suspicion gauge: a fixed bronze track sprite plus a plain-color
// fill sprite whose scale/offset is updated in place each frame (no texture
// redraw, no per-frame allocation).
function buildSuspicionGaugeMaterials(shared) {
  const trackTex = makeCanvasTexture(96, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const w = s * 0.86, h = s * 0.22, x = (s - w) / 2, y = (s - h) / 2;
    ctx.fillStyle = 'rgba(30,22,14,0.55)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  });
  // Sprite meshes require THREE.SpriteMaterial specifically (not the
  // MeshStandardMaterial that makeMat() builds for ordinary surfaces).
  const trackMat = new THREE.SpriteMaterial({ map: trackTex, transparent: true, depthTest: false });
  const fillMat = new THREE.SpriteMaterial({ color: 0xe8b15a, transparent: true, depthTest: false });
  shared.materials.push(trackMat, fillMat);
  if (shared.textures) shared.textures.push(trackTex);
  return { trackTex, trackMat, fillMat };
}

function buildSkyDome(shared) {
  const geo = trackGeo(shared, new THREE.SphereGeometry(150, 32, 20));
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexColors: true, toneMapped: false,
  });
  shared.materials.push(mat);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const ground = new THREE.Color(0xb89870);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 150;
    if (y > 0.05) c.copy(horizon).lerp(top, clamp((y - 0.05) / 0.7, 0, 1));
    else c.copy(horizon).lerp(ground, clamp((-y + 0.05) / 0.3, 0, 1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  return mesh;
}

function buildMotes(shared) {
  const count = 80;
  const geo = trackGeo(shared, new THREE.BufferGeometry());
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (hash2(i, 1, 100) - 0.5) * 40;
    positions[i * 3 + 1] = 1 + hash2(i, 2, 101) * 8;
    positions[i * 3 + 2] = (hash2(i, 3, 102) - 0.5) * 50;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffe6c0,
    size: 0.08,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
  });
  shared.materials.push(mat);
  const points = new THREE.Points(geo, mat);
  points.name = 'motes';
  points.userData.base = positions.slice();
  return points;
}

function buildLights(shared, quality) {
  const group = new THREE.Group();
  group.name = 'world-lights';

  const hemi = new THREE.HemisphereLight(0xc8dcef, 0x8a7255, 1.25);
  hemi.name = 'hemi';
  group.add(hemi);

  const amb = new THREE.AmbientLight(0xffe0c0, 0.22);
  group.add(amb);

  const sun = new THREE.DirectionalLight(0xffe8c4, 3.0);
  sun.position.set(-28, 34, 18);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  sun.name = 'sun';
  group.add(sun);
  group.add(sun.target);
  sun.target.position.set(0, 0, -8);

  const fill = new THREE.DirectionalLight(0x9bbdde, 0.45);
  fill.position.set(20, 12, -10);
  fill.name = 'fill';
  group.add(fill);

  const rim = new THREE.DirectionalLight(0xffaa88, 0.2);
  rim.position.set(0, 8, -40);
  group.add(rim);

  shared.lights = { hemi, amb, sun, fill, rim, group };
  return group;
}

function resolveLayout(layout) {
  const base = layout && typeof layout === 'object' ? layout : {};
  return {
    start: base.start || FALLBACK_LAYOUT.start,
    well: base.well || FALLBACK_LAYOUT.well,
    bounds: base.bounds || FALLBACK_LAYOUT.bounds,
    obstacles: Array.isArray(base.obstacles) && base.obstacles.length
      ? base.obstacles
      : FALLBACK_LAYOUT.obstacles,
    shelters: Array.isArray(base.shelters) && base.shelters.length
      ? base.shelters
      : FALLBACK_LAYOUT.shelters,
  };
}

/* ─── Public API ─────────────────────────────────────────────── */

export function createBethlehemWorld({ scene, renderer, layout } = {}) {
  if (!scene) throw new TypeError('createBethlehemWorld requires scene');

  const L = resolveLayout(layout);
  const shared = {
    materials: [],
    geometries: [],
    meshes: [],
    textures: [],
    lights: null,
  };

  const root = new THREE.Group();
  root.name = 'bethlehem-water-world';

  let quality = 'standard';
  if (renderer?.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // Atmosphere
  const oldFog = scene.fog, oldBackground = scene.background;
  scene.fog = new THREE.Fog(PALETTE.fog, 72, 180);
  scene.background = new THREE.Color(0xcadbdc);

  root.add(buildSkyDome(shared));
  root.add(buildMountains(shared));
  root.add(buildGround(shared, L));
  root.add(buildBuildings(shared, L));
  const well = buildWell(shared, L);
  root.add(well);
  const oliveProto = buildOliveTreePrototype(shared);
  const olives = placeOlives(shared, L, oliveProto);
  root.add(olives);
  root.add(buildShelterBushes(shared, L));
  const grass = buildGrass(shared, L);
  root.add(grass);
  const props = buildProps(shared, L);
  root.add(props);
  const motes = buildMotes(shared);
  root.add(motes);
  const lights = buildLights(shared, quality);
  root.add(lights);

  // Characters
  const player = buildHuman(shared, {
    name: 'player-warrior',
    tunic: PALETTE.tunicWarrior,
    sash: 0x4a3020,
    hair: PALETTE.hair,
    hat: 'cloth',
    scale: 1,
  });
  const companions = [
    buildHuman(shared, { name: 'companion-ochre', tunic: PALETTE.tunicCompanion, beard: true, scale: 1.04 }),
    buildHuman(shared, { name: 'companion-clay', tunic: PALETTE.tunicCompanion2, cloak: 0x665b4b, hat: 'cloth', scale: 0.98 }),
  ];
  const guards = Array.from({ length: Array.isArray(layout?.guards) ? layout.guards.length : 3 }, (_, i) =>
    buildHuman(shared, { name: `guard-${i}`, tunic: PALETTE.tunicGuard, armor: true, hat: 'helmet', scale: 1.03 }));
  const david = buildHuman(shared, {
    name: 'david-at-camp', tunic: PALETTE.tunicDavid,
    cloak: PALETTE.cloakDavid, beard: true, scale: 1.06,
  });
  david.root.position.set(L.start.x + 1.7, 0, L.start.z + 0.4);
  david.root.rotation.y = -Math.PI * 0.65;
  const allHumans = [player, ...companions, ...guards, david];
  for (const human of allHumans) root.add(human.root);
  attachWaterSkin(shared, player).visible = false;
  attachWaterSkin(shared, david).visible = false;

  // Spear silhouettes make guards distinguishable even at phone scale.
  const spearGeo = trackGeo(shared, new THREE.CylinderGeometry(0.022, 0.028, 2.35, 5));
  const spearMat = makeMat(shared, { color: 0x4e3827, roughness: 0.85 });
  const tipGeo = trackGeo(shared, new THREE.ConeGeometry(0.07, 0.28, 5));
  const tipMat = makeMat(shared, { color: 0xac9169, metalness: 0.4, roughness: 0.5 });
  for (const guard of guards) {
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(spearGeo, spearMat); shaft.castShadow = true;
    const tip = new THREE.Mesh(tipGeo, tipMat); tip.position.y = 1.29;
    spear.add(shaft, tip); spear.position.set(0.52, 1.15, 0.05);
    guard.root.add(spear);
  }

  const playerRingGeo = trackGeo(shared, new THREE.RingGeometry(0.53, 0.59, 40));
  const playerRingMat = new THREE.MeshBasicMaterial({ color: 0xffefc5, transparent: true, opacity: 0.7, depthWrite: false });
  shared.materials.push(playerRingMat);
  const playerRing = new THREE.Mesh(playerRingGeo, playerRingMat);
  playerRing.rotation.x = -Math.PI / 2; playerRing.position.y = 0.025; root.add(playerRing);

  const targetRingGeo = trackGeo(shared, new THREE.RingGeometry(2.1, 2.16, 56));
  const targetRingMat = new THREE.MeshBasicMaterial({ color: 0xfbe9b5, transparent: true, opacity: 0.48, depthWrite: false });
  shared.materials.push(targetRingMat);
  const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
  targetRing.rotation.x = -Math.PI / 2; targetRing.position.set(L.well.x, 0.035, L.well.z); root.add(targetRing);

  // Truncated guard sight cones: when core ships sightPolygon(guard,crouching)
  // we render exactly what core computed (same fan, same occlusion); until
  // then this falls back to an equivalent local raycast using the same
  // crouch-aware classification as the physical obstacle renderer above, so
  // low cover only blocks the cone while the player target is crouching.
  const rayCount = 32;
  const FALLBACK_SIGHT_RANGE = 9;
  const FALLBACK_CROUCH_SIGHT_RANGE = 4.5;
  const FALLBACK_FOV_HALF = Math.PI / 3;
  const obstacleKinds = L.obstacles.map(classifyObstacle);
  function blockedForSight(x, z, crouchingTarget) {
    for (let i = 0; i < L.obstacles.length; i++) {
      const o = L.obstacles[i];
      if (Math.abs(x - o.x) > o.w / 2 + 0.4 || Math.abs(z - o.z) > o.d / 2 + 0.4) continue;
      if (obstacleKinds[i] === 'cover' && !crouchingTarget) continue; // low cover: standing sight passes over it
      return true;
    }
    return false;
  }
  function fallbackSightPolygon(actor, crouchingTarget) {
    const range = crouchingTarget ? FALLBACK_CROUCH_SIGHT_RANGE : FALLBACK_SIGHT_RANGE;
    const pts = [{ x: actor.x, z: actor.z }];
    for (let j = 0; j <= rayCount; j++) {
      const angle = (actor.heading || 0) - FALLBACK_FOV_HALF + (j / rayCount) * FALLBACK_FOV_HALF * 2;
      const dx = Math.sin(angle), dz = Math.cos(angle);
      let length = range;
      for (let d = 0.25; d <= range; d += 0.25) {
        if (blockedForSight(actor.x + dx * d, actor.z + dz * d, crouchingTarget)) { length = Math.max(0, d - 0.25); break; }
      }
      pts.push({ x: actor.x + dx * length, z: actor.z + dz * length });
    }
    return pts;
  }
  function computeSightPolygon(actor, crouchingTarget) {
    if (typeof core.sightPolygon === 'function') {
      try {
        const poly = core.sightPolygon(actor, !!crouchingTarget);
        if (Array.isArray(poly) && poly.length > 2) return poly;
      } catch {
        // core export exists but threw (e.g. not fully wired yet) -- use the
        // local fallback below rather than breaking the render frame.
      }
    }
    return fallbackSightPolygon(actor, crouchingTarget);
  }
  // Fixed-capacity buffer avoids per-frame allocation regardless of exactly
  // how many vertices core's sightPolygon returns; setDrawRange trims the
  // unused tail so a shorter polygon never renders stale old triangles.
  const CONE_CAPACITY = 128;
  // Saturated cool color and stronger fill stay visible against warm sand.
  // The flat playable ground is y=-.015; y=.045 clears it. Depth testing keeps
  // the cone on the ground rather than painting it through walls/characters.
  // The radar retains the unobstructed top-down tactical view.
  const cones = guards.map(() => {
    const geometry = trackGeo(shared, new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONE_CAPACITY * 3), 3));
    const indices = [];
    for (let j = 0; j < CONE_CAPACITY - 2; j++) indices.push(0, j + 1, j + 2);
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      color: SIGHT_COLORS.patrol, transparent: true, opacity: SIGHT_OPACITY.patrol, side: THREE.DoubleSide, depthWrite: false, depthTest: true, toneMapped: false,
    });
    shared.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'guard-sight'; mesh.frustumCulled = false; mesh.renderOrder = 5;
    root.add(mesh);
    const outlineGeo = trackGeo(shared, new THREE.BufferGeometry());
    outlineGeo.setAttribute('position', geometry.attributes.position);
    outlineGeo.setDrawRange(0, 0);
    const outlineMat = new THREE.LineBasicMaterial({ color: SIGHT_COLORS.patrol, transparent: true, opacity: 0.96, depthWrite: false, depthTest: true, toneMapped: false });
    shared.materials.push(outlineMat);
    const outline = new THREE.LineLoop(outlineGeo, outlineMat); outline.frustumCulled = false; outline.renderOrder = 6;
    root.add(outline);
    return { mesh, outline };
  });

  // Suspicion/mode feedback: warm bronze gauge + ?/! glyph per guard, plus a
  // last-known-position marker. All geometry/materials are built once here;
  // update() only mutates transforms/opacity/scale, never allocates.
  const stealthIcons = buildStealthIconTextures();
  shared.textures.push(stealthIcons.suspicion, stealthIcons.alert);
  const iconMatSuspicion = new THREE.SpriteMaterial({ map: stealthIcons.suspicion, transparent: true, depthTest: false });
  const iconMatAlert = new THREE.SpriteMaterial({ map: stealthIcons.alert, transparent: true, depthTest: false });
  shared.materials.push(iconMatSuspicion, iconMatAlert);
  const gauge = buildSuspicionGaugeMaterials(shared);
  // Shared geometry/material avoids duplicate resource allocation. Individual
  // marker meshes still add draw calls per guard; this is not instancing.
  const markerFlameGeo = trackGeo(shared, new THREE.ConeGeometry(0.08, 0.22, 6));
  const markerFlameMat = makeMat(shared, { color: PALETTE.torch, emissive: PALETTE.torch, emissiveIntensity: 0.8, roughness: 0.6 });
  const markerStakeGeo = trackGeo(shared, new THREE.CylinderGeometry(0.03, 0.045, 0.55, 5));
  const markerStakeMat = makeMat(shared, { color: 0x3a3028, roughness: 1 });
  const guardUi = guards.map(() => {
    const track = new THREE.Sprite(gauge.trackMat.clone());
    shared.materials.push(track.material);
    track.scale.set(1.1, 0.3, 1);
    const fill = new THREE.Sprite(gauge.fillMat.clone());
    shared.materials.push(fill.material);
    fill.scale.set(0.001, 0.2, 1);
    const icon = new THREE.Sprite(iconMatSuspicion);
    icon.scale.set(0.42, 0.42, 1);
    const marker = new THREE.Group(); marker.name = 'last-known-marker';
    const stake = new THREE.Mesh(markerStakeGeo, markerStakeMat); stake.position.y = 0.28;
    const flame = new THREE.Mesh(markerFlameGeo, markerFlameMat); flame.position.y = 0.58;
    marker.add(stake, flame); marker.visible = false;
    root.add(track, fill, icon, marker);
    return { track, fill, icon, marker, flame, lastMode: 'patrol' };
  });

  // Tiny wind offsets preserve instancing and avoid hundreds of matrix uploads.
  const windUniform = { value: 0 };
  function installWind(material, amplitude) {
    material.onBeforeCompile = shader => {
      shader.uniforms.bethlehemWind = windUniform;
      shader.vertexShader = 'uniform float bethlehemWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float gust = sin(bethlehemWind * 1.15 + instanceMatrix[3].x * .38 + instanceMatrix[3].z * .22);
          transformed.x += gust * ${amplitude.toFixed(3)} * max(0.0, position.y + .3);
          transformed.z += cos(bethlehemWind * .8 + instanceMatrix[3].x) * ${(amplitude * 0.35).toFixed(3)};
        #endif
      `);
    };
    material.customProgramCacheKey = () => `bethlehem-wind-${amplitude}`;
  }
  installWind(olives.userData.leafMesh.material, 0.075);
  installWind(grass.userData.mesh.material, 0.15);
  for (const item of props.userData.swayItems) {
    if (item.kind === 'awning' || item.kind === 'banner') item.basePositions = item.mesh.geometry.attributes.position.array.slice();
  }

  // Pouring is staged at the return camp, never at the well: David receives
  // the water, lowers his gaze and pours to the ground instead of drinking it.
  const streamGeo = trackGeo(shared, new THREE.CylinderGeometry(0.026, 0.045, 1, 6));
  const streamMat = new THREE.MeshBasicMaterial({ color: 0xbce9ed, transparent: true, opacity: 0.72, depthWrite: false });
  shared.materials.push(streamMat);
  const stream = new THREE.Mesh(streamGeo, streamMat); stream.name = 'offering-water-stream'; stream.visible = false; root.add(stream);
  const rippleGeo = trackGeo(shared, new THREE.RingGeometry(0.32, 0.35, 32));
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xc9e5df, transparent: true, opacity: 0, depthWrite: false });
  shared.materials.push(rippleMat);
  const ripple = new THREE.Mesh(rippleGeo, rippleMat); ripple.rotation.x = -Math.PI / 2; ripple.visible = false; root.add(ripple);
  const streamFrom = new THREE.Vector3(), streamTo = new THREE.Vector3(), streamDirection = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const worldHeadTmp = new THREE.Vector3();
  let noiseRippleAge = 0;

  // Sparse distant birds, original geometry; their scale remains subordinate
  // to the architecture rather than reading as a particle effect.
  const birdGeometry = trackGeo(shared, new THREE.BufferGeometry());
  birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.7, 0.07, -0.18, 0.17, 0, 0.16], 3));
  const birdMaterial = new THREE.MeshBasicMaterial({ color: 0x655961, side: THREE.DoubleSide, fog: true });
  shared.materials.push(birdMaterial);
  const birds = Array.from({ length: 4 }, (_, i) => {
    const bird = new THREE.Group(), left = new THREE.Mesh(birdGeometry, birdMaterial), right = new THREE.Mesh(birdGeometry, birdMaterial);
    right.scale.x = -1; bird.add(left, right); root.add(bird); return { bird, left, right, i };
  });

  // Actual-noise feedback: an expanding dust-pale ripple at state.noise's
  // location for any real sound (footsteps/sprint/distraction landing), plus
  // a brief warm flash reserved for a thrown stone's landing specifically so
  // it stays legible from a stealth ripple instead of just another HUD dot.
  const noiseRippleGeo = trackGeo(shared, new THREE.RingGeometry(0.22, 0.3, 28));
  const noiseRippleMat = new THREE.MeshBasicMaterial({ color: 0xe8dcb0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  shared.materials.push(noiseRippleMat);
  const noiseRipple = new THREE.Mesh(noiseRippleGeo, noiseRippleMat);
  noiseRipple.rotation.x = -Math.PI / 2; noiseRipple.visible = false; noiseRipple.name = 'noise-ripple';
  root.add(noiseRipple);
  const stoneFlashGeo = trackGeo(shared, new THREE.CircleGeometry(0.18, 16));
  const stoneFlashMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0, depthWrite: false });
  shared.materials.push(stoneFlashMat);
  const stoneFlash = new THREE.Mesh(stoneFlashGeo, stoneFlashMat);
  stoneFlash.rotation.x = -Math.PI / 2; stoneFlash.visible = false; stoneFlash.position.y = 0.05; stoneFlash.name = 'stone-flash';
  root.add(stoneFlash);
  // Secondary ring for state.movementNoise -- core now reports the player's
  // own footstep/sprint noise concurrently with a primary stone/distraction
  // noise (previously a stone throw suppressed footstep hearing entirely).
  // Visually distinct (smaller, dustier, no flash) so it reads as a second,
  // ongoing sound rather than competing with the primary noise event.
  const movementRippleGeo = trackGeo(shared, new THREE.RingGeometry(0.14, 0.2, 22));
  const movementRippleMat = new THREE.MeshBasicMaterial({ color: 0xc9b98a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  shared.materials.push(movementRippleMat);
  const movementRipple = new THREE.Mesh(movementRippleGeo, movementRippleMat);
  movementRipple.rotation.x = -Math.PI / 2; movementRipple.visible = false; movementRipple.name = 'movement-noise-ripple';
  root.add(movementRipple);
  let lastMovementNoiseKey = null;
  let movementRippleAge = 0;
  let lastNoiseKey = null; // dedupe so the flash restarts only on a genuinely new noise event

  // Optional hero re-skin: load the refined warrior GLB over the procedural
  // capsule-limbed hero only. warrior-refined.glb ships six clips (Idle, Walk,
  // Crouch, Carry, DrawWater, Pour) from assets/bethlehem-art/PROVENANCE.md --
  // that file's own status is BLOCKED on visual acceptance, so loading it here
  // is a mechanics-neutral, fully optional swap, never a quality claim. Any
  // failure at any stage silently keeps the procedural hero (the default and
  // already-working appearance) with zero behavior change.
  const HERO_GLB_URL = new URL('../assets/bethlehem-art/warrior-refined.glb', import.meta.url).href;
  const HERO_SCALE = 1.78;
  // The player hero must NEVER play the ending Pour clip -- David alone pours
  // the water out to the LORD at the ending camp; the desired-clip selection
  // in update() below only ever resolves to Idle/Crouch/DrawWater/Carry/Walk.
  let heroGlb = null;
  // Real state, not a fake flag: 'procedural' (default/no GLB), 'loading', or
  // 'loaded' once the GLB is actually attached. Named `artStatus` to match the
  // parent's existing readSnapshot() consumer (`world?.artStatus??'procedural'`).
  let artStatus = 'procedural';
  try {
    artStatus = 'loading';
    const heroLoader = new GLTFLoader();
    heroLoader.load(
      HERO_GLB_URL,
      (gltf) => {
        try {
          if (disposed) return;
          const sceneRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!sceneRoot) { artStatus = 'procedural'; return; }
          sceneRoot.scale.setScalar(HERO_SCALE);
          sceneRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          const mixer = new THREE.AnimationMixer(sceneRoot);
          const actions = {};
          for (const clip of (gltf.animations || [])) actions[clip.name] = mixer.clipAction(clip);
          const hasUsableClip = Object.keys(actions).length > 0;
          // The rig's "root" bone doubles as the art lab's `placement` frame
          // (its local space is exactly where the IK target offsets like
          // y~0.86-0.88 for pelvis/hand height are authored against) and, via
          // traverse, already reaches every bone the refiner requires.
          const rootBone = sceneRoot.getObjectByName('root');
          if (!rootBone) throw new Error('warrior-refined.glb has no "root" bone for pose placement');
          const poseRefiner = createArtPoseRefiner(THREE, rootBone, rootBone);
          player.body.visible = false; // hide the procedural hero only after the GLB (+ pose fix) is actually attached
          player.root.add(sceneRoot);
          heroGlb = { root: sceneRoot, mixer, actions, current: null, hasUsableClip, poseRefiner, poseElapsed: 0 };
          (actions.Idle || Object.values(actions)[0])?.play?.();
          artStatus = 'loaded';
        } catch (innerError) {
          console.warn('bethlehem hero glb attach failed, keeping procedural hero', innerError);
          artStatus = 'procedural';
        }
      },
      undefined,
      (loadError) => {
        console.warn('bethlehem hero glb load failed, keeping procedural hero', loadError);
        artStatus = 'procedural';
      },
    );
  } catch (setupError) {
    console.warn('bethlehem hero glb loader unavailable, keeping procedural hero', setupError);
    artStatus = 'procedural';
  }

  scene.add(root);
  const fullGrassCount = grass.userData.mesh.count;
  let disposed = false;
  let lastTime = 0;
  const placeHuman = (human, actor, dt, crouching = false, moving = false) => {
    if (!actor) return;
    human.root.position.set(Number.isFinite(actor.x) ? actor.x : 0, 0, Number.isFinite(actor.z) ? actor.z : 0);
    human.root.rotation.y = Number.isFinite(actor.heading) ? actor.heading : 0;
    human.crouching = Boolean(crouching);
    human.update(dt, moving ? (crouching ? 2.1 : 4.2) : 0);
  };

  function update(time, dt, state) {
    if (disposed || !state?.player) return;
    const t = Number.isFinite(time) ? time : lastTime;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
    lastTime = t; windUniform.value = t;
    const ending = state.phase === 'ending' || state.phase === 'complete';
    const e = Number.isFinite(state.endingTime) ? state.endingTime : 0;
    player.pose = state.phase === 'filling' ? 'carry' : 'idle';
    player.carrying = Boolean(state.carrying) && !ending;
    player.waterSkin.visible = player.carrying || state.phase === 'filling';
    placeHuman(player, state.player, delta, state.player.crouching && !ending, state.player.moving && !ending);
    if (heroGlb) {
      heroGlb.mixer.update(delta);
      // Deliberately never 'Pour': the player hero stays idle/hands-off while
      // David alone performs the ending pour, per the fixed story beat. Draws
      // water visibly while filling, rather than just reusing 'Carry'.
      const desired = ending ? 'Idle'
        : state.player.crouching ? 'Crouch'
        : state.phase === 'filling' ? 'DrawWater'
        : player.carrying ? 'Carry'
        : state.player.moving ? 'Walk'
        : 'Idle';
      if (desired !== heroGlb.current) {
        const next = heroGlb.actions[desired] || heroGlb.actions.Idle;
        if (next) {
          const prev = heroGlb.current ? heroGlb.actions[heroGlb.current] : null;
          next.reset().fadeIn(0.25).play();
          if (prev && prev !== next) prev.fadeOut(0.25);
          heroGlb.poseElapsed = 0; // IK phase (walk swing/crouch dip/draw-water ramp) restarts per pose
        }
        heroGlb.current = desired;
      }
      heroGlb.poseElapsed += delta;
      // The baked clips drive legs/torso; this procedural pass is what
      // actually places the arms/water-vessel every frame -- without it the
      // rig sits in its bind-pose T-pose regardless of which clip is playing.
      heroGlb.poseRefiner.update(heroGlb.current || 'Idle', heroGlb.poseElapsed);
    }
    companions.forEach((human, i) => {
      human.carrying = false;
      placeHuman(human, state.companions?.[i], delta, state.player.crouching && !ending, state.player.moving && !ending);
    });
    const info = typeof core.stealthInfo === 'function' ? (() => {
      try { return core.stealthInfo(state); } catch { return null; }
    })() : null;
    guards.forEach((human, i) => {
      const actor = state.guards?.[i];
      placeHuman(human, actor, delta, false, delta > 0 && !ending && !(actor?._pause));
      const cone = cones[i];
      const ui = guardUi[i];
      const active = !['intro', 'caught', 'ending', 'complete'].includes(state.phase);
      cone.mesh.visible = active;
      cone.outline.visible = active;
      if (!actor || !active) {
        ui.track.visible = ui.fill.visible = ui.icon.visible = ui.marker.visible = false;
        return;
      }
      const poly = computeSightPolygon(actor, !!state.player.crouching);
      const n = Math.min(poly.length, CONE_CAPACITY);
      const positions = cone.mesh.geometry.attributes.position;
      for (let k = 0; k < n; k++) positions.setXYZ(k, poly[k].x - actor.x, 0.045, poly[k].z - actor.z);
      positions.needsUpdate = true;
      cone.mesh.geometry.setDrawRange(0, Math.max(0, n - 2) * 3);
      cone.outline.geometry.setDrawRange(0, n);
      cone.mesh.position.set(actor.x, 0, actor.z);
      cone.outline.position.set(actor.x, 0, actor.z);
      const suspicion = clamp(typeof actor.suspicion === 'number' ? actor.suspicion : (state.alarm || 0), 0, 1);
      const mode = typeof actor.mode === 'string' ? actor.mode : (suspicion > 0.5 ? 'suspicious' : 'patrol');
      const sightColor = SIGHT_COLORS[mode] || SIGHT_COLORS.patrol;
      cone.mesh.material.color.set(sightColor);
      cone.mesh.material.opacity = SIGHT_OPACITY[mode] || SIGHT_OPACITY.patrol;
      cone.outline.material.color.set(sightColor);

      // Suspicion bar + ?/! mode glyph. Hidden in calm patrol so the warm
      // ancient-Judean scene doesn't read as a neon status-bar HUD; both
      // appear only once a guard actually has something to show the player.
      const showUi = mode !== 'patrol' && suspicion > 0.02;
      ui.track.visible = ui.fill.visible = showUi;
      ui.icon.visible = showUi && (mode === 'alert' || mode === 'search' || mode === 'suspicious' || mode === 'investigate');
      if (showUi) {
        const headPos = human.head.getWorldPosition(worldHeadTmp);
        ui.track.position.set(headPos.x, headPos.y + 0.62, headPos.z);
        ui.fill.position.set(headPos.x - 0.55 * (1 - suspicion), headPos.y + 0.62, headPos.z + 0.001);
        ui.fill.scale.set(Math.max(0.001, 1.1 * suspicion), 0.2, 1);
        ui.icon.position.set(headPos.x, headPos.y + 0.95, headPos.z);
        ui.icon.material = (mode === 'alert' || mode === 'search') ? iconMatAlert : iconMatSuspicion;
      }
      const searching = mode === 'search' || mode === 'investigate';
      const lastSeen = actor.lastSeen;
      ui.marker.visible = searching && !!lastSeen && Number.isFinite(lastSeen.x) && Number.isFinite(lastSeen.z);
      if (ui.marker.visible) {
        ui.marker.position.set(lastSeen.x, 0, lastSeen.z);
        ui.flame.scale.set(1, 0.85 + Math.sin(t * 10 + i) * 0.18, 1);
      }
      ui.lastMode = mode;
    });
    const noise = state.noise;
    const noiseActive = noise && Number.isFinite(noise.x) && Number.isFinite(noise.z) && (noise.ttl == null || noise.ttl > 0);
    if (noiseActive) {
      const key = `${noise.x.toFixed(2)},${noise.z.toFixed(2)},${noise.kind || ''}`;
      if (key !== lastNoiseKey) { lastNoiseKey = key; noiseRippleAge = 0; }
      noiseRippleAge += delta;
      const radius = Number.isFinite(noise.radius) ? noise.radius : 4;
      const life = clamp(noiseRippleAge / 0.6, 0, 1);
      noiseRipple.visible = true;
      noiseRipple.position.set(noise.x, 0.04, noise.z);
      noiseRipple.scale.setScalar(0.3 + life * Math.max(1, radius * 0.4));
      noiseRipple.material.opacity = (1 - life) * 0.4;
      const isStone = noise.kind === 'stone' || noise.kind === 'distract' || noise.kind === 'distraction';
      stoneFlash.visible = isStone && noiseRippleAge < 0.4;
      if (stoneFlash.visible) {
        stoneFlash.position.set(noise.x, 0.05, noise.z);
        const flashLife = clamp(noiseRippleAge / 0.4, 0, 1);
        stoneFlash.scale.setScalar(0.6 + flashLife * 1.8);
        stoneFlash.material.opacity = (1 - flashLife) * 0.85;
      }
    } else {
      lastNoiseKey = null;
      noiseRipple.visible = false;
      stoneFlash.visible = false;
    }
    const movementNoise = state.movementNoise;
    const movementActive = movementNoise && Number.isFinite(movementNoise.x) && Number.isFinite(movementNoise.z)
      && (movementNoise.ttl == null || movementNoise.ttl > 0);
    if (movementActive) {
      const mKey = `${movementNoise.x.toFixed(2)},${movementNoise.z.toFixed(2)}`;
      if (mKey !== lastMovementNoiseKey) { lastMovementNoiseKey = mKey; movementRippleAge = 0; }
      movementRippleAge += delta;
      const mRadius = Number.isFinite(movementNoise.radius) ? movementNoise.radius : 2.5;
      const mLife = clamp(movementRippleAge / 0.5, 0, 1);
      movementRipple.visible = true;
      movementRipple.position.set(movementNoise.x, 0.035, movementNoise.z);
      movementRipple.scale.setScalar(0.25 + mLife * Math.max(0.6, mRadius * 0.3));
      movementRipple.material.opacity = (1 - mLife) * 0.3;
    } else {
      lastMovementNoiseKey = null;
      movementRipple.visible = false;
    }
    playerRing.position.set(state.player.x, 0.025, state.player.z);
    playerRing.visible = !ending && state.phase !== 'intro';
    // Tint the player ring by core's own cover classification when available
    // (warm amber exposed -> cool concealed) instead of inventing a second,
    // possibly-inconsistent local notion of concealment.
    const cover = info && typeof info.cover === 'string' ? info.cover : null;
    playerRing.material.color.setHex(
      cover === 'concealed' || cover === 'occluded' ? 0xaed4c8
        : cover === 'low-cover' ? 0xe6cf8f
        : 0xffefc5,
    );
    targetRing.visible = !ending && state.phase !== 'intro';
    const target = state.carrying ? L.start : L.well;
    targetRing.position.set(target.x, 0.035, target.z);
    targetRing.material.opacity = 0.32 + Math.sin(t * 2) * 0.1;

    david.pose = ending && e > 0.6 ? 'pour' : 'idle';
    david.carrying = false; david.waterSkin.visible = ending && e > 0.6;
    david.update(delta, 0);
    if (david.waterSkin.visible) david.waterSkin.rotation.z = -1.4;
    stream.visible = ending && e > 1.6 && e < 6.2;
    ripple.visible = ending && e > 1.6 && e < 6.6;
    if (stream.visible || ripple.visible) {
      root.updateMatrixWorld(true);
      streamFrom.set(0, 0.28, 0).applyMatrix4(david.waterSkin.matrixWorld);
      streamTo.set(streamFrom.x + 0.18, 0.035, streamFrom.z + 0.12);
      streamDirection.subVectors(streamFrom, streamTo);
      const length = streamDirection.length();
      stream.position.copy(streamFrom).add(streamTo).multiplyScalar(0.5);
      stream.scale.set(1 + Math.sin(t * 17) * 0.1, length, 1);
      stream.quaternion.setFromUnitVectors(up, streamDirection.normalize());
      stream.material.opacity = Math.min(0.72, Math.max(0, (6.2 - e) * 0.65));
      ripple.position.copy(streamTo); ripple.position.y = 0.045;
      const pulse = (Math.max(0, e - 1.6) * 1.4) % 1;
      ripple.scale.setScalar(0.7 + pulse * 2);
      ripple.material.opacity = (1 - pulse) * 0.28;
    }

    const bucket = well.userData.bucket;
    bucket.position.y = state.phase === 'filling' ? 0.55 + clamp(state.fill || 0, 0, 1) * 1.5 : 0.55;
    well.userData.water.material.opacity = 0.78 + Math.sin(t * 1.9) * 0.045;
    for (const item of props.userData.swayItems) {
      if (item.basePositions) {
        const p = item.mesh.geometry.attributes.position, base = item.basePositions;
        for (let i = 0; i < p.count; i++) {
          const y = base[i * 3 + 1], weight = item.kind === 'banner' ? (1.1 - y) / 2.2 : 0.5 + y / 2;
          p.setZ(i, base[i * 3 + 2] + Math.sin(t * 1.7 + base[i * 3] * 2 + item.phase) * item.amp * Math.max(0, weight));
        }
        p.needsUpdate = true;
      } else if (item.kind === 'flame') {
        item.mesh.scale.set(1, 0.9 + Math.sin(t * 13 + item.phase) * 0.14, 1);
        item.mesh.position.y = item.baseY + Math.sin(t * 9 + item.phase) * 0.02;
      }
    }
    for (const torch of props.userData.torchLights) torch.light.intensity = quality === 'low' ? 0 : 1.9 + Math.sin(t * 11 + torch.phase) * 0.25;
    const mp = motes.geometry.attributes.position, mb = motes.userData.base;
    for (let i = 0; i < mp.count; i++) mp.setXYZ(i, mb[i * 3] + Math.sin(t * 0.15 + i) * 0.3, mb[i * 3 + 1] + Math.sin(t * 0.18 + i * 2) * 0.2, mb[i * 3 + 2]);
    mp.needsUpdate = true;
    for (const { bird, left, right, i } of birds) {
      bird.position.set(Math.sin(t * 0.07 + i * 0.8) * 26, 12 + i * 0.9, -33 - i * 3 + Math.cos(t * 0.06 + i) * 3);
      bird.rotation.y = Math.PI / 2 + Math.cos(t * 0.07 + i * 0.8) * 0.25;
      left.rotation.z = Math.sin(t * 4.5 + i) * 0.25; right.rotation.z = -left.rotation.z;
    }
  }

  function setQuality(value) {
    if (disposed) return;
    quality = value === 'low' ? 'low' : 'standard';
    shared.lights.sun.castShadow = quality !== 'low';
    if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
    motes.visible = quality !== 'low';
    grass.userData.mesh.count = quality === 'low' ? Math.ceil(fullGrassCount * 0.55) : fullGrassCount;
  }

  function dispose() {
    if (disposed) return;
    disposed = true; root.removeFromParent();
    if (heroGlb) {
      heroGlb.mixer.stopAllAction();
      heroGlb.root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose();
      });
      heroGlb.root.removeFromParent();
      heroGlb = null;
    }
    for (const geometry of new Set(shared.geometries)) geometry?.dispose();
    for (const material of new Set(shared.materials)) material?.dispose();
    for (const texture of new Set(shared.textures)) texture?.dispose();
    for (const mesh of shared.meshes) mesh.dispose?.();
    shared.lights.sun.shadow.map?.dispose();
    scene.fog = oldFog; scene.background = oldBackground;
  }

  // Deterministic initial positions are present before the parent's first frame.
  placeHuman(player, { ...L.start, heading: Math.PI }, 0);
  companions.forEach((human, i) => placeHuman(human, { x: L.start.x + (i ? 1.3 : -1.3), z: L.start.z + 1.7, heading: Math.PI }, 0));
  guards.forEach((human, i) => placeHuman(human, { x: layout?.guards?.[i]?.xMin ?? -14, z: layout?.guards?.[i]?.z ?? [7, -7, -18][i], heading: Math.PI / 2 }, 0));
  const worldApi = { update, dispose, player, companions, guards, setQuality };
  // Real, live status (not a fake boolean): reflects the actual async GLTFLoader
  // outcome at read time -- 'loading' until the callback settles, 'loaded' only
  // once the GLB is actually attached, else 'procedural' (the default hero).
  Object.defineProperty(worldApi, 'artStatus', { enumerable: true, get: () => artStatus });
  return worldApi;
}

