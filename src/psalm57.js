// Psalm 57 scene 1 greybox: 3D En-gedi cave -> step into the psalm on the wall -> hide from torchlight.
// Art is placeholder (primitives). Rules live in psalm57-core.js; this file only renders and reads input.
import * as THREE from '../vendor/three.module.js';
import * as core from './psalm57-core.js';
import { PSALM57, SCENE1_SEGMENTS, PSALM57_CITATION, PSALM57_SUPERSCRIPTION, RECORDED, IMAGINED } from './psalm57-text.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
$('superText').textContent = `"${PSALM57_SUPERSCRIPTION.split(', ').at(-1)}"`;
const WALL_Z = -4, WALL_W = 24, WALL_H = 4.5;
const U2X = (u) => -WALL_W / 2 + u * (WALL_W / core.WALL.length);
const V2Y = (v) => WALL_H - v * (WALL_H / core.WALL.height);
const CREVICE_SPOT = new THREE.Vector3(U2X(core.START_U), 0, WALL_Z + 0.8);

// ---------- renderer / scene ----------
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0907);
scene.fog = new THREE.Fog(0x0d0907, 14, 34);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
scene.add(new THREE.HemisphereLight(0x6a5644, 0x140d08, 0.9));
const dawn = new THREE.DirectionalLight(0x8fa6c8, 0.35);
dawn.position.set(0, 6, 12);
scene.add(dawn);

const stone = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 });
// Cave-mouth geometry that would sit between a pulled-back portrait wall camera and the wall.
const occluders = new THREE.Group(); scene.add(occluders);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(27, 13), stone(0x4a3b2d));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.5);
scene.add(floor);
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(27, 13), stone(0x1d1510));
ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 4.8, 1.5);
scene.add(ceiling);
for (const sx of [-1, 1]) {
  const side = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.8), stone(0x3a2d22));
  side.rotation.y = -sx * Math.PI / 2; side.position.set(sx * 12.6, 2.4, 1.5);
  occluders.add(side);
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.8, 1.2), stone(0x33271d));
  pillar.position.set(sx * 10.4, 2.4, 7.6);
  occluders.add(pillar);
}
const lintel = new THREE.Mesh(new THREE.BoxGeometry(27, 1.1, 1.2), stone(0x2b2018));
lintel.position.set(0, 4.3, 7.6); occluders.add(lintel);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
[[-11.6, -2.6, 0.8], [-11.8, 3.5, 1.1], [11.5, -1.5, 0.9], [11.7, 4.6, 1.3], [7, 5.6, 0.6], [-6, 6.0, 0.5]].forEach(([x, z, s]) => {
  const r = new THREE.Mesh(rockGeo, stone(0x3d3024)); r.position.set(x, s * 0.5, z); r.scale.setScalar(s); r.rotation.set(x, z, s); occluders.add(r);
});

