import * as THREE from 'three';
import { generateWorld, canStep } from './world.js';
import { REGIONS, POIS, BIBLE_SOURCE, JOURNEY_END } from './data.js';
import { act1Best, act2Best, regionProgress, journeyComplete } from './progress.js';
import { buildTerrain, buildWater, buildProps, buildVegetation, makeCoords, BILLBOARD_Q } from './scene.js';
import { makeCharacterSheet, LOOKS, makeFlameSheet, makeIconTexture, makeSoftTexture } from './pixel.js';
import { PostStack } from './post.js';
import { keyName } from './keys.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const world = generateWorld();
const C = makeCoords(world);
const $ = (id) => document.getElementById(id);

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
const camera = new THREE.PerspectiveCamera(30, 1, 1, 260);
scene.fog = new THREE.Fog(0xdfe7ea, 48, 120);
scene.background = new THREE.Color(0xdfe7ea);

const hemi = new THREE.HemisphereLight(0xd6e4f2, 0xb9a37c, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.7);
sun.castShadow = true;
const SHADOW = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(SHADOW, SHADOW);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 34, bottom: -34, near: 1, far: 140 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);

// ---------------- World meshes ----------------
const time = { value: 0 };
scene.add(buildTerrain(world));
const water = buildWater(world);
scene.add(water);
const props = buildProps(world);
scene.add(props.group);
scene.add(buildVegetation(world, time));

// window glow (evening)
const winGeo = new THREE.PlaneGeometry(0.22, 0.24);
const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.2, 0.8), transparent: true, opacity: 0 });
const windows = new THREE.InstancedMesh(winGeo, winMat, props.windows.length);
props.windows.forEach((p, k) => windows.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
scene.add(windows);

// ---------------- Fires ----------------
const flameTex = makeFlameSheet();
const glowTex = makeSoftTexture(64, 'radial');
const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, alphaTest: 0.1, color: new THREE.Color(3.2, 2.2, 1.2), depthWrite: false });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6, 0.8, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
const flames = props.fires.map((f, n) => {
  const g = new THREE.PlaneGeometry(0.5 * f.size, 0.75 * f.size); g.translate(0, 0.37 * f.size, 0);
  const m = new THREE.Mesh(g, flameMat); m.position.copy(f.pos); m.quaternion.copy(BILLBOARD_Q);
  scene.add(m);
  const glow = new THREE.Sprite(glowMat); glow.position.copy(f.pos).add(new THREE.Vector3(0, 0.35 * f.size, 0)); glow.scale.setScalar(2.2 * f.size);
  scene.add(glow);
  return { ...f, mesh: m, glow, phase: n * 1.7 };
});
const firePool = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffa54a, 0, 9, 1.6); scene.add(l); return l; });

// ---------------- Sprites ----------------
const blobTex = makeSoftTexture(64, 'blob');
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
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
    this.sheet = sheet;
    const w = (sheet.fw / 16) * scale, h = (sheet.fh / 16) * scale;
    this.geo = new THREE.PlaneGeometry(w, h); this.geo.translate(0, h / 2, 0);
    this.mesh = new THREE.Mesh(this.geo, sheet.material);
    this.mesh.quaternion.copy(BILLBOARD_Q);
    this.mesh.castShadow = true; this.mesh.customDepthMaterial = sheet.depth;
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.55), blobMat);
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1;
    scene.add(this.mesh, this.blob);
    this.x = x; this.z = z; this.y = groundAt(x, z); this.dir = 0; this.frame = 0; this.anim = 0; this.moving = false;
    this.setFrame(0, 0);
  }
  setFrame(dir, frame) {
    if (dir === this._d && frame === this._f) return;
    this._d = dir; this._f = frame;
    const e = 0.001, u0 = frame / 4 + e, u1 = (frame + 1) / 4 - e, v1 = 1 - dir / 4 - e, v0 = 1 - (dir + 1) / 4 + e;
    const uv = this.geo.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  }
  update(dt) {
    if (this.moving) { this.anim += dt * (this.speedAnim || 8); this.setFrame(this.dir, Math.floor(this.anim) % 4); }
    else { this.anim = 0; this.setFrame(this.dir, 0); }
    const g = groundAt(this.x, this.z);
    this.y += (g - this.y) * Math.min(1, dt * 14);
    this.mesh.position.set(this.x, this.y, this.z);
    this.blob.position.set(this.x, Math.max(this.y, waterAt(this.x, this.z)) + 0.02, this.z + 0.05);
  }
}
function tileAt(x, z) { return [C.ti(x), C.tj(z)]; }
function groundAt(x, z) { const [i, j] = tileAt(x, z); return world.inb(i, j) ? world.height[world.idx(i, j)] : 0; }
function waterAt(x, z) { const [i, j] = tileAt(x, z); return world.inb(i, j) ? world.water[world.idx(i, j)] : -1; }
function tryMove(a, dx, dz) {
  let moved = false;
  if (dx) {
    const [ci, cj] = tileAt(a.x, a.z);
    const nx = a.x + dx, pi = C.ti(nx + Math.sign(dx) * 0.3);
    if (pi === ci || canStep(world, ci, cj, pi, cj)) { a.x = nx; moved = true; }
  }
  if (dz) {
    const [ci, cj] = tileAt(a.x, a.z);
    const nz = a.z + dz, pj = C.tj(nz + Math.sign(dz) * 0.3);
    if (pj === cj || canStep(world, ci, cj, ci, pj)) { a.z = nz; moved = true; }
  }
  return moved;
}

