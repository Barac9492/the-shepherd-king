// Act 3 · 시글락 — renderer, input and UI. Rules: adullam-logic.js (serving, roles) for the building phase,
// sequenced by ziklag-logic.js (the call, the burned town, 브솔 시내, the Egyptian, the shares). No attack exists.
import * as THREE from 'three';
import { canStep } from './world.js';
import { generateZiklag } from './ziklag-world.js';
import * as G from './adullam-logic.js';
import * as Z from './ziklag-logic.js';
import { buildTerrain, buildWater, buildProps, buildVegetation, makeCoords, BILLBOARD_Q } from './scene.js';
import { makeCharacterSheet, LOOKS, makeFlameSheet, makeSoftTexture } from './pixel.js';
import { PostStack } from './post.js';
import { BIBLE_SOURCE } from './data.js';
import { keyName } from './keys.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const world = generateZiklag();
const L = world.layout.stop;
const C = makeCoords(world);
const $ = (id) => document.getElementById(id);
const SAVE_KEY = Z.ACT3_KEY;
const carriedFromAct2 = (() => { try { return Number(localStorage.getItem('david-herut-v1')) || 0; } catch { return 0; } })();

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
for (const f of world.features.fires) addFire(C.wx(f.i), C.wz(f.j), 0.9); // the Amalekite camp (30:16)
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
// tents go up as households settle; after the raid they are gone (30:1)
const growth = { tents: [], popping: [], ruins: [] };
function grow() {
  if (S.act === 'build' && S.phase === 'play') {
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
  item: { water: plainTex('water'), bread: plainTex('bread'), fire: plainTex('fire'), watch: plainTex('watch'), share: plainTex('share') },
};
const spriteMat = (map) => new THREE.SpriteMaterial({ map, depthWrite: false, depthTest: false, transparent: true });
const MATS = {
  bubble: Object.fromEntries(Object.entries(TEX.bubble).map(([k, v]) => [k, spriteMat(v)])),
  bubbleLate: Object.fromEntries(Object.entries(TEX.bubbleLate).map(([k, v]) => [k, spriteMat(v)])),
  item: Object.fromEntries(Object.entries(TEX.item).map(([k, v]) => [k, spriteMat(v)])),
};

// ---------------- Stations: where water and bread come from, and the way out ----------------
function signTex(kind) {
  return pixelTex(14, 16, (px) => {
    px(1, 0, '#4a2e14', 12, 1); px(0, 1, '#4a2e14', 1, 10); px(13, 1, '#4a2e14', 1, 10); px(1, 11, '#4a2e14', 12, 1);
    px(1, 1, '#f6dc94', 12, 10); px(1, 1, '#fff0bc', 12, 1);
    px(6, 12, '#4a2e14', 2, 4);
    ICON[kind](px, 2, 2);
  });
}
const STATIONS = [
  { kind: 'water', at: L.spring, lift: 2.1 },
  { kind: 'bread', at: L.basket, lift: 2.0 },
  { kind: 'watch', at: L.lookout, lift: 2.2 },
];
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
for (const st of STATIONS) {
  const y = groundAt(st.at.x, st.at.z);
  st.sign = new THREE.Sprite(spriteMat(signTex(st.kind))); st.sign.scale.set(0.82, 0.94, 1); st.sign.renderOrder = 4; scene.add(st.sign);
  st.y = y;
  st.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); st.ring.rotation.x = -Math.PI / 2; st.ring.position.set(st.at.x, y + 0.08, st.at.z); st.ring.visible = false; scene.add(st.ring);
}
// a board of loaves by the storehouse that shows the bread stock
const boards = [L].map((st) => {
  const g = new THREE.Group(), y = groundAt(st.basket.x, st.basket.z);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.7), woodMat); board.position.set(st.basket.x - 0.2, y + 0.42, st.basket.z + 0.3); board.castShadow = true; g.add(board);
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.28, 0.28]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), woodMat); leg.position.set(st.basket.x - 0.2 + dx, y + 0.2, st.basket.z + 0.3 + dz); g.add(leg); }
  const loafMat = new THREE.MeshLambertMaterial({ color: 0xd59a4c }), loafGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.1, 8), loaves = [];
  for (let n = 0; n < 12; n++) { const l = new THREE.Mesh(loafGeo, loafMat); const c = n % 6, r = Math.floor(n / 6); l.position.set(st.basket.x - 0.8 + c * 0.24, y + 0.51 + r * 0.09, st.basket.z + 0.16 + r * 0.22 + (c % 2) * 0.05); l.castShadow = true; g.add(l); loaves.push(l); }
  scene.add(g);
  return { loaves };
});
// leaving: a trail of lights down the road, and torches at its end
const trailMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(3.2, 2.3, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const trails = [L].map((st) => st.exitRoad.map((p) => { const sp = new THREE.Sprite(trailMat.clone()); sp.position.set(p.x, groundAt(p.x, p.z) + 0.25, p.z); sp.scale.setScalar(1.5); sp.visible = false; scene.add(sp); return sp; }));
let breadToldAt = -1;
function neededStation() {
  // the need of the closest person still waiting for something only David can fetch
  if (S.phase !== 'play') return null;
  let best = null, bd = Infinity;
  for (const p of S.people) {
    if (p.status !== 'waiting' || p.claimedBy || p.need === 'fire' || p.need === S.carry) continue;
    const d = Math.hypot(p.x - david.x, p.z - david.z); if (d < bd) { bd = d; best = p.need; }
  }
  return best;
}
// Watchers matter once the rumour builds: light the lookout and say how to staff it.
function watchNudge() { return S.act === 'build' && S.phase === 'play' && S.attention >= 25 && G.workers(S, 'watch').length === 0; }
const hasFollowers = () => S.people.some((p) => p.status === 'following');
function updateStations(t) {
  const need = neededStation();
  for (const st of STATIONS) {
    if (S.act !== 'build') { st.sign.visible = false; st.ring.visible = false; continue; }
    const hot = st.kind === need || (st.kind === 'bread' && breadToldAt >= 0 && t - breadToldAt < 6) || (st.kind === 'watch' && watchNudge());
    const bob = Math.sin(t * (hot ? 5 : 2) + st.at.x) * (hot ? 0.14 : 0.05);
    st.sign.position.set(st.at.x, st.y + st.lift + bob, st.at.z);
    const sc = hot ? 1.18 : 1; st.sign.scale.set(0.82 * sc, 0.94 * sc, 1);
    st.ring.visible = hot; if (hot) { const k = (t * 1.4) % 1; st.ring.scale.setScalar(0.8 + k * 0.5); st.ring.material.opacity = 0.7 * (1 - k); }
    st.sign.visible = S.phase === 'play' || S.phase === 'gad';
  }
  boards.forEach((b) => { for (let n = 0; n < b.loaves.length; n++) b.loaves[n].visible = !S.burned && n < S.bread; });
  const leaving = S.act === 'leaving';
  trails.forEach((tr) => tr.forEach((sp, n) => { const on = leaving; sp.visible = on; if (on) { const k = (t * 1.6 - n * 0.22) % 1.6; sp.material.opacity = k > 0 && k < 0.6 ? Math.sin((k / 0.6) * Math.PI) : 0.3; } }));
}

// ---------------- Cast ----------------
const villagerLook = (n) => ({ ...LOOKS.david, staff: false, sling: false, curly: false, skin: '#d29a74', skinDark: '#b07a58', hair: '#3a2a20', hairHi: '#4a3628', sandal: '#4a3020', belt: '#5a3a24', ...LOOKS.villagers[n % LOOKS.villagers.length] });
const MESSENGER_LOOK = { ...LOOKS.soldier }; // Achish's messenger (28:1)
const ABIATHAR_LOOK = { ...LOOKS.david, sling: false, curly: false, staff: false, beard: true, skin: '#c98f68', skinDark: '#a87050', hair: '#3a2a20', hairHi: '#4a3628', tunic: '#f0ead8', tunicDark: '#cfc6ae', headcloth: '#f4f0e6', belt: '#7a5a2a' }; // with the ephod (30:7)
const EGYPTIAN_LOOK = { ...villagerLook(3), skin: '#9a6644', skinDark: '#7a4c30', hair: '#1e1612', hairHi: '#2c201a', tunic: '#e8dcc0', tunicDark: '#c4b494', belt: '#8a6a3a' }; // 애굽 소년 (30:13)
const david = new Actor(sheetFor('david', 'human', LOOKS.david), { x: L.entry.x, z: L.entry.z });
const carrySprite = new THREE.Sprite(MATS.item.water); carrySprite.scale.set(0.5, 0.45, 1); carrySprite.renderOrder = 5; carrySprite.visible = false; scene.add(carrySprite);
const S = Z.createZiklag(L, Number(params.get('seed')) || (Date.now() % 100000), carriedFromAct2 || Z.DEFAULT_CARRIED);
const abiathar = new Actor(sheetFor('abiathar', 'human', ABIATHAR_LOOK), { x: S.abiathar.x, z: S.abiathar.z });
let egyptian = null;
const cast = new Map(); // person id -> { actor, bubble, tag }
const sheep = [];
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
const FOLD = { x: C.wx(82), z: C.wz(28) };
function addSheep(n, x, z) {
  for (let k = 0; k < n; k++) {
    const a = new Actor(sheetFor('sheep', 'sheep'), { x: x + (Math.random() - 0.5) * 2, z: z + (Math.random() - 0.5) * 2 });
    a.off = { x: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 2 }; a.wait = Math.random() * 2; a.speedAnim = 7; a.target = null;
    sheep.push(a);
  }
}
// the goal ring: where to go next once the town is left behind
const goalRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); goalRing.rotation.x = -Math.PI / 2; goalRing.visible = false; scene.add(goalRing);
// recovered goods by the brook (30:19–20): what David hands out as shares
const spoilPile = new THREE.Group();
{
  const y = groundAt(L.spoil.x, L.spoil.z), clothMats = [0x8a2a2a, 0x2a4a7a, 0x3a6a3a, 0xc9a24a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), clothMats[k % 4]); m.position.set(L.spoil.x + ((k % 3) - 1) * 0.55, y + 0.15 + Math.floor(k / 3) * 0.28, L.spoil.z + ((k * 7) % 3 - 1) * 0.3); m.rotation.y = k * 0.7; m.castShadow = true; spoilPile.add(m); }
  for (let k = 0; k < 4; k++) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.46, 7), new THREE.MeshLambertMaterial({ map: TX.terracotta })); j.position.set(L.spoil.x - 1 + k * 0.6, y + 0.23, L.spoil.z + 0.9); j.castShadow = true; spoilPile.add(j); }
  spoilPile.visible = false; scene.add(spoilPile);
}
// the baggage the two hundred stay with (30:24 "소유물 곁에")
{
  const y = groundAt(L.baggage.x, L.baggage.z);
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.45), new THREE.MeshLambertMaterial({ map: TX.hay })); m.position.set(L.baggage.x + ((k % 3) - 1) * 0.65, y + 0.18 + Math.floor(k / 3) * 0.34, L.baggage.z - 0.4); m.rotation.y = k * 0.5; m.castShadow = true; scene.add(m); }
}