// ---------- the psalm wall (base canvas + torchlight shader) ----------
const PPU = 4096 / core.WALL.length; // pixels per wall unit
function drawWallTexture() {
  const c = document.createElement('canvas'); c.width = 4096; c.height = Math.round(core.WALL.height * PPU);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#5d4835'); grad.addColorStop(1, '#3f3124');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,235,200' : '0,0,0'},${0.04 + rnd() * 0.06})`; g.fillRect(rnd() * c.width, rnd() * c.height, 2 + rnd() * 9, 2 + rnd() * 6); }
  g.strokeStyle = 'rgba(15,10,6,.45)'; g.lineWidth = 3;
  for (let i = 0; i < 18; i++) { let x = rnd() * c.width, y = rnd() * c.height; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 90; y += rnd() * 60; g.lineTo(x, y); } g.stroke(); }
  const P = (u) => u * PPU, Q = (v) => v * PPU;
  // crevice (start shelter)
  g.fillStyle = '#120c08';
  g.beginPath(); g.moveTo(P(0), Q(0.6)); g.lineTo(P(2.1), Q(1.0)); g.lineTo(P(1.7), Q(3.2)); g.lineTo(P(2.25), Q(5.4)); g.lineTo(P(1.9), Q(8.6)); g.lineTo(P(0), Q(8.8)); g.closePath(); g.fill();
  // shadow under the wings
  const w = core.SHELTERS[1];
  const sh = g.createLinearGradient(0, Q(3.9), 0, Q(7.6));
  sh.addColorStop(0, 'rgba(0,0,0,.34)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath(); g.moveTo(P(w.u0 - 0.2), Q(3.9)); g.lineTo(P(w.u1 + 0.2), Q(3.9)); g.lineTo(P(w.u1), Q(7.6)); g.lineTo(P(w.u0), Q(7.6)); g.closePath(); g.fill();
  // wings
  const cx = P((w.u0 + w.u1) / 2), top = Q(1.2), base = Q(3.9);
  g.fillStyle = '#d9c39b'; g.strokeStyle = '#6e5232'; g.lineWidth = 5;
  for (const side of [-1, 1]) {
    const tip = cx + side * P((w.u1 - w.u0) / 2 + 0.35);
    g.beginPath(); g.moveTo(cx, base - Q(0.4));
    g.bezierCurveTo(cx + side * P(1.2), top - Q(0.3), tip - side * P(0.6), top, tip, top + Q(0.5));
    g.bezierCurveTo(tip - side * P(0.3), base - Q(0.9), cx + side * P(1.2), base, cx, base); g.closePath(); g.fill(); g.stroke();
    for (let f = 1; f <= 5; f++) { const fx = cx + side * P(0.5 * f + 0.2); g.beginPath(); g.moveTo(fx, base - Q(0.15 + f * 0.12)); g.lineTo(fx + side * P(0.35), base + Q(0.05)); g.stroke(); }
  }
  // exit opening
  g.fillStyle = '#d8c3a0';
  g.beginPath(); g.moveTo(P(core.EXIT_U), Q(7.3)); g.lineTo(P(core.EXIT_U), Q(4.2)); g.quadraticCurveTo(P(core.EXIT_U + 0.75), Q(3.1), P(47.9), Q(4.2)); g.lineTo(P(47.9), Q(7.3)); g.closePath(); g.fill();
  // carved verse: the player walks on top of these letters
  const ranges = [[2.8, 25.9], [w.u0 + 0.2, w.u1 - 0.2], [34.0, 45.8]];
  g.textBaseline = 'top';
  g.font = `700 ${Math.round(PPU * 0.78)}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  SCENE1_SEGMENTS.forEach((text, i) => {
    const [u0, u1] = ranges[i];
    const width = g.measureText(text).width, sx = Math.min(1.1, P(u1 - u0) / width);
    g.save(); g.translate(P(u0), Q(core.WALL.pathV + 0.04)); g.scale(sx, 1);
    g.fillStyle = 'rgba(232,206,160,.55)'; g.fillText(text, 3, 3);
    g.fillStyle = '#24180e'; g.fillText(text, 0, 0);
    g.restore();
  });
  g.fillStyle = 'rgba(36,24,14,.8)'; g.font = `600 ${Math.round(PPU * 0.42)}px sans-serif`;
  g.fillText('시편 57:1', P(2.8), Q(7.55));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

const wallUniforms = {
  map: { value: drawWallTexture() },
  torchU: { value: 20 }, lightR: { value: core.LIGHT_RADIUS }, lightOn: { value: 1 }, flicker: { value: 1 },
  wing0: { value: core.SHELTERS[1].u0 }, wing1: { value: core.SHELTERS[1].u1 }, crevice1: { value: core.SHELTERS[0].u1 },
  wallLen: { value: core.WALL.length }, wallH: { value: core.WALL.height },
};
const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), new THREE.ShaderMaterial({
  uniforms: wallUniforms,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform float torchU, lightR, lightOn, flicker, wing0, wing1, crevice1, wallLen, wallH;
    varying vec2 vUv;
    void main(){
      vec3 base = texture2D(map, vUv).rgb;
      float u = vUv.x * wallLen, v = (1.0 - vUv.y) * wallH;
      float d = length(vec2(u - torchU, (v - 5.6) * 0.55));
      // Bright core = the exposure radius used by the rule. Outside it only a faint warning halo (max 0.2).
      float core = smoothstep(lightR + 0.3, lightR, d); // fully bright everywhere the rule can catch you
      float halo = smoothstep(lightR * 1.9, lightR + 0.3, d) * 0.2;
      float light = max(core, halo) * lightOn * flicker;
      // Shadow zones are the rule zones. Edges soften only inward (safe ground may look slightly lit;
      // exposed ground never looks shaded).
      float wing = smoothstep(wing0, wing0 + 0.12, u) * (1.0 - smoothstep(wing1 - 0.12, wing1, u)) * smoothstep(3.6, 4.1, v);
      float crev = (1.0 - smoothstep(crevice1 - 0.12, crevice1, u)) * step(0.8, v);
      light *= 1.0 - 0.93 * max(wing, crev);
      vec3 col = base * (0.42 + light * vec3(1.9, 1.25, 0.62));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
wall.position.set(0, WALL_H / 2, WALL_Z);
scene.add(wall);

// ---------- characters (placeholder primitives) ----------
function figure(tunic, skin, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.95, 10), stone(tunic)); body.position.y = 0.78; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), stone(skin)); head.position.y = 1.42; g.add(head);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), stone(skin)); leg.position.set(s * 0.09, 0.2, 0); g.add(leg); }
  g.scale.setScalar(scale);
  return g;
}
const david = figure(0xa0522d, 0xc58c62);
david.position.set(2, 0, 2.4);
scene.add(david);
const soldier = figure(0x5a1e14, 0xb07a55, 1.12);
soldier.position.set(0, 0, 9);
const torchStick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), stone(0x3b2a1a));
torchStick.position.set(0.32, 1.45, -0.1); soldier.add(torchStick);
const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb257 }));
flame.position.set(0.32, 1.85, -0.1); soldier.add(flame);
const torchLight = new THREE.PointLight(0xff9a40, 40, 20, 1.6);
torchLight.position.copy(flame.position); soldier.add(torchLight);
scene.add(soldier);
const marker = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: 0xe3b56d, transparent: true }));
marker.rotation.x = -Math.PI / 2; marker.position.copy(CREVICE_SPOT).setY(0.03);
scene.add(marker);

// The flat David who lives on the wall
function figureTexture(step) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#9c4524'; g.strokeStyle = '#2a170c'; g.lineWidth = 5;
  g.beginPath(); g.arc(68, 40, 22, 0, Math.PI * 2); g.fill(); g.stroke();                 // head
  g.beginPath(); g.moveTo(50, 70); g.lineTo(86, 70); g.lineTo(96, 170); g.lineTo(40, 170); g.closePath(); g.fill(); g.stroke(); // tunic
  g.beginPath(); g.moveTo(84, 82); g.lineTo(108, 120); g.stroke();                      // arm
  g.beginPath(); g.moveTo(112, 30); g.lineTo(104, 240); g.stroke();                     // staff
  const a = step ? 14 : 0;
  g.lineCap = 'round'; g.lineWidth = 13; g.strokeStyle = '#9c4524';
  g.beginPath(); g.moveTo(58, 168); g.lineTo(58 - a, 246); g.moveTo(78, 168); g.lineTo(78 + a, 246); g.stroke(); // legs
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const frames = [figureTexture(0), figureTexture(1)];
const flatMat = new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, opacity: 0, depthWrite: false });
const flat = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.24), flatMat);
flat.position.set(U2X(core.START_U), V2Y(core.WALL.pathV) + 0.58, WALL_Z + 0.03);
scene.add(flat);

// ---------- state ----------
let mode = 'intro'; // intro | cave | enter | wall | won
let state = null, caveClock = 0, enterT = 0, walkAnim = 0, paused = false;
const firstTips = new Set();
// HUD strip zones come from the rule constants (single source of truth).
{
  const pct = (u) => `${(u / core.WALL.length) * 100}%`;
  const [crev, wings] = core.SHELTERS;
  Object.assign(document.querySelector('#strip .crevice').style, { left: pct(crev.u0), width: pct(crev.u1 - crev.u0) });
  Object.assign(document.querySelector('#strip .wings').style, { left: pct(wings.u0), width: pct(wings.u1 - wings.u0) });
  Object.assign(document.querySelector('#strip .exit').style, { left: pct(core.EXIT_U), right: '0' });
  Object.assign($('stripTorch').style, { width: pct(2 * core.LIGHT_RADIUS), marginLeft: `-${(core.LIGHT_RADIUS / core.WALL.length) * 100}%` });
}
const keys = new Set();
let padDir = 0, tapTarget = null;
const camPos = new THREE.Vector3(2, 3.2, 10), camLook = new THREE.Vector3(0, 1.3, 0);

function toast(text, ms = 2200) {
  const el = $('toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms);
}
const setObjective = (t) => { $('objective').textContent = t; };
function setMode(m) { mode = m; app.dataset.mode = m; }

// ---------- input ----------
const LEFT = new Set(['ArrowLeft', 'KeyA']), RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']), DOWN = new Set(['ArrowDown', 'KeyS']);
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter') && mode === 'cave' && !$('enterWall').hidden) enterWall();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); padDir = 0; });
document.addEventListener('visibilitychange', () => { paused = document.hidden; keys.clear(); padDir = 0; });
function bindPad(id, dir) {
  const b = $(id);
  const on = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); padDir = dir; b.classList.add('on'); };
  const off = () => { if (padDir === dir) padDir = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindPad('left', -1); bindPad('right', 1);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'cave') return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(floor)[0] || ray.intersectObject(wall)[0];
  if (hit) tapTarget = new THREE.Vector3(hit.point.x, 0, Math.max(hit.point.z, WALL_Z + 0.7));
});
const wallDir = () => (padDir || ([...keys].some((k) => RIGHT.has(k)) ? 1 : 0) - ([...keys].some((k) => LEFT.has(k)) ? 1 : 0));

// ---------- flow ----------
$('start').addEventListener('click', () => {
  $('intro').hidden = true; $('hud').hidden = false; setMode('cave');
  setObjective('벽 왼쪽 끝, 갈라진 틈으로 가세요.');
});
$('enterWall').addEventListener('click', enterWall);
function enterWall() {
  if (mode !== 'cave') return;
  $('enterWall').hidden = true; tapTarget = null; setMode('enter'); enterT = 0;
  state = core.createState();
}
function beginWall() {
  setMode('wall'); $('pad').hidden = false;
  setObjective('빛이 틈을 지나가면, 날개 그림 아래까지 걸어가세요.');
}
$('again').addEventListener('click', () => {
  $('ending').hidden = true; state = core.createState(); flat.position.x = U2X(state.u); beginWall();
});
function showEnding() {
  setMode('won'); $('pad').hidden = true; padDir = 0;
  $('verse').textContent = PSALM57[0];
  $('recorded').replaceChildren(...RECORDED.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('imagined').replaceChildren(...IMAGINED.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('citation').textContent = PSALM57_CITATION;
  $('ending').hidden = false; $('again').focus();
}

// Read-only inspection for local verification. Exposes no way to change the game.
window.psalm57Inspect = () => ({
  mode, u: state?.u ?? null, t: state?.t ?? null, torchU: wallUniforms.torchU.value,
  caught: state?.caught ?? 0, wingHides: state?.wingHides ?? 0, crevHides: state?.crevHides ?? 0,
  davidX: david.position.x, davidZ: david.position.z,
});

// ---------- loop ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const _wallPos = new THREE.Vector3(), _wallLook = new THREE.Vector3(), _mv = new THREE.Vector3(), _tmp = new THREE.Vector3();
function wallCameraFor(u) {
  const a = camera.aspect, tan = Math.tan(THREE.MathUtils.degToRad(20));
  const h = Math.max(4.9, 4.6 / a), w = h * a;
  const dist = h / (2 * tan);
  const half = Math.max(0, WALL_W / 2 - w / 2);
  const x = THREE.MathUtils.clamp(U2X(u), -half, half);
  return { pos: _wallPos.set(x, 2.25, WALL_Z + dist), look: _wallLook.set(x, 2.25, WALL_Z) };
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) { renderer.render(scene, camera); return; }
  const flick = 0.9 + 0.1 * Math.sin(now * 0.021) * Math.sin(now * 0.0137);
  wallUniforms.flicker.value = flick; torchLight.intensity = 40 * flick;
  marker.material.opacity = 0.55 + 0.4 * Math.sin(now * 0.004);

  let torchU;
  if (mode === 'intro' || mode === 'cave') {
    caveClock += dt; torchU = core.torchAt(caveClock, 0).u;
  } else {
    if (mode === 'wall') {
      const dir = wallDir();
      for (const ev of core.step(state, dir, dt)) {
        if (ev.type === 'caught') { toast('횃불 빛에 드러났어요. 틈으로 돌아갑니다.'); flatMat.color.set(0xffe2a0); clearTimeout(frame.flash); frame.flash = setTimeout(() => flatMat.color.set(0xffffff), 350); }
        if (ev.type === 'hidden' && !firstTips.has(ev.shelter)) {
          firstTips.add(ev.shelter);
          toast(ev.shelter === 'crevice' ? '틈 안에서는 빛이 닿지 않아요.' : '날개 그늘 아래에서는 빛이 닿지 않아요.');
          if (ev.shelter === 'wings') setObjective('빛이 지나간 뒤, 오른쪽 끝 출구로 가세요.');
        }
        if (ev.type === 'won') setTimeout(showEnding, 600);
      }
      if (dir) { walkAnim += dt; flat.scale.x = dir; }
      flatMat.map = frames[dir && Math.floor(walkAnim * 6) % 2 ? 1 : 0];
    }
    torchU = core.torchAt(state.t, state.phase).u;
  }
  wallUniforms.torchU.value = torchU;
  soldier.position.x = THREE.MathUtils.clamp(U2X(torchU), -14, 14);
  soldier.rotation.y = Math.sin(now * 0.002) * 0.3;

  if (mode === 'intro' || mode === 'cave') {
    if (mode === 'cave') {
      const mv = _mv.set(
        ([...keys].some((k) => RIGHT.has(k)) ? 1 : 0) - ([...keys].some((k) => LEFT.has(k)) ? 1 : 0), 0,
        ([...keys].some((k) => DOWN.has(k)) ? 1 : 0) - ([...keys].some((k) => UP.has(k)) ? 1 : 0));
      if (mv.lengthSq()) tapTarget = null;
      else if (tapTarget) { mv.subVectors(tapTarget, david.position).setY(0); if (mv.length() < 0.1) { tapTarget = null; mv.set(0, 0, 0); } }
      if (mv.lengthSq()) {
        mv.normalize().multiplyScalar(3 * dt);
        david.position.add(mv);
        david.position.x = THREE.MathUtils.clamp(david.position.x, -11.6, 11.6);
        david.position.z = THREE.MathUtils.clamp(david.position.z, WALL_Z + 0.6, 4.8);
        david.rotation.y = Math.atan2(mv.x, mv.z);
      }
      const near = david.position.distanceTo(CREVICE_SPOT) < 1.8;
      $('enterWall').hidden = !near;
    }
    const portrait = camera.aspect < 1;
    // Keep the camera inside the cave mouth (the lintel starts at z = 7) and under the ceiling.
    camPos.lerp(_tmp.set(david.position.x * (portrait ? 0.88 : 0.6), portrait ? 4.3 : 3.3, Math.min(6.8, david.position.z + (portrait ? 8.2 : 6.8))), 1 - Math.exp(-dt * 4));
    camLook.lerp(_tmp.set(david.position.x * (portrait ? 0.92 : 0.75), portrait ? 2.1 : 1.3, david.position.z - 2.5), 1 - Math.exp(-dt * 4));
  } else {
    const target = wallCameraFor(state.u);
    if (mode === 'enter') {
      enterT += dt / 1.3;
      const k = Math.min(1, enterT);
      wallUniforms.lightOn.value = Math.abs(1 - 2 * k);
      david.visible = k < 0.5; flatMat.opacity = Math.max(0, (k - 0.4) / 0.6);
      flat.position.x = U2X(state.u);
      camPos.lerp(target.pos, 1 - Math.exp(-dt * 5)); camLook.lerp(target.look, 1 - Math.exp(-dt * 5));
      if (k >= 1) { wallUniforms.lightOn.value = 1; beginWall(); }
    } else {
      flat.position.x = U2X(state.u);
      camPos.lerp(target.pos, 1 - Math.exp(-dt * 6)); camLook.lerp(target.look, 1 - Math.exp(-dt * 6));
    }
  }
  // Wider lens in the cave (portrait phones need to see the crevice); the wall view frames itself at 40deg.
  const wantFov = (mode === 'intro' || mode === 'cave') ? (camera.aspect < 1 ? 66 : 46) : 40;
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix(); }
  const inCave = mode === 'intro' || mode === 'cave';
  occluders.visible = inCave || (mode === 'enter' && enterT < 0.35);
  marker.visible = inCave;
  scene.fog.near = inCave ? 14 : 60; scene.fog.far = inCave ? 34 : 90;
  camera.position.copy(camPos); camera.lookAt(camLook);

  if (state) {
    $('stripPlayer').style.left = `${(state.u / core.WALL.length) * 100}%`;
  }
  $('stripTorch').style.left = `${(THREE.MathUtils.clamp(torchU, 0, core.WALL.length) / core.WALL.length) * 100}%`;
  $('stripTorch').style.opacity = torchU < -2 || torchU > core.WALL.length + 2 ? '0.25' : '1';
  renderer.render(scene, camera);
}
requestAnimationFrame((t) => { last = t; $('loading').hidden = true; frame(t); });
