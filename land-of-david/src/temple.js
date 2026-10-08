// Act 5 · 성전 준비 — renderer, input and UI. Rules: temple-logic.js. Map: temple-world.js.
// David wants to build God a house (삼하 7:2), is told his son will (7:12–13, 대상 22:7–10), and prepares anyway (22:5).
import * as THREE from 'three';
import { canStep } from './world.js';
import { generateTemple, OUTLINE } from './temple-world.js';
import * as T from './temple-logic.js';
import { buildTerrain, buildWater, buildProps, buildVegetation, makeCoords, BILLBOARD_Q } from './scene.js';
import { makeCharacterSheet, LOOKS, makeFlameSheet, makeSoftTexture } from './pixel.js';
import { PostStack } from './post.js';
import { BIBLE_SOURCE } from './data.js';
import { keyName } from './keys.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const world = generateTemple();
const L = world.layout;
const C = makeCoords(world);
const $ = (id) => document.getElementById(id);
const SAVE_KEY = T.ACT5_KEY;

// ---------------- Renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
$('app').appendChild(renderer.domElement);
const post = new PostStack(renderer, { msaa: isMobile ? 0 : 4 });
const usePost = !params.has('nopost');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 220);
scene.fog = new THREE.Fog(0xdde6ea, 62, 160);
scene.background = new THREE.Color(0xdde6ea);
const hemi = new THREE.HemisphereLight(0xc9dcf0, 0x9a8662, 0.62);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
sun.castShadow = true;
const SHADOW = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(SHADOW, SHADOW);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 30, bottom: -30, near: 1, far: 130 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035;
scene.add(hemi, sun, sun.target);

// ---------------- World ----------------
const time = { value: 0 };
scene.add(buildTerrain(world));
const water = buildWater(world);
scene.add(water);
const props = buildProps(world);
scene.add(props.group);
scene.add(buildVegetation(world, time));
const TX = props.textures;

// ---------------- Fires ----------------
const flameTex = makeFlameSheet();
const glowTex = makeSoftTexture(64, 'radial');
const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, alphaTest: 0.1, color: new THREE.Color(3.2, 2.2, 1.2), depthWrite: false });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6, 0.8, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
const stoneMat = new THREE.MeshLambertMaterial({ map: TX.fieldstone }), woodMat = new THREE.MeshLambertMaterial({ map: TX.wood });
const ashlarMat = new THREE.MeshLambertMaterial({ map: TX.ashlar || TX.fieldstone });
const flames = [];
function groundAt(x, z) { const i = C.ti(x), j = C.tj(z); return world.inb(i, j) ? world.height[world.idx(i, j)] : 0; }
function waterAt(x, z) { const i = C.ti(x), j = C.tj(z); return world.inb(i, j) ? world.water[world.idx(i, j)] : -1; }
function addFlame(pos, size) {
  const geo = new THREE.PlaneGeometry(0.5 * size, 0.75 * size); geo.translate(0, 0.37 * size, 0);
  const mesh = new THREE.Mesh(geo, flameMat); mesh.position.copy(pos); mesh.quaternion.copy(BILLBOARD_Q); scene.add(mesh);
  const glow = new THREE.Sprite(glowMat); glow.position.set(pos.x, pos.y + 0.35 * size, pos.z); glow.scale.setScalar(2.2 * size); scene.add(glow);
  const f = { pos: pos.clone(), size, mesh, glow, phase: flames.length * 1.7 }; flames.push(f); return f;
}
for (const f of props.fires) addFlame(f.pos, f.size); // the gate torches
const firePool = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa54a, 0, 9, 1.6); scene.add(l); return l; });

// ---------------- Places: the altar, the forge, the quarry, the cedar landing, the king's chest ----------------
const metal = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e });
const MAT = { cedar: new THREE.MeshLambertMaterial({ map: TX.wood, color: 0xd09060 }), stone: ashlarMat, gold: metal(0xe8c040, 0.25), silver: metal(0xd4d8e0, 0.12), iron: metal(0x5a5c62), bronze: metal(0xb8743a, 0.08) };
const box = (mat, w, h, d, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
{ // the altar on the threshing floor (대상 21:26, 22:1): field stones and a fire
  const f = world.features.altar, x = C.wx(f.i), z = C.wz(f.j), y = groundAt(x, z);
  box(stoneMat, 1.3, 0.9, 1.3, x, y + 0.45, z);
  for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(stoneMat, 0.22, 0.22, 0.22, x + a, y + 1.0, z + b);
  addFlame(new THREE.Vector3(x, y + 0.9, z), 0.8);
}
{ // the forge: a clay furnace with its fire, and an anvil stone
  const f = world.features.forge, x = C.wx(f.i), z = C.wz(f.j), y = groundAt(x, z);
  const clay = new THREE.MeshLambertMaterial({ map: TX.terracotta || TX.fieldstone, color: 0xc08a64 });
  const fur = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 1.1, 10), clay); fur.position.set(x, y + 0.55, z); fur.castShadow = true; scene.add(fur);
  addFlame(new THREE.Vector3(x, y + 1.1, z), 0.7);
  box(MAT.iron, 0.6, 0.4, 0.35, x - 1.6, y + 0.2, z + 0.6);
  for (let k = 0; k < 4; k++) box(k % 2 ? MAT.bronze : MAT.iron, 0.42, 0.12, 0.2, x + 1.2, y + 0.06 + k * 0.12, z + 0.8, k * 0.3);
}
{ // big cut blocks at the quarry face (22:2)
  const q = world.features.quarry;
  for (const [di, dj, s] of [[-3, -3, 1.2], [-1, -4, 1], [2, -3.4, 1.1], [-4, -1, 0.9]]) { const x = C.wx(q.i + di), z = C.wz(q.j + dj); box(ashlarMat, 1.1 * s, 0.7 * s, 0.8 * s, x, groundAt(x, z) + 0.35 * s, z, di * 0.2); }
}
{ // cedar logs stacked where the Sidonians and Tyrians unload (22:4)
  const s = L.sources.cedar.spot, y = groundAt(s.x, s.z);
  for (let k = 0; k < 7; k++) box(MAT.cedar, 2.6, 0.28, 0.3, s.x - 2.6, y + 0.14 + Math.floor(k / 4) * 0.28, s.z - 1.0 + (k % 4) * 0.32 + (k >= 4 ? 0.16 : 0));
}
// David's own gold and silver, in a chest by the palace door until he gives it (29:3)
const chest = new THREE.Group();
{ const p = L.treasury, y = groundAt(p.x, p.z); const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), woodMat); b.position.y = 0.22; const g = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.38), MAT.gold); g.position.y = 0.5; const sv = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), MAT.silver); sv.position.set(0.16, 0.6, 0); chest.add(b, g, sv); chest.traverse((o) => { o.castShadow = true; }); chest.position.set(p.x - 1.0, y, p.z - 0.4); scene.add(chest); }

