// Psalm 57 scene 1, v2: 3D En-gedi cave <-> 2D fresco platformer on the wall.
// Rules live in psalm57-core.js; this file renders, reads input and switches between the two worlds.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { PostStack } from '../land-of-david/src/post.js';
import * as core from './psalm57-core.js';
import { drawFresco, buildNormalMap, drawDavidSheet } from './psalm57-art.js';
import { PSALM57, PSALM57_CITATION, PSALM57_SUPERSCRIPTION, RECORDED, IMAGINED } from './psalm57-text.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
$('superText').textContent = `"${PSALM57_SUPERSCRIPTION.split(', ').at(-1)}"`;

// wall units -> metres: 48 x 14 units = 24 x 7 m, wall plane at z = WALL_Z
const S = 0.5, WALL_Z = -4, WALL_W = core.WALL.length * S, WALL_H = core.WALL.height * S;
const U2X = (u) => -WALL_W / 2 + u * S;
const Y2Y = (y) => y * S;
const CRACK_SPOT = new THREE.Vector3(U2X(1.1), 0, WALL_Z + 0.9);
const JAR_Z = WALL_Z + 1.9;
const TORCH_Z = [9.4, 8.6];
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

// ---------- renderer / post ----------
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the post stack grades and converts to sRGB
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const post = new PostStack(renderer, { msaa: isMobile ? 0 : 4 });
post.mComp.uniforms.dof.value = 0; post.mComp.uniforms.bloom.value = 0.85; post.mComp.uniforms.vignette.value = 0.55;
post.mComp.uniforms.warmth.value = 0.5; post.mComp.uniforms.exposure.value = 1.15; post.mComp.uniforms.saturation.value = 1.05;
post.mBright.uniforms.threshold.value = 0.85;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050302);
scene.fog = new THREE.FogExp2(0x0a0604, 0.028);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 90);
scene.add(new THREE.HemisphereLight(0x3a4666, 0x1a0f07, 1.0));
const moon = new THREE.DirectionalLight(0x6f86b8, 0.45);
moon.position.set(-4, 9, 16); scene.add(moon);

// ---------- cave ----------
function rockTexture(seed, base, dark) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? dark : 'rgba(255,230,190,.07)'; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const rockMat = (seed, rep, color = '#5a4433') => { const t = rockTexture(seed, color, 'rgba(10,6,3,.35)'); t.repeat.set(rep, rep); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0 }); };
function bumpy(geo, amp, freq, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.cos(v.y * freq * 1.3 + seed * 2) + Math.sin((v.x + v.y) * freq * 2.1 + seed) * 0.5;
    p.setZ(i, p.getZ(i) + n * amp);
  }
  geo.computeVertexNormals(); return geo;
}
const occluders = new THREE.Group(); scene.add(occluders);
const floor = new THREE.Mesh(bumpy(new THREE.PlaneGeometry(27, 13, 80, 40), 0.06, 1.7, 1), rockMat(3, 6, '#4b3a2c'));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.6); floor.receiveShadow = true; scene.add(floor);
const outside = new THREE.Mesh(bumpy(new THREE.PlaneGeometry(70, 24, 60, 20), 0.25, 0.5, 6), rockMat(31, 8, '#3a2c20'));
outside.rotation.x = -Math.PI / 2; outside.position.set(0, -0.05, 19); outside.receiveShadow = true; scene.add(outside);
const ceiling = new THREE.Mesh(bumpy(new THREE.PlaneGeometry(27, 13, 50, 26), 0.5, 0.6, 4), rockMat(5, 4, '#2c2119'));
ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 8.0, 1.6); scene.add(ceiling);
for (const sx of [-1, 1]) {
  const side = new THREE.Mesh(bumpy(new THREE.PlaneGeometry(13, 8.2, 40, 26), 0.45, 0.7, sx * 3), rockMat(7 + sx, 4, '#3d2e22'));
  side.rotation.y = -sx * Math.PI / 2; side.position.set(sx * 12.5, 4.0, 1.6); side.receiveShadow = true; occluders.add(side);
  const pillar = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 1), rockMat(11 + sx, 2, '#33261b'));
  pillar.scale.set(1.0, 2.0, 0.55); pillar.position.set(sx * 11.0, 3.6, 7.3); occluders.add(pillar);
}
const lintel = new THREE.Mesh(new THREE.DodecahedronGeometry(3, 1), rockMat(13, 2, '#2b2018'));
lintel.scale.set(4.6, 0.55, 0.6); lintel.position.set(0, 7.7, 7.4); occluders.add(lintel);
// rock frame around the fresco
const frameMat = rockMat(17, 3, '#3a2b20');
for (const [x, y, w, h] of [[0, WALL_H + 0.5, WALL_W + 2, 1.2], [-WALL_W / 2 - 0.5, WALL_H / 2, 1.2, WALL_H + 2], [WALL_W / 2 + 0.5, WALL_H / 2, 1.2, WALL_H + 2]]) {
  const m = new THREE.Mesh(bumpy(new THREE.BoxGeometry(w, h, 0.8, 20, 10, 2), 0.12, 2.2, x), frameMat); m.position.set(x, y, WALL_Z - 0.3); scene.add(m);
}
const stalGeo = new THREE.ConeGeometry(0.18, 1, 6);
const stalMat = rockMat(19, 1, '#3a2b20');
const stal = new THREE.InstancedMesh(stalGeo, stalMat, 70);
{ const m = new THREE.Matrix4(); let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) { const h = 0.4 + r() * 1.6; m.compose(new THREE.Vector3((r() - 0.5) * 24, 8.0 - h / 2, -3 + r() * 9.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, r() * 6, 0)), new THREE.Vector3(1 + r(), h, 1 + r())); stal.setMatrixAt(i, m); } }
scene.add(stal);
const rockGeo = new THREE.DodecahedronGeometry(1, 1);
[[-11.2, -1.0, 0.7], [-10.6, 4.8, 1.0], [11.0, -0.4, 0.8], [10.9, 4.9, 1.2], [8.2, 6.2, 0.5], [-7.2, 6.4, 0.45], [3.5, 6.6, 0.35]].forEach(([x, z, s], i) => {
  const r = new THREE.Mesh(rockGeo, rockMat(23 + i, 1, '#3d3024')); r.position.set(x, s * 0.45, z); r.scale.set(s * 1.3, s, s); r.rotation.set(x, z, s); r.castShadow = r.receiveShadow = true; occluders.add(r);
});