const startTile = params.get('at') ? params.get('at').split(',').map(Number) : world.spawn;
const david = new Actor(sheetFor('david', 'human', LOOKS.david), { x: C.wx(startTile[0]), z: C.wz(startTile[1]) });
david.y = groundAt(david.x, david.z);

const npcs = world.features.npcs.map((n, k) => {
  let sheet, scale = 1;
  if (n.kind === 'sheep' || n.kind === 'ibex') sheet = sheetFor(n.kind, n.kind);
  else if (n.kind === 'villager') sheet = sheetFor('v' + (n.look % LOOKS.villagers.length), 'human', { ...LOOKS.david, staff: false, sling: false, curly: false, skin: '#d29a74', skinDark: '#b07a58', hair: '#3a2a20', hairHi: '#4a3628', sandal: '#4a3020', belt: '#5a3a24', ...LOOKS.villagers[n.look % LOOKS.villagers.length] });
  else { sheet = sheetFor(n.kind, 'human', LOOKS[n.kind]); if (n.kind === 'goliath') scale = 1.75; }
  const a = new Actor(sheet, { scale, x: n.x - world.W / 2, z: n.z - world.H / 2 });
  a.kind = n.kind; a.home = [n.home[0] - world.W / 2, n.home[1] - world.H / 2]; a.roam = n.roam; a.wait = Math.random() * 3; a.target = null;
  a.dir = n.face ?? (n.kind === 'sheep' || n.kind === 'ibex' ? 2 : 0);
  a.speed = n.kind === 'sheep' ? 1.1 : n.kind === 'ibex' ? 1.4 : 1.0;
  a.speedAnim = n.kind === 'sheep' ? 7 : 6;
  return a;
});

// ---------------- Markers & collectibles ----------------
const diamondTex = makeIconTexture('diamond');
const stoneTex = makeIconTexture('stone');
const save = JSON.parse(localStorage.getItem('david-hd2d-v1') || '{}');
const state = { discovered: new Set(save.discovered || []), stones: new Set(save.stones || []), mood: params.get('t') === 'evening' ? 'dusk' : 'day', cardOpen: false, region: null };
const persist = () => localStorage.setItem('david-hd2d-v1', JSON.stringify({ discovered: [...state.discovered], stones: [...state.stones] }));
const markers = POIS.filter((p) => !p.hidden).map((p) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: diamondTex, color: new THREE.Color(3.2, 2.4, 1.2), depthWrite: false }));
  const x = C.wx(p.at[0]), z = C.wz(p.at[1]);
  const y = Math.max(groundAt(x, z), waterAt(x, z));
  s.scale.setScalar(0.42); s.position.set(x, y + 2.1, z);
  scene.add(s);
  return { poi: p, sprite: s, x, z, baseY: y + 2.1 };
});
const stones = world.features.stones.map((st, n) => {
  const x = st.x - world.W / 2, z = st.z - world.H / 2;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stoneTex, color: new THREE.Color(1.5, 1.5, 1.45) }));
  s.scale.setScalar(0.32); s.position.set(x, 0.42, z);
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.2, 1.3, 1.5), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  g.scale.setScalar(1.1); g.position.set(x, 0.45, z);
  scene.add(s, g);
  const taken = state.stones.has(n);
  s.visible = g.visible = !taken;
  return { n, x, z, sprite: s, glow: g, taken };
});

