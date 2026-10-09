// Act 4 · 헤브론 → 다윗성 — renderer, input and UI. Rules: adullam-logic.js (serving, roles) in Hebron,
// sequenced by hebron-logic.js (the tribes, the covenant, the timed building of the City of David). No attack exists.
import * as THREE from 'three';
import { canStep } from './world.js';
import { generateHebron } from './hebron-world.js';
import * as G from './adullam-logic.js';
import * as RankedLogic from './hebron-logic.js';
import { createLandRankingSession } from './ranking-session.js';
const ranking = createLandRankingSession('hebron');
const H = ranking.wrap(RankedLogic);
import { buildTerrain, buildWater, buildProps, buildVegetation, makeCoords, BILLBOARD_Q } from './scene.js';
import { makeCharacterSheet, LOOKS, makeFlameSheet, makeSoftTexture } from './pixel.js';
import { PostStack } from './post.js';
import { BIBLE_SOURCE } from './data.js';
import { keyName } from './keys.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const world = generateHebron();
const L = world.layout.stop;
const C = makeCoords(world);
const $ = (id) => document.getElementById(id);
const SAVE_KEY = H.ACT4_KEY;
const carriedFromAct3 = (() => { try { return Number(localStorage.getItem('david-ziklag-v1')) || 0; } catch { return 0; } })();
const SEG_N = world.features.segments.length;

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

// ---------------- Fires (static + growth) ----------------
const flameTex = makeFlameSheet();
const glowTex = makeSoftTexture(64, 'radial');
const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, alphaTest: 0.1, color: new THREE.Color(3.2, 2.2, 1.2), depthWrite: false });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6, 0.8, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
const stoneMat = new THREE.MeshLambertMaterial({ map: TX.fieldstone }), woodMat = new THREE.MeshLambertMaterial({ map: TX.wood });
const flames = [];
function groundAt(x, z) { const i = C.ti(x), j = C.tj(z); return world.inb(i, j) ? world.height[world.idx(i, j)] : 0; }
function waterAt(x, z) { const i = C.ti(x), j = C.tj(z); return world.inb(i, j) ? world.water[world.idx(i, j)] : -1; }
function addFire(x, z, size = 0.95) {
  const y = groundAt(x, z), g = new THREE.Group();
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), stoneMat); m.position.set(x + Math.cos(a) * 0.36, y + 0.06, z + Math.sin(a) * 0.36); m.rotation.y = a; g.add(m); }
  for (const r of [0.6, -0.7]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), woodMat); m.position.set(x, y + 0.06, z); m.rotation.y = r; g.add(m); }
  g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  scene.add(g);
  const geo = new THREE.PlaneGeometry(0.5 * size, 0.75 * size); geo.translate(0, 0.37 * size, 0);
  const mesh = new THREE.Mesh(geo, flameMat); mesh.position.set(x, y + 0.08, z); mesh.quaternion.copy(BILLBOARD_Q); scene.add(mesh);
  const glow = new THREE.Sprite(glowMat); glow.position.set(x, y + 0.08 + 0.35 * size, z); glow.scale.setScalar(2.2 * size); scene.add(glow);
  const f = { pos: new THREE.Vector3(x, y + 0.08, z), size, mesh, glow, phase: flames.length * 1.7, group: g };
  flames.push(f);
  return f;
}
addFire(L.fire.x, L.fire.z, 1);
for (const f of world.features.fires) addFire(C.wx(f.i), C.wz(f.j), 0.9); // the camp below Zion
const firePool = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa54a, 0, 9, 1.6); scene.add(l); return l; });

// ---------------- Growth: tents appear as the camp fills ----------------
function texBox(tex, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const n = f * 4 + v; uv.setXY(n, uv.getX(n) * dims[f][0], uv.getY(n) * dims[f][1]); }
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
}
function makeTent(i, j, style) {
  const tex = style ? TX.tentStripe : TX.tentBlack, w = 2.4, d = 1.9;
  const x = C.wx(i), z = C.wz(j), y = groundAt(x, z), g = new THREE.Group();
  const body = texBox(tex, w - 0.2, 0.45, d - 0.5); body.position.set(0, 0.225, 0); g.add(body);
  const pg = new THREE.CylinderGeometry(1, 1, w + 0.1, 3, 1, false); pg.rotateZ(Math.PI / 2); pg.rotateX(-Math.PI / 2); pg.computeBoundingBox();
  const bb = pg.boundingBox; pg.translate(0, -bb.min.y, 0); pg.scale(1, 0.75 / (bb.max.y - bb.min.y), (d / 2) / Math.max(Math.abs(bb.min.z), bb.max.z));
  const roof = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ map: tex })); roof.position.y = 0.45; g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1410 })); door.position.set(0, 0.21, (d - 0.5) / 2 + 0.02); g.add(door);
  const awn = texBox(tex, w * 0.7, 0.05, 0.6); awn.position.set(0, 0.64, d / 2 + 0.25); awn.rotation.x = 0.35; g.add(awn);
  for (const sx of [-1, 1]) { const pole = texBox(TX.wood, 0.05, 0.62, 0.05); pole.position.set(sx * w * 0.33, 0.31, d / 2 + 0.5); g.add(pole); }
  g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  g.position.set(x, y, z); g.scale.setScalar(0.01); scene.add(g);
  const ti = Math.round(i), tj = Math.round(j), tiles = []; // tent spots can be fractional; typed arrays ignore fractional indices
  for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 1; di++) { const k = world.idx(ti + di, tj + dj); if (!world.blocked[k]) { world.blocked[k] = 1; tiles.push(k); } }
  g.userData.tiles = tiles;
  return g;
}
// tents go up as households settle in Hebron's towns (2:3)
const growth = { tents: [], popping: [] };
function grow() {
  if (S.act === 'settle' && S.phase === 'play') {
    const want = Math.min(L.tentSpots.length, Math.floor(S.t / 9));
    while (growth.tents.length < want) { const s = L.tentSpots[growth.tents.length]; if (Math.hypot(david.x - C.wx(s.i), david.z - C.wz(s.j)) < 2.6) break; // never pitch a tent on David
      const g = makeTent(s.i, s.j, growth.tents.length % 2 === 1); growth.tents.push(g); growth.popping.push({ obj: g, t: 0 }); }
  }
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
  setFrame(dir, frame) {
    if (dir === this._d && frame === this._f) return;
    this._d = dir; this._f = frame;
    const e = 0.001, u0 = frame / 4 + e, u1 = (frame + 1) / 4 - e, v1 = 1 - dir / 4 - e, v0 = 1 - (dir + 1) / 4 + e, uv = this.geo.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true;
  }
  face(dx, dz, animal) { if (animal) { if (Math.abs(dx) > 0.02) this.dir = dx < 0 ? 2 : 3; } else this.dir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : dz < 0 ? 1 : 0; }
  update(dt) {
    if (this.moving) { this.anim += dt * (this.speedAnim || 8); this.setFrame(this.dir, Math.floor(this.anim) % 4); } else { this.anim = 0; this.setFrame(this.dir, 0); }
    this.y += (groundAt(this.x, this.z) - this.y) * Math.min(1, dt * 14);
    this.mesh.position.set(this.x, this.y, this.z);
    this.blob.position.set(this.x, Math.max(this.y, waterAt(this.x, this.z)) + 0.02, this.z + 0.05);
  }
  remove() { scene.remove(this.mesh, this.blob); }
}
function tryMove(a, dx, dz) {
  let moved = false;
  if (dx) { const ci = C.ti(a.x), cj = C.tj(a.z), nx = a.x + dx, pi = C.ti(nx + Math.sign(dx) * 0.3); if (pi === ci || canStep(world, ci, cj, pi, cj)) { a.x = nx; moved = true; } }
  if (dz) { const ci = C.ti(a.x), cj = C.tj(a.z), nz = a.z + dz, pj = C.tj(nz + Math.sign(dz) * 0.3); if (pj === cj || canStep(world, ci, cj, ci, pj)) { a.z = nz; moved = true; } }
  return moved;
}