// the outline of the house David will not build: faint gold lines on the threshing floor
const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.78, 0.42), transparent: true, opacity: 0.2, depthWrite: false });
const outline = new THREE.Group();
{
  const x0 = C.wx(OUTLINE.i0) - 0.5, x1 = C.wx(OUTLINE.i1) + 0.5, z0 = C.wz(OUTLINE.j0) - 0.5, z1 = C.wz(OUTLINE.j1) + 0.5, y = groundAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.05;
  const line = (ax, az, bx, bz) => { const l = Math.hypot(bx - ax, bz - az), m = new THREE.Mesh(new THREE.BoxGeometry(l, 0.06, 0.16), ghostMat); m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); outline.add(m); };
  line(x0, z0, x1, z0); line(x0, z1, x1, z1); line(x0, z0, x0, z1); line(x1, z0, x1, z1);
  const inner = x0 + (x1 - x0) / 3; line(inner, z0, inner, z1); // the most holy place, 20 of the 60 cubits (대하 3:8), at the west end
  // ghost pillars: the house that never rises
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), ghostMat); m.position.set(px, y + 1.3, pz); outline.add(m); }
  scene.add(outline);
}
// the piles: one stack per material, with a count sign
const PILE_ORDER = ['cedar', 'stone', 'gold', 'silver', 'iron', 'bronze'];
function labelTex(text, full) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 44; const g = c.getContext('2d');
  g.fillStyle = '#2a1d0e'; g.fillRect(0, 0, 160, 44); g.fillStyle = full ? '#f6dc94' : '#f4ead2'; g.fillRect(2, 2, 156, 40);
  g.fillStyle = '#2a1d0e'; g.font = '700 22px "Apple SD Gothic Neo","Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 80, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const piles = Object.fromEntries(PILE_ORDER.map((k) => {
  const p = L.piles[k], y = groundAt(p.x, p.z), g = new THREE.Group(), items = [], cap = T.NEED[k] * 2;
  const geo = k === 'cedar' ? new THREE.BoxGeometry(1.6, 0.22, 0.24) : k === 'stone' ? new THREE.BoxGeometry(0.62, 0.36, 0.42) : new THREE.BoxGeometry(0.46, 0.13, 0.22);
  for (let n = 0; n < cap; n++) {
    const m = new THREE.Mesh(geo, MAT[k]); m.castShadow = true; m.visible = false;
    if (k === 'cedar') m.position.set(-0.45 + (n % 4) * 0.3 + (Math.floor(n / 4) % 2) * 0.15, 0.11 + Math.floor(n / 4) * 0.22, 0);
    else if (k === 'stone') m.position.set(-0.36 + (n % 2) * 0.68, 0.18 + Math.floor(n / 4) * 0.36, -0.24 + (Math.floor(n / 2) % 2) * 0.46);
    else m.position.set(-0.26 + (n % 2) * 0.5, 0.07 + Math.floor(n / 4) * 0.13, -0.13 + (Math.floor(n / 2) % 2) * 0.26);
    m.rotation.y = k === 'cedar' ? Math.PI / 2 : (n % 3) * 0.05; g.add(m); items.push(m);
  }
  g.position.set(p.x, y, p.z); scene.add(g);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('', false), depthWrite: false, depthTest: false, transparent: true })); sign.scale.set(2.5, 0.69, 1); sign.renderOrder = 4; sign.position.set(p.x, y + 2.2, p.z); scene.add(sign);
  return [k, { g, items, sign, shown: -1 }];
}));
function updatePiles() {
  for (const k of PILE_ORDER) {
    const pl = piles[k], n = S.piles[k];
    if (pl.shown === n) continue; pl.shown = n;
    pl.items.forEach((m, i) => { m.visible = i < n; });
    pl.sign.material.map.dispose(); pl.sign.material.map = labelTex(`${T.ITEM_NAME[k]} ${Math.min(n, T.NEED[k])}/${T.NEED[k]}`, n >= T.NEED[k]); pl.sign.material.needsUpdate = true;
  }
  const on = S.act === 'prepare' || S.act === 'ready' || S.act === 'refused' || S.act === 'solomon' || S.act === 'handed' || S.act === 'done';
  for (const k of PILE_ORDER) piles[k].sign.visible = on;
}

// ---------------- Sprites ----------------
const blobMat = new THREE.MeshBasicMaterial({ map: makeSoftTexture(64, 'blob'), transparent: true, depthWrite: false });
const sheets = {};
function sheetFor(key, kind, look) {
  if (sheets[key]) return sheets[key];
  const s = makeCharacterSheet(kind, look);
  s.material = new THREE.MeshLambertMaterial({ map: s.texture, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.16, emissiveMap: s.texture });
  s.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: s.texture, alphaTest: 0.5 });
  return (sheets[key] = s);
}
class Actor {
  constructor(sheet, { scale = 1, x = 0, z = 0 } = {}) {
    const w = (sheet.fw / 16) * scale, h = (sheet.fh / 16) * scale;
    this.geo = new THREE.PlaneGeometry(w, h); this.geo.translate(0, h / 2, 0);
    this.mesh = new THREE.Mesh(this.geo, sheet.material); this.mesh.quaternion.copy(BILLBOARD_Q);
    this.mesh.castShadow = true; this.mesh.customDepthMaterial = sheet.depth;
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.55), blobMat); this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1;
    scene.add(this.mesh, this.blob);
    this.x = x; this.z = z; this.y = groundAt(x, z); this.dir = 0; this.anim = 0; this.moving = false; this.h = h;
    this.setFrame(0, 0);
  }
  setSheet(sheet) { this.mesh.material = sheet.material; this.mesh.customDepthMaterial = sheet.depth; }
  setFrame(dir, frame) {
    if (dir === this._d && frame === this._f) return;
    this._d = dir; this._f = frame;
    const e = 0.001, u0 = frame / 4 + e, u1 = (frame + 1) / 4 - e, v1 = 1 - dir / 4 - e, v0 = 1 - (dir + 1) / 4 + e, uv = this.geo.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true;
  }
  face(dx, dz) { this.dir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : dz < 0 ? 1 : 0; }
  update(dt) {
    if (this.moving) { this.anim += dt * (this.speedAnim || 8); this.setFrame(this.dir, Math.floor(this.anim) % 4); } else { this.anim = 0; this.setFrame(this.dir, 0); }
    this.y += (groundAt(this.x, this.z) - this.y) * Math.min(1, dt * 14);
    this.mesh.position.set(this.x, this.y, this.z);
    this.blob.position.set(this.x, Math.max(this.y, waterAt(this.x, this.z)) + 0.02, this.z + 0.05);
  }
}
function tryMove(a, dx, dz) {
  let moved = false;
  if (dx) { const ci = C.ti(a.x), cj = C.tj(a.z), nx = a.x + dx, pi = C.ti(nx + Math.sign(dx) * 0.3); if (pi === ci || canStep(world, ci, cj, pi, cj)) { a.x = nx; moved = true; } }
  if (dz) { const ci = C.ti(a.x), cj = C.tj(a.z), nz = a.z + dz, pj = C.tj(nz + Math.sign(dz) * 0.3); if (pj === cj || canStep(world, ci, cj, ci, pj)) { a.z = nz; moved = true; } }
  return moved;
}

