// Act 1 · 아둘람 — renderer, input and UI. Game rules live in adullam-logic.js.
import * as THREE from 'three';
import { canStep } from './world.js';
import { generateAdullam } from './adullam-world.js';
import * as G from './adullam-logic.js';
import { buildTerrain, buildWater, buildProps, buildVegetation, makeCoords, BILLBOARD_Q } from './scene.js';
import { makeCharacterSheet, LOOKS, makeFlameSheet, makeSoftTexture } from './pixel.js';
import { PostStack } from './post.js';
import { BIBLE_SOURCE } from './data.js';
import { keyName } from './keys.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const world = generateAdullam();
const L = world.layout;
const C = makeCoords(world);
const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'david-adullam-v1';

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
  for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 1; di++) world.blocked[world.idx(i + di, j + dj)] = 1;
  return g;
}
const growth = { tents: [], fires: 1, popping: [] };
function grow(joined) {
  const wantTents = Math.min(L.tentSpots.length, Math.floor(joined / 45));
  while (growth.tents.length < wantTents) { const s = L.tentSpots[growth.tents.length]; const t = makeTent(s.i, s.j, growth.tents.length % 3 === 1); growth.tents.push(t); growth.popping.push({ obj: t, t: 0 }); }
  const wantFires = 1 + Math.min(L.fireSpots.length, Math.floor(joined / 110));
  while (growth.fires < wantFires) { const s = L.fireSpots[growth.fires - 1]; addFire(C.wx(s.i), C.wz(s.j), 0.85); growth.fires++; }
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
  item: { water: plainTex('water'), bread: plainTex('bread'), fire: plainTex('fire'), watch: plainTex('watch') },
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
  { kind: 'bread', at: L.basket, lift: 2.4 },
  { kind: 'watch', at: L.lookout, lift: 2.2 },
];
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
for (const st of STATIONS) {
  const y = groundAt(st.at.x, st.at.z);
  st.sign = new THREE.Sprite(spriteMat(signTex(st.kind))); st.sign.scale.set(0.82, 0.94, 1); st.sign.renderOrder = 4; scene.add(st.sign);
  st.y = y;
  st.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40), ringMat.clone()); st.ring.rotation.x = -Math.PI / 2; st.ring.position.set(st.at.x, y + 0.08, st.at.z); st.ring.visible = false; scene.add(st.ring);
}
// the oven: a clay 탄누르 with a board of loaves that shows the bread stock
const oven = (() => {
  const g = new THREE.Group(), x = L.basket.x + 1.1, z = L.basket.z - 0.5, y = groundAt(x, z);
  const clay = new THREE.MeshLambertMaterial({ map: TX.terracotta || TX.fieldstone, color: 0xd09a70 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 0.8, 10), clay); body.position.set(x, y + 0.4, z); body.castShadow = true; g.add(body);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.14, 10), clay); lip.position.set(x, y + 0.86, z); g.add(lip);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.0, 0.3) })); mouth.position.set(x, y + 0.24, z + 0.56); g.add(mouth);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.7), woodMat); board.position.set(L.basket.x - 0.2, y + 0.42, L.basket.z + 0.3); board.castShadow = true; g.add(board);
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.28, 0.28]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), woodMat); leg.position.set(L.basket.x - 0.2 + dx, y + 0.2, L.basket.z + 0.3 + dz); g.add(leg); }
  const loafMat = new THREE.MeshLambertMaterial({ color: 0xd59a4c }), loafGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.1, 8);
  const loaves = [];
  for (let n = 0; n < 12; n++) { const l = new THREE.Mesh(loafGeo, loafMat); const c = n % 6, r = Math.floor(n / 6); l.position.set(L.basket.x - 0.2 - 0.6 + c * 0.24, y + 0.51 + r * 0.09, L.basket.z + 0.3 - 0.14 + r * 0.22 + (c % 2) * 0.05); l.castShadow = true; g.add(l); loaves.push(l); }
  scene.add(g);
  const light = new THREE.PointLight(0xff8a3a, 2.2, 3.5, 1.6); light.position.set(x, y + 0.4, z + 0.8); scene.add(light);
  return { loaves, mouth, light };
})();
// leaving: a trail of lights down the road, and torches at its end
const trailMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(3.2, 2.3, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const trail = L.exitRoad.map((p) => { const sp = new THREE.Sprite(trailMat.clone()); sp.position.set(p.x, groundAt(p.x, p.z) + 0.25, p.z); sp.scale.setScalar(1.5); sp.visible = false; scene.add(sp); return sp; });
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
function watchNudge() { return S.phase === 'play' && S.attention >= 25 && G.workers(S, 'watch').length === 0; }
const hasFollowers = () => S.people.some((p) => p.status === 'following');
function updateStations(t) {
  const need = neededStation();
  for (const st of STATIONS) {
    const hot = st.kind === need || (st.kind === 'bread' && breadToldAt >= 0 && t - breadToldAt < 6) || (st.kind === 'watch' && watchNudge());
    const bob = Math.sin(t * (hot ? 5 : 2) + st.at.x) * (hot ? 0.14 : 0.05);
    st.sign.position.set(st.at.x, st.y + st.lift + bob, st.at.z);
    const sc = hot ? 1.18 : 1; st.sign.scale.set(0.82 * sc, 0.94 * sc, 1);
    st.ring.visible = hot; if (hot) { const k = (t * 1.4) % 1; st.ring.scale.setScalar(0.8 + k * 0.5); st.ring.material.opacity = 0.7 * (1 - k); }
    st.sign.visible = S.phase === 'play' || S.phase === 'gad';
  }
  for (let n = 0; n < oven.loaves.length; n++) oven.loaves[n].visible = n < S.bread;
  oven.light.intensity = 1.8 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.15;
  const leaving = S.phase === 'leaving';
  trail.forEach((sp, n) => { sp.visible = leaving; if (leaving) { const k = (t * 1.6 - n * 0.22) % 1.6; sp.material.opacity = k > 0 && k < 0.6 ? Math.sin((k / 0.6) * Math.PI) : 0.3; } });
}

// ---------------- Cast ----------------
const villagerLook = (n) => ({ ...LOOKS.david, staff: false, sling: false, curly: false, skin: '#d29a74', skinDark: '#b07a58', hair: '#3a2a20', hairHi: '#4a3628', sandal: '#4a3020', belt: '#5a3a24', ...LOOKS.villagers[n % LOOKS.villagers.length] });
const GAD_LOOK = { ...LOOKS.david, sling: false, curly: false, staff: true, beard: true, skin: '#c98f68', skinDark: '#a87050', hair: '#d8d2c4', hairHi: '#eeeae0', tunic: '#e9e1cc', tunicDark: '#c7bea6', headcloth: '#f4f0e6', belt: '#6a5a40' };
const david = new Actor(sheetFor('david', 'human', LOOKS.david), { x: L.fire.x - 1.2, z: L.fire.z + 1.4 });
const carrySprite = new THREE.Sprite(MATS.item.water); carrySprite.scale.set(0.5, 0.45, 1); carrySprite.renderOrder = 5; carrySprite.visible = false; scene.add(carrySprite);
const S = G.createAdullam(L, Number(params.get('seed')) || (Date.now() % 100000));
const cast = new Map(); // person id -> { actor, bubble, role }
let gadActor = null;
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
function addSheep(n, x, z) {
  for (let k = 0; k < n; k++) {
    const a = new Actor(sheetFor('sheep', 'sheep'), { x: x + (Math.random() - 0.5) * 2, z: z + (Math.random() - 0.5) * 2 });
    a.home = { x: C.wx(43) + (Math.random() - 0.5) * 3, z: C.wz(47) + (Math.random() - 0.5) * 2 }; a.wait = Math.random() * 2; a.speedAnim = 7; a.target = null;
    sheep.push(a);
  }
}

// ---------------- Input ----------------
const keys = new Set();
addEventListener('keydown', (e) => { const k = keyName(e); keys.add(k); if ((k === 'enter' || k === ' ') && cardState.open && !e.repeat) { e.preventDefault(); $('cardClose').click(); } });
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
  keys.clear(); joy.active = false; joyEl.classList.remove('on');
}
$('cardClose').addEventListener('click', () => { if (!cardState.open) return; cardState.open = false; $('card').classList.remove('show'); const f = cardState.onClose; cardState.onClose = null; f?.(); });