// ---------------- Pixel icons (need bubbles, carried items, roles) ----------------
function pixelTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(px);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ICON = {
  water: (px, ox, oy) => { px(ox + 4, oy, '#2a4f8a', 2, 1); px(ox + 3, oy + 1, '#2a4f8a', 4, 1); px(ox + 2, oy + 2, '#2a4f8a', 6, 5); px(ox + 3, oy + 7, '#2a4f8a', 4, 1); px(ox + 3, oy + 2, '#6fb4e8', 4, 4); px(ox + 4, oy + 1, '#6fb4e8', 2, 1); px(ox + 3, oy + 6, '#4a8ccf', 4, 1); px(ox + 3, oy + 3, '#e6f6ff', 1, 2); },
  bread: (px, ox, oy) => { px(ox + 1, oy + 3, '#5a3414', 8, 4); px(ox + 2, oy + 2, '#5a3414', 6, 1); px(ox + 2, oy + 3, '#c98a3e', 6, 3); px(ox + 3, oy + 2, '#c98a3e', 4, 1); px(ox + 2, oy + 3, '#e8b866', 6, 1); px(ox + 3, oy + 4, '#8a5422', 1, 1); px(ox + 5, oy + 4, '#8a5422', 1, 1); px(ox + 7, oy + 4, '#8a5422', 1, 1); },
  fire: (px, ox, oy) => { px(ox + 4, oy, '#a8321a', 1, 2); px(ox + 3, oy + 2, '#a8321a', 4, 5); px(ox + 2, oy + 4, '#a8321a', 6, 3); px(ox + 4, oy + 2, '#f0782a', 2, 4); px(ox + 3, oy + 4, '#f0782a', 4, 2); px(ox + 4, oy + 4, '#ffd36a', 2, 2); px(ox + 2, oy + 7, '#5a3414', 6, 1); },
  share: (px, ox, oy) => { px(ox + 1, oy + 3, '#4a2410', 8, 5); px(ox + 2, oy + 3, '#b8423a', 6, 4); px(ox + 4, oy + 1, '#4a2410', 2, 2); px(ox + 3, oy + 2, '#e0c060', 4, 1); px(ox + 2, oy + 5, '#8a2a24', 6, 1); px(ox + 3, oy + 4, '#f0d890', 1, 1); },
  cedar: (px, ox, oy) => { px(ox, oy + 2, '#3a2010', 10, 5); px(ox + 1, oy + 3, '#a0643a', 8, 1); px(ox + 1, oy + 5, '#b8783e', 8, 1); px(ox + 1, oy + 4, '#7a4a28', 8, 1); px(ox + 8, oy + 2, '#e8c890', 2, 2); px(ox + 8, oy + 5, '#e8c890', 2, 2); px(ox + 9, oy + 3, '#c89a60', 1, 1); },
  stone: (px, ox, oy) => { px(ox + 1, oy + 4, '#4a4440', 8, 4); px(ox + 2, oy + 4, '#b8b0a0', 3, 3); px(ox + 5, oy + 4, '#a49c8c', 3, 3); px(ox + 3, oy + 1, '#4a4440', 5, 3); px(ox + 4, oy + 1, '#ccc4b2', 3, 2); },
  watch: (px, ox, oy) => { px(ox + 2, oy + 3, '#2a1d0e', 6, 3); px(ox + 1, oy + 4, '#2a1d0e', 8, 1); px(ox + 3, oy + 3, '#f4ead2', 4, 3); px(ox + 4, oy + 3, '#3f5d8c', 2, 3); px(ox + 4, oy + 4, '#111', 2, 1); },
};
function bubbleTex(kind, tint = '#f8f0dc') {
  return pixelTex(14, 15, (px) => {
    px(1, 0, '#3a2a1a', 12, 1); px(0, 1, '#3a2a1a', 1, 10); px(13, 1, '#3a2a1a', 1, 10); px(1, 11, '#3a2a1a', 12, 1);
    px(1, 1, tint, 12, 10); px(5, 12, '#3a2a1a', 4, 1); px(6, 13, '#3a2a1a', 2, 1); px(6, 12, tint, 2, 1);
    ICON[kind](px, 2, 2);
  });
}
function plainTex(kind) { return pixelTex(10, 9, (px) => ICON[kind](px, 0, 0)); }
const TEX = {
  bubble: { water: bubbleTex('water'), bread: bubbleTex('bread'), fire: bubbleTex('fire') },
  bubbleLate: { water: bubbleTex('water', '#f2c2a8'), bread: bubbleTex('bread', '#f2c2a8'), fire: bubbleTex('fire', '#f2c2a8') },
  item: { water: plainTex('water'), bread: plainTex('bread'), fire: plainTex('fire'), watch: plainTex('watch'), cedar: plainTex('cedar'), stone: plainTex('stone') },
};
const spriteMat = (map) => new THREE.SpriteMaterial({ map, depthWrite: false, depthTest: false, transparent: true });
const MATS = {
  bubble: Object.fromEntries(Object.entries(TEX.bubble).map(([k, v]) => [k, spriteMat(v)])),
  bubbleLate: Object.fromEntries(Object.entries(TEX.bubbleLate).map(([k, v]) => [k, spriteMat(v)])),
  item: Object.fromEntries(Object.entries(TEX.item).map(([k, v]) => [k, spriteMat(v)])),
};

// ---------------- Stations: where water, bread and cedar come from ----------------
function signTex(kind) {
  return pixelTex(14, 16, (px) => {
    px(1, 0, '#4a2e14', 12, 1); px(0, 1, '#4a2e14', 1, 10); px(13, 1, '#4a2e14', 1, 10); px(1, 11, '#4a2e14', 12, 1);
    px(1, 1, '#f6dc94', 12, 10); px(1, 1, '#fff0bc', 12, 1);
    px(6, 12, '#4a2e14', 2, 4);
    ICON[kind](px, 2, 2);
  });
}
const STATIONS = [
  { kind: 'water', at: L.spring, lift: 2.1, act: 'settle' },
  { kind: 'bread', at: L.basket, lift: 2.0, act: 'settle' },
  { kind: 'watch', at: L.lookout, lift: 2.2, act: 'settle' },
  { kind: 'water', at: L.zionSpring, lift: 2.0, act: 'build' },
  { kind: 'bread', at: L.zionBasket, lift: 2.0, act: 'build' },
  { kind: 'cedar', at: L.caravan, lift: 2.3, act: 'build', when: () => S.hiram?.arrived && S.cedar < H.CEDAR_LOADS },
];
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
for (const st of STATIONS) {
  const y = groundAt(st.at.x, st.at.z);
  st.sign = new THREE.Sprite(spriteMat(signTex(st.kind))); st.sign.scale.set(0.82, 0.94, 1); st.sign.renderOrder = 4; scene.add(st.sign);
  st.y = y;
  st.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); st.ring.rotation.x = -Math.PI / 2; st.ring.position.set(st.at.x, y + 0.08, st.at.z); st.ring.visible = false; scene.add(st.ring);
}
// a board of loaves by Hebron's storehouse that shows the bread stock
const boards = [L].map((st) => {
  const g = new THREE.Group(), y = groundAt(st.basket.x, st.basket.z);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.7), woodMat); board.position.set(st.basket.x - 0.2, y + 0.42, st.basket.z + 0.3); board.castShadow = true; g.add(board);
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.28, 0.28]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), woodMat); leg.position.set(st.basket.x - 0.2 + dx, y + 0.2, st.basket.z + 0.3 + dz); g.add(leg); }
  const loafMat = new THREE.MeshLambertMaterial({ color: 0xd59a4c }), loafGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.1, 8), loaves = [];
  for (let n = 0; n < 12; n++) { const l = new THREE.Mesh(loafGeo, loafMat); const c = n % 6, r = Math.floor(n / 6); l.position.set(st.basket.x - 0.8 + c * 0.24, y + 0.51 + r * 0.09, st.basket.z + 0.16 + r * 0.22 + (c % 2) * 0.05); l.castShadow = true; g.add(l); loaves.push(l); }
  scene.add(g);
  return { loaves };
});
let breadToldAt = -1;
function neededStation() {
  if (S.act === 'build') {
    if (S.carry) return null;
    const needy = S.crews.filter((c) => c.status === 'building' && c.need).sort((a, b) => Math.hypot(a.x - david.x, a.z - david.z) - Math.hypot(b.x - david.x, b.z - david.z))[0];
    return needy ? needy.need : null;
  }
  // the need of the closest person still waiting for something only David can fetch
  if (S.act !== 'settle' || S.phase !== 'play') return null;
  let best = null, bd = Infinity;
  for (const p of S.people) {
    if (p.status !== 'waiting' || p.claimedBy || p.need === 'fire' || p.need === S.carry) continue;
    const d = Math.hypot(p.x - david.x, p.z - david.z); if (d < bd) { bd = d; best = p.need; }
  }
  return best;
}
// a watcher keeps Hebron's gate; nothing hunts David here, so it is a gentle nudge only
function watchNudge() { return S.act === 'settle' && S.phase === 'play' && S.attention >= 35 && G.workers(S, 'watch').length === 0; }
const hasFollowers = () => S.people.some((p) => p.status === 'following');
function updateStations(t) {
  const need = neededStation();
  for (const st of STATIONS) {
    const on = S.act === st.act && (!st.when || st.when());
    if (!on) { st.sign.visible = false; st.ring.visible = false; continue; }
    const hot = st.kind === need || (st.kind === 'bread' && st.act === 'settle' && breadToldAt >= 0 && t - breadToldAt < 6) || (st.kind === 'watch' && watchNudge()) || (st.kind === 'cedar' && !S.carry && cedarTime());
    const bob = Math.sin(t * (hot ? 5 : 2) + st.at.x) * (hot ? 0.14 : 0.05);
    st.sign.position.set(st.at.x, st.y + st.lift + bob, st.at.z);
    const sc = hot ? 1.18 : 1; st.sign.scale.set(0.82 * sc, 0.94 * sc, 1);
    st.ring.visible = hot; if (hot) { const k = (t * 1.4) % 1; st.ring.scale.setScalar(0.8 + k * 0.5); st.ring.material.opacity = 0.7 * (1 - k); }
    st.sign.visible = true;
  }
  boards.forEach((b) => { for (let n = 0; n < b.loaves.length; n++) b.loaves[n].visible = n < S.bread; });
}
const cedarTime = () => S.act === 'build' && S.hiram?.arrived && S.cedar < H.CEDAR_LOADS && !S.crews.some((c) => c.status === 'building' && c.need) && !H.following(S).length;