// ---------------- Pixel icons ----------------
function pixelTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(px);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ingot = (hi, mid, lo) => (px, ox, oy) => { px(ox + 1, oy + 3, '#2a1d0e', 8, 4); px(ox + 2, oy + 2, '#2a1d0e', 6, 1); px(ox + 2, oy + 3, mid, 6, 3); px(ox + 3, oy + 2, hi, 4, 1); px(ox + 2, oy + 3, hi, 6, 1); px(ox + 2, oy + 5, lo, 6, 1); };
const ICON = {
  cedar: (px, ox, oy) => { px(ox, oy + 2, '#3a2010', 10, 5); px(ox + 1, oy + 3, '#a0643a', 8, 1); px(ox + 1, oy + 5, '#b8783e', 8, 1); px(ox + 1, oy + 4, '#7a4a28', 8, 1); px(ox + 8, oy + 2, '#e8c890', 2, 2); px(ox + 8, oy + 5, '#e8c890', 2, 2); px(ox + 9, oy + 3, '#c89a60', 1, 1); },
  stone: (px, ox, oy) => { px(ox + 1, oy + 4, '#4a4440', 8, 4); px(ox + 2, oy + 4, '#b8b0a0', 3, 3); px(ox + 5, oy + 4, '#a49c8c', 3, 3); px(ox + 3, oy + 1, '#4a4440', 5, 3); px(ox + 4, oy + 1, '#ccc4b2', 3, 2); },
  gold: ingot('#fff0a0', '#e8c040', '#a8801a'), silver: ingot('#ffffff', '#d4d8e0', '#8a8e98'), iron: ingot('#9a9ca4', '#5a5c62', '#34363c'), bronze: ingot('#f0b070', '#b8743a', '#7a4418'),
  treasure: (px, ox, oy) => { px(ox + 1, oy + 2, '#2a1d0e', 8, 6); px(ox + 2, oy + 3, '#8a5a2a', 6, 4); px(ox + 2, oy + 3, '#e8c040', 6, 1); px(ox + 4, oy + 4, '#e8c040', 2, 2); px(ox + 2, oy + 1, '#e8c040', 3, 1); px(ox + 5, oy + 1, '#d4d8e0', 3, 1); },
  scroll: (px, ox, oy) => { px(ox + 1, oy + 1, '#5a3414', 8, 7); px(ox + 2, oy + 2, '#f4ead2', 6, 5); px(ox + 3, oy + 3, '#8a6a3a', 4, 1); px(ox + 3, oy + 5, '#8a6a3a', 3, 1); px(ox, oy + 1, '#a07040', 1, 7); px(ox + 9, oy + 1, '#a07040', 1, 7); },
};
function signTex(kind) {
  return pixelTex(14, 16, (px) => {
    px(1, 0, '#4a2e14', 12, 1); px(0, 1, '#4a2e14', 1, 10); px(13, 1, '#4a2e14', 1, 10); px(1, 11, '#4a2e14', 12, 1);
    px(1, 1, '#f6dc94', 12, 10); px(1, 1, '#fff0bc', 12, 1); px(6, 12, '#4a2e14', 2, 4);
    ICON[kind](px, 2, 2);
  });
}
function plainTex(kind) { return pixelTex(10, 9, (px) => ICON[kind](px, 0, 0)); }
const spriteMat = (map) => new THREE.SpriteMaterial({ map, depthWrite: false, depthTest: false, transparent: true });
const ITEM_MAT = Object.fromEntries(['cedar', 'stone', 'gold', 'silver', 'iron', 'bronze', 'treasure', 'scroll'].map((k) => [k, spriteMat(plainTex(k))]));

// ---------------- Stations: the three work places and the king's chest ----------------
const STATIONS = [
  { kind: 'stone', key: 'quarry', at: L.sources.quarry.spot, lift: 2.3 },
  { kind: 'cedar', key: 'cedar', at: L.sources.cedar.spot, lift: 2.3 },
  { kind: 'iron', key: 'forge', at: L.sources.forge.spot, lift: 2.3 },
  { kind: 'treasure', key: 'treasury', at: L.treasury, lift: 2.2 },
];
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
for (const st of STATIONS) {
  st.y = groundAt(st.at.x, st.at.z);
  st.sign = new THREE.Sprite(spriteMat(signTex(st.kind))); st.sign.scale.set(0.82, 0.94, 1); st.sign.renderOrder = 4; scene.add(st.sign);
}
function updateStations(t, goal) {
  for (const st of STATIONS) {
    const on = S.act === 'prepare' && (st.key !== 'treasury' || !S.treasureGiven);
    st.sign.visible = on; if (!on) continue;
    const hot = goal && goal.station === st.key;
    const bob = Math.sin(t * (hot ? 5 : 2) + st.at.x) * (hot ? 0.14 : 0.05), sc = hot ? 1.18 : 1;
    st.sign.position.set(st.at.x, st.y + st.lift + bob, st.at.z); st.sign.scale.set(0.82 * sc, 0.94 * sc, 1);
  }
  chest.visible = !S.treasureGiven && S.carry !== 'treasure';
}
const goalRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); goalRing.rotation.x = -Math.PI / 2; goalRing.visible = false; scene.add(goalRing);

// ---------------- Cast ----------------
const villagerLook = (n) => ({ ...LOOKS.david, staff: false, sling: false, curly: false, skin: '#d29a74', skinDark: '#b07a58', hair: '#3a2a20', hairHi: '#4a3628', sandal: '#4a3020', belt: '#5a3a24', ...LOOKS.villagers[n % LOOKS.villagers.length] });
const elderLook = (n) => ({ ...villagerLook(n), beard: true, hair: '#c8c0b0', hairHi: '#e4ddd0', headcloth: ['#f4f0e6', '#d8c8a0', '#c8d4e0'][n % 3] });
const KING = { ...LOOKS.david, sling: false, staff: false, tunic: '#5a3a7a', tunicDark: '#3e2858', belt: '#c9a24a' }; // royal colours are imagined
const DAVID_LOOKS = [KING, { ...KING, beard: true, hair: '#7a6a5a', hairHi: '#9a8a78' }, { ...KING, beard: true, staff: true, hair: '#d8d2c4', hairHi: '#eeeae0' }]; // David grows old (대상 23:1)
const NATHAN_LOOK = { ...elderLook(1), tunic: '#e9e1cc', tunicDark: '#c7bea6', headcloth: '#f4f0e6', staff: true };
const SOLOMON_LOOK = { ...villagerLook(4), beard: false, tunic: '#2a4a8a', tunicDark: '#1a3060', headcloth: '#e8c040', belt: '#c9a24a' }; // 22:5 "어리고 연약하고"; his clothes are imagined
const FOREIGN = [{ tunic: '#8a5a2a', tunicDark: '#6a4220' }, { tunic: '#6a2a6a', tunicDark: '#4a1a4a', headcloth: '#e8d8b0' }, { tunic: '#4a4a4a', tunicDark: '#2a2a2a' }];
const david = new Actor(sheetFor('david0', 'human', DAVID_LOOKS[0]), { x: L.start.x, z: L.start.z });
let davidAge = 0;
const nathan = new Actor(sheetFor('nathan', 'human', NATHAN_LOOK), { x: L.nathan.x, z: L.nathan.z });
const carrySprite = new THREE.Sprite(ITEM_MAT.stone); carrySprite.scale.set(0.5, 0.45, 1); carrySprite.renderOrder = 5; carrySprite.visible = false; scene.add(carrySprite);
const S = T.createTemple(L, Number(params.get('seed')) || (Date.now() % 100000));

function bannerTex(text, n) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 40; const g = c.getContext('2d');
  g.fillStyle = '#2a1d0e'; g.fillRect(0, 0, 160, 40); g.fillStyle = ['#8a2a2a', '#2a4a7a', '#3a6a3a', '#c9a24a', '#6a3a7a'][n % 5]; g.fillRect(2, 2, 156, 36);
  g.fillStyle = '#fff7e2'; g.font = '700 21px "Apple SD Gothic Neo","Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 80, 21);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function bannerSprite(text, n) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bannerTex(text, n), depthWrite: false, depthTest: false, transparent: true })); sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 6; scene.add(sp); return sp; }
// crews: a foreman stands at each work place; carriers walk the road with loads
const crewCast = S.crews.map((c, n) => {
  const look = { ...villagerLook(n * 3 + 1), ...FOREIGN[n] };
  const foreman = new Actor(sheetFor('crew' + n, 'human', look), { x: c.spot.x + 0.9, z: c.spot.z - 0.6 });
  return { foreman, look, banner: bannerSprite(T.CREW_NAME[c.key], n), carriers: new Map() };
});
function carrierActor(n, q) {
  const cc = crewCast[n]; let e = cc.carriers.get(q.id); if (e) return e;
  const a = new Actor(sheetFor('crew' + n + 'c' + (cc.carriers.size % 2), 'human', { ...villagerLook(n * 3 + 2 + cc.carriers.size), ...FOREIGN[n] }), { x: q.x, z: q.z }); a.speedAnim = 7;
  const tag = new THREE.Sprite(ITEM_MAT.stone); tag.scale.set(0.42, 0.38, 1); tag.renderOrder = 5; tag.visible = false; scene.add(tag);
  e = { a, tag, px: q.x, pz: q.z }; cc.carriers.set(q.id, e); return e;
}
const giverCast = new Map();
function giverFor(g) {
  let e = giverCast.get(g.id); if (e) return e;
  const a = new Actor(sheetFor('elder' + (g.look % 3), 'human', elderLook(g.look)), { x: g.x, z: g.z }); a.speedAnim = 7;
  const mate = new Actor(sheetFor('v' + ((g.look + 4) % 9), 'human', villagerLook(g.look + 4)), { x: g.x + 0.6, z: g.z + 0.4 }); mate.speedAnim = 7;
  const tag = new THREE.Sprite(ITEM_MAT[g.gift]); tag.scale.set(0.46, 0.42, 1); tag.renderOrder = 5; scene.add(tag);
  e = { a, mate, tag, banner: bannerSprite(g.who, g.id + 1), px: g.x, pz: g.z }; giverCast.set(g.id, e); return e;
}
let solomon = null;