// ---------------- Atmosphere ----------------
const MOTES = isMobile ? 160 : 320;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
for (let k = 0; k < MOTES; k++) { motePos[k * 3] = (Math.random() - 0.5) * 40; motePos[k * 3 + 1] = Math.random() * 5; motePos[k * 3 + 2] = (Math.random() - 0.5) * 30; moteSeed[k] = Math.random() * 10; }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const moteMat = new THREE.PointsMaterial({ map: glowTex, size: 0.13, color: new THREE.Color(1.8, 1.6, 1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false;
scene.add(motes);
const shaftTex = makeSoftTexture(64, 'shaft');
const shafts = [0, 1, 2, 3].map((k) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + k * 0.8, 16), new THREE.MeshBasicMaterial({ map: shaftTex, color: new THREE.Color(1.0, 0.9, 0.7), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.userData.off = [-12 + k * 8 + Math.random() * 3, -6 - Math.random() * 4];
  scene.add(m);
  return m;
});
// waterfall mist
const MIST = 60; const mistGeo = new THREE.BufferGeometry(); const mistPos = new Float32Array(MIST * 3); const mistLife = new Float32Array(MIST);
mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.7, color: new THREE.Color(1.3, 1.4, 1.5), transparent: true, opacity: 0.35, depthWrite: false }));
mist.frustumCulled = false; scene.add(mist);
const wfBase = props.waterfall ? props.waterfall.position.clone().setY(world.features.waterfall.bottom) : null;
for (let k = 0; k < MIST; k++) mistLife[k] = Math.random();

// ---------------- Moods ----------------
const MOODS = {
  day: { sky: 0xdde6ea, fogNear: 62, fogFar: 160, hemiSky: 0xc9dcf0, hemiGround: 0x9a8662, hemi: 0.62, sun: 0xfff0d8, sunI: 3.4, sunOff: [18, 30, 12], fire: 1.2, exposure: 0.92, win: 0, water: 1.0, bloom: 0.5, warmth: 0.45, shafts: 0.09, motes: 0.5 },
  dusk: { sky: 0x707592, fogNear: 45, fogFar: 130, hemiSky: 0x7f8bc0, hemiGround: 0x5a4436, hemi: 0.4, sun: 0xffb27a, sunI: 1.5, sunOff: [28, 13, 4], fire: 7, exposure: 1.08, win: 1, water: 0.62, bloom: 0.95, warmth: 0.85, shafts: 0.03, motes: 0.9 },
};
let mood = { ...MOODS[state.mood] };
function applyMood(dt) {
  const tgt = MOODS[state.mood];
  const k = dt === undefined ? 1 : Math.min(1, dt * 2.5);
  for (const key of ['fogNear', 'fogFar', 'hemi', 'sunI', 'fire', 'exposure', 'win', 'water', 'bloom', 'warmth', 'shafts', 'motes']) mood[key] += (tgt[key] - mood[key]) * k;
  mood.sunOff = mood.sunOff.map((v, n) => v + (tgt.sunOff[n] - v) * k);
  const lc = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  mood.skyC = (mood.skyC || new THREE.Color(tgt.sky)).lerp(new THREE.Color(tgt.sky), k);
  hemi.color.lerp(new THREE.Color(tgt.hemiSky), k); hemi.groundColor.lerp(new THREE.Color(tgt.hemiGround), k);
  sun.color.lerp(new THREE.Color(tgt.sun), k);
  void lc;
  scene.fog.color.copy(mood.skyC); scene.background.copy(mood.skyC);
  scene.fog.near = mood.fogNear; scene.fog.far = mood.fogFar;
  hemi.intensity = mood.hemi; sun.intensity = mood.sunI;
  winMat.opacity = mood.win;
  water.material.uniforms.light.value = mood.water;
  post.mComp.uniforms.bloom.value = mood.bloom; post.mComp.uniforms.exposure.value = mood.exposure; post.mComp.uniforms.warmth.value = mood.warmth;
  for (const s of shafts) s.material.opacity = mood.shafts;
  moteMat.opacity = mood.motes;
}
applyMood();