// ---------------- Cast ----------------
const villagerLook = (n) => ({ ...LOOKS.david, staff: false, sling: false, curly: false, skin: '#d29a74', skinDark: '#b07a58', hair: '#3a2a20', hairHi: '#4a3628', sandal: '#4a3020', belt: '#5a3a24', ...LOOKS.villagers[n % LOOKS.villagers.length] });
const elderLook = (n) => ({ ...villagerLook(n), beard: true, hair: '#c8c0b0', hairHi: '#e4ddd0', headcloth: ['#f4f0e6', '#d8c8a0', '#c8d4e0'][n % 3] }); // the elders of the tribes (5:3)
const TYRE_LOOK = { ...villagerLook(2), beard: true, tunic: '#6a2a6a', tunicDark: '#4a1a4a', headcloth: '#e8d8b0', belt: '#c9a24a' }; // Hiram's messenger (5:11): the purple is imagined
const david = new Actor(sheetFor('david', 'human', LOOKS.david), { x: L.entry.x, z: L.entry.z });
const carrySprite = new THREE.Sprite(MATS.item.water); carrySprite.scale.set(0.5, 0.45, 1); carrySprite.renderOrder = 5; carrySprite.visible = false; scene.add(carrySprite);
const S = H.createHebron(L, Number(params.get('seed')) || (Date.now() % 100000), carriedFromAct3 || H.DEFAULT_CARRIED);
const cast = new Map(); // person id -> { actor, bubble, tag }
function castFor(p) {
  let c = cast.get(p.id);
  if (c) return c;
  const actor = new Actor(sheetFor('v' + (p.look % 9), 'human', villagerLook(p.look)), { x: p.x, z: p.z });
  actor.speedAnim = 7;
  const bubble = new THREE.Sprite(MATS.bubble.water); bubble.scale.set(0.78, 0.84, 1); bubble.renderOrder = 6; scene.add(bubble);
  const tag = new THREE.Sprite(MATS.item.water); tag.scale.set(0.36, 0.32, 1); tag.renderOrder = 6; tag.visible = false; scene.add(tag);
  c = { actor, bubble, tag, px: p.x, pz: p.z };
  cast.set(p.id, c);
  return c;
}
// a small cloth banner with the tribe's name, carried above each group (the banners are imagined)
const BANNER = ['#8a2a2a', '#2a4a7a', '#3a6a3a', '#c9a24a', '#6a3a7a', '#2a6a6a'];
function bannerTex(text, n) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 40; const g = c.getContext('2d');
  g.fillStyle = '#2a1d0e'; g.fillRect(0, 0, 128, 40); g.fillStyle = BANNER[n % BANNER.length]; g.fillRect(2, 2, 124, 36);
  g.fillStyle = '#fff7e2'; g.font = '700 22px "Apple SD Gothic Neo","Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 21);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function bannerSprite(text, n) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bannerTex(text, n), depthWrite: false, depthTest: false, transparent: true })); sp.scale.set(1.3, 0.41, 1); sp.renderOrder = 6; scene.add(sp); return sp; }
const elders = new Map(); // tribe id -> { actor, banner, px, pz }
function elderFor(t) {
  let e = elders.get(t.id); if (e) return e;
  const actor = new Actor(sheetFor('elder' + (t.look % 3), 'human', elderLook(t.look)), { x: t.x, z: t.z }); actor.speedAnim = 6;
  const mate = new Actor(sheetFor('v' + ((t.look + 4) % 9), 'human', villagerLook(t.look + 4)), { x: t.x + 0.6, z: t.z - 0.4 }); mate.speedAnim = 6;
  e = { actor, mate, banner: bannerSprite(t.name, t.id), px: t.x, pz: t.z }; elders.set(t.id, e); return e;
}
const crewCast = new Map(); // crew id -> { actor, mate, banner, bubble, tag }
function crewFor(c) {
  let e = crewCast.get(c.id); if (e) return e;
  const actor = new Actor(sheetFor('v' + (c.look % 9), 'human', villagerLook(c.look)), { x: c.x, z: c.z }); actor.speedAnim = 7;
  const mate = new Actor(sheetFor('v' + ((c.look + 3) % 9), 'human', villagerLook(c.look + 3)), { x: c.x + 0.5, z: c.z + 0.3 }); mate.speedAnim = 7;
  const bubble = new THREE.Sprite(MATS.bubble.water); bubble.scale.set(0.78, 0.84, 1); bubble.renderOrder = 6; bubble.visible = false; scene.add(bubble);
  const tag = new THREE.Sprite(MATS.item.stone); tag.scale.set(0.36, 0.32, 1); tag.renderOrder = 6; tag.visible = false; scene.add(tag);
  e = { actor, mate, banner: bannerSprite(c.tribe, c.id + 1), bubble, tag, px: c.x, pz: c.z }; crewCast.set(c.id, e); return e;
}
let hiram = null, hiramMate = null;