// ---------------- Input ----------------
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = keyName(e); keys.add(k);
  if (e.repeat) return;
  if ((k === 'enter' || k === ' ') && cardState.open) { e.preventDefault(); $('cardClose').click(); }
});
addEventListener('keyup', (e) => keys.delete(keyName(e)));
addEventListener('blur', () => keys.clear());
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const joyEl = $('joy'), knobEl = $('knob');
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || cardState.open) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0;
  joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.classList.add('on');
});
addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), m = 46;
  if (l > m) { dx *= m / l; dy *= m / l; }
  joy.dx = dx / m; joy.dy = dy / m; knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endJoy = (e) => { if (e.pointerId !== joy.id) return; joy.active = false; joy.dx = joy.dy = 0; joyEl.classList.remove('on'); knobEl.style.transform = ''; };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);

// ---------------- UI ----------------
let toastTimer = 0;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const cardState = { open: false, onClose: null };
function showCard({ place, title, verses, body = '', recorded, imagined, button, onClose, extra = '' }) {
  cardState.open = true; cardState.onClose = onClose;
  $('cardPlace').textContent = place; $('cardTitle').textContent = title;
  $('cardVerses').innerHTML = verses.map(([ref, txt]) => `<blockquote><p>${esc(txt)}</p><cite>${esc(ref)}</cite></blockquote>`).join('') + body;
  $('cardCols').style.display = recorded ? '' : 'none';
  if (recorded) { $('cardRecorded').innerHTML = recorded.map((t) => `<li>${esc(t)}</li>`).join(''); $('cardImagined').innerHTML = imagined.map((t) => `<li>${esc(t)}</li>`).join(''); }
  $('cardSource').textContent = `성경 본문: ${BIBLE_SOURCE}`;
  $('cardExtra').innerHTML = extra;
  $('cardClose').textContent = button;
  $('card').classList.add('show');
  $('card').querySelector('.sheet').scrollTop = 0;
  keys.clear(); joy.active = false; joyEl.classList.remove('on');
}
$('cardClose').addEventListener('click', () => { if (!cardState.open) return; cardState.open = false; $('card').classList.remove('show'); const f = cardState.onClose; cardState.onClose = null; f?.(); });

const PLACE = { palace: '다윗성', nathan: '다윗성', night: '다윗성 · 그 밤', word: '다윗성 · 그 밤', sit: '여호와 앞에', sat: '여호와 앞에', prepare: '다윗성 · 모리아', ready: '모리아 · 성전 터', refused: '모리아 · 성전 터', solomon: '모리아 · 성전 터', handed: '모리아 · 성전 터', done: '모리아' };
let hudCache = '';
function updateHUD() {
  const prep = S.act === 'prepare', after = ['ready', 'refused', 'solomon', 'handed', 'done'].includes(S.act);
  const crewN = S.crews.reduce((a, c) => a + c.carriers.length, 0);
  const key = [S.act, T.percent(S), Math.floor(S.prepT), crewN, S.gifts, S.sitT > 0 ? Math.round(S.sitT * 10) : 0, ...PILE_ORDER.map((k) => S.piles[k])].join('|');
  if (key === hudCache) return; hudCache = key;
  $('where').textContent = PLACE[S.act] || '다윗성';
  $('joined').textContent = prep || after ? `준비 ${T.percent(S)}%` : '다윗 왕';
  $('bread').textContent = prep ? `일꾼 ${crewN}/${T.CREW_MAX * 3}${S.givers.length ? ` · 예물 ${S.gifts}/${T.GIVERS.length}` : ''}` : after ? `예물 ${S.gifts}/${T.GIVERS.length}` : '';
  $('rumor').style.display = prep ? '' : 'none';
  if (prep) {
    $('rumorLabel').textContent = '다윗의 날';
    $('rumorFill').style.width = `${T.daysLeft(S) * 100}%`;
    $('rumorHint').textContent = T.daysLeft(S) < 0.25 ? '날이 그림자 같아서 (대상 29:15)' : '다 하기 전에 많이 준비하세요 (대상 22:5)';
    $('rumor').classList.toggle('hot', T.daysLeft(S) < 0.2);
  }
  $('piles').style.display = prep || after ? '' : 'none';
  if (prep || after) $('piles').innerHTML = PILE_ORDER.map((k) => `<span class="${S.piles[k] >= T.NEED[k] ? 'ok' : ''}">${T.ITEM_NAME[k]} ${Math.min(S.piles[k], T.NEED[k])}/${T.NEED[k]}</span>`).join('');
  $('sitRing').classList.toggle('on', S.act === 'sit' && S.sitT > 0);
  $('sitArc').setAttribute('stroke-dashoffset', String(176 * (1 - Math.min(1, S.sitT / T.SIT_TIME))));
  $('night').classList.toggle('on', S.act === 'night' || S.act === 'word');
}