// ---------------- The burned town (30:1–3) ----------------
const smokeMat = new THREE.SpriteMaterial({ map: makeSoftTexture(64, 'radial'), color: new THREE.Color(0.22, 0.2, 0.2), transparent: true, depthWrite: false, opacity: 0.55 });
const smoke = [];
function burnTown() {
  const dark = new Set(['roof', 'plaster', 'mudbrick', 'wood', 'hay', 'door', 'clothRed', 'clothBlue', 'clothGreen', 'ashlar']);
  props.group.traverse((o) => { const key = (o.name || '').replace('props:', ''); if (o.isMesh && dark.has(key) && o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(key === 'ashlar' ? 0.55 : 0.32); } });
  for (const g of growth.tents) { g.visible = false; for (const k of g.userData.tiles) world.blocked[k] = 0; }
  for (const h of world.features.houses) for (let n = 0; n < 3; n++) {
    const sp = new THREE.Sprite(smokeMat.clone()); const x = C.wx(h.i0 + h.w / 2 - 0.5), z = C.wz(h.j0 + h.d / 2 - 0.5);
    sp.userData = { x, z, y0: h.y + h.h + 0.3, t: Math.random() * 4 + n * 1.3 }; sp.scale.setScalar(1.4); scene.add(sp); smoke.push(sp);
  }
  for (const a of sheep) { a.mesh.visible = false; a.blob.visible = false; }
}