// ---------------- Places: the covenant stone, Millo, the wall ring, the king's house ----------------
const ashlarMat = new THREE.MeshLambertMaterial({ map: TX.ashlar || TX.fieldstone }), ghostMat = new THREE.MeshBasicMaterial({ color: 0xf6dc94, transparent: true, opacity: 0.18, depthWrite: false });
{ // the covenant stone in Hebron's square (imagined; 5:3 says only "여호와 앞에서")
  const f = world.features.covenant, x = C.wx(f.i), z = C.wz(f.j), y = groundAt(x, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.5), stoneMat); m.position.set(x, y + 0.8, z); m.castShadow = m.receiveShadow = true; scene.add(m);
}
{ // Millo: a stepped stone terrace on the stronghold's north-east shoulder (placement imagined)
  const f = world.features.millo, x = C.wx(f.i), z = C.wz(f.j), y = groundAt(x, z), g = new THREE.Group();
  for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(3.4 - k * 0.7, 0.45, 2.4 - k * 0.45), ashlarMat); m.position.set(x, y - 0.6 + k * 0.45, z); m.castShadow = m.receiveShadow = true; g.add(m); }
  scene.add(g);
}
// wall segments: a faint outline until built; the current one rises with its progress
const WALL_H = 2.2;
const segs = world.features.segments.map((sg) => {
  const g = new THREE.Group(), ghost = new THREE.Group();
  for (const t of sg.tiles) {
    const x = C.wx(t.i), z = C.wz(t.j), y = groundAt(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), ashlarMat); m.position.set(x, y + WALL_H / 2, z); m.castShadow = m.receiveShadow = true; m.userData = { gy: y, block: true }; g.add(m);
    const gm = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.96), ghostMat); gm.position.set(x, y + 0.06, z); ghost.add(gm);
    // battlements on top
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), ashlarMat); b.position.set(x, y + WALL_H + 0.17, z); b.castShadow = true; b.userData = { top: true }; g.add(b);
  }
  g.visible = false; scene.add(g, ghost);
  return { g, ghost, tiles: sg.tiles.map((t) => world.idx(t.i, t.j)), built: false, pending: [] };
});
function blockSegment(k) { const sg = segs[k]; sg.built = true; sg.pending = sg.tiles.slice(); }
function settleBlocks() { // never wall David or a crew in: block a tile only when nobody stands on it
  for (const sg of segs) for (let n = sg.pending.length - 1; n >= 0; n--) {
    const k = sg.pending[n], i = k % world.W, j = Math.floor(k / world.W), x = C.wx(i), z = C.wz(j);
    if (Math.hypot(david.x - x, david.z - z) < 0.9 || S.crews.some((c) => Math.hypot(c.x - x, c.z - z) < 0.9)) continue;
    world.blocked[k] = 1; sg.pending.splice(n, 1);
  }
}
function updateWalls(t) {
  segs.forEach((sg, k) => {
    const cur = S.act === 'build' && k === S.seg;
    const h = sg.built ? 1 : cur ? Math.max(0.06, S.segProg / H.SEG_WORK) : 0;
    sg.g.visible = h > 0;
    if (sg.h !== h) { sg.h = h; for (const m of sg.g.children) { if (m.userData.block) { m.scale.y = h; m.position.y = m.userData.gy + (WALL_H * h) / 2; } else m.visible = h >= 1; } } // rises from the ground
    sg.ghost.visible = !sg.built && (S.act === 'build' || S.act === 'zion');
    if (sg.ghost.visible) for (const m of sg.ghost.children) m.material.opacity = cur ? 0.35 + 0.25 * Math.sin(t * 5) : 0.14;
  });
}
// David's house: foundation stones now, cedar walls and roof as the carpenters work (5:11)
const houseG = new THREE.Group();
{
  const f = world.features.houseSite, x0 = C.wx(f.i0) - 0.5, z0 = C.wz(f.j0) - 0.5, y = groundAt(C.wx(f.i0), C.wz(f.j0));
  const base = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.3, f.d), ashlarMat); base.position.set(x0 + f.w / 2, y + 0.15, z0 + f.d / 2); base.castShadow = base.receiveShadow = true; scene.add(base);
  const cedarMat = new THREE.MeshLambertMaterial({ map: TX.wood, color: 0xd09060 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(f.w - 0.3, 1.8, f.d - 0.3), cedarMat); walls.position.set(x0 + f.w / 2, y + 0.3 + 0.9, z0 + f.d / 2); walls.castShadow = walls.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(f.w + 0.2, 0.25, f.d + 0.2), new THREE.MeshLambertMaterial({ map: TX.wood, color: 0xa86a40 })); roof.position.set(x0 + f.w / 2, y + 2.25, z0 + f.d / 2); roof.castShadow = true;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a1a10 })); door.position.set(x0 + f.w / 2, y + 0.9, z0 + f.d - 0.12);
  houseG.add(walls, roof, door); houseG.userData = { walls, roof, door, y }; scene.add(houseG);
  // a stack of cedar beams by the foundation, one per load delivered
  houseG.userData.beams = [0, 1, 2].map((k) => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.26), cedarMat); b.position.set(x0 + f.w / 2, y + 0.11 + k * 0.23, z0 + f.d + 0.7); b.castShadow = true; b.visible = false; scene.add(b); return b; });
}
function updateHouse() {
  const u = houseG.userData, p = Math.min(1, S.houseProg / (H.CEDAR_LOADS * H.CARPENTRY));
  u.walls.visible = p > 0; u.walls.scale.y = Math.max(0.01, Math.min(1, p / 0.75)); u.walls.position.y = u.y + 0.3 + 0.9 * u.walls.scale.y;
  u.roof.visible = p >= 0.8; u.door.visible = p >= 0.5;
  u.beams.forEach((b, k) => { b.visible = k < S.cedar - Math.floor(S.houseProg / H.CARPENTRY + 0.001) || (k < S.cedar && !S.house && S.houseProg < (k + 1) * H.CARPENTRY); });
}
// Hiram's cedar, unloaded at the caravan spot (5:11)
const cedarPile = new THREE.Group();
{
  const y = groundAt(L.caravan.x, L.caravan.z), m = new THREE.MeshLambertMaterial({ map: TX.wood, color: 0xd09060 });
  for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.26, 0.3), m); b.position.set(L.caravan.x + 0.3, y + 0.13 + Math.floor(k / 3) * 0.27, L.caravan.z - 0.9 + (k % 3) * 0.34); b.castShadow = true; cedarPile.add(b); }
  cedarPile.visible = false; scene.add(cedarPile);
}
// the goal ring: where to go next
const goalRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); goalRing.rotation.x = -Math.PI / 2; goalRing.visible = false; scene.add(goalRing);

// ---------------- Input ----------------
const keys = new Set();
addEventListener('keydown', (e) => { if (ranking.isOpen()) return;
  const k = keyName(e); keys.add(k);
  if (e.repeat) return;
  if ((k === 'enter' || k === ' ') && cardState.open) { e.preventDefault(); $('cardClose').click(); return; }
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
// 이/가 by the last syllable's final consonant (파수꾼이, 물 긷는 자가).
const withSubject = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c <= 11171 && c % 28 ? '이' : '가'); };
// 으로 after a final consonant other than ㄹ, otherwise 로 (언덕으로, 망대로, 바위로)
const withTo = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; const f = c >= 0 && c <= 11171 ? c % 28 : 0; return w + (f && f !== 8 ? "으로" : "로"); };
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
  keys.clear(); joy.active = false; joyEl.classList.remove('on');
}
$('cardClose').addEventListener('click', () => { if (!cardState.open || ranking.isOpen()) return; cardState.open = false; $('card').classList.remove('show'); const f = cardState.onClose; cardState.onClose = null; f?.(); });