// ---------------- Scripture (개역한글, bskorea.or.kr) ----------------
const V = {
  '삼하 7:1': '여호와께서 사방의 모든 대적을 파하사 왕으로 궁에 평안히 거하게 하신 때에',
  '삼하 7:2': '왕이 선지자 나단에게 이르되 볼찌어다 나는 백향목 궁에 거하거늘 하나님의 궤는 휘장 가운데 있도다',
  '삼하 7:3': '나단이 왕께 고하되 여호와께서 왕과 함께 계시니 무릇 마음에 있는 바를 행하소서',
  '삼하 7:4': '그 밤에 여호와의 말씀이 나단에게 임하여 가라사대',
  '삼하 7:5': '가서 내 종 다윗에게 말하기를 여호와의 말씀이 네가 나를 위하여 나의 거할 집을 건축하겠느냐',
  '삼하 7:11': '… 여호와가 또 네게 이르노니 여호와가 너를 위하여 집을 이루고',
  '삼하 7:12': '네 수한이 차서 네 조상들과 함께 잘 때에 내가 네 몸에서 날 자식을 네 뒤에 세워 그 나라를 견고케 하리라',
  '삼하 7:13': '저는 내 이름을 위하여 집을 건축할 것이요 나는 그 나라 위를 영원히 견고케 하리라',
  '삼하 7:18': '다윗 왕이 여호와 앞에 들어가 앉아서 가로되 주 여호와여 나는 누구오며 내 집은 무엇이관대 나로 이에 이르게 하셨나이까',
  '대상 22:5': '다윗이 가로되 내 아들 솔로몬이 어리고 연약하고 여호와를 위하여 건축할 전은 극히 장려하여 만국에 명성과 영광이 있게 하여야 할찌라 그러므로 내가 이제 위하여 준비하리라 하고 죽기 전에 많이 준비하였더라',
  '대상 22:7': '이르되 내 아들아 나는 내 하나님 여호와의 이름을 위하여 전을 건축할 마음이 있었으나',
  '대상 22:8': '여호와의 말씀이 내게 임하여 이르시되 너는 피를 심히 많이 흘렸고 크게 전쟁하였느니라 네가 내 앞에서 땅에 피를 많이 흘렸은즉 내 이름을 위하여 전을 건축하지 못하리라',
  '대상 22:9': '한 아들이 네게서 나리니 저는 평강의 사람이라 내가 저로 사면 모든 대적에게서 평강하게 하리라 그 이름을 솔로몬이라 하리니 이는 내가 저의 생전에 평안과 안정을 이스라엘에게 줄 것임이니라',
  '대상 22:10': '저가 내 이름을 위하여 전을 건축할찌라 저는 내 아들이 되고 나는 저의 아비가 되어 그 나라 위를 이스라엘 위에 굳게 세워 영원까지 이르게 하리라 하셨나니',
  '대상 28:11': '다윗이 전의 낭실과 그 집들과 그 곳간과 다락과 골방과 속죄소의 식양을 그 아들 솔로몬에게 주고',
  '대상 28:19': '다윗이 가로되 이 위의 모든 것의 식양을 여호와의 손이 내게 임하여 그려 나로 알게 하셨느니라',
  '대상 28:20': '또 그 아들 솔로몬에게 이르되 너는 강하고 담대하게 이 일을 행하고 두려워 말며 놀라지 말라 네가 여호와의 전 역사의 모든 일을 마칠 동안에 여호와 하나님 나의 하나님이 너와 함께하사 네게서 떠나지 아니하시고 너를 버리지 아니하시리라',
  '대상 29:3': '성전을 위하여 예비한 이 모든 것 외에도 내 마음에 내 하나님의 전을 사모하므로 나의 사유의 금, 은으로 내 하나님의 전을 위하여 드렸노니',
  '대상 29:5': '금, 은 그릇을 만들며 공장의 손으로 하는 모든 일에 쓰게 하였노니 오늘날 누가 즐거이 손에 채워 여호와께 드리겠느냐',
  '대상 29:6': '이에 모든 족장과 이스라엘 모든 지파 어른과 천부장과 백부장과 왕의 사무감독이 다 즐거이 드리되',
  '대상 29:9': '백성이 자기의 즐거이 드림으로 기뻐하였으니 곧 저희가 성심으로 여호와께 즐거이 드림이며 다윗 왕도 기쁨을 이기지 못하여 하니라',
  '대상 29:14': '나와 나의 백성이 무엇이관대 이처럼 즐거운 마음으로 드릴 힘이 있었나이까 모든 것이 주께로 말미암았사오니 우리가 주의 손에서 받은 것으로 주께 드렸을 뿐이니이다',
  '대상 29:15': '주 앞에서는 우리가 우리 열조와 다름이 없이 나그네와 우거한 자라 세상에 있는 날이 그림자 같아서 머무름이 없나이다',
};
const v = (ref) => [ref, V[ref]];
const COMMAND_LINE = {
  quarry: '"석수를 시켜 하나님의 전을 건축할 돌을 다듬게하고" (대상 22:2)',
  cedar: '"시돈 사람과 두로 사람이 백향목을 다윗에게로 많이 수운하여 왔음이라" (대상 22:4)',
  forge: '"문짝못과 거멀못에 쓸 철을 한 없이 준비하고" (대상 22:3)',
};

// ---------------- Events from the simulation ----------------
let firstExample = true, firstDeliver = true;
function handle(ev) {
  switch (ev.type) {
    case 'nathan': showCard({
      place: '다윗성 · 휘장 앞', title: '무릇 마음에 있는 바를 행하소서',
      verses: [v('삼하 7:3')],
      body: '<p class="note">나단은 짓자고 합니다. 그런데 그 밤에…</p>',
      button: '그 밤', onClose: () => T.night(S),
    }); break;
    case 'word': showCard({
      place: '다윗성 · 그 밤', title: '여호와가 너를 위하여 집을 이루고',
      verses: [v('삼하 7:4'), v('삼하 7:5'), v('삼하 7:11'), v('삼하 7:12'), v('삼하 7:13')],
      body: '<p class="note">다윗이 하나님의 집을 짓는 것이 아니라, 여호와께서 다윗의 집을 세우신다고 하십니다. 하나님의 집은 다윗의 아들이 지을 것입니다.</p>',
      button: '여호와 앞에 들어가 앉기', onClose: () => { T.toSit(S); toast('궤가 있는 휘장 앞으로 가서 가만히 멈춰 있으세요.', 3600); },
    }); break;
    case 'sat': showCard({
      place: '여호와 앞에', title: '나는 누구오며',
      verses: [v('삼하 7:18'), v('대상 22:5')],
      body: '<p class="note">지을 수는 없어도 준비할 수는 있습니다. 세 일터에 가서 명하고, 직접 나르고, 당신의 금과 은을 드리세요. <b>다윗의 날이 다하기 전에.</b> 왕이 직접 나르면 그 일터에 일꾼이 늘어납니다.</p>',
      button: '준비하기', onClose: () => T.startPrepare(S),
    }); break;
    case 'prepare': toast(isMobile ? '화면을 끌어서 걷기. 서쪽 채석장, 북서쪽 백향목 길, 동쪽 대장간에 가서 명하세요.' : 'WASD/방향키로 걷기. 서쪽 채석장, 북서쪽 백향목 길, 동쪽 대장간에 가서 명하세요.', 5200); break;
    case 'commanded': toast(`${T.CREW_NAME[ev.key]}에게 명했습니다. ${COMMAND_LINE[ev.key]}`, 4600); popText('명하여', S.crews.find((c) => c.key === ev.key).spot); break;
    case 'pickup': if (ev.item === 'treasure') toast('당신의 금과 은입니다. 북쪽 모리아 성전 터로 가져가세요.', 3600); else if (firstDeliver) toast(`${T.ITEM_NAME[ev.item]}을 메었습니다. 화살표를 따라 모리아 성전 터로 가져가면 쌓입니다.`, 3600); break;
    case 'delivered':
      popText(`+1 ${T.ITEM_NAME[ev.item]}`, L.piles[ev.item]);
      if (ev.by === 'david') firstDeliver = false;
      break;
    case 'example': { const c = S.crews.find((q) => q.key === ev.key); popText(`일꾼 ${ev.n}/${T.CREW_MAX}`, c.spot); if (firstExample) { firstExample = false; toast(`왕이 직접 나르자 ${T.CREW_NAME[ev.key]} 한 사람이 더 일을 맡았습니다. 일터마다 넷까지 늘어납니다.`, 4600); } break; }
    case 'treasure': showCard({
      place: '모리아 · 성전 터', title: '누가 즐거이 드리겠느냐',
      verses: [v('대상 29:3'), v('대상 29:5')],
      body: '<p class="note">왕이 먼저 자기 것을 드렸습니다.</p>',
      button: '백성을 부르기', onClose: () => T.callGivers(S),
    }); break;
    case 'givers': toast('족장들과 지파 어른들이 예물을 들고 성문에서 나옵니다 (대상 29:6).', 4200); break;
    case 'gift': { const g = S.givers.find((q) => q.who === ev.who && q.status === 'given' && q.gift === ev.item); popText(`${ev.who} · ${T.ITEM_NAME[ev.item]}`, L.piles[ev.item]);
      if (ev.gems) setTimeout(() => popText('보석 · 여호와의 전 곳간으로', g || L.yard), 500);
      if (ev.n === T.GIVERS.length) toast('"백성이 자기의 즐거이 드림으로 기뻐하였으니" (대상 29:9)', 4600);
      break; }
    case 'ready': toast('다 준비되었습니다. 이제 성전 터 한가운데로 들어가 보세요.', 4200); break;
    case 'evening': toast(`다윗의 날이 저물었습니다. 준비한 것 ${ev.percent}%가 쌓였습니다. 성전 터 한가운데로 가 보세요.`, 5200); break;
    case 'refused': showCard({
      place: '모리아 · 성전 터', title: '내 이름을 위하여 전을 건축하지 못하리라',
      verses: [v('대상 22:7'), v('대상 22:8'), v('대상 22:9'), v('대상 22:10')],
      body: '<p class="note">다윗은 이 집을 짓지 못합니다. 짓는 사람은 그의 아들 솔로몬입니다. 다윗은 그를 불렀습니다 (22:6).</p>',
      button: '솔로몬을 부르기', onClose: () => T.callSolomon(S),
    }); break;
    case 'solomon-coming': toast('솔로몬이 성문에서 올라옵니다.', 3000); break;
    case 'handed': showCard({
      place: '모리아 · 성전 터', title: '강하고 담대하게',
      verses: [v('대상 28:11'), v('대상 28:19'), v('대상 28:20')],
      button: '다윗의 기도', onClose: () => showCard({
        place: '온 회중 앞에서', title: '주의 손에서 받은 것으로',
        verses: [v('대상 29:14'), v('대상 29:15')],
        button: '마치기', onClose: showEnding,
      }),
    }); break;
  }
}
const pops = [];
function popText(text, p) {
  if (!p) return;
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = text; $('hud').appendChild(el);
  pops.push({ el, x: p.x, z: p.z, t: 0 });
}