// ---------- the fresco wall ----------
const PPU_COLOR = isMobile ? 64 : 85;
const art = drawFresco(PPU_COLOR);
const colorTex = new THREE.CanvasTexture(art.color);
colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const hiRes = drawFresco(PPU_COLOR / 2); // relief at half resolution is enough for lighting
const nm = buildNormalMap(hiRes.height, hiRes.gold);
const normalTex = new THREE.DataTexture(nm.data, nm.width, nm.height, THREE.RGBAFormat);
normalTex.minFilter = THREE.LinearMipmapLinearFilter; normalTex.magFilter = THREE.LinearFilter; normalTex.generateMipmaps = true; normalTex.needsUpdate = true;

const L = {
  tPos: { value: [new THREE.Vector3(), new THREE.Vector3()] }, tU: { value: [0, 0] }, jarS: { value: [0, 0] },
  lightR: { value: core.LIGHT.radius }, lightY: { value: core.LIGHT.y }, flick: { value: 1 }, lightOn: { value: 1 },
  jarHalf: { value: core.JAR.half }, jarOn: { value: 1 },
  crackR: { value: new THREE.Vector4(core.CRACK.u0, core.CRACK.u1, core.CRACK.yMax + core.PHYS.bodyH, 0) },
  wingsR: { value: new THREE.Vector4(core.WINGS.u0, core.WINGS.u1, core.WINGS.yMin, core.WINGS.yMax + core.PHYS.bodyH) },
  camPos: { value: new THREE.Vector3() }, time: { value: 0 },
  wallLen: { value: core.WALL.length }, wallH: { value: core.WALL.height },
};
// Light on the wall = the rule: a disc of radius R around (torchU, LIGHT.y), checked at the player's
// body centre; shelters dim it. Normal-mapped relief makes the torchlight rake across the carvings.
const LIGHT_GLSL = `
uniform vec3 tPos[2]; uniform float tU[2]; uniform float jarS[2];
uniform float lightR, lightY, flick, lightOn, jarHalf, jarOn, time;
uniform vec4 crackR, wingsR; uniform vec3 camPos;
float shelter(float u, float y, int i){
  float c = step(crackR.x, u) * (1.0 - smoothstep(crackR.y - 0.12, crackR.y, u)) * step(y, crackR.z);
  float w = smoothstep(wingsR.x, wingsR.x + 0.12, u) * (1.0 - smoothstep(wingsR.y - 0.12, wingsR.y, u)) * step(wingsR.z, y) * step(y, wingsR.w);
  float jx = i == 0 ? jarS[0] : jarS[1];
  float j = jarOn * (1.0 - smoothstep(jarHalf - 0.12, jarHalf, abs(u - jx))) * step(y, 3.4 - max(0.0, abs(u - jx) - 0.6) * 0.9);
  return max(c, max(w, j));
}
vec3 torchLight(float u, float y, vec3 wp, vec3 N, float gold){
  vec3 V = normalize(camPos - wp); vec3 acc = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float tu = i == 0 ? tU[0] : tU[1];
    vec3 tp = i == 0 ? tPos[0] : tPos[1];
    float d = length(vec2(u - tu, y - lightY));
    float k = max(smoothstep(lightR + 0.3, lightR, d), smoothstep(lightR * 1.9, lightR + 0.3, d) * 0.18) * lightOn * flick;
    k *= 1.0 - 0.92 * shelter(u, y, i);
    vec3 Ld = normalize(tp - wp); float ndl = max(dot(N, Ld), 0.0);
    vec3 H = normalize(Ld + V); float sp = pow(max(dot(N, H), 0.0), 36.0);
    acc += k * ((0.25 + 1.15 * ndl) * vec3(1.9, 1.15, 0.55) + gold * sp * vec3(3.2, 2.4, 1.1));
  }
  return acc;
}`;
const wallMat = new THREE.ShaderMaterial({
  uniforms: { ...L, map: { value: colorTex }, nmap: { value: normalTex } },
  vertexShader: `varying vec2 vUv; varying vec3 vWp; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D map, nmap; uniform float wallLen, wallH; varying vec2 vUv; varying vec3 vWp;
    ${LIGHT_GLSL}
    void main(){
      vec3 alb = texture2D(map, vUv).rgb; vec4 n4 = texture2D(nmap, vUv);
      vec3 N = normalize(n4.xyz * 2.0 - 1.0); float gold = n4.a;
      float u = vUv.x * wallLen, y = vUv.y * wallH;
      vec3 amb = vec3(0.12, 0.13, 0.19) * (0.6 + 0.4 * N.z);
      // dawn spilling through the exit doorway
      float door = smoothstep(2.6, 0.0, length(vec2(u - 47.1, (y - 6.6) * 0.8)));
      vec3 col = alb * (amb + torchLight(u, y, vWp, N, gold)) + alb * door * vec3(1.6, 1.15, 0.7);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat);
wall.position.set(0, WALL_H / 2, WALL_Z); scene.add(wall);

// ---------- painted David (lives on the wall) ----------
const sheet = drawDavidSheet();
const sheetTex = new THREE.CanvasTexture(sheet.canvas); sheetTex.colorSpace = THREE.SRGBColorSpace;
const SPRITE_H = 2.1 * S, SPRITE_W = SPRITE_H * sheet.fw / sheet.fh;
const spriteMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { ...L, sheet: { value: sheetTex }, frame: { value: 0 }, frames: { value: sheet.frames }, flip: { value: 1 }, alpha: { value: 0 }, flash: { value: 0 }, safe: { value: 0 }, wallLen: L.wallLen },
  vertexShader: `varying vec2 vUv; varying vec3 vWp; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D sheet; uniform float frame, frames, flip, alpha, flash, safe, wallLen; varying vec2 vUv; varying vec3 vWp;
    ${LIGHT_GLSL}
    void main(){
      float x = flip > 0.0 ? vUv.x : 1.0 - vUv.x;
      vec4 c = texture2D(sheet, vec2((frame + x) / frames, vUv.y));
      if (c.a < 0.35) discard;
      float u = (vWp.x + ${(WALL_W / 2).toFixed(1)}) / ${S.toFixed(2)}, y = vWp.y / ${S.toFixed(2)};
      vec3 lit = c.rgb * (vec3(0.16, 0.17, 0.24) + torchLight(u, y, vWp, vec3(0.0, 0.0, 1.0), 0.0));
      lit += vec3(0.25, 0.45, 0.8) * safe * 0.35 + vec3(1.6, 1.2, 0.6) * flash;
      gl_FragColor = vec4(lit, c.a * alpha);
    }`,
});
const flat = new THREE.Mesh(new THREE.PlaneGeometry(SPRITE_W, SPRITE_H), spriteMat);
flat.renderOrder = 2; scene.add(flat);
const placeFlat = (u, y) => flat.position.set(U2X(u), Y2Y(y) + SPRITE_H / 2 - 0.03, WALL_Z + 0.02);

// ---------- 3D characters ----------
const loader = new GLTFLoader();
function fallbackFigure(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.95, 10), new THREE.MeshStandardMaterial({ color })); b.position.y = 0.78; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: 0xc58c62 })); h.position.y = 1.42; g.add(h);
  return g;
}
const david = new THREE.Group(); david.position.set(1.5, 0, 2.4); scene.add(david);
let davidModel = fallbackFigure(0xa0522d), davidPivots = null; david.add(davidModel);
loader.loadAsync('./assets/storybook/david.glb').then((gltf) => {
  const m = gltf.scene; const box = new THREE.Box3().setFromObject(m); const h = box.max.y - box.min.y;
  m.scale.setScalar(1.55 / h); m.position.y = -box.min.y * (1.55 / h);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  david.remove(davidModel); davidModel = m; david.add(m);
  const find = (n) => m.getObjectByName(n);
  davidPivots = ['legL', 'legR', 'armL', 'armR'].map((n) => { const o = find(n); return o ? { o, rx: o.rotation.x } : null; });
}).catch(() => {});

const soldiers = core.TORCHES.map((T, i) => {
  const root = new THREE.Group(); scene.add(root);
  const body = fallbackFigure(0x5a1e14); body.scale.setScalar(1.12); root.add(body);
  const torch = new THREE.Group(); torch.position.set(0.32, 1.5, 0.25); root.add(torch);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x3b2a1a })); torch.add(stick);
  const flameTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 36, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,180,70,.9)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(4, 2.4, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.position.y = 0.45; flame.scale.set(0.5, 0.75, 1); torch.add(flame);
  const light = new THREE.PointLight(0xff9a48, 55, 26, 1.3); light.position.y = 0.45; torch.add(light);
  if (i === 0 && renderer.shadowMap.enabled) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; }
  const s = { T, i, root, body, torch, flame, light, mixer: null, walk: null };
  loader.loadAsync('./assets/bethlehem-art/warrior-refined.glb').then((gltf) => {
    const m = gltf.scene; const box = new THREE.Box3().setFromObject(m); const h = box.max.y - box.min.y;
    m.scale.setScalar(1.75 / h); m.position.y = -box.min.y * (1.75 / h);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    root.remove(body); root.add(m);
    s.mixer = new THREE.AnimationMixer(m);
    const clip = gltf.animations.find((a) => a.name === 'Walk') || gltf.animations[0];
    if (clip) { s.walk = s.mixer.clipAction(clip); s.walk.play(); }
  }).catch(() => {});
  return s;
});

// the clay jar
const jarGeo = new THREE.LatheGeometry([[0, 0], [0.22, 0.02], [0.34, 0.2], [0.38, 0.45], [0.3, 0.7], [0.16, 0.82], [0.18, 0.92], [0.0, 0.92]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
const jar = new THREE.Mesh(jarGeo, new THREE.MeshStandardMaterial({ color: 0xa4562c, roughness: 0.75 }));
jar.castShadow = jar.receiveShadow = true; scene.add(jar);
const jarRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.7), transparent: true }));
jarRing.rotation.x = -Math.PI / 2; scene.add(jarRing);
const crackRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.7), transparent: true }));
crackRing.rotation.x = -Math.PI / 2; crackRing.position.copy(CRACK_SPOT).setY(0.03); scene.add(crackRing);

// dust motes and embers
const softDot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function points(n, size, color, opacity) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, color, map: softDot, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
}
const dust = points(isMobile ? 260 : 520, 0.05, new THREE.Color(0.9, 0.7, 0.5), 0.35); scene.add(dust);
{ const p = dust.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, (Math.random() - 0.5) * 24, Math.random() * 7.5, -3.6 + Math.random() * 11); }
const embers = points(48, 0.06, new THREE.Color(4, 1.8, 0.5), 0.9); scene.add(embers);
const emberLife = new Float32Array(48).map(() => Math.random());

// ---------- state ----------
let mode = 'intro'; // intro | cave | enter | wall | leave | won
let state = null, clock = 0, enterT = 0, jarSlot = 0, jarU = core.JAR_SLOTS[0], jarAnim = null, walkT = 0, paused = false;
const seen = new Set();
const keys = new Set();
let padDir = 0, padJump = false, tapTarget = null;
const camPos = new THREE.Vector3(1.5, 3.6, 10), camLook = new THREE.Vector3(0, 2, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function toast(text, ms = 2600) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms); }
const tip = (key, text, ms) => { if (seen.has(key)) return; seen.add(key); toast(text, ms); };
const setObjective = (t) => { $('objective').textContent = t; };
function setMode(m) { mode = m; app.dataset.mode = m; }
const pct = (u) => `${(Math.min(core.WALL.length, Math.max(0, u)) / core.WALL.length) * 100}%`;
{
  const z = (sel, u0, u1) => Object.assign(document.querySelector(`#strip .${sel}`).style, { left: pct(u0), width: pct(u1 - u0 + 0) });
  z('crack', core.CRACK.u0, core.CRACK.u1); z('wings', core.WINGS.u0, core.WINGS.u1); z('gap', core.GAP.u0, core.GAP.u1);
  Object.assign(document.querySelector('#strip .exit').style, { left: pct(core.EXIT.u), right: '0' });
  for (const id of ['stripA', 'stripB']) Object.assign($(id).style, { width: pct(2 * core.LIGHT.radius), marginLeft: `-${(core.LIGHT.radius / core.WALL.length) * 100}%` });
}

// ---------- input ----------
const LEFT = new Set(['ArrowLeft', 'KeyA']), RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']), DOWN = new Set(['ArrowDown', 'KeyS']);
const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
const any = (set) => [...keys].some((k) => set.has(k));
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
    if (!$('enterWall').hidden) enterWall(); else if (!$('pushJar').hidden) pushJar(); else if (!$('leaveWall').hidden) leaveWall();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
const release = () => { keys.clear(); padDir = 0; padJump = false; document.querySelectorAll('#pad button.on').forEach((b) => b.classList.remove('on')); };
addEventListener('blur', release);
document.addEventListener('visibilitychange', () => { paused = document.hidden; release(); });
function hold(id, on, off) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); on(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => { b.classList.remove('on'); off(); }));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
hold('left', () => { padDir = -1; }, () => { if (padDir === -1) padDir = 0; });
hold('right', () => { padDir = 1; }, () => { if (padDir === 1) padDir = 0; });
hold('jump', () => { padJump = true; }, () => { padJump = false; });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'cave') return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(floor)[0] || ray.intersectObject(wall)[0];
  if (hit) tapTarget = new THREE.Vector3(hit.point.x, 0, Math.max(hit.point.z, WALL_Z + 0.7));
});