function roleLine() { return `물 ${G.workers(S, 'water').length}/${G.ROLE_CAP.water} · 떡 ${G.workers(S, 'bread').length}/${G.ROLE_CAP.bread} · 파수 ${G.workers(S, 'watch').length}/${G.ROLE_CAP.watch}`; }
const clockText = (sec) => { const s = Math.max(0, sec); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
let hudCache = '', watchTold = false;
const PLACE = { settle: '헤브론', judah: '헤브론', tribes: '헤브론 성문', covenant: '헤브론', zion: '시온 산성', build: '다윗성', ending: '다윗성', done: '다윗성' };
function updateHUD() {
  if (!watchTold && watchNudge() && !$('toast').classList.contains('show')) { watchTold = true; toast(`성문을 지킬 사람이 없습니다. 따라오는 사람을 ${withTo(L.lookoutName)} 데려가면 파수꾼이 됩니다.`, 5200); }
  const settling = S.act === 'settle', building = S.act === 'build' || S.act === 'ending' || S.act === 'done', tribes = S.act === 'tribes';
  const key = [S.joined, S.bread, Math.round(S.attention), S.carry, G.workers(S).length, S.act, S.phase, S.seg, Math.floor(S.segProg), Math.floor(S.buildT), S.cedar, S.house, S.tribes.filter((t) => t.status === 'gathered').length].join('|');
  if (key === hudCache) return; hudCache = key;
  $('where').textContent = PLACE[S.act] || '헤브론';
  $('joined').textContent = `함께한 자 ${S.joined}명`;
  $('bread').textContent = settling ? `떡 ${S.bread}` : tribes ? `지파 ${1 + S.tribes.filter((t) => t.status === 'gathered').length}/12` : building ? `성벽 ${S.seg}/${SEG_N} · 왕의 집 ${S.house ? '완성' : `${S.cedar}/${H.CEDAR_LOADS}`}` : '';
  $('rumor').style.display = settling || building ? '' : 'none';
  if (settling) {
    $('rumorLabel').textContent = '헤브론에서 지낸 날';
    $('rumorFill').style.width = `${S.attention}%`;
    $('rumorHint').textContent = S.phase !== 'play' ? '' : G.workers(S, 'watch').length ? `파수꾼 ${G.workers(S, 'watch').length}명이 성문을 지키는 중` : '쫓는 자는 없습니다. 사람들의 자리를 세우세요';
  } else if (building) {
    $('rumorLabel').innerHTML = `<span class="clock">${clockText(S.buildT)}</span><small>${bestTime ? `최고 ${clockText(bestTime)}` : '첫 기록'}</small>`;
    $('rumorFill').style.width = `${Math.min(100, ((S.seg + (S.seg < SEG_N ? S.segProg / H.SEG_WORK : 0)) / SEG_N) * 85 + (S.houseProg / (H.CEDAR_LOADS * H.CARPENTRY)) * 15)}%`;
    $('rumorHint').textContent = `성벽 ${S.seg}/${SEG_N} · 일꾼 ${H.builders(S).length}/12`;
  }
  $('rumor').classList.toggle('hot', false);
  $('roles').textContent = roleLine(); $('roles').style.display = settling ? '' : 'none';
}

// ---------------- Events from the simulation ----------------
let firstWorkerServe = true, firstJoin = true, firstNeed = true, firstBuild = true;
const V = {
  '2:1': '그 후에 다윗이 여호와께 물어 가로되 내가 유다 한 성으로 올라가리이까 여호와께서 가라사대 올라가라 다윗이 가로되 어디로 가리이까 가라사대 헤브론으로 갈찌니라',
  '2:3': '또 자기와 함께한 종자들과 그들의 권속들을 다 데리고 올라가서 헤브론 각 성에 거하게 하니라',
  '2:4': '유다 사람들이 와서 거기서 다윗에게 기름을 부어 유다 족속의 왕을 삼았더라',
  '2:11': '다윗이 헤브론에서 유다 족속의 왕이 된 날 수는 일곱해 여섯달이더라',
  '5:1': '이스라엘 모든 지파가 헤브론에 이르러 다윗에게 나아와 말하여 가로되 보소서 우리는 왕의 골육이니이다',
  '5:2': '전일 곧 사울이 우리의 왕이 되었을 때에도 이스라엘을 거느려 출입하게 한 자는 왕이시었고 여호와께서도 왕에게 말씀하시기를 네가 내 백성 이스라엘의 목자가 되며 이스라엘의 주권자가 되리라 하셨나이다 하니라',
  '5:3': '이에 이스라엘 모든 장로가 헤브론에 이르러 왕에게 나아오매 다윗왕이 헤브론에서 여호와 앞에서 저희와 언약을 세우매 저희가 다윗에게 기름을 부어 이스라엘 왕을 삼으니라',
  '5:4': '다윗이 삼십세에 위에 나아가서 사십년을 다스렸으되',
  '5:7': '다윗이 시온 산성을 빼앗았으니 이는 다윗성이더라',
  '5:9': '다윗이 그 산성에 거하여 다윗성이라 이름하고 밀로에서부터 안으로 성을 둘러 쌓으니라',
  '5:10': '만군의 하나님 여호와께서 함께 계시니 다윗이 점점 강성하여 가니라',
  '5:11': '두로 왕 히람이 다윗에게 사자들과 백향목과 목수와 석수를 보내매 저희가 다윗을 위하여 집을 지으니',
  '5:12': '다윗이 여호와께서 자기를 세우사 이스라엘 왕을 삼으신 것과 그 백성 이스라엘을 위하여 그 나라를 높이신 것을 아니라',
};
const v = (ref) => [`삼하 ${ref}`, V[ref]];
function handle(ev) {
  const p = ev.id ? S.people.find((q) => q.id === ev.id) : null;
  switch (ev.type) {
    case 'arrive': if (!S.arrivedOnce) { S.arrivedOnce = true; toast('북쪽 성문으로 가족들이 들어옵니다 (2:3). 필요한 것을 채워 주세요.', 4200); } break;
    case 'join':
      if (firstJoin && ev.by === 'david') { firstJoin = false; setTimeout(() => toast('맞이한 사람이 당신을 따라옵니다. 우물·곳간·북동쪽 망대로 데려가면 일을 맡습니다.', 4200), 600); }
      popText(`+${ev.count}`, p);
      break;
    case 'waiting':
      if (p?.need === 'bread' && breadToldAt < 0) { breadToldAt = S.t; toast('떡은 동쪽 곳간에 있습니다.', 4200); }
      break;
    case 'escort': toast('이 사람을 광장의 불 곁으로 데려가세요.'); break;
    case 'assign': toast(`${withSubject(G.ROLE_NAME[ev.role])} 생겼습니다`, 1800); break;
    case 'restaffed': toast('헤브론에 물 긷는 자, 떡 굽는 자, 파수꾼이 다 섰습니다.', 3600); break;
    case 'served-by-people':
      if (firstWorkerServe) { firstWorkerServe = false; toast('당신이 세운 사람이 새로 온 가족을 맞이했습니다.', 4200); }
      break;
    case 'judah': showCard({
      place: '헤브론', title: '유다 족속의 왕',
      verses: [v('2:4'), v('2:11')],
      body: '<p class="note">헤브론에서 일곱 해 반이 지나갑니다. 그 사이의 싸움(2:8–4:12)은 그리지 않습니다. 이제 다른 지파의 장로들이 북쪽 길로 옵니다.</p>',
      button: '성문으로 나가 맞이하기', onClose: () => H.startTribes(S),
    }); break;
    case 'tribes': toast('지파의 장로들이 북쪽 길로 옵니다. 한 무리씩 가서 맞으세요.', 4200); break;
    case 'greeted': { const t = S.tribes.find((q) => q.name === ev.name); popText(ev.name, t); if (ev.left > 0 && ev.left % 3 === 0) toast(`${ev.name} 지파의 장로들이 언약의 돌 곁으로 갑니다. 남은 지파 ${ev.left}`, 2200); break; }
    case 'covenant': showCard({
      place: '헤브론 · 여호와 앞에서', title: '이스라엘 왕을 삼으니라',
      verses: [v('5:1'), v('5:2'), v('5:3'), v('5:4')],
      button: '예루살렘으로', onClose: () => H.goToZion(S),
    }); break;
    case 'zion': showCard({
      place: '시온 산성', title: '밀로에서부터 안으로',
      verses: [v('5:7'), v('5:9')],
      body: `<p class="note">산성을 얻는 장면(5:6–8)은 그리지 않습니다. 이제 열두 지파와 함께 성을 둘러 쌓습니다. 성벽 열두 칸은 지파마다 한 칸씩 맡습니다. <b>성벽 ${SEG_N}칸과 왕의 집을 다 짓는 데 걸린 시간이 기록됩니다.</b>${bestTime ? ` 지금 최고 기록은 ${clockText(bestTime)}입니다.` : ''}</p>`,
      button: '시작', onClose: () => H.startBuild(S),
    }); break;
    case 'build': toast('성문 아래 진영에서 지파들을 데려오세요. 한 번에 셋까지 따라옵니다. 성벽 한 칸은 한 지파가 맡고, 먼저 온 지파들이 돕습니다. 첫 자리는 북동쪽 밀로입니다.', 5600); break;
    case 'crew-follows': break;
    case 'crew-builds': if (firstBuild) { firstBuild = false; toast('지파가 성벽을 쌓기 시작합니다. 사람이 많을수록 빨리 올라갑니다.', 3600); } break;
    case 'crew-need': if (firstNeed) { firstNeed = false; toast(`${ev.tribe} 지파 일꾼들이 ${ev.need === 'water' ? '목말라' : '배고파'} 쉬고 있습니다. ${ev.need === 'water' ? '성문 밖 남동쪽 샘에서 물을' : '산성 서쪽 곳간에서 떡을'} 가져다주세요.`, 4600); } break;
    case 'crew-served': { const c = S.crews.find((q) => q.tribe === ev.tribe); popText(ev.item === 'water' ? '물' : '떡', c); break; }
    case 'segment-owner': { const sp = L.segSpots[ev.seg]; popText(`${ev.tribe} 지파의 칸`, sp); break; }
    case 'segment': blockSegment(ev.order); { const sp = L.segSpots[ev.order]; popText(ev.millo ? `밀로 · ${ev.tribe}` : `${ev.tribe} ${ev.order + 1}/${SEG_N}`, sp); } if (ev.millo) toast('밀로가 섰습니다. 성벽이 양쪽으로 둘러 나갑니다.', 3000); break;
    case 'walls-done': toast('성벽이 다 둘러졌습니다.', 2600); break;
    case 'hiram-coming': toast('서쪽 길로 두로에서 사자들이 옵니다…', 3200); break;
    case 'hiram': cedarPile.visible = true; showCard({
      place: '다윗성 · 성문 밖 서쪽', title: '백향목과 목수와 석수',
      verses: [v('5:11')],
      body: '<p class="note">석수들이 함께 쌓아 성벽이 더 빨리 올라갑니다. 백향목을 왕의 집 터로 세 번 날라 오면 목수들이 집을 짓습니다.</p>',
      button: '계속', onClose: () => {},
    }); break;
    case 'pickup':
      if (ev.item === 'cedar') toast('백향목을 메었습니다. 산성 한가운데 왕의 집 터로.', 2400);
      break;
    case 'cedar': popText(`백향목 ${ev.loads}/${H.CEDAR_LOADS}`, L.houseDrop); break;
    case 'house': toast('목수들이 왕의 집을 다 지었습니다.', 2600); break;
    case 'built': finishRun(ev.seconds); showCard({
      place: '다윗성', title: '점점 강성하여 가니라',
      verses: [v('5:10')],
      body: `<p class="note">걸린 시간 <b>${clockText(ev.seconds)}</b>${runRecord.newBest ? ' · <b>새 최고 기록</b>' : ` · 최고 ${clockText(runRecord.best)}`}</p>`,
      button: '마치기', onClose: showEnding,
    }); break;
  }
}
const pops = [];
function popText(text, p) {
  if (!p) return;
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = text; $('hud').appendChild(el);
  pops.push({ el, x: p.x, z: p.z, t: 0 });
}

// personal best (lower is better), saved once per run
const prevRecord = (() => { try { return H.parseRecord(localStorage.getItem(SAVE_KEY)); } catch { return null; } })();
let bestTime = prevRecord ? prevRecord.best : 0;
const runRecord = { best: 0, newBest: false, saved: false };
function finishRun(seconds) {
  if (runRecord.saved) return;
  const rec = H.record(prevRecord, S.joined, seconds);
  runRecord.best = rec.best; runRecord.newBest = !prevRecord || rec.best < prevRecord.best; runRecord.saved = true; bestTime = rec.best;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(rec)); } catch { /* private mode: the run still ends */ }
}
function showEnding() {
  H.finish(S);
  const s = H.summary(S);
  showCard({
    place: '4막 · 헤브론 · 다윗성', title: '여호와께서 자기를 세우사',
    verses: [v('5:9'), v('5:12')],
    body: `<p class="note">함께한 자 <b>${s.joined}명</b>, 열두 지파. 다윗성을 쌓는 데 <b>${clockText(s.buildSeconds)}</b> 걸렸습니다${runRecord.newBest ? ' (새 최고 기록)' : ` (최고 ${clockText(runRecord.best)})`}. 처음으로 떠나지 않아도 되는 거처를 세웠습니다. <span class="soon">5막 · 성전 준비는 준비 중입니다.</span></p>`,
    recorded: [
      '다윗이 여호와께 물었고, "헤브론으로 갈찌니라"는 대답을 들었다. 함께한 사람들과 그 가족들이 헤브론 각 성에 살았다 (2:1–3).',
      '유다 사람들이 다윗에게 기름을 부어 유다 족속의 왕으로 삼았다. 다윗은 헤브론에서 일곱 해 여섯 달을 다스렸다 (2:4, 2:11).',
      '그 사이 사울의 집과 오랜 싸움이 있었다 (2:8–4:12). 이 게임은 그 싸움을 그리지 않았다.',
      '이스라엘 모든 지파와 장로들이 헤브론에 와서 언약을 세우고 다윗을 이스라엘 왕으로 삼았다 (5:1–3).',
      '다윗은 시온 산성을 빼앗아 다윗성이라 하고, 밀로에서부터 안으로 성을 둘러 쌓았다 (5:7, 5:9). 산성을 얻는 장면(5:6–8)은 그리지 않았다.',
      '두로 왕 히람이 백향목과 목수와 석수를 보내 다윗의 집을 지었다. 다윗은 여호와께서 자기를 세우신 것을 알았다 (5:11–12).',
    ],
    imagined: [
      '헤브론과 시온 산성, 밀로, 샘과 진영의 모양과 위치',
      '지파마다 장로 한 무리가 차례로 오고, 다윗이 성문 밖에서 맞는 방식과 지파 이름 깃발',
      '언약의 돌. 본문은 "여호와 앞에서"라고만 한다',
      '열두 지파가 한 무리씩 성벽 한 칸을 쌓는 방식, 일꾼에게 물과 떡을 가져다주는 일, 백향목을 세 번 나르는 일',
      '시간 기록과 최고 기록. 성경은 성을 쌓는 데 걸린 시간을 말하지 않는다',
    ],
    extra: `<div class="links"><a href="./temple.html">5막 · 성전 준비</a><a href="./hebron.html">다시 하기 (기록 도전)</a><a href="./ziklag.html">3막 · 시글락</a><a href="./">다윗의 땅</a></div>`,
    button: '다윗의 땅으로', onClose: () => { location.href = './'; },
  });
}