// best preparation (higher is better), saved once per run
const prevRecord = (() => { try { return T.parseRecord(localStorage.getItem(SAVE_KEY)); } catch { return null; } })();
function showEnding() {
  T.finish(S);
  const s = T.summary(S), rec = T.record(prevRecord, s);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(rec)); } catch { /* private mode: the run still ends */ }
  const crews = s.crews.reduce((a, b) => a + b, 0);
  showCard({
    place: '5막 · 성전 준비', title: '죽기 전에 많이 준비하였더라',
    verses: [v('대상 22:5')],
    body: `<div class="stats"><div><b>${s.percent}%</b><span>준비한 것 (${s.prepared}/${s.total})</span></div><div><b>${s.byDavid}</b><span>왕이 직접 나른 짐</span></div><div><b>${crews}</b><span>일터의 일꾼</span></div><div><b>${s.gifts}/${s.givers}</b><span>즐거이 드린 무리</span></div></div>
      <p class="note">${s.lateEnd ? '다윗의 날이 다하기까지' : '다윗의 날이 다하기 전에'} 돌과 백향목과 철과 놋, 금과 은이 성전 터에 쌓였습니다. 그 위에 집은 서지 않았습니다. 그 집은 솔로몬이 짓습니다. 여호와께서 다윗의 집을 세우시고, 다윗은 아들이 지을 집을 준비했습니다.</p>`,
    recorded: [
      '다윗이 백향목 궁에 살 때 하나님의 궤는 휘장 가운데 있었다. 다윗이 이를 말하자 나단은 처음에 "행하소서"라고 했다 (삼하 7:1–3).',
      '그 밤 여호와께서 나단을 통해, 다윗이 아니라 다윗의 몸에서 날 자식이 여호와의 이름을 위하여 집을 지을 것이며, 여호와께서 다윗의 집을 세우시겠다고 하셨다 (삼하 7:4–16).',
      '다윗 왕은 여호와 앞에 들어가 앉아 "나는 누구오며"라고 기도했다 (삼하 7:18).',
      '다윗은 석수에게 돌을 다듬게 하고 철과 놋과 백향목을 많이 준비했다. 백향목은 시돈 사람과 두로 사람이 가져왔다. 솔로몬이 어리고 연약하므로 죽기 전에 많이 준비했다 (대상 22:2–5).',
      '역대상은 다윗이 전쟁을 많이 하여 피를 흘렸으므로 성전을 짓지 못한다고 기록한다 (대상 22:8, 28:3). 짓는 사람은 평강의 사람 솔로몬이다 (22:9–10).',
      '다윗은 자기 사유의 금과 은을 드렸고, 족장들과 지파 어른들과 천부장, 백부장, 왕의 사무감독이 즐거이 드렸다. 보석은 여호와의 전 곳간에 드렸다. 백성이 기뻐했다 (대상 29:3–9).',
      '다윗은 성전의 식양을 솔로몬에게 주고 "강하고 담대하게" 하라고 했다 (대상 28:11–20). 성전 자리는 모리아 산, 오르난의 타작마당이다 (대하 3:1).',
    ],
    imagined: [
      '다윗성, 휘장 친 궤, 모리아의 성전 터, 채석장과 대장간과 백향목 길의 모양과 위치, 터에 그린 윤곽선',
      '휘장 앞에서 몇 초 동안 가만히 멈춰 있는 방식. 본문은 "들어가 앉아서"라고만 한다',
      '왕이 직접 나르면 일꾼이 늘어나는 방식. 본문은 "다윗이 명하여"라고만 한다',
      '준비한 양의 목표치와 퍼센트, 예물을 드린 무리의 순서와 수. 본문의 양은 훨씬 크다 (대상 22:14, 29:4–7)',
      '다윗이 늙어 가며 느려지고 머리가 세는 것 ("다윗이 나이 많아 늙으매", 대상 23:1에서 착안)',
      '"대장장이"라는 이름. 철과 놋을 누가 다뤘는지는 기록되지 않았다',
      '솔로몬이 성전 터로 올라와 식양을 받는 장면. 본문은 다윗이 솔로몬을 불러 부탁했다고 한다 (22:6)',
    ],
    extra: `<div class="links"><a href="./temple.html">다시 하기</a><a href="./hebron.html">4막 · 헤브론</a><a href="./adullam.html">1막부터</a><a href="./">다윗의 땅</a></div>`,
    button: '다윗의 땅으로', onClose: () => { location.href = './'; },
  });
}