// ---------------- Input ----------------
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = keyName(e);
  keys.add(k);
  if (e.repeat) return;
  if (['e', ' ', 'enter'].includes(k)) { e.preventDefault(); interact(); }
  if (k === 'escape') closeCard();
  if (k === 'n') toggleMood();
});
addEventListener('keyup', (e) => keys.delete(keyName(e)));
addEventListener('blur', () => keys.clear());
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const joyEl = $('joy'), knobEl = $('knob');
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || state.cardOpen) return;
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
$('act').addEventListener('click', () => interact());
$('mood').addEventListener('click', () => toggleMood());
$('cardClose').addEventListener('click', () => closeCard());
$('card').addEventListener('click', (e) => { if (e.target.id === 'card') closeCard(); });
function toggleMood() { state.mood = state.mood === 'day' ? 'dusk' : 'day'; $('mood').textContent = state.mood === 'day' ? '저녁 등불' : '아침 햇살'; }
$('mood').textContent = state.mood === 'day' ? '저녁 등불' : '아침 햇살';

// ---------------- UI ----------------
let bannerTimer = 0;
function showBanner(region) {
  $('bannerName').textContent = region.name;
  $('bannerSub').textContent = `${region.en} · ${region.ref}`;
  const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 4200);
  $('where').textContent = region.name;
}
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
function updateHUD() {
  const total = POIS.length, done = journeyComplete(state.discovered, POIS);
  $('found').textContent = `발견 ${state.discovered.size}/${total}${done ? ' ✓' : ''}`;
  const reg = REGIONS.find((r) => r.id === state.region), rp = reg && regionProgress(state.discovered, POIS)[reg.id];
  if (reg) $('where').textContent = rp ? `${reg.name} · ${rp.found}/${rp.total}` : reg.name;
  $('stonesHud').textContent = `매끄러운 돌 ${state.stones.size}/5`;
  $('stonesHud').style.display = state.stones.size || state.region === 'elah' ? '' : 'none';
}
function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
let pendingEnding = false;
function showCard(p) {
  state.cardOpen = true;
  const region = REGIONS.find((r) => r.id === p.region);
  $('cardPlace').textContent = p.place || (region ? `${region.name} · ${region.en}` : '');
  $('cardLinks').hidden = p !== JOURNEY_END;
  $('cardTitle').textContent = p.title;
  $('cardVerses').innerHTML = p.verses.map(([ref, txt]) => `<blockquote><p>${esc(txt)}</p><cite>${esc(ref)}</cite></blockquote>`).join('');
  $('cardRecorded').innerHTML = p.recorded.map((t) => `<li>${esc(t)}</li>`).join('');
  $('cardImagined').innerHTML = p.imagined.map((t) => `<li>${esc(t)}</li>`).join('');
  $('cardSource').textContent = `성경 본문: ${BIBLE_SOURCE}`;
  $('card').classList.add('show');
  if (p.id && !state.discovered.has(p.id)) { state.discovered.add(p.id); persist(); updateHUD(); if (journeyComplete(state.discovered, POIS)) pendingEnding = true; }
}
function closeCard() {
  if (!state.cardOpen) return; state.cardOpen = false; $('card').classList.remove('show');
  if (pendingEnding) { pendingEnding = false; setTimeout(() => showCard(JOURNEY_END), 450); }
}
let nearPoi = null;
function interact() {
  if (state.cardOpen) { closeCard(); return; }
  if (nearPoi) showCard(nearPoi.poi);
}