// ---------- flow ----------
$('start').addEventListener('click', () => {
  $('intro').hidden = true; $('hud').hidden = false; setMode('cave');
  setObjective('벽 왼쪽 끝, 갈라진 틈으로 가세요.');
});
$('enterWall').addEventListener('click', enterWall);
$('pushJar').addEventListener('click', pushJar);
$('leaveWall').addEventListener('click', leaveWall);
function enterWall() {
  if (mode !== 'cave') return;
  $('enterWall').hidden = true; $('pushJar').hidden = true; tapTarget = null; release();
  state = core.createState({ phases: core.DEFAULT_PHASES.map((p) => p + clock), jarSlot });
  setMode('enter'); enterT = 0;
}
function beginWall() {
  setMode('wall'); $('pad').hidden = false;
  if (jarSlot === 2) setObjective('항아리 그림자 안에서 빛이 지나가기를 기다렸다가 출구로 가세요.');
  else setObjective('빛이 지나가면 새겨진 말씀을 딛고 위로 올라가세요.');
}
function leaveWall() {
  if (mode !== 'wall') return;
  $('leaveWall').hidden = true; $('pad').hidden = true; release();
  setMode('leave'); enterT = 0;
  david.position.set(CRACK_SPOT.x + 0.4, 0, CRACK_SPOT.z + 0.6); david.visible = true;
}
function pushJar() {
  if (mode !== 'cave' || jarAnim) return;
  const dir = david.position.x < jar.position.x ? 1 : -1;
  const next = Math.min(core.JAR_SLOTS.length - 1, Math.max(0, jarSlot + dir));
  if (next === jarSlot) { toast('더 밀 수 없어요.'); return; }
  jarAnim = { from: jarU, to: core.JAR_SLOTS[next], t: 0 }; jarSlot = next;
  if (next === 2) { toast('항아리 그림자가 "이 재앙들이 지나기까지" 위에 드리워졌어요.', 3200); setObjective('틈으로 돌아가 다시 벽 속으로 들어가세요.'); }
  else toast('항아리를 옮기면 벽에 드리워지는 그림자의 자리도 바뀝니다.', 3000);
}
$('again').addEventListener('click', () => {
  $('ending').hidden = true; state = core.createState({ phases: core.DEFAULT_PHASES.map((p) => p + clock), jarSlot }); beginWall();
});
function showEnding() {
  setMode('won'); $('pad').hidden = true; $('leaveWall').hidden = true; release();
  $('verse').textContent = PSALM57[0];
  $('recorded').replaceChildren(...RECORDED.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('imagined').replaceChildren(...IMAGINED.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('citation').textContent = PSALM57_CITATION;
  $('ending').hidden = false; $('again').focus();
}
function onWallEvents(evs) {
  for (const ev of evs) {
    if (ev.type === 'caught') {
      spriteMat.uniforms.flash.value = 1;
      const onFloor = lastU > core.GAP.u1 - 0.5;
      if (onFloor && state.jarSlot !== 2) {
        floorCatches++;
        if (floorCatches === 1) toast('횃불 빛에 드러났어요. 바닥 쪽에는 숨을 곳이 없어 보여요.', 3600);
        else {
          toast('틈으로 나가 굴 바닥의 항아리를 옮겨 보세요. 항아리 그림자가 벽에 드리워집니다.', 4600);
          setObjective('틈에서 "벽에서 나오기"로 나가 항아리를 오른쪽 끝까지 미세요.');
        }
      } else toast('횃불 빛에 드러났어요. 틈으로 돌아갑니다.');
    }
    if (ev.type === 'fell') { spriteMat.uniforms.flash.value = 0.6; toast('벽화가 떨어져 나간 곳이에요. 틈으로 돌아갑니다.'); }
    if (ev.type === 'hidden') {
      if (ev.shelter === 'crack') tip('crack', '틈 안에서는 빛이 닿지 않아요.');
      if (ev.shelter === 'wings') tip('wings', '날개 그늘 아래에서는 빛이 닿지 않아요.');
      if (ev.shelter === 'jar') tip('jar', '항아리 그림자 안에서는 빛이 닿지 않아요.');
    }
    if (ev.type === 'land' && ev.platform === 'p3') tip('p3', '높은 줄에는 횃불 빛이 닿지 않아요. 날개 그림 아래로 내려가세요.', 3200);
    if (ev.type === 'land' && ev.platform === 'wings' && state.jarSlot !== 2 && floorCatches < 2) setObjective('날개 그늘 아래에서 빛이 지나가기를 기다렸다가, 아래 바닥으로 내려가 보세요.');
    if (ev.type === 'won') setTimeout(showEnding, 700);
  }
}
let lastU = 0, floorCatches = 0;

// Read-only inspection for local verification. Exposes no way to change the game.
window.psalm57Inspect = () => ({
  mode, clock, jarSlot, u: state?.u ?? null, y: state?.y ?? null, ground: state?.ground ?? null,
  caught: state?.caught ?? 0, fell: state?.fell ?? 0, hides: state ? { ...state.hides } : null,
  torches: core.TORCHES.map((T, i) => core.torchAt(T, clock, core.DEFAULT_PHASES[i]).u),
  davidX: david.position.x, davidZ: david.position.z, jarX: jar.position.x,
});

// ---------- loop ----------
function resize() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false); post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function wallCamera(u, y, out) {
  const a = camera.aspect, tan = Math.tan(THREE.MathUtils.degToRad(20));
  const h = a < 1 ? 7.2 : 4.6, w = h * a, dist = h / (2 * tan);
  // keep the floor band above the on-screen pad: allow the view to dip below the wall's bottom edge
  const hx = Math.max(0, WALL_W / 2 - w / 2), hy0 = Math.min(WALL_H / 2, h / 2) - (a < 1 ? 1.0 : 0.5), hy1 = Math.max(WALL_H / 2, WALL_H - h / 2);
  const x = THREE.MathUtils.clamp(U2X(u), -hx, hx), cy = THREE.MathUtils.clamp(Y2Y(y) + 0.7, hy0, hy1);
  out.pos.set(x, cy, WALL_Z + dist); out.look.set(x, cy, WALL_Z);
  return out;
}
const camTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (!paused && (mode === 'cave' || mode === 'wall' || mode === 'intro')) {
    if (mode === 'wall') {
      const input = { dir: padDir || (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0), jump: padJump || any(JUMP) };
      const before = state.t;
      lastU = state.u;
      onWallEvents(core.step(state, input, dt));
      clock += state.t - before;
      $('leaveWall').hidden = !(state.mode === 'play' && state.ground === 'ground' && state.u <= core.CRACK.u1);
    } else if (mode === 'cave') clock += dt;
  }
  if (!paused && (mode === 'enter' || mode === 'leave')) {
    clock += dt;
    if (mode === 'enter' && state) state.phases = core.DEFAULT_PHASES.map((p) => p + clock); // state.t is still 0
  }

  // torches (same clock as the rules)
  const flick = 0.88 + 0.12 * Math.sin(t * 21) * Math.sin(t * 13.7);
  L.flick.value = flick; L.time.value = t;
  soldiers.forEach((s) => {
    const tp = core.torchAt(s.T, clock, core.DEFAULT_PHASES[s.i]);
    L.tU.value[s.i] = tp.u;
    s.root.position.set(U2X(tp.u), 0, TORCH_Z[s.i]);
    s.root.rotation.y = tp.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    s.torch.getWorldPosition(_v); _v.y = Y2Y(core.LIGHT.y); L.tPos.value[s.i].copy(_v).setZ(TORCH_Z[s.i] - 0.6);
    s.light.intensity = 55 * flick; s.flame.scale.set(0.45 + 0.08 * flick, 0.7 + 0.12 * flick, 1);
    if (s.mixer) { if (s.walk) s.walk.timeScale = s.T.speed * S / 1.3; s.mixer.update(dt); }
  });
  // jar (slides between slots) and its shadow on the wall
  if (jarAnim) { jarAnim.t = Math.min(1, jarAnim.t + dt / 0.9); jarU = jarAnim.from + (jarAnim.to - jarAnim.from) * (1 - (1 - jarAnim.t) ** 3); if (jarAnim.t >= 1) jarAnim = null; }
  jar.position.set(U2X(jarU), 0, JAR_Z); jarRing.position.set(jar.position.x, 0.03, JAR_Z);
  L.jarS.value[0] = core.jarShadowU(jarU, L.tU.value[0]); L.jarS.value[1] = core.jarShadowU(jarU, L.tU.value[1]);
  jarRing.material.opacity = crackRing.material.opacity = 0.45 + 0.4 * Math.sin(t * 4);

  // dust and embers
  { const p = dust.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.05 * (1 + (i % 3)); if (y > 7.6) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.03); } p.needsUpdate = true; }
  { const p = embers.geometry.attributes.position; for (let i = 0; i < 48; i++) { emberLife[i] += dt * (0.5 + (i % 5) * 0.12); const s = soldiers[i % 2]; if (emberLife[i] > 1) { emberLife[i] = 0; } s.flame.getWorldPosition(_w); const k = emberLife[i]; p.setXYZ(i, _w.x + Math.sin(i * 7 + t * 2) * 0.25 * k, _w.y + k * 1.4, _w.z + Math.cos(i * 3) * 0.2 * k); } p.needsUpdate = true; }

  const inCave = mode === 'intro' || mode === 'cave';
  if (inCave) {
    if (mode === 'cave') {
      const mv = _v.set((any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0), 0, (any(DOWN) ? 1 : 0) - (any(UP) ? 1 : 0));
      if (mv.lengthSq()) tapTarget = null;
      else if (tapTarget) { mv.subVectors(tapTarget, david.position).setY(0); if (mv.length() < 0.1) { tapTarget = null; mv.set(0, 0, 0); } }
      if (mv.lengthSq()) {
        mv.normalize().multiplyScalar(3.2 * dt);
        david.position.add(mv);
        david.position.x = THREE.MathUtils.clamp(david.position.x, -11.6, 11.6);
        david.position.z = THREE.MathUtils.clamp(david.position.z, WALL_Z + 0.6, 5.2);
        { const dx = david.position.x - jar.position.x, dz = david.position.z - jar.position.z, d = Math.hypot(dx, dz); // slide around the jar
          if (d < 0.75 && d > 1e-4) { david.position.x = jar.position.x + dx / d * 0.75; david.position.z = jar.position.z + dz / d * 0.75; } }
        david.rotation.y = Math.atan2(mv.x, mv.z); walkT += dt * 9;
      }
      const nearCrack = david.position.distanceTo(CRACK_SPOT) < 1.6;
      const nearJar = !nearCrack && david.position.distanceTo(jar.position) < 1.5 && !jarAnim;
      $('enterWall').hidden = !nearCrack; $('pushJar').hidden = !nearJar;
      if (nearJar) $('pushJar').firstChild.textContent = david.position.x < jar.position.x ? '항아리를 오른쪽으로 밀기 ' : '항아리를 왼쪽으로 밀기 ';
      if (nearJar) tip('jarNear', '항아리를 옮기면 벽에 드리워지는 그림자의 자리도 바뀝니다.', 3000);
    }
    if (davidPivots) { const sw = Math.sin(walkT) * 0.55 * (mode === 'cave' && (tapTarget || any(LEFT) || any(RIGHT) || any(UP) || any(DOWN)) ? 1 : 0); davidPivots.forEach((p, i) => { if (p) p.o.rotation.x = p.rx + (i % 2 ? -sw : sw) * (i < 2 ? 1 : 0.8); }); }
    const portrait = camera.aspect < 1;
    if (mode === 'intro') { // establishing shot: from deep in the cave out toward the patrolling torches
      camPos.set(Math.sin(t * 0.15) * 1.2, 1.7, -2.6); camLook.set(Math.sin(t * 0.15) * 2, 2.0, 9);
    } else {
    camPos.lerp(_w.set(david.position.x * (portrait ? 0.88 : 0.6), portrait ? 4.6 : 3.6, Math.min(6.8, david.position.z + (portrait ? 8.5 : 7.5))), 1 - Math.exp(-dt * 4));
    camLook.lerp(_w.set(david.position.x * (portrait ? 0.92 : 0.75), portrait ? 2.6 : 1.9, david.position.z - 3), 1 - Math.exp(-dt * 2.5));
    }
    flat.visible = false;
  } else {
    flat.visible = true;
    const u = state.u, y = state.y;
    wallCamera(u, y, camTarget);
    if (mode === 'enter' || mode === 'leave') {
      enterT += dt / 1.2;
      const k = Math.min(1, enterT), into = mode === 'enter';
      david.visible = into ? k < 0.45 : k > 0.55;
      spriteMat.uniforms.alpha.value = into ? Math.max(0, (k - 0.35) / 0.65) : Math.max(0, 1 - k * 1.6);
      if (into) { camPos.lerp(camTarget.pos, 1 - Math.exp(-dt * 5)); camLook.lerp(camTarget.look, 1 - Math.exp(-dt * 5)); }
      if (k >= 1) { if (into) beginWall(); else { setMode('cave'); state = null; setObjective(jarSlot === 2 ? '갈라진 틈으로 돌아가 다시 벽 속으로 들어가세요.' : '굴 바닥의 항아리를 오른쪽으로 밀어 보세요.'); } }
      if (!into) { camPos.lerp(_w.set(david.position.x * 0.6, 3.6, Math.min(6.8, david.position.z + 7.5)), 1 - Math.exp(-dt * 3)); camLook.lerp(_w.set(david.position.x * 0.75, 1.9, david.position.z - 3), 1 - Math.exp(-dt * 3)); }
    } else {
      camPos.lerp(camTarget.pos, 1 - Math.exp(-dt * 6)); camLook.lerp(camTarget.look, 1 - Math.exp(-dt * 6));
      spriteMat.uniforms.alpha.value = 1;
    }
    placeFlat(u, y);
    spriteMat.uniforms.flip.value = state.facing;
    const run = state.ground && Math.abs(state.vx) > 0.1;
    spriteMat.uniforms.frame.value = !state.ground ? 7 : run ? 1 + (Math.floor(state.t * 12) % 6) : 0;
    spriteMat.uniforms.flash.value = Math.max(0, spriteMat.uniforms.flash.value - dt * 2.5);
    const safe = core.TORCHES.some((T, i) => core.inLight(u, y, L.tU.value[i]) && core.shelterFrom(u, y, L.tU.value[i], core.JAR_SLOTS[state.jarSlot]));
    spriteMat.uniforms.safe.value += ((safe ? 1 : 0) - spriteMat.uniforms.safe.value) * Math.min(1, dt * 8);
  }
  occluders.visible = inCave || mode === 'leave' || (mode === 'enter' && enterT < 0.35);
  jar.visible = david.visible || inCave; jarRing.visible = inCave; crackRing.visible = inCave;
  scene.fog.density = inCave ? 0.028 : 0.006;
  const wantFov = inCave || mode === 'leave' ? (camera.aspect < 1 ? 68 : 50) : 40;
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix(); }
  camera.position.copy(camPos); camera.lookAt(camLook);
  L.camPos.value.copy(camera.position);

  // HUD strip
  $('stripA').style.left = pct(L.tU.value[0]); $('stripB').style.left = pct(L.tU.value[1]);
  $('stripA').style.opacity = L.tU.value[0] < -2 || L.tU.value[0] > 50 ? '0.25' : '1';
  Object.assign(document.querySelector('#strip .jar').style, { left: pct(jarU - core.JAR.half), width: pct(2 * core.JAR.half) });
  if (state) $('stripPlayer').style.left = pct(state.u); else $('stripPlayer').style.left = pct(Math.max(0, (david.position.x + WALL_W / 2) / S));

  post.render(scene, camera, t);
}
requestAnimationFrame((t) => { last = t; $('loading').hidden = true; frame(t); });