// ---------------- Where to go next: one goal at a time ----------------
function goalPoint() {
  const near = (list) => list.sort((a, b) => Math.hypot(a.x - david.x, a.z - david.z) - Math.hypot(b.x - david.x, b.z - david.z))[0] || null;
  switch (S.act) {
    case 'palace': return { ...L.nathan, icon: 'scroll' };
    case 'sit': return { ...L.tentSpot, icon: 'scroll' };
    case 'prepare': {
      if (S.carry) return { ...L.yard, icon: S.carry };
      const idle = S.crews.filter((c) => c.status === 'idle');
      if (idle.length) { const c = near(idle.map((q) => ({ x: q.spot.x, z: q.spot.z, key: q.key, item: q.item }))); return { ...c, station: c.key, icon: c.item === 'metal' ? 'iron' : c.item }; }
      if (!S.treasureGiven) return { ...L.treasury, station: 'treasury', icon: 'treasure' };
      const lo = T.lowest(S);
      if (lo && lo.src) { const c = S.crews.find((q) => q.key === lo.src); return { x: c.spot.x, z: c.spot.z, station: c.key, icon: lo.key }; }
      return null;
    }
    case 'ready': return { ...L.buildRing, icon: 'scroll' };
    case 'solomon': return S.solomon ? { x: S.solomon.x, z: S.solomon.z, icon: 'scroll' } : null;
    default: return null;
  }
}
const marks = [];
const ICON_URL = Object.fromEntries(Object.keys(ICON).map((k) => [k, signTex(k).image.toDataURL()]));
function markEl(n) {
  while (marks.length <= n) { const el = document.createElement('div'); el.className = 'edge'; el.innerHTML = '<i></i><img alt="">'; $('hud').appendChild(el); marks.push(el); }
  return marks[n];
}
const safeBox = { at: -1e9, top: 140, bottom: 600 };
function edgeMarks(goal) {
  // markers live inside a safe box: below the top HUD, above the bottom hint, so they never sit on David or a panel
  const W = innerWidth, VH = innerHeight, m = 34;
  if (performance.now() - safeBox.at > 500) { // measure the panels that are actually on screen
    let t = 60, b = VH - 60;
    for (const id of ['where', 'homeBtn', 'joined', 'rumor', 'piles']) { const el = $(id); if (!el || !el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.height && r.top < VH * 0.5) t = Math.max(t, r.bottom + 24); }
    const pr = $('prompt'); if (pr.classList.contains('show')) { const r = pr.getBoundingClientRect(); if (r.height) b = Math.min(b, r.top - 24); }
    safeBox.top = Math.min(t, VH * 0.6); safeBox.bottom = Math.max(b, safeBox.top + 40); safeBox.at = performance.now();
  }
  const top = safeBox.top, bottom = safeBox.bottom;
  const screenOf = (x, z) => { proj.set(x, groundAt(x, z) + 1, z).project(camera); return { sx: (proj.x * 0.5 + 0.5) * W, sy: (-proj.y * 0.5 + 0.5) * VH, behind: proj.z > 1 }; };
  const onScreen = (x, z) => { const q = screenOf(x, z); return !q.behind && q.sx > m && q.sx < W - m && q.sy > top && q.sy < bottom; };
  const list = goal && !cardState.open && !onScreen(goal.x, goal.z) ? [goal] : [];
  let n = 0;
  for (const it of list) {
    const q = screenOf(it.x, it.z), cx = W / 2, cy = (top + bottom) / 2;
    let dx = q.sx - cx, dy = q.sy - cy; if (q.behind) { dx = -dx; dy = -dy; }
    const e = 1e-3, k = Math.min(dx > 0 ? (W - m - cx) / Math.max(e, dx) : (cx - m) / Math.max(e, -dx), dy > 0 ? (bottom - cy) / Math.max(e, dy) : (cy - top) / Math.max(e, -dy));
    const el = markEl(n++); el.style.display = 'block';
    el.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px) translate(-50%, -50%)`;
    el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const img = el.lastChild, icon = it.icon || 'scroll'; if (img.dataset.k !== icon) { img.src = ICON_URL[icon]; img.dataset.k = icon; }
    el.classList.add('goal'); el.dataset.n = '';
  }
  for (let k = n; k < marks.length; k++) marks[k].style.display = 'none';
}

// ---------------- Resize ----------------
let camDist = 40;
function resize() {
  const w = innerWidth, h = innerHeight;
  const pr = Math.min(devicePixelRatio || 1, Math.sqrt((isMobile ? 1.3e6 : 2.6e6) / (w * h)), 2);
  renderer.setPixelRatio(pr); renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  camDist = Math.max(40, 7 / (Math.tan(THREE.MathUtils.degToRad(15)) * camera.aspect));
}
addEventListener('resize', resize); resize();

// ---------------- Loop ----------------
const camTarget = new THREE.Vector3(david.x, david.y + 0.8, david.z);
const PITCH = THREE.MathUtils.degToRad(40);
let started = params.has('skip'), intro = started ? 0 : 1;
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fps = 0;
const tmp = new THREE.Vector3(), proj = new THREE.Vector3();
const DAY = { sky: new THREE.Color(0xdde6ea), hemiSky: new THREE.Color(0xc9dcf0), hemiGround: new THREE.Color(0x9a8662), sun: new THREE.Color(0xfff0d8) };
const DUSK = { sky: new THREE.Color(0x8a86a0), hemiSky: new THREE.Color(0x8f94c0), hemiGround: new THREE.Color(0x6a4e3a), sun: new THREE.Color(0xffb27a) };
const NIGHT = { sky: new THREE.Color(0x1c2240), hemiSky: new THREE.Color(0x3a4880), hemiGround: new THREE.Color(0x2a2430), sun: new THREE.Color(0x8aa0d8) };
const sunOffDay = new THREE.Vector3(18, 30, 12), sunOffDusk = new THREE.Vector3(28, 14, 6), sunOff = new THREE.Vector3();
const tmpC = new THREE.Color();
function applyLight(k, night) { // k: 0 day → 1 dusk; night: 0..1 blends toward moonlight
  const mix = (a, b, c) => tmpC.copy(a[c]).lerp(b[c], k).lerp(NIGHT[c], night);
  scene.background.copy(mix(DAY, DUSK, 'sky')); scene.fog.color.copy(scene.background);
  hemi.color.copy(mix(DAY, DUSK, 'hemiSky')); hemi.groundColor.copy(mix(DAY, DUSK, 'hemiGround')); sun.color.copy(mix(DAY, DUSK, 'sun'));
  hemi.intensity = (0.62 - 0.2 * k) * (1 - 0.35 * night); sun.intensity = (3.4 - 1.7 * k) * (1 - 0.7 * night);
  sunOff.copy(sunOffDay).lerp(sunOffDusk, k);
  post.mComp.uniforms.bloom.value = 0.5 + 0.4 * Math.max(k, night); post.mComp.uniforms.exposure.value = 0.92 + 0.14 * k; post.mComp.uniforms.warmth.value = 0.45 + 0.4 * k - 0.3 * night;
  water.material.uniforms.light.value = 1 - 0.35 * Math.max(k, night);
  return 1.2 + 5 * Math.max(k, night);
}
let nightK = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  time.value += dt; const t = time.value;

  // David
  let ix = 0, iz = 0;
  if (started && !cardState.open && S.act !== 'done') {
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowup') || keys.has('w')) iz -= 1;
    if (keys.has('arrowdown') || keys.has('s')) iz += 1;
    if (joy.active && Math.hypot(joy.dx, joy.dy) > 0.18) { ix = joy.dx; iz = joy.dy; }
  }
  const il = Math.hypot(ix, iz);
  david.moving = il > 0.1 && S.act !== 'night';
  if (david.moving) {
    const run = keys.has('shift') || (joy.active && il > 0.92);
    const sp = (run ? 6.2 : 4.4) * Math.min(1, il) * T.davidSpeed(S);
    tryMove(david, (ix / il) * sp * dt, (iz / il) * sp * dt);
    david.face(ix, iz); david.speedAnim = (run ? 11 : 8) * T.davidSpeed(S);
  }
  david.update(dt);
  // David's hair greys as his days pass (imagined; 대상 23:1)
  const age = S.act === 'prepare' ? (T.daysLeft(S) < 0.35 ? 2 : T.daysLeft(S) < 0.7 ? 1 : 0) : ['ready', 'refused', 'solomon', 'handed', 'done'].includes(S.act) ? 2 : 0;
  if (age !== davidAge) { davidAge = age; david.setSheet(sheetFor('david' + age, 'human', DAVID_LOOKS[age])); popText(age === 1 ? '세월이 흐릅니다' : '다윗이 나이 많아 늙으매', { x: david.x, z: david.z + 1.6 }); }

  // simulation
  if (started && !cardState.open) {
    T.step(S, dt, { david });
    for (const ev of T.drainEvents(S)) handle(ev);
  }

  // Nathan by the curtain
  nathan.face(david.x - nathan.x, david.z - nathan.z); nathan.update(dt);
  // crews: the foreman waits for the command; carriers walk with loads
  S.crews.forEach((c, n) => {
    const cc = crewCast[n], f = cc.foreman;
    f.face(david.x - f.x, david.z - f.z); f.update(dt);
    cc.banner.position.set(f.x, f.y + f.h + 0.45 + (c.status === 'idle' && S.act === 'prepare' ? Math.sin(t * 4) * 0.08 : 0), f.z);
    cc.banner.visible = S.act === 'prepare';
    for (const q of c.carriers) {
      const e = carrierActor(n, q), a = e.a, dx = q.x - e.px, dz = q.z - e.pz; e.px = q.x; e.pz = q.z;
      a.x = q.x; a.z = q.z; a.moving = Math.hypot(dx, dz) > 0.0005; if (a.moving) a.face(dx, dz); a.update(dt);
      e.tag.visible = !!q.load; if (q.load) { e.tag.material = ITEM_MAT[q.load]; e.tag.position.set(a.x, a.y + a.h + 0.25, a.z); }
    }
  });
  // the willing givers (29:6–9)
  for (const g of S.givers) {
    if (g.status === 'hidden') continue;
    const e = giverFor(g), a = e.a, dx = g.x - e.px, dz = g.z - e.pz; e.px = g.x; e.pz = g.z;
    a.x = g.x; a.z = g.z; a.moving = Math.hypot(dx, dz) > 0.0005; if (a.moving) a.face(dx, dz); else a.face(L.buildRing.x - a.x, L.buildRing.z - a.z); a.update(dt);
    const m = e.mate, mx = g.x + 0.6, mz = g.z + 0.45; m.moving = a.moving; m.x += (mx - m.x) * Math.min(1, dt * 6); m.z += (mz - m.z) * Math.min(1, dt * 6); if (m.moving) m.face(dx, dz); else m.dir = a.dir; m.update(dt);
    e.tag.visible = g.status === 'coming'; e.tag.position.set(a.x, a.y + a.h + 0.25, a.z);
    e.banner.visible = g.status === 'coming'; e.banner.position.set(a.x + 0.3, a.y + a.h + 0.7, a.z);
    if (g.status === 'given') { a.anim += dt * 4; a.setFrame(a.dir, Math.floor(a.anim) % 2 ? 1 : 0); } // rejoicing (29:9)
  }
  // Solomon (22:6)
  if (S.solomon && !solomon) solomon = new Actor(sheetFor('solomon', 'human', SOLOMON_LOOK), { x: S.solomon.x, z: S.solomon.z });
  if (solomon) { const dx = S.solomon.x - solomon.x, dz = S.solomon.z - solomon.z; solomon.moving = Math.hypot(dx, dz) > 0.0005; if (solomon.moving) solomon.face(dx, dz); else solomon.face(david.x - solomon.x, david.z - solomon.z); solomon.x = S.solomon.x; solomon.z = S.solomon.z; solomon.update(dt); }

  updatePiles();
  const goal = started && !cardState.open ? goalPoint() : null;
  goalRing.visible = !!goal;
  if (goal) { const k = (t * 1.4) % 1; goalRing.position.set(goal.x, groundAt(goal.x, goal.z) + 0.08, goal.z); goalRing.scale.setScalar(0.8 + k * 0.5); goalRing.material.opacity = 0.7 * (1 - k); }
  const carry = S.carry || (S.act === 'solomon' ? 'scroll' : null);
  carrySprite.visible = !!carry; if (carry) { carrySprite.material = ITEM_MAT[carry]; carrySprite.position.set(david.x, david.y + david.h + 0.35 + Math.sin(t * 4) * 0.04, david.z); }
  // the outline glows brighter as more is prepared, and pulses when David is told to go in
  const pct = T.percent(S) / 100, pulse = S.act === 'ready' ? 0.25 + 0.2 * Math.sin(t * 4) : 0;
  ghostMat.opacity = 0.18 + pct * 0.32 + pulse;

  // camera
  camTarget.lerp(tmp.set(david.x, david.y + 0.8, david.z), Math.min(1, dt * 5));
  if (started && intro > 0) intro = Math.max(0, intro - dt / 2.4);
  const ease = intro * intro * (3 - 2 * intro);
  const dist = camDist * (1 + ease * 0.7), pitch = PITCH + ease * 0.25, orbit = started ? 0 : Math.sin(t * 0.1) * 5;
  camera.position.set(camTarget.x + orbit, camTarget.y + Math.sin(pitch) * dist, camTarget.z - ease * 8 + Math.cos(pitch) * dist);
  camera.lookAt(camTarget.x + orbit * 0.6, camTarget.y, camTarget.z - ease * 8);

  // light: afternoon in the palace, night for the word and the prayer, then a new morning that ages into dusk
  const nightTarget = ['night', 'word', 'sit', 'sat'].includes(S.act) ? 1 : 0;
  nightK += (nightTarget - nightK) * Math.min(1, dt * (nightTarget ? 1.2 : 0.6));
  const lightK = S.act === 'prepare' ? (1 - T.daysLeft(S)) * 0.8 : ['ready', 'refused', 'solomon', 'handed', 'done'].includes(S.act) ? 0.9 : 0.15;
  const fireI = applyLight(lightK, nightK);
  sun.target.position.copy(camTarget); sun.position.copy(camTarget).add(sunOff);
  const nearF = flames.map((f) => [f, f.pos.distanceToSquared(camTarget)]).sort((a, b) => a[1] - b[1]);
  firePool.forEach((l, n) => { const f = nearF[n]?.[0]; if (f) { l.position.copy(f.pos).add(tmp.set(0, 0.5, 0.2)); l.intensity = fireI * (0.85 + 0.15 * Math.sin(t * 17 + f.phase) * Math.sin(t * 7.3 + f.phase * 2)); } else l.intensity = 0; });
  const ff = Math.floor(t * 9);
  for (const f of flames) { const uv = f.mesh.geometry.attributes.uv, fr = (ff + Math.floor(f.phase * 3)) % 4; uv.setXY(0, fr / 4, 1); uv.setXY(1, (fr + 1) / 4, 1); uv.setXY(2, fr / 4, 0); uv.setXY(3, (fr + 1) / 4, 0); uv.needsUpdate = true; f.glow.material.opacity = 0.35 + Math.max(lightK, nightK) * 0.35; }
  water.material.uniforms.time.value = t;

  // HUD
  if (started) {
    updateHUD();
    const prompt = $('prompt'), hint = S.hint;
    if (hint && !cardState.open) { prompt.textContent = hint; prompt.classList.add('show'); } else prompt.classList.remove('show');
    edgeMarks(goal);
    updateStations(performance.now() / 1000, goal);
    for (let k = pops.length - 1; k >= 0; k--) { const p = pops[k]; p.t += dt; proj.set(p.x, groundAt(p.x, p.z) + 2.4 + p.t * 1.2, p.z).project(camera); p.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`; p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.4)); if (p.t > 1.4) { p.el.remove(); pops.splice(k, 1); } }
  }

  tmp.set(david.x, david.y + 0.7, david.z).project(camera);
  post.mComp.uniforms.focusY.value = THREE.MathUtils.clamp((tmp.y + 1) / 2, 0.25, 0.75);
  post.mComp.uniforms.dof.value = started ? 0.7 : 0.9;
  if (usePost) post.render(scene, camera, t); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(frame);
}