// ---------------- Input ----------------
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = keyName(e); keys.add(k);
  if (e.repeat) return;
  if ((k === 'enter' || k === ' ') && cardState.open) { e.preventDefault(); $('cardClose').click(); return; }
  if (['e', ' ', 'enter'].includes(k) && !cardState.open && Z.giveShare(S, david)) e.preventDefault();
});
$('act').addEventListener('click', () => { if (!cardState.open) Z.giveShare(S, david); });
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
$('cardClose').addEventListener('click', () => { if (!cardState.open) return; cardState.open = false; $('card').classList.remove('show'); const f = cardState.onClose; cardState.onClose = null; f?.(); });

function roleLine() { return `물 ${G.workers(S, 'water').length}/${G.ROLE_CAP.water} · 떡 ${G.workers(S, 'bread').length}/${G.ROLE_CAP.bread} · 파수 ${G.workers(S, 'watch').length}/${G.ROLE_CAP.watch}`; }
let hudCache = '', watchTold = false;
const PLACE = { build: '시글락', leaving: '시글락', away: '시글락', burned: '불탄 시글락', ephod: '불탄 시글락', pursue: '남쪽 길', egypt: '브솔 시내', 'egypt-up': '브솔 시내 남쪽 들', guide: '남쪽 들', recovered: '남쪽 들', share: '브솔 시내', ending: '브솔 시내', done: '브솔 시내' };
function updateHUD() {
  if (!watchTold && watchNudge() && !$('toast').classList.contains('show')) { watchTold = true; toast(`성벽을 지킬 사람이 없습니다. 따라오는 사람을 ${withTo(L.lookoutName)} 데려가면 파수꾼이 됩니다.`, 5600); }
  const watchN = G.workers(S, 'watch').length, building = S.act === 'build';
  const key = [S.joined, S.bread, Math.round(S.attention), S.carry, G.workers(S).length, watchN, S.act, S.phase, S.shares].join('|');
  if (key === hudCache) return; hudCache = key;
  $('where').textContent = PLACE[S.act] || '시글락';
  $('joined').textContent = `함께한 자 ${S.joined}명`;
  $('bread').textContent = building ? `떡 ${S.bread}` : S.act === 'share' ? `나눈 몫 ${S.shares}/${S.stayers.length}` : '';
  $('rumor').style.display = building ? '' : 'none';
  $('rumorFill').style.width = `${S.attention}%`;
  $('rumor').classList.toggle('hot', S.attention > 75);
  $('roles').textContent = roleLine(); $('roles').style.display = building ? '' : 'none';
  $('rumorHint').textContent = !building || S.phase !== 'play' ? '' : watchN ? `파수꾼 ${watchN}명이 성벽을 지키는 중` : `따라오는 사람을 ${L.lookoutName}에 세우면 성벽을 지킵니다`;
}