// ---------------- Off-screen markers: people who need something, and where to take an escort ----------------
const marks = [];
const ICON_URL = Object.fromEntries(['water', 'bread', 'fire'].map((k) => [k, TEX.bubble[k].image.toDataURL()]));
ICON_URL['sign-water'] = signTex('water').image.toDataURL(); ICON_URL.cedar = signTex('cedar').image.toDataURL(); ICON_URL.stone = signTex('stone').image.toDataURL(); ICON_URL['sign-cedar'] = ICON_URL.cedar; ICON_URL['sign-bread'] = signTex('bread').image.toDataURL(); ICON_URL['sign-watch'] = signTex('watch').image.toDataURL();
ICON_URL.exit = pixelTex(14, 15, (px) => { px(1, 0, '#3a2a1a', 12, 1); px(0, 1, '#3a2a1a', 1, 10); px(13, 1, '#3a2a1a', 1, 10); px(1, 11, '#3a2a1a', 12, 1); px(1, 1, '#f6dc94', 12, 10); px(6, 2, '#5a3414', 2, 6); px(4, 6, '#5a3414', 6, 1); px(5, 7, '#5a3414', 4, 1); px(6, 8, '#5a3414', 2, 1); }).image.toDataURL();
function markEl(n) {
  while (marks.length <= n) { const el = document.createElement('div'); el.className = 'edge'; el.innerHTML = '<i></i><img alt="">'; $('hud').appendChild(el); marks.push(el); }
  return marks[n];
}
// where David should go next outside Hebron's serving phase (one goal at a time)
function goalPoint() {
  const near = (list) => list.sort((a, b) => Math.hypot(a.x - david.x, a.z - david.z) - Math.hypot(b.x - david.x, b.z - david.z))[0] || null;
  switch (S.act) {
    case 'tribes': return near(S.tribes.filter((t) => t.status === 'waiting' || t.status === 'coming'));
    case 'build': {
      const needy = S.crews.filter((c) => c.status === 'building' && c.need);
      if (S.carry === 'cedar') return { ...L.houseDrop, icon: 'cedar' };
      if (S.carry) { const c = near(needy.filter((q) => q.need === S.carry)); if (c) return c; }
      if (needy.length) { const c = near(needy); return c.need === 'water' ? { ...L.zionSpring, icon: 'water' } : { ...L.zionBasket, icon: 'bread' }; }
      if (H.following(S).length && S.seg < SEG_N) return { ...L.segSpots[S.seg], icon: 'stone' };
      if (cedarTime() && (S.seg >= SEG_N || H.builders(S).length >= 4 || !S.crews.some((c) => c.status === 'camp'))) return { ...L.caravan, icon: 'cedar' };
      if (S.seg < SEG_N) { const c = near(S.crews.filter((q) => q.status === 'camp')); if (c) return c; }
      return null;
    }
    default: return null;
  }
}
function edgeMarks() {
  const W = innerWidth, VH = innerHeight, m = 34;
  const onScreen = (x, z) => { proj.set(x, groundAt(x, z) + 1, z).project(camera); const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * VH; return proj.z < 1 && sx > m && sx < W - m && sy > m + 60 && sy < VH - m; };
  // one marker per need: points at the closest off-screen person, shows how many are waiting off-screen
  const groups = {};
  for (const p of S.people) {
    if ((p.status !== 'waiting' && p.status !== 'arriving') || onScreen(p.x, p.z)) continue;
    const d = Math.hypot(p.x - david.x, p.z - david.z), g = groups[p.need] ||= { x: p.x, z: p.z, d, need: p.need, n: 0, late: false };
    g.n++; g.late ||= p.waited > 22; if (d < g.d) Object.assign(g, { x: p.x, z: p.z, d });
  }
  const list = Object.values(groups);
  if (S.people.some((p) => p.status === 'escort') && !onScreen(L.fire.x, L.fire.z)) list.push({ x: L.fire.x, z: L.fire.z, need: 'fire', goal: true, n: 1 });
  const need = neededStation(), st = need && STATIONS.find((q) => q.kind === need);
  if (st && !onScreen(st.at.x, st.at.z)) list.push({ x: st.at.x, z: st.at.z, need: 'sign-' + need, goal: true, n: 1 });
  if (watchNudge() && hasFollowers() && !onScreen(L.lookout.x, L.lookout.z)) list.push({ x: L.lookout.x, z: L.lookout.z, need: 'sign-watch', goal: true, n: 1 });
  if (S.act !== 'settle') list.length = 0;
  const goal = S.act === 'settle' ? null : goalPoint();
  if (goal) { list.length = 0; if (!onScreen(goal.x, goal.z)) list.push({ x: goal.x, z: goal.z, need: goal.icon || 'exit', goal: true, n: 1 }); }
  let n = 0;
  for (const it of list) {
    proj.set(it.x, groundAt(it.x, it.z) + 1, it.z).project(camera);
    const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * VH;
    const cx = W / 2, cy = VH / 2; let dx = sx - cx, dy = sy - cy; if (proj.z > 1) { dx = -dx; dy = -dy; }
    const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (dy > 0 ? VH / 2 - m - 70 : VH / 2 - m - 30) / Math.max(1e-3, Math.abs(dy)));
    const el = markEl(n++); el.style.display = 'block';
    el.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px) translate(-50%, -50%)`;
    el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const img = el.lastChild; if (img.dataset.k !== it.need) { img.src = ICON_URL[it.need]; img.dataset.k = it.need; }
    el.classList.toggle('late', !!it.late); el.classList.toggle('goal', !!it.goal);
    el.dataset.n = it.n > 1 ? String(it.n) : '';
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
const sunOffDay = new THREE.Vector3(18, 30, 12), sunOffDusk = new THREE.Vector3(28, 14, 6), sunOff = new THREE.Vector3();
function applyLight(k) { // k: 0 afternoon → 1 dusk, follows the act's clock
  scene.background.copy(DAY.sky).lerp(DUSK.sky, k); scene.fog.color.copy(scene.background);
  hemi.color.copy(DAY.hemiSky).lerp(DUSK.hemiSky, k); hemi.groundColor.copy(DAY.hemiGround).lerp(DUSK.hemiGround, k);
  sun.color.copy(DAY.sun).lerp(DUSK.sun, k);
  hemi.intensity = 0.62 - 0.2 * k; sun.intensity = 3.4 - 1.7 * k;
  sunOff.copy(sunOffDay).lerp(sunOffDusk, k);
  post.mComp.uniforms.bloom.value = 0.5 + 0.4 * k; post.mComp.uniforms.exposure.value = 0.92 + 0.14 * k; post.mComp.uniforms.warmth.value = 0.45 + 0.4 * k;
  water.material.uniforms.light.value = 1 - 0.35 * k;
  return 1.2 + 5 * k; // fire strength
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  time.value += dt; const t = time.value;

  // David
  let ix = 0, iz = 0;
  if (started && !cardState.open && !ranking.isOpen() && S.phase !== 'done') {
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowup') || keys.has('w')) iz -= 1;
    if (keys.has('arrowdown') || keys.has('s')) iz += 1;
    if (joy.active && Math.hypot(joy.dx, joy.dy) > 0.18) { ix = joy.dx; iz = joy.dy; }
  }
  const il = Math.hypot(ix, iz);
  david.moving = il > 0.1;
  if (david.moving) {
    const run = keys.has('shift') || (joy.active && il > 0.92);
    const sp = (run ? 6.2 : 4.4) * Math.min(1, il);
    tryMove(david, (ix / il) * sp * dt, (iz / il) * sp * dt);
    david.face(ix, iz); david.speedAnim = run ? 11 : 8;
  }
  david.update(dt);

  // simulation
  if (started && !cardState.open && !ranking.isOpen()) {
    H.step(S, dt, { david });
    if (S.teleport) { david.x = S.teleport.x; david.z = S.teleport.z; david.y = groundAt(david.x, david.z); camTarget.set(david.x, david.y + 0.8, david.z); S.teleport = null; }
    for (const ev of G.drainEvents(S)) handle(ev);
  }
  if (!ranking.isOpen()) { grow(); settleBlocks(); }

  // people in Hebron
  for (const p of S.people) {
    const c = castFor(p), a = c.actor;
    const dx = p.x - c.px, dz = p.z - c.pz; c.px = p.x; c.pz = p.z;
    a.x = p.x; a.z = p.z; a.moving = Math.hypot(dx, dz) > 0.0005;
    if (a.moving) a.face(dx, dz); else if (p.status === 'waiting') a.face(david.x - a.x, david.z - a.z);
    a.update(dt);
    const top = a.y + a.h + 0.15;
    if (S.act === 'settle' && (p.status === 'waiting' || p.status === 'arriving')) {
      c.bubble.visible = true; c.bubble.material = (p.waited > 22 ? MATS.bubbleLate : MATS.bubble)[p.need];
      c.bubble.position.set(a.x, top + 0.42 + Math.sin(t * 3 + p.id) * 0.06, a.z);
    } else c.bubble.visible = false;
    const tagKind = S.act === 'settle' ? (p.status === 'working' ? (p.carry || (p.role === 'watch' ? 'watch' : p.role)) : p.status === 'escort' ? 'fire' : null) : null;
    c.tag.visible = !!tagKind; if (tagKind) { c.tag.material = MATS.item[tagKind]; c.tag.position.set(a.x, top + 0.2, a.z); }
  }
  // the elders of the tribes (5:1–3)
  for (const tr of S.tribes) {
    if (tr.status === 'hidden') continue;
    const e = elderFor(tr), a = e.actor, dx = tr.x - e.px, dz = tr.z - e.pz; e.px = tr.x; e.pz = tr.z;
    a.x = tr.x; a.z = tr.z; a.moving = Math.hypot(dx, dz) > 0.0005; if (a.moving) a.face(dx, dz); else a.face(david.x - a.x, david.z - a.z); a.update(dt);
    const m = e.mate; m.moving = a.moving; const mx = tr.x + 0.65, mz = tr.z + 0.45; m.x += (mx - m.x) * Math.min(1, dt * 6); m.z += (mz - m.z) * Math.min(1, dt * 6); if (m.moving) m.face(dx, dz); else m.dir = a.dir; m.update(dt);
    e.banner.position.set(tr.x + 0.3, a.y + a.h + 0.55 + (tr.status === 'waiting' ? Math.sin(t * 3 + tr.id) * 0.06 : 0), tr.z);
    e.banner.material.opacity = tr.status === 'waiting' || tr.status === 'coming' ? 1 : 0.75;
    e.banner.visible = S.act === 'tribes' || S.act === 'covenant';
  }
  // the twelve crews at Zion
  for (const cr of S.crews) {
    const e = crewFor(cr), a = e.actor, dx = cr.x - e.px, dz = cr.z - e.pz; e.px = cr.x; e.pz = cr.z;
    a.x = cr.x; a.z = cr.z; a.moving = Math.hypot(dx, dz) > 0.0005; if (a.moving) a.face(dx, dz); else if (cr.status === 'building' && cr.seg >= 0 && cr.seg < SEG_N) { const sp = L.segSpots[cr.seg]; a.face(sp.x - L.houseDrop.x, sp.z - L.houseDrop.z); } a.update(dt);
    const working = cr.status === 'building' && !cr.need && !a.moving && S.seg < SEG_N;
    const m = e.mate; const mx = cr.x + 0.55, mz = cr.z + 0.35; m.moving = a.moving; m.x += (mx - m.x) * Math.min(1, dt * 6); m.z += (mz - m.z) * Math.min(1, dt * 6); if (m.moving) m.face(dx, dz); m.update(dt);
    if (working) { m.anim += dt * 6; m.setFrame(m.dir, Math.floor(m.anim) % 4); a.anim += dt * 5; a.setFrame(a.dir, Math.floor(a.anim) % 2 ? 1 : 0); } // hauling stones
    const top = a.y + a.h + 0.15;
    e.banner.position.set(cr.x + 0.25, top + (cr.need ? 1.2 : 0.4), cr.z);
    e.banner.visible = S.act === 'build' || S.act === 'zion' || S.act === 'ending';
    e.bubble.visible = !!cr.need && S.act === 'build'; if (cr.need) { e.bubble.material = MATS.bubble[cr.need]; e.bubble.position.set(cr.x, top + 0.42 + Math.sin(t * 3 + cr.id) * 0.06, cr.z); }
    e.tag.visible = working; if (working) e.tag.position.set(cr.x - 0.35, top + 0.1 + Math.abs(Math.sin(t * 4 + cr.id)) * 0.15, cr.z);
  }
  // Hiram's messengers and their cedar (5:11)
  if (S.hiram && !hiram) { hiram = new Actor(sheetFor('tyre', 'human', TYRE_LOOK), { x: S.hiram.x, z: S.hiram.z }); hiramMate = new Actor(sheetFor('tyre2', 'human', { ...TYRE_LOOK, beard: false, tunic: '#8a4a2a', tunicDark: '#6a3a1a' }), { x: S.hiram.x - 1, z: S.hiram.z }); hiram.speedAnim = hiramMate.speedAnim = 8; }
  if (hiram) {
    const dx = S.hiram.x - hiram.x, dz = S.hiram.z - hiram.z; hiram.moving = Math.hypot(dx, dz) > 0.0005; if (hiram.moving) hiram.face(dx, dz); else hiram.face(david.x - hiram.x, david.z - hiram.z);
    hiram.x = S.hiram.x; hiram.z = S.hiram.z; hiram.update(dt);
    const mx = S.hiram.x - 1.1, mz = S.hiram.z + 0.4; hiramMate.moving = hiram.moving; hiramMate.x += (mx - hiramMate.x) * Math.min(1, dt * 5); hiramMate.z += (mz - hiramMate.z) * Math.min(1, dt * 5); if (hiramMate.moving) hiramMate.face(dx, dz); hiramMate.update(dt);
  }
  cedarPile.visible = !!S.hiram?.arrived; cedarPile.children.forEach((b, k) => { b.visible = k < 6 - S.cedar * 2; });
  updateWalls(t); updateHouse();
  const gp = goalPoint(); goalRing.visible = !!gp && !cardState.open && !ranking.isOpen();
  if (gp) { const k = (t * 1.4) % 1; goalRing.position.set(gp.x, groundAt(gp.x, gp.z) + 0.08, gp.z); goalRing.scale.setScalar(0.8 + k * 0.5); goalRing.material.opacity = 0.7 * (1 - k); }
  carrySprite.visible = !!S.carry; if (S.carry) { carrySprite.material = MATS.item[S.carry]; carrySprite.position.set(david.x, david.y + david.h + 0.35 + Math.sin(t * 4) * 0.04, david.z); }

  // growth pop-in
  for (let k = growth.popping.length - 1; k >= 0; k--) { const g = growth.popping[k]; g.t += dt * 2.2; const e = Math.min(1, g.t); g.obj.scale.setScalar(Math.max(0.01, e < 1 ? 1 + Math.sin(e * Math.PI) * 0.18 - (1 - e) : 1)); if (g.t >= 1) { g.obj.scale.setScalar(1); growth.popping.splice(k, 1); } }

  // camera
  camTarget.lerp(tmp.set(david.x, david.y + 0.8, david.z), Math.min(1, dt * 5));
  if (started && intro > 0) intro = Math.max(0, intro - dt / 2.4);
  const ease = intro * intro * (3 - 2 * intro);
  const dist = camDist * (1 + ease * 0.7), pitch = PITCH + ease * 0.25, orbit = started ? 0 : Math.sin(t * 0.1) * 5;
  camera.position.set(camTarget.x + orbit, camTarget.y + Math.sin(pitch) * dist, camTarget.z - ease * 8 + Math.cos(pitch) * dist);
  camera.lookAt(camTarget.x + orbit * 0.6, camTarget.y, camTarget.z - ease * 8);

  const lightK = S.act === 'settle' ? Math.min(1, S.t / L.maxTime) * 0.45 : S.act === 'judah' || S.act === 'tribes' ? 0.55 : S.act === 'covenant' ? 0.7 : S.act === 'zion' ? 0.1 : S.act === 'build' ? Math.min(0.6, S.buildT / 200) : 0.75;
  const fireI = applyLight(lightK);
  sun.target.position.copy(camTarget); sun.position.copy(camTarget).add(sunOff);
  const near = flames.map((f) => [f, f.pos.distanceToSquared(camTarget)]).sort((a, b) => a[1] - b[1]);
  firePool.forEach((l, n) => { const f = near[n]?.[0]; if (f) { l.position.copy(f.pos).add(tmp.set(0, 0.5, 0.2)); l.intensity = fireI * (0.85 + 0.15 * Math.sin(t * 17 + f.phase) * Math.sin(t * 7.3 + f.phase * 2)); } else l.intensity = 0; });
  const ff = Math.floor(t * 9);
  for (const f of flames) { const uv = f.mesh.geometry.attributes.uv, fr = (ff + Math.floor(f.phase * 3)) % 4; uv.setXY(0, fr / 4, 1); uv.setXY(1, (fr + 1) / 4, 1); uv.setXY(2, fr / 4, 0); uv.setXY(3, (fr + 1) / 4, 0); uv.needsUpdate = true; f.glow.material.opacity = 0.35 + lightK * 0.35; }

  if (props.caveRoof) { const i = C.ti(david.x), j = C.tj(david.z); const inside = world.inb(i, j) && world.tag[world.idx(i, j)] === 2; const m = props.caveRoof.material; m.opacity += ((inside ? 0.08 : 1) - m.opacity) * Math.min(1, dt * 6); m.depthWrite = m.opacity > 0.9; }
  water.material.uniforms.time.value = t;

  // HUD
  if (started) {
    updateHUD();
    const prompt = $('prompt'), hint = S.hint;
    if (hint && !cardState.open && !ranking.isOpen()) { prompt.textContent = hint; prompt.classList.add('show'); } else prompt.classList.remove('show');
    edgeMarks();
    updateStations(performance.now() / 1000);
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
    place: '헤브론으로', title: '헤브론으로 갈찌니라',
    verses: [v('2:1'), v('2:3')],
    body: '<p class="note">사울이 죽었습니다 (삼하 1장). 이제 쫓는 자가 없습니다. 헤브론에 사람들의 자리를 세우세요.</p>',
    button: '헤브론 성으로', onClose: () => setTimeout(() => toast(isMobile ? '화면을 끌어서 걷기. 따라오는 사람들을 우물·곳간·북동쪽 망대로 데려가세요.' : 'WASD/방향키로 걷기. 따라오는 사람들을 우물·곳간·북동쪽 망대로 데려가세요.', 4200), 400),
  });
}
$('startBtn').addEventListener('click', start);
ranking.ready(start);
if (started) { $('title').classList.add('hide'); $('hud').classList.add('show'); }
if (prevRecord) $('best').textContent = `최고 기록: 다윗성 ${clockText(prevRecord.best)}`;
$('carried').textContent = ranking.ranked ? '랭킹 도전: 모두 같은 인원으로 시작합니다' : carriedFromAct3 ? `시글락에서 함께한 ${S.carried}명이 따라옵니다` : `3막 기록이 없어 ${S.carried}명과 함께 시작합니다`;
requestAnimationFrame(frame);

window.__hebron = {
  S, G, H, world, david, get fps() { return fps; }, start,
  teleport(x, z) { david.x = x; david.z = z; david.y = groundAt(x, z); camTarget.set(x, david.y + 0.8, z); },
  info: () => renderer.info.render,
};