function start() {
  if (started) return;
  started = true;
  $('title').classList.add('hide'); $('hud').classList.add('show');
  showCard({
    place: '다윗성 · 백향목 궁', title: '하나님의 궤는 휘장 가운데 있도다',
    verses: [v('삼하 7:1'), v('삼하 7:2')],
    body: '<p class="note">싸움이 끝나고 평안이 왔습니다. 왕은 하나님의 집을 짓고 싶습니다.</p>',
    button: '나단에게 말하기', onClose: () => setTimeout(() => toast(isMobile ? '화면을 끌어서 걷기. 휘장 친 궤 곁의 나단에게 가세요.' : 'WASD/방향키로 걷기. 휘장 친 궤 곁의 나단에게 가세요.', 4200), 300),
  });
}
$('startBtn').addEventListener('click', start);
if (started) { $('title').classList.add('hide'); $('hud').classList.add('show'); }
if (prevRecord) $('best').textContent = `지난 준비: 최고 ${prevRecord.best}%`;
requestAnimationFrame(frame);

window.__temple = {
  S, T, world, david, get fps() { return fps; }, start,
  teleport(x, z) { david.x = x; david.z = z; david.y = groundAt(x, z); camTarget.set(x, david.y + 0.8, z); },
  info: () => renderer.info.render,
};