// ---------------- Events from the simulation ----------------
let firstWorkerServe = true, firstJoin = true, messenger = null;
function removeMessenger() { if (messenger) { messenger.remove(); messenger = null; } }
const V = {
  '27:6': '아기스가 그 날에 시글락을 그에게 주었으므로 시글락이 오늘까지 유다 왕에게 속하니라',
  '28:1': '그 때에 블레셋 사람이 이스라엘을 쳐서 싸우려고 군대를 모집한지라 아기스가 다윗에게 이르되 너는 밝히 알라 너와 네 사람들이 나와 한가지로 나가서 군대에 참가할 것이니라',
  '29:11': '이에 다윗이 자기 사람들로 더불어 일찌기 아침에 일어나서 떠나 블레셋 사람의 땅으로 돌아가고 블레셋 사람은 이스르엘로 올라가니라',
  '30:1': '다윗과 그의 사람들이 제 삼일에 시글락에 이를 때에 아말렉 사람들이 이미 남방과 시글락을 침로하였는데 그들이 시글락을 쳐서 불사르고',
  '30:2': '거기 있는 대소 여인들을 하나도 죽이지 아니하고 다 사로잡아 끌고 자기 길을 갔더라',
  '30:3': '다윗과 그의 사람들이 성에 이르러 본즉 성이 불탔고 자기들의 아내와 자녀들이 사로잡혔는지라',
  '30:4': '다윗과 그와 함께한 백성이 울 기력이 없도록 소리를 높여 울었더라',
  '30:6': '백성이 각기 자녀들을 위하여 마음이 슬퍼서 다윗을 돌로 치자 하니 다윗이 크게 군급하였으나 그 하나님 여호와를 힘입고 용기를 얻었더라',
  '30:7': '다윗이 아히멜렉의 아들 제사장 아비아달에게 이르되 청컨대 에봇을 내게로 가져오라 아비아달이 에봇을 다윗에게로 가져오매',
  '30:8': '다윗이 여호와께 묻자와 가로되 내가 이 군대를 쫓아 가면 미치겠나이까 여호와께서 대답하시되 쫓아가라 네가 반드시 미치고 정녕 도로 찾으리라',
  '30:10': '곧 피곤하여 브솔 시내를 건너지 못하는 이백인을 머물렀고 다윗은 사백인을 거느리고 쫓아가니라',
  '30:11': '무리가 들에서 애굽 사람 하나를 만나 다윗에게로 데려다가 떡을 주어 먹게 하며 물을 마시우고',
  '30:12': '무화과 뭉치에서 뗀 덩이 하나와 건포도 두 송이를 주었으니 그가 낮 사흘, 밤 사흘을 떡도 먹지 못하였고 물도 마시지 못하였음이라 그가 먹고 정신을 차리매',
  '30:13': '다윗이 그에게 이르되 너는 뉘게 속하였으며 어디로서냐 가로되 나는 애굽 소년이요 아말렉 사람의 종이더니 사흘 전에 병이 들매 주인이 나를 버렸나이다',
  '30:15': '다윗이 그에게 이르되 네가 나를 그 군대에게로 인도하겠느냐 그가 가로되 당신이 나를 죽이지도 아니하고 내 주인의 수중에 붙이지도 아니하겠다고 하나님으로 맹세하소서 그리하면 내가 당신을 이 군대에게로 인도하리이다',
  '30:16': '그가 인도하여 내려가니 그들이 온 땅에 편만하여 블레셋 사람의 땅과 유다 땅에서 크게 탈취하였음을 인하여 먹고 마시며 춤추는지라',
  '30:18': '다윗이 아말렉 사람의 취하였던 모든 것을 도로 찾고 그 두 아내를 구원하였고',
  '30:19': '그들의 탈취하였던것 곧 무리의 자녀들이나 빼앗겼던 것의 대소를 물론하고 아무 것도 잃은 것이 없이 다윗이 도로 찾아왔고',
  '30:21': '다윗이 이왕에 피곤하여 능히 자기를 따르지 못하므로 브솔 시내에 머물게 한 이백인에게 오매 그들이 다윗과 그와 함께한 백성을 영접하러 나온지라 다윗이 그 백성에게 이르러 문안하매',
  '30:22': '다윗과 함께 갔던 자 중에 악한 자와 비류들이 다 가로되 그들이 우리와 함께 가지 아니하였은즉 우리가 도로 찾은 물건은 무엇이든지 그들에게 주지 말고 각 사람의 처자만 주어서 데리고 떠나가게 하라 하는지라',
  '30:23': '다윗이 가로되 나의 형제들아 여호와께서 우리를 보호하시고 우리를 치러 온 그 군대를 우리 손에 붙이셨은즉 그가 우리에게 주신 것을 너희가 이같이 못하리라',
  '30:24': '이 일에 누가 너희를 듣겠느냐 전장에 내려갔던 자의 분깃이나 소유물 곁에 머물렀던 자의 분깃이 일반일찌니 같이 분배할것이니라 하고',
  '30:25': '그 날부터 다윗이 이것으로 이스라엘의 율례와 규례를 삼았더니 오늘까지 이르니라',
};
const v = (ref) => [`삼상 ${ref}`, V[ref]];
function handle(ev) {
  const p = ev.id ? S.people.find((q) => q.id === ev.id) : null;
  switch (ev.type) {
    case 'arrive': if (!S.arrivedOnce) { S.arrivedOnce = true; toast('북쪽 성문으로 가족들이 들어옵니다 (27:3). 필요한 것을 채워 주세요.', 4200); } break;
    case 'join':
      if (firstJoin && ev.by === 'david') { firstJoin = false; setTimeout(() => toast('맞이한 사람이 당신을 따라옵니다. 우물·곳간·성벽 망대로 데려가면 일을 맡습니다.', 4200), 600); }
      popText(`+${ev.count}`, p);
      break;
    case 'waiting':
      if (p?.need === 'bread' && breadToldAt < 0) { breadToldAt = S.t; toast('떡은 동쪽 곳간에 있습니다.', 4200); }
      break;
    case 'escort': toast('이 사람을 광장의 불 곁으로 데려가세요.'); break;
    case 'assign': toast(`${withSubject(G.ROLE_NAME[ev.role])} 생겼습니다`, 1800); break;
    case 'restaffed': toast('시글락에 물 긷는 자, 떡 굽는 자, 파수꾼이 다 섰습니다.', 3600); break;
    case 'served-by-people':
      if (firstWorkerServe) { firstWorkerServe = false; toast('당신이 세운 사람이 새로 온 가족을 맞이했습니다.', 4200); }
      break;
    case 'gad': toast('북쪽 길로 블레셋 사람이 옵니다…', 3200); removeMessenger(); messenger = new Actor(sheetFor('msg-gath', 'human', MESSENGER_LOOK), { x: S.gad.x, z: S.gad.z }); messenger.speedAnim = 8; break;
    case 'gad-speaks': showCard({
      place: '시글락 · 아기스의 부름', title: '나와 한가지로 나가서',
      verses: [v('28:1')],
      body: '<p class="note">다윗과 사람들은 아기스를 따라 나가야 합니다. 물 긷는 자와 떡 굽는 자, 파수꾼까지 모두 데리고 갑니다. 가족들은 성에 남습니다.</p>',
      button: '사람들을 데리고 북쪽 성문으로', onClose: () => Z.answerCall(S),
    }); break;
    case 'leaving': toast('사람들이 일을 놓고 당신을 따릅니다. 불빛을 따라 북쪽 성문으로 나가세요.', 3600); break;
    case 'away': removeMessenger(); showCard({
      place: '아벡에서 돌아오는 길', title: '블레셋 사람의 땅으로 돌아가고',
      verses: [v('29:11')],
      body: '<p class="note">블레셋 방백들이 다윗을 싸움에 데려가지 않겠다고 해서, 아기스가 돌려보냈습니다 (29:3–10). 사흘 만에 시글락에 닿습니다.</p>',
      button: '시글락으로 돌아가기', onClose: () => Z.returnToZiklag(S),
    }); break;
    case 'burned': burnTown(); showCard({
      place: '시글락 · 제 삼일', title: '성이 불탔고',
      verses: [v('30:1'), v('30:2'), v('30:3')],
      body: '<p class="note">불탄 장면과 우는 사람들만 보여 줍니다. 아무도 죽지 않았고, 모두 끌려갔습니다 (30:2).</p>',
      button: '…', onClose: () => toast('사람들이 울고 있습니다 (30:4). 광장의 제사장 아비아달에게 가세요.', 4600),
    }); break;
    case 'ephod': showCard({
      place: '시글락 · 광장', title: '여호와를 힘입고 용기를 얻었더라',
      verses: [v('30:6'), v('30:7'), v('30:8')],
      button: '쫓아가기', onClose: () => Z.startPursuit(S),
    }); break;
    case 'pursue': toast('모두 당신을 따라옵니다. 남쪽 성문으로 나가 브솔 시내로 가세요.', 3600); break;
    case 'besor': showCard({
      place: '브솔 시내', title: '건너지 못하는 이백인',
      verses: [v('30:10')],
      body: `<p class="note">지친 사람들(${ev.stayed}명)이 북쪽 둑의 짐 곁에 남고, 나머지 ${ev.went}명이 당신과 함께 건넙니다.</p>`,
      button: '시내를 건너기', onClose: () => toast('들에 누군가 쓰러져 있습니다. 남동쪽으로 가 보세요.', 3800),
    }); break;
    case 'pickup':
      if (ev.item === 'water' && S.act === 'egypt') toast('시냇물을 떴습니다. 쓰러진 사람에게 가져다주세요.', 2600);
      if (ev.item === 'bread' && S.act === 'egypt') toast('짐에서 떡과 무화과, 건포도를 꺼냈습니다 (30:12).', 2800);
      if (ev.item === 'share') toast('몫을 들었습니다. 머문 사람들에게 가져다주세요.', 2200);
      break;
    case 'fed': popText(ev.item === 'water' ? '물' : '떡', S.egyptian); toast(ev.item === 'water' ? '물을 마셨습니다. 이제 떡을 가져다주세요.' : '떡을 먹었습니다. 이제 물을 가져다주세요.', 2600); break;
    case 'egypt-up': showCard({
      place: '브솔 시내 남쪽 들', title: '애굽 소년',
      verses: [v('30:11'), v('30:12'), v('30:13'), v('30:15')],
      button: '그를 따라가기', onClose: () => Z.startGuide(S),
    }); break;
    case 'guide': toast('애굽 소년이 길을 안내합니다. 따라가세요.', 3000); break;
    case 'recovered': showCard({
      place: '남쪽 들 · 아말렉 진', title: '아무 것도 잃은 것이 없이',
      verses: [v('30:16'), v('30:18'), v('30:19')],
      body: '<p class="note">싸움 장면은 그리지 않습니다 (30:17). 끌려갔던 가족과 양떼, 빼앗겼던 것을 모두 되찾았습니다.</p>',
      button: '브솔 시내로 돌아가기', onClose: () => Z.returnToBesor(S),
    }); break;
    case 'back-at-besor':
      for (const a of sheep) { a.mesh.visible = true; a.blob.visible = true; a.x = L.returnFrom.x + 3 + a.off.x; a.z = L.returnFrom.z + 1 + a.off.z; a.target = null; a.wait = Math.random() * 2; }
      spoilPile.visible = true;
      toast('머물렀던 사람들이 맞으러 나왔습니다 (30:21).', 3400);
      setTimeout(() => { if (S.act === 'share') toast('"그들이 우리와 함께 가지 아니하였은즉 … 그들에게 주지 말고" (30:22). 되찾은 물건 더미에서 몫을 들고 가세요.', 6000); }, 3600);
      break;
    case 'share': popText('몫', p); if (ev.left > 0) toast(`몫을 받았습니다. 남은 무리 ${ev.left}`, 1800); break;
    case 'shared': showCard({
      place: '브솔 시내', title: '같이 분배할것이니라',
      verses: [v('30:23'), v('30:24'), v('30:25')],
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


function showEnding() {
  Z.finish(S);
  const s = Z.summary(S);
  const best = Math.max(s.joined, Number(localStorage.getItem(SAVE_KEY) || 0)); localStorage.setItem(SAVE_KEY, String(best));
  showCard({
    place: '3막 · 시글락', title: '여호와를 힘입고',
    verses: [v('30:6'), v('30:24')],
    body: `<p class="note">함께한 자 <b>${s.joined}명</b>. 시글락에 가족들의 거처를 세웠고, 불탄 성에서 다시 일어섰습니다. 따라가지 못한 ${s.stayed}명에게도 같은 몫을 나누었습니다. <span class="soon">4막 · 헤브론은 준비 중입니다.</span></p>`,
    recorded: [
      '아기스가 다윗에게 시글락을 주었고, 다윗은 블레셋 지방에 일년 넉달을 머물렀다 (27:6–7).',
      '그 동안 다윗은 남방 민족들을 치고 아기스에게 거짓으로 보고했다 (27:8–12). 이 게임은 그 일을 놀이로 만들지 않았다.',
      '다윗이 아기스를 따라 나간 사이 아말렉이 시글락을 불사르고 여인들과 자녀들을 사로잡아 갔다 (30:1–3).',
      '다윗은 여호와를 힘입고 용기를 얻었고, 에봇으로 물은 뒤 쫓아갔다. 브솔 시내에 이백 명이 머물렀다 (30:6–10).',
      '버려진 애굽 소년에게 떡과 물을 주었고, 그가 길을 안내했다. 모든 것을 도로 찾았다 (30:11–19).',
      '머문 자와 내려간 자의 분깃이 같다는 것이 이스라엘의 율례가 되었다 (30:24–25). 다윗은 유다 장로들에게도 선물을 보냈다 (30:26–31).',
    ],
    imagined: [
      '시글락과 브솔 시내, 들의 지형과 거리',
      '가족들이 한 무리씩 들어와 거처를 세우는 놀이 방식, 우물·곳간·성벽 망대의 역할',
      '애굽 소년이 쓰러져 있던 자리, 물과 떡을 가져다주는 순서',
      '몫을 무리마다 하나씩 가져다주는 방식. 본문은 "같이 분배할것이니라"라고만 한다',
    ],
    extra: `<div class="links"><a href="./ziklag.html">다시 하기</a><a href="./herut.html">2막 · 헤렛 수풀</a><a href="./">다윗의 땅</a></div>`,
    button: '다윗의 땅으로', onClose: () => { location.href = './'; },
  });
}

// ---------------- Off-screen markers: people who need something, and where to take an escort ----------------
const marks = [];
const ICON_URL = Object.fromEntries(['water', 'bread', 'fire'].map((k) => [k, TEX.bubble[k].image.toDataURL()]));
ICON_URL['sign-water'] = signTex('water').image.toDataURL(); ICON_URL['sign-bread'] = signTex('bread').image.toDataURL(); ICON_URL['sign-watch'] = signTex('watch').image.toDataURL();
ICON_URL.exit = pixelTex(14, 15, (px) => { px(1, 0, '#3a2a1a', 12, 1); px(0, 1, '#3a2a1a', 1, 10); px(13, 1, '#3a2a1a', 1, 10); px(1, 11, '#3a2a1a', 12, 1); px(1, 1, '#f6dc94', 12, 10); px(6, 2, '#5a3414', 2, 6); px(4, 6, '#5a3414', 6, 1); px(5, 7, '#5a3414', 4, 1); px(6, 8, '#5a3414', 2, 1); }).image.toDataURL();
function markEl(n) {
  while (marks.length <= n) { const el = document.createElement('div'); el.className = 'edge'; el.innerHTML = '<i></i><img alt="">'; $('hud').appendChild(el); marks.push(el); }
  return marks[n];
}
// where David should go next after the call (one goal at a time)
function goalPoint() {
  switch (S.act) {
    case 'burned': return S.abiathar;
    case 'pursue': return david.z < L.southGate.z - 0.6 ? L.southGate : L.ford;
    case 'egypt': return S.carry ? S.egyptian : !S.fed.water ? { ...L.brookWater, icon: 'water' } : { ...L.baggage, icon: 'bread' };
    case 'guide': return S.guide?.there ? L.overlook : S.egyptian;
    case 'share': { if (!S.carry) return L.spoil; const p = S.people.filter((q) => q.status === 'staying' && !q.shared).sort((a, b) => Math.hypot(a.x - david.x, a.z - david.z) - Math.hypot(b.x - david.x, b.z - david.z))[0]; return p || null; }
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
  if (S.act === 'leaving') { list.length = 0; if (!onScreen(L.exit.x, L.exit.z)) list.push({ x: L.exit.x, z: L.exit.z, need: 'exit', goal: true, n: 1 }); }
  const goal = S.act === 'build' || S.act === 'leaving' ? null : goalPoint();
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
  if (started && !cardState.open && S.phase !== 'done') {
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
  if (started && !cardState.open) {
    Z.step(S, dt, { david });
    if (S.teleport) { david.x = S.teleport.x; david.z = S.teleport.z; david.y = groundAt(david.x, david.z); camTarget.set(david.x, david.y + 0.8, david.z); S.teleport = null; }
    for (const ev of G.drainEvents(S)) handle(ev);
  }
  grow();

  // people
  for (const p of S.people) {
    const c = castFor(p), a = c.actor;
    const hidden = p.status === 'taken';
    a.mesh.visible = a.blob.visible = !hidden; if (hidden) { c.bubble.visible = c.tag.visible = false; continue; }
    const dx = p.x - c.px, dz = p.z - c.pz; c.px = p.x; c.pz = p.z;
    a.x = p.x; a.z = p.z; a.moving = Math.hypot(dx, dz) > 0.0005;
    if (a.moving) a.face(dx, dz); else if (p.status === 'waiting') a.face(david.x - a.x, david.z - a.z);
    a.update(dt);
    const top = a.y + a.h + 0.15;
    if (p.status === 'waiting' || p.status === 'arriving') {
      c.bubble.visible = true; c.bubble.material = (p.waited > 22 ? MATS.bubbleLate : MATS.bubble)[p.need];
      c.bubble.position.set(a.x, top + 0.42 + Math.sin(t * 3 + p.id) * 0.06, a.z);
    } else c.bubble.visible = false;
    const tagKind = p.status === 'working' ? (p.carry || (p.role === 'watch' ? 'watch' : p.role)) : p.status === 'escort' ? 'fire' : p.status === 'staying' && p.shared ? 'share' : null;
    c.tag.visible = !!tagKind; if (tagKind) { c.tag.material = MATS.item[tagKind]; c.tag.position.set(a.x, top + 0.2, a.z); }
  }
  if (messenger && S.gad) { const dx = S.gad.x - messenger.x, dz = S.gad.z - messenger.z; messenger.moving = Math.hypot(dx, dz) > 0.0005; if (messenger.moving) messenger.face(dx, dz); messenger.x = S.gad.x; messenger.z = S.gad.z; messenger.update(dt); }
  abiathar.update(dt); if (S.act === 'burned') abiathar.face(david.x - abiathar.x, david.z - abiathar.z);
  if (S.egyptian && !egyptian) { egyptian = new Actor(sheetFor('egyptian', 'human', EGYPTIAN_LOOK), { x: S.egyptian.x, z: S.egyptian.z }); egyptian.need = new THREE.Sprite(MATS.bubble.water); egyptian.need.scale.set(0.78, 0.84, 1); egyptian.need.renderOrder = 6; scene.add(egyptian.need); }
  if (egyptian && !S.egyptian) { egyptian.remove(); scene.remove(egyptian.need); egyptian = null; }
  if (egyptian) {
    const E = S.egyptian, dx = E.x - egyptian.x, dz = E.z - egyptian.z; egyptian.moving = Math.hypot(dx, dz) > 0.0005; if (egyptian.moving) egyptian.face(dx, dz); egyptian.x = E.x; egyptian.z = E.z; egyptian.update(dt);
    egyptian.mesh.scale.y = E.up ? 1 : 0.55; // lying weak in the field until he eats (30:12)
    const want = !S.fed.water ? 'water' : !S.fed.bread ? 'bread' : null;
    egyptian.need.visible = !!want && S.act === 'egypt'; if (want) { egyptian.need.material = MATS.bubble[want]; egyptian.need.position.set(E.x, egyptian.y + 1.3 + Math.sin(t * 3) * 0.06, E.z); }
  }
  const gp = goalPoint(); goalRing.visible = !!gp && !cardState.open;
  if (gp) { const k = (t * 1.4) % 1; goalRing.position.set(gp.x, groundAt(gp.x, gp.z) + 0.08, gp.z); goalRing.scale.setScalar(0.8 + k * 0.5); goalRing.material.opacity = 0.7 * (1 - k); }
  for (const sp of smoke) { const u = sp.userData; u.t += dt; const k = (u.t % 4) / 4; sp.position.set(u.x + Math.sin(u.t * 0.7) * 0.3 * k, u.y0 + k * 3.2, u.z - k * 0.6); sp.scale.setScalar(1 + k * 2.2); sp.material.opacity = 0.55 * Math.sin(k * Math.PI); }
  // the flock grows as households settle (S.flocks), popping in at the fold
  if (!S.burned && sheep.length < S.flocks) addSheep(S.flocks - sheep.length, FOLD.x, FOLD.z);
  // sheep graze near the camp, and follow when everyone leaves
  for (const a of sheep) {
    let tx, tz, sp = 1.1;
    if (!a.mesh.visible) continue;
    const home = S.act === 'share' || S.act === 'ending' || S.act === 'done' ? { x: L.returnFrom.x + 4 + a.off.x, z: L.returnFrom.z + 1 + a.off.z * 0.5 } : { x: FOLD.x + a.off.x * 0.5, z: FOLD.z + a.off.z * 0.5 };
    { a.wait -= dt; if (!a.target && a.wait <= 0) a.target = { x: home.x + (Math.random() - 0.5) * 3, z: home.z + (Math.random() - 0.5) * 2 }; if (a.target) { tx = a.target.x; tz = a.target.z; } }
    a.moving = false;
    if (tx !== undefined) { const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d < 0.3) { a.target = null; a.wait = 1.5 + Math.random() * 4; } else { const st = Math.min(d, sp * dt); a.x += (dx / d) * st; a.z += (dz / d) * st; a.moving = true; a.face(dx, dz, true); } }
    a.update(dt);
  }
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

  const lightK = S.act === 'build' || S.act === 'leaving' ? Math.min(1, S.t / L.maxTime) * 0.45 : S.burned && (S.act === 'burned' || S.act === 'ephod') ? 0.9 : S.act === 'share' || S.act === 'ending' || S.act === 'done' ? 0.75 : 0.35;
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
    if (hint && !cardState.open) { prompt.textContent = hint; prompt.classList.add('show'); } else prompt.classList.remove('show');
    $('act').classList.toggle('show', S.act === 'share' && S.carry === 'share' && S.people.some((q) => q.status === 'staying' && !q.shared && Math.hypot(david.x - q.x, david.z - q.z) <= Z.SHARE_RANGE) && !cardState.open);
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
  setTimeout(() => toast(isMobile ? '화면을 끌어서 걷기. 따라오는 사람들을 우물·곳간·성벽 망대로 데려가세요.' : 'WASD/방향키로 걷기. 따라오는 사람들을 우물·곳간·성벽 망대로 데려가세요.', 4200), 1800);
}
$('startBtn').addEventListener('click', start);
if (started) { $('title').classList.add('hide'); $('hud').classList.add('show'); }
const prevBest = Number(localStorage.getItem(SAVE_KEY) || 0);
if (prevBest) $('best').textContent = `지난 기록: 함께한 자 ${prevBest}명`;
$('carried').textContent = carriedFromAct2 ? `엔게디에서 함께한 ${S.carried}명이 따라옵니다` : `2막 기록이 없어 ${S.carried}명과 함께 시작합니다`;
addSheep(S.flocks, FOLD.x, FOLD.z);
requestAnimationFrame(frame);

window.__ziklag = {
  S, G, Z, world, david, sheep, get fps() { return fps; }, start,
  teleport(x, z) { david.x = x; david.z = z; david.y = groundAt(x, z); camTarget.set(x, david.y + 0.8, z); },
  info: () => renderer.info.render,
};