function roleLine() { return `물 ${G.workers(S, 'water').length}/${G.ROLE_CAP.water} · 떡 ${G.workers(S, 'bread').length}/${G.ROLE_CAP.bread} · 파수 ${G.workers(S, 'watch').length}/${G.ROLE_CAP.watch}`; }
let hudCache = '', watchTold = false;
function updateHUD() {
  if (!watchTold && watchNudge() && !$('toast').classList.contains('show')) { watchTold = true; toast('소문이 퍼지고 있습니다. 따라오는 사람을 동쪽 언덕 파수 바위로 데려가면 파수꾼이 되어 소문을 늦춥니다.', 5600); }
  const watchN = G.workers(S, 'watch').length;
  const key = [S.joined, S.bread, Math.round(S.attention), S.carry, G.workers(S).length, watchN].join('|');
  if (key === hudCache) return; hudCache = key;
  $('joined').textContent = `함께한 자 ${S.joined}명`;
  $('bread').textContent = `떡 ${S.bread}`;
  $('rumorFill').style.width = `${S.attention}%`;
  $('rumor').classList.toggle('hot', S.attention > 75);
  $('roles').textContent = roleLine();
  $('rumorHint').textContent = watchN ? `파수꾼 ${watchN}명이 소문을 늦추는 중` : '따라오는 사람을 파수 바위에 세우면 소문이 늦어집니다';
}