// ---------------- Resize ----------------
let camDist = 38;
function resize() {
  const w = innerWidth, h = innerHeight;
  const pr = Math.min(devicePixelRatio || 1, Math.sqrt((isMobile ? 1.3e6 : 2.6e6) / (w * h)), 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  camDist = Math.max(38, 9 / (Math.tan(THREE.MathUtils.degToRad(15)) * camera.aspect));
}
addEventListener('resize', resize); resize();

// ---------------- Loop ----------------
const camTarget = new THREE.Vector3(david.x, david.y + 0.8, david.z);
const PITCH = THREE.MathUtils.degToRad(39);
let intro = params.has('shot') || params.has('skip') ? 0 : 1;
let started = params.has('shot') || params.has('skip');
let regionCheck = 0, poolCheck = 0;
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fps = 0;
const tmp = new THREE.Vector3();

function updateNPC(a, dt) {
  const dToDavid = Math.hypot(a.x - david.x, a.z - david.z);
  let tx = null, tz = null, speed = a.speed;
  if (a.kind === 'sheep' && dToDavid < 7 && dToDavid > 1.7) { // the flock drifts after its shepherd
    const ang = (a.home[0] * 13.7) % (Math.PI * 2);
    tx = david.x + Math.cos(ang) * 1.6; tz = david.z + Math.sin(ang) * 1.2; speed = Math.min(3.6, 1.2 + (dToDavid - 1.7) * 0.6);
  } else if (a.roam > 0) {
    a.wait -= dt;
    if (!a.target && a.wait <= 0) a.target = [a.home[0] + (Math.random() - 0.5) * 2 * a.roam, a.home[1] + (Math.random() - 0.5) * 2 * a.roam];
    if (a.target) [tx, tz] = a.target;
  }
  a.moving = false;
  if (tx !== null) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { a.target = null; a.wait = 1.5 + Math.random() * 4; }
    else {
      const st = Math.min(d, speed * dt);
      const moved = tryMove(a, (dx / d) * st, (dz / d) * st);
      if (!moved) { a.target = null; a.wait = 1 + Math.random() * 2; }
      else {
        a.moving = true;
        const animal = a.kind === 'sheep' || a.kind === 'ibex';
        if (animal) { if (Math.abs(dx) > 0.05) a.dir = dx < 0 ? 2 : 3; }
        else a.dir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : dz < 0 ? 1 : 0;
      }
    }
  } else if (a.kind !== 'goliath' && a.kind !== 'shieldbearer' && a.kind !== 'sheep' && a.kind !== 'ibex' && dToDavid < 3) {
    const dx = david.x - a.x, dz = david.z - a.z; a.dir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : dz < 0 ? 1 : 0;
  }
  a.update(dt);
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  time.value += dt;
  const t = time.value;

  // player
  let ix = 0, iz = 0;
  if (started && !state.cardOpen) {
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
    const sp = (run ? 6.2 : 4.0) * Math.min(1, il);
    tryMove(david, (ix / il) * sp * dt, (iz / il) * sp * dt);
    david.dir = Math.abs(ix) > Math.abs(iz) ? (ix < 0 ? 2 : 3) : iz < 0 ? 1 : 0;
    david.speedAnim = run ? 11 : 8;
  }
  david.update(dt);
  for (const a of npcs) updateNPC(a, dt);

  // camera
  camTarget.lerp(tmp.set(david.x, david.y + 0.8, david.z), Math.min(1, dt * 5));
  if (started && intro > 0) intro = Math.max(0, intro - dt / 2.6);
  const ease = intro * intro * (3 - 2 * intro);
  const dist = camDist * (1 + ease * 0.9);
  const pitch = PITCH + ease * 0.3;
  const orbit = started ? 0 : Math.sin(t * 0.1) * 6;
  const shiftZ = -ease * 22; // look north over the land during the intro so the map edge stays out of frame
  camera.position.set(camTarget.x + orbit, camTarget.y + Math.sin(pitch) * dist, camTarget.z + shiftZ + Math.cos(pitch) * dist);
  camera.lookAt(camTarget.x + orbit * 0.6, camTarget.y, camTarget.z + shiftZ);

  // sun follows the view so shadows stay crisp
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(tmp.set(...mood.sunOff));
  applyMood(dt);

  // fires
  if ((poolCheck -= dt) <= 0) {
    poolCheck = 0.25;
    const near = flames.map((f) => [f, f.pos.distanceToSquared(camTarget)]).sort((a, b) => a[1] - b[1]).slice(0, firePool.length);
    firePool.forEach((l, n) => { const f = near[n]; l.userData.f = f && f[1] < 900 ? f[0] : null; if (l.userData.f) l.position.copy(l.userData.f.pos).add(tmp.set(0, 0.5, 0.2)); });
  }
  for (const l of firePool) { const f = l.userData.f; l.intensity = f ? mood.fire * (f.torch ? 0.6 : 1) * (0.85 + 0.15 * Math.sin(t * 17 + f.phase) * Math.sin(t * 7.3 + f.phase * 2)) : 0; }
  const ff = Math.floor(t * 9);
  for (const f of flames) {
    const uv = f.mesh.geometry.attributes.uv, fr = (ff + Math.floor(f.phase * 3)) % 4;
    uv.setXY(0, fr / 4, 1); uv.setXY(1, (fr + 1) / 4, 1); uv.setXY(2, fr / 4, 0); uv.setXY(3, (fr + 1) / 4, 0); uv.needsUpdate = true;
    f.glow.material.opacity = 0.35 + mood.win * 0.35;
  }

  // markers and stones
  nearPoi = null; let best = 2.2;
  for (const m of markers) {
    const done = state.discovered.has(m.poi.id);
    m.sprite.position.y = m.baseY + Math.sin(t * 2 + m.x) * 0.12;
    m.sprite.material.color.setRGB(done ? 1.1 : 3.2, done ? 1.05 : 2.4, done ? 0.9 : 1.2);
    m.sprite.material.rotation = Math.sin(t * 1.4 + m.z) * 0.15;
    const d = Math.hypot(m.x - david.x, m.z - david.z);
    if (d < best) { best = d; nearPoi = m; }
  }
  for (const s of stones) {
    if (s.taken) continue;
    s.sprite.position.y = 0.4 + Math.sin(t * 3 + s.n) * 0.05;
    s.glow.material.opacity = 0.4 + Math.sin(t * 4 + s.n) * 0.25;
    if (Math.hypot(s.x - david.x, s.z - david.z) < 0.85) {
      s.taken = true; s.sprite.visible = s.glow.visible = false; state.stones.add(s.n); persist(); updateHUD();
      toast(`매끄러운 돌 ${state.stones.size}/5`);
      if (state.stones.size === 5) setTimeout(() => showCard(POIS.find((p) => p.id === 'stones')), 700);
    }
  }
  const prompt = $('prompt');
  if (nearPoi && !state.cardOpen && started) { prompt.textContent = `${nearPoi.poi.title}  ·  ${isMobile ? '탭해서 살펴보기' : 'E 살펴보기'}`; prompt.classList.add('show'); $('act').classList.add('show'); }
  else { prompt.classList.remove('show'); $('act').classList.remove('show'); }

  // regions
  if ((regionCheck -= dt) <= 0 && started) {
    regionCheck = 0.3;
    const pi = C.ti(david.x), pj = C.tj(david.z);
    let cur = null, bestR = 1;
    for (const r of REGIONS) { const q = Math.hypot(pi - r.center[0], pj - r.center[1]) / r.r; if (q < bestR) { bestR = q; cur = r; } }
    if (cur && cur.id !== state.region) { state.region = cur.id; showBanner(cur); updateHUD(); }
  }

  // cave roof fades when David is inside
  if (props.caveRoof) {
    const [i, j] = tileAt(david.x, david.z);
    const inside = world.inb(i, j) && world.tag[world.idx(i, j)] === 2;
    const m = props.caveRoof.material; m.opacity += ((inside ? 0.08 : 1) - m.opacity) * Math.min(1, dt * 6); m.depthWrite = m.opacity > 0.9;
  }
  if (props.waterfall) props.waterfall.material.map.offset.y = (t * 1.4) % 1;
  water.material.uniforms.time.value = t;

  // motes
  for (let k = 0; k < MOTES; k++) {
    let x = motePos[k * 3], y = motePos[k * 3 + 1], z = motePos[k * 3 + 2];
    x += Math.sin(t * 0.3 + moteSeed[k]) * dt * 0.3 + dt * 0.15; y += Math.sin(t * 0.5 + moteSeed[k] * 2) * dt * 0.12; z += Math.cos(t * 0.27 + moteSeed[k]) * dt * 0.2;
    const rx = x - camTarget.x, rz = z - camTarget.z;
    if (rx > 20) x -= 40; if (rx < -20) x += 40; if (rz > 14) z -= 28; if (rz < -16) z += 28;
    const g = groundAt(x, z); if (y < g + 0.3) y = g + 4; if (y > g + 5) y = g + 0.4;
    motePos[k * 3] = x; motePos[k * 3 + 1] = y; motePos[k * 3 + 2] = z;
  }
  moteGeo.attributes.position.needsUpdate = true;
  shafts.forEach((s, k) => { s.position.set(camTarget.x + s.userData.off[0] + Math.sin(t * 0.05 + k) * 1.5, camTarget.y + 5, camTarget.z + s.userData.off[1]); s.quaternion.copy(camera.quaternion); s.rotateZ(-0.55); });
  if (wfBase) {
    for (let k = 0; k < MIST; k++) {
      mistLife[k] += dt * 0.5; if (mistLife[k] > 1) mistLife[k] = 0;
      const l = mistLife[k], a = k * 2.4;
      mistPos[k * 3] = wfBase.x + Math.cos(a) * (0.4 + l * 1.6); mistPos[k * 3 + 1] = wfBase.y + l * 1.4; mistPos[k * 3 + 2] = wfBase.z + 0.6 + Math.sin(a) * (0.3 + l * 1.2);
    }
    mistGeo.attributes.position.needsUpdate = true;
  }

  // tilt-shift focus follows David
  tmp.set(david.x, david.y + 0.7, david.z).project(camera);
  post.mComp.uniforms.focusY.value = THREE.MathUtils.clamp((tmp.y + 1) / 2, 0.25, 0.75);
  post.mComp.uniforms.dof.value = started ? 1 : 0.9;

  if (usePost) post.render(scene, camera, t); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }

  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(frame);
}