// ---------------- Events from the simulation ----------------
let firstFollow = true, firstWorkerServe = true, firstJoin = true;
function handle(ev) {
  const p = ev.id ? S.people.find((q) => q.id === ev.id) : null;
  switch (ev.type) {
    case 'arrive': if (p?.kind === 'family') setTimeout(() => toast('아버지의 온 집이 내려왔습니다 (삼상 22:1). 물을 길어다 주세요.', 3600), 1200); break;
    case 'join':
      if (firstJoin) { firstJoin = false; setTimeout(() => toast('맞이한 사람은 당신을 따라옵니다. 샘·화덕·파수 바위로 데려가면 일을 맡습니다.', 4200), 600); }
      if (p?.kind === 'family') addSheep(5, p.x, p.z); else if (Math.random() < 0.3) addSheep(1 + Math.floor(Math.random() * 2), p.x, p.z);
      popText(`+${ev.count}`, p);
      break;
    case 'waiting':
      if (p?.need === 'bread' && breadToldAt < 0) { breadToldAt = S.t; toast('떡은 굴 입구 옆 화덕에 있습니다. 떡 표시가 있는 곳으로 가면 집어 듭니다.', 4800); }
      break;
    case 'escort': if (firstFollow) { firstFollow = false; toast('이 사람을 불 곁으로 데려가세요.'); } break;
    case 'assign': toast(`${G.ROLE_NAME[ev.role]}가 생겼습니다`, 1800); break;
    case 'served-by-people':
      if (firstWorkerServe) { firstWorkerServe = false; toast('당신이 맞이했던 사람이 새로 온 사람을 맞이했습니다.', 4200); }
      break;
    case 'rest': break;
    case 'gad': toast('누군가 길을 따라 급히 오고 있습니다…', 3000); gadActor = new Actor(sheetFor('gad', 'human', GAD_LOOK), { x: S.gad.x, z: S.gad.z }); gadActor.speedAnim = 8; break;
    case 'gad-speaks': showGad(); break;
    case 'leaving': toast('모두가 짐을 꾸려 당신을 따릅니다. 불빛을 따라 남쪽 길로 내려가세요.', 3600); break;
    case 'done': showEnding(); break;
  }
}
const pops = [];
function popText(text, p) {
  if (!p) return;
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = text; $('hud').appendChild(el);
  pops.push({ el, x: p.x, z: p.z, t: 0 });
}