// ---------------- Start ----------------
function start() {
  if (started) return;
  started = true;
  $('title').classList.add('hide');
  $('hud').classList.add('show');
  setTimeout(() => toast(isMobile ? '화면을 끌어서 걷기 · ◆ 표시를 찾아보세요' : 'WASD/방향키로 걷기 · Shift 달리기 · ◆ 에서 E'), 2800);
}
$('startBtn').addEventListener('click', start);
function updateTitle() {
  const best = act1Best(localStorage);
  document.body.classList.toggle('first-visit', !best);
  $('act1Status').textContent = best ? `✓ 함께한 자 ${best}명 · 다시 하기` : '처음이라면 여기서 시작하세요';
  const best2 = act2Best(localStorage);
  $('act2Status').textContent = best2 ? `✓ 함께한 자 ${best2}명 · 다시 하기` : best ? '아둘람 다음 이야기 · 헤렛 · 그일라 · 엔게디' : '1막을 마치면 이어집니다';
  $('act2').classList.toggle('next', !!best && !best2);
  $('startBtn').textContent = best ? (state.discovered.size ? '지도 이어서 걷기' : '지도 걷기') : '지도만 둘러보기';
  const done = journeyComplete(state.discovered, POIS);
  $('mapProgress').textContent = done ? `✓ 지도 여정 완료 · 발견 ${POIS.length}/${POIS.length}` : `지도 발견 ${state.discovered.size}/${POIS.length} · 매끄러운 돌 ${state.stones.size}/5`;
}
updateTitle();
if (started) { $('title').classList.add('hide'); $('hud').classList.add('show'); }
if (params.has('shot')) document.body.classList.add('shot');
updateHUD();
requestAnimationFrame(frame);

window.__game = {
  world, david, npcs, state, scene, camera, renderer,
  get fps() { return fps; },
  teleport(i, j) { david.x = C.wx(i); david.z = C.wz(j); david.y = groundAt(david.x, david.z); camTarget.set(david.x, david.y + 0.8, david.z); },
  setMood(m) { state.mood = m; },
  start, showCard: (id) => showCard(POIS.find((p) => p.id === id)), closeCard,
  info() { return renderer.info.render; },
};