function showGad() {
  showCard({
    place: '아둘람 · 선지자 갓', title: '이 요새에 있지 말고',
    verses: [['삼상 22:5', '선지자 갓이 다윗에게 이르되 이 요새에 있지 말고 떠나 유다 땅으로 들어가라 다윗이 떠나 헤렛 수풀에 이르니라'], ['삼상 22:6', '사울이 다윗과 그와 함께 있는 사람들이 나타났다 함을 들으니라 …']],
    body: `<p class="note">세운 것을 두고 떠나야 합니다. 데려갈 수 있는 것은 사람들입니다.</p>`,
    button: '모두 데리고 떠나기', onClose: () => G.startLeaving(S),
  });
}
function showEnding() {
  const s = G.summary(S);
  const best = Math.max(s.joined, Number(localStorage.getItem(SAVE_KEY) || 0)); localStorage.setItem(SAVE_KEY, String(best));
  const line = s.servedByPeople > 0
    ? `함께한 자 <b>${s.joined}명</b>. 그중 <b>${s.servedByPeople}무리</b>는 당신이 맞이했던 사람들이 맞이했습니다.`
    : `함께한 자 <b>${s.joined}명</b>. 다음에는 맞이한 사람을 샘·화덕·파수 바위로 데려가 보세요.`;
  showCard({
    place: '1막 · 아둘람 굴', title: '의인이 나를 두르리이다',
    verses: [
      ['삼상 22:2', '환난 당한 모든 자와 빚진 자와 마음이 원통한 자가 다 그에게로 모였고 그는 그 장관이 되었는데 그와 함께한 자가 사백명 가량이었더라'],
      ['시 142:7', '내 영혼을 옥에서 이끌어 내사 주의 이름을 감사케 하소서 주께서 나를 후대하시리니 의인이 나를 두르리이다'],
    ],
    body: `<p class="note">${line}</p><p class="note">다윗은 갓의 말을 듣고 사람들과 함께 <b>헤렛 수풀</b>로 떠났습니다 (삼상 22:5). <span class="soon">2막 · 헤렛 수풀은 준비 중입니다.</span></p>`,
    recorded: [
      '환난 당한 자, 빚진 자, 마음이 원통한 자가 다윗에게 모여 약 400명이 되었다 (22:1–2).',
      '선지자 갓의 말을 듣고 다윗은 헤렛 수풀로 떠났다 (22:5).',
      '시편 142편 표제는 "다윗이 굴에 있을 때"라고 하지만 어느 굴인지는 밝히지 않는다.',
    ],
    imagined: [
      '사람마다의 사연과 필요(물·떡·불 곁 자리), 물 긷는 자·떡 굽는 자·파수꾼이라는 역할',
      '굴·샘·화덕·파수 바위의 모양, 갓이 오는 시점, 떠나는 곳을 아둘람으로 그린 것 (본문은 "이 요새"라고만 한다)',
      '떡 다섯 덩이가 아둘람까지 남아 있었다는 설정 (제사장이 준 떡의 수는 기록되지 않았다)',
    ],
    extra: `<div class="links"><a href="./adullam.html">다시 하기</a><a href="../">다윗 게임</a></div>`,
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
function edgeMarks() {
  const W = innerWidth, H = innerHeight, m = 34;
  const onScreen = (x, z) => { proj.set(x, groundAt(x, z) + 1, z).project(camera); const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * H; return proj.z < 1 && sx > m && sx < W - m && sy > m + 60 && sy < H - m; };
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
  if (S.phase === 'leaving') { list.length = 0; if (!onScreen(L.exit.x, L.exit.z)) list.push({ x: L.exit.x, z: L.exit.z, need: 'exit', goal: true, n: 1 }); }
  let n = 0;
  for (const it of list) {
    proj.set(it.x, groundAt(it.x, it.z) + 1, it.z).project(camera);
    const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * H;
    const cx = W / 2, cy = H / 2; let dx = sx - cx, dy = sy - cy; if (proj.z > 1) { dx = -dx; dy = -dy; }
    const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (dy > 0 ? H / 2 - m - 70 : H / 2 - m - 30) / Math.max(1e-3, Math.abs(dy)));
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
  if (started && !cardState.open) { G.step(S, dt, { david }); for (const ev of G.drainEvents(S)) handle(ev); }
  grow(S.joined);

  // people
  for (const p of S.people) {
    const c = castFor(p), a = c.actor;
    const dx = p.x - c.px, dz = p.z - c.pz; c.px = p.x; c.pz = p.z;
    a.x = p.x; a.z = p.z; a.moving = Math.hypot(dx, dz) > 0.0005;
    if (a.moving) a.face(dx, dz); else if (p.status === 'waiting') a.face(david.x - a.x, david.z - a.z);
    a.update(dt);
    const top = a.y + a.h + 0.15;
    if (p.status === 'waiting' || p.status === 'arriving') {
      c.bubble.visible = true; c.bubble.material = (p.waited > 22 ? MATS.bubbleLate : MATS.bubble)[p.need];
      c.bubble.position.set(a.x, top + 0.42 + Math.sin(t * 3 + p.id) * 0.06, a.z);
    } else c.bubble.visible = false;
    const tagKind = p.status === 'working' ? (p.carry || (p.role === 'watch' ? 'watch' : p.role)) : p.status === 'escort' ? 'fire' : null;
    c.tag.visible = !!tagKind; if (tagKind) { c.tag.material = MATS.item[tagKind]; c.tag.position.set(a.x, top + 0.2, a.z); }
  }
  if (gadActor && S.gad) { const dx = S.gad.x - gadActor.x, dz = S.gad.z - gadActor.z; gadActor.moving = Math.hypot(dx, dz) > 0.0005; if (gadActor.moving) gadActor.face(dx, dz); gadActor.x = S.gad.x; gadActor.z = S.gad.z; gadActor.update(dt); }
  // sheep graze near the camp, and follow when everyone leaves
  for (const a of sheep) {
    let tx, tz, sp = 1.1;
    if (S.phase === 'leaving' || S.phase === 'done') { tx = david.x + Math.cos(a.home.x * 7) * 2; tz = david.z - 1.5 + Math.sin(a.home.z * 7); sp = 4.2; }
    else { a.wait -= dt; if (!a.target && a.wait <= 0) a.target = { x: a.home.x + (Math.random() - 0.5) * 5, z: a.home.z + (Math.random() - 0.5) * 3 }; if (a.target) { tx = a.target.x; tz = a.target.z; } }
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

  const lightK = Math.min(1, S.t / G.END_TIME) * 0.85 + (S.phase === 'leaving' || S.phase === 'done' ? 0.15 : 0);
  const fireI = applyLight(lightK);
  sun.target.position.copy(camTarget); sun.position.copy(camTarget).add(sunOff);
  const near = flames.map((f) => [f, f.pos.distanceToSquared(camTarget)]).sort((a, b) => a[1] - b[1]);
  firePool.forEach((l, n) => { const f = near[n]?.[0]; if (f) { l.position.copy(f.pos).add(tmp.set(0, 0.5, 0.2)); l.intensity = fireI * (0.85 + 0.15 * Math.sin(t * 17 + f.phase) * Math.sin(t * 7.3 + f.phase * 2)); } else l.intensity = 0; });
  const ff = Math.floor(t * 9);
  for (const f of flames) { const uv = f.mesh.geometry.attributes.uv, fr = (ff + Math.floor(f.phase * 3)) % 4; uv.setXY(0, fr / 4, 1); uv.setXY(1, (fr + 1) / 4, 1); uv.setXY(2, fr / 4, 0); uv.setXY(3, (fr + 1) / 4, 0); uv.needsUpdate = true; f.glow.material.opacity = 0.35 + lightK * 0.35; }

  // cave roof fades when David is inside
  if (props.caveRoof) { const i = C.ti(david.x), j = C.tj(david.z); const inside = world.inb(i, j) && world.tag[world.idx(i, j)] === 2; const m = props.caveRoof.material; m.opacity += ((inside ? 0.08 : 1) - m.opacity) * Math.min(1, dt * 6); m.depthWrite = m.opacity > 0.9; }
  water.material.uniforms.time.value = t;

  // HUD
  if (started) {
    updateHUD();
    const prompt = $('prompt'), hint = S.hint;
    if (hint && !cardState.open) { prompt.textContent = hint; prompt.classList.add('show'); } else prompt.classList.remove('show');
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
  setTimeout(() => toast(isMobile ? '화면을 끌어서 걷기. 길에서 사람들이 옵니다.' : 'WASD/방향키로 걷기. 길에서 사람들이 옵니다.', 3200), 1800);
}
$('startBtn').addEventListener('click', start);
if (started) { $('title').classList.add('hide'); $('hud').classList.add('show'); }
const prevBest = Number(localStorage.getItem(SAVE_KEY) || 0);
if (prevBest) $('best').textContent = `지난 기록: 함께한 자 ${prevBest}명`;
requestAnimationFrame(frame);

window.__adullam = {
  S, G, world, david, get fps() { return fps; }, start,
  teleport(x, z) { david.x = x; david.z = z; david.y = groundAt(x, z); camTarget.set(x, david.y + 0.8, z); },
  info: () => renderer.info.render,
};
