/*
 * Shared environment uplift for The Shepherd King anthology.
 *
 * Rendering only. This module does not change chapter scripts, terrain heights,
 * colliders, player bounds, camera clamps, or the Chapter 1 storybook world.
 */

const REQUIRED_KEYS = [
  'bethlehem', 'elah', 'harp', 'jonathan', 'engedi',
  'abigail', 'ziklag', 'ark', 'mephibosheth', 'nathan',
];
const PALACE_KEYS = new Set(['harp', 'jonathan', 'mephibosheth', 'nathan']);

const PALETTES = {
  elah:          { soil: 0x8f7954, stone: 0xc1b18f, leaf: 0x74815a, leaf2: 0x8f9870 },
  harp:          { soil: 0x8d774f, stone: 0xc7b58e, leaf: 0x687b50, leaf2: 0x899263 },
  jonathan:      { soil: 0x8d7a58, stone: 0xc9b894, leaf: 0x718354, leaf2: 0x96a16c },
  engedi:        { soil: 0x8b6d52, stone: 0xc89d76, leaf: 0x76805d, leaf2: 0x959a72 },
  abigail:       { soil: 0x92764d, stone: 0xc4ab7e, leaf: 0x7a8050, leaf2: 0x9a9962 },
  ziklag:        { soil: 0x6e5c4c, stone: 0xa9977d, leaf: 0x727851, leaf2: 0x8b8c64 },
  ark:           { soil: 0x927b58, stone: 0xd0bd94, leaf: 0x728357, leaf2: 0x929d70 },
  mephibosheth:  { soil: 0x8b7454, stone: 0xbba985, leaf: 0x777b55, leaf2: 0x92936a },
  nathan:        { soil: 0x88714d, stone: 0xc5b086, leaf: 0x718052, leaf2: 0x929d6b },
};

const OUTDOOR_ANCHORS = {
  elah: [[-66, 32, 'olive'], [-63, -28, 'stone'], [66, 34, 'olive'], [61, -31, 'stone']],
  harp: [[52, 53, 'olive'], [31, 26, 'stone'], [-32, 35, 'olive'], [-48, -18, 'stone']],
  jonathan: [[-18, 9, 'olive'], [18, -13, 'stone'], [45, 38, 'olive'], [-45, 28, 'stone']],
  engedi: [[-13, 70, 'stone'], [13, 42, 'olive'], [-12, 8, 'stone'], [10, -35, 'olive']],
  abigail: [[-58, 39, 'olive'], [-34, 23, 'stone'], [30, -20, 'olive'], [58, -40, 'stone']],
  ziklag: [[-25, 72, 'stone'], [27, 68, 'olive'], [-31, -31, 'olive'], [28, -72, 'stone']],
  ark: [[72, 57, 'olive'], [55, 35, 'stone'], [-58, 48, 'olive'], [-70, -28, 'stone']],
  mephibosheth: [[-31, 27, 'stone'], [29, 22, 'olive'], [-33, -31, 'olive'], [31, -36, 'stone']],
  nathan: [[-29, 25, 'olive'], [25, 21, 'stone'], [-26, -31, 'stone'], [31, -24, 'olive']],
};

const PALACE_STYLE = {
  harp:         { wall: 0x8e806e, floor: 0x675746, trim: 0x443529, cloth: 0x354b76, accent: 0x8b3940, warm: 0xffad62, cool: 0x7897c5 },
  jonathan:     { wall: 0xcbbb9a, floor: 0xad9b79, trim: 0x725438, cloth: 0x36578d, accent: 0x8d3c48, warm: 0xffcf88, cool: 0x8ea9ca },
  mephibosheth: { wall: 0xd2c19f, floor: 0xbaab88, trim: 0x745638, cloth: 0x405b91, accent: 0x7b3450, warm: 0xffd08c, cool: 0x8da9c4 },
  nathan:       { wall: 0xb7a786, floor: 0x8d7e66, trim: 0x584334, cloth: 0x39496d, accent: 0x7b3f39, warm: 0xf0a064, cool: 0x7087ad },
};

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeState(THREE, game, key) {
  const root = new THREE.Group();
  root.name = `anthology-world-${key}`;
  game.root.add(root);
  const state = {
    key, root, geometries: new Set(), materials: new Set(), lights: [], replacements: [],
    terrain: null, terrainMaterial: null, terrainOriginal: null, palace: null,
    indoor: false, phase: 'base', disposed: false,
  };
  game.__anthologyWorld = state;
  return state;
}

function ownGeometry(state, geometry) { state.geometries.add(geometry); return geometry; }
function ownMaterial(state, material) { state.materials.add(material); return material; }

function standard(THREE, state, color, options = {}) {
  return ownMaterial(state, new THREE.MeshStandardMaterial({
    color, roughness: options.roughness ?? .92, metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? true, vertexColors: options.vertexColors ?? false,
    side: options.side, emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  }));
}

function addMesh(THREE, state, parent, geometry, material, transform = {}) {
  ownGeometry(state, geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(transform.x || 0, transform.y || 0, transform.z || 0);
  mesh.rotation.set(transform.rx || 0, transform.ry || 0, transform.rz || 0);
  mesh.scale.set(transform.sx ?? transform.s ?? 1, transform.sy ?? transform.s ?? 1, transform.sz ?? transform.s ?? 1);
  mesh.castShadow = transform.cast ?? false;
  mesh.receiveShadow = transform.receive ?? true;
  mesh.renderOrder = transform.renderOrder || 0;
  parent.add(mesh);
  return mesh;
}

function instance(THREE, state, parent, geometry, material, transforms) {
  if (!transforms.length) return null;
  ownGeometry(state, geometry);
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  transforms.forEach((t, i) => {
    e.set(t.rx || 0, t.ry || 0, t.rz || 0); q.setFromEuler(e);
    const scale = t.s ?? 1;
    matrix.compose(p.set(t.x, t.y, t.z), q, s.set(t.sx ?? scale, t.sy ?? scale, t.sz ?? scale));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.computeBoundingSphere(); parent.add(mesh);
  return mesh;
}

function terrainMaterial(THREE, state, game, key) {
  const terrain = game.terrain, base = terrain?.material;
  if (!terrain || !base?.clone) return;
  const material = ownMaterial(state, base.clone());
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    if (previous) previous(shader);
    shader.vertexShader = `varying vec3 vAnthologyWorld;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vAnthologyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = `varying vec3 vAnthologyWorld;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float aBroad = sin(vAnthologyWorld.x * .115 + sin(vAnthologyWorld.z * .043) * 1.7);
       float aFine = sin(vAnthologyWorld.z * .62 - vAnthologyWorld.x * .37);
       float aNear = 1.0 - smoothstep(35.0, 115.0, distance(vAnthologyWorld.xz, cameraPosition.xz));
       diffuseColor.rgb *= 1.0 + aBroad * .018 + aFine * .009 * aNear;
       diffuseColor.rgb += vec3(.010, .006, -.004) * aNear * (1.0 - abs(aBroad));`,
    );
  };
  material.customProgramCacheKey = () => `anthology-terrain-${key}-v2`;
  material.roughness = .98; material.metalness = 0; material.needsUpdate = true;
  state.terrain = terrain; state.terrainOriginal = base; state.terrainMaterial = material;
  terrain.material = material; terrain.receiveShadow = true;
}

function makeStoneGeometry(THREE, state) {
  const group = new THREE.BufferGeometry();
  const parts = [];
  const colors = [0xb9aa8d, 0xcebd98, 0x9e927d];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.DodecahedronGeometry(i ? .32 : .5, 0).toNonIndexed();
    g.scale(i ? 1.15 : 1.45, i ? .55 : .48, i ? .9 : 1.0);
    g.translate((i - 1) * .42, i ? .18 : .24, i === 2 ? .18 : -.08);
    const c = new THREE.Color(colors[i]), attr = new Float32Array(g.attributes.position.count * 3);
    for (let j = 0; j < g.attributes.position.count; j++) attr.set([c.r, c.g, c.b], j * 3);
    g.setAttribute('color', new THREE.BufferAttribute(attr, 3)); parts.push(g);
  }
  let count = 0; parts.forEach(g => count += g.attributes.position.count);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let offset = 0;
  parts.forEach(g => {
    pos.set(g.attributes.position.array, offset * 3); nor.set(g.attributes.normal.array, offset * 3);
    col.set(g.attributes.color.array, offset * 3); offset += g.attributes.position.count; g.dispose();
  });
  group.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  group.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  group.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.computeBoundingSphere(); return group;
}

function makeOliveGeometry(THREE, state, palette) {
  const root = new THREE.Group();
  const trunkMat = standard(THREE, state, 0x604c36, { roughness: 1 });
  const leafMat = standard(THREE, state, palette.leaf, { roughness: .96 });
  addMesh(THREE, state, root, new THREE.CylinderGeometry(.18, .32, 2.1, 7), trunkMat, { y: 1, rz: .12 });
  addMesh(THREE, state, root, new THREE.CylinderGeometry(.1, .18, 1.3, 6), trunkMat, { x: -.3, y: 2.15, rz: .5 });
  const crowns = [[0, 2.9, 0, 1], [.82, 2.85, .18, .72], [-.8, 2.8, -.1, .74], [.15, 3.42, -.2, .72], [.4, 3.05, .72, .62]];
  crowns.forEach((v, i) => addMesh(THREE, state, root, new THREE.IcosahedronGeometry(v[3], 0), leafMat, {
    x: v[0], y: v[1], z: v[2], sx: 1.05, sy: .58 + (i % 2) * .08, sz: .84, ry: i * .7, cast: true,
  }));
  return root;
}

function addOutdoorClusters(THREE, state, game, key) {
  const palette = PALETTES[key], anchors = OUTDOOR_ANCHORS[key] || [];
  const r = seeded(700 + REQUIRED_KEYS.indexOf(key) * 97);
  const stoneMat = standard(THREE, state, 0xffffff, { vertexColors: true, roughness: 1 });
  const stoneGeo = makeStoneGeometry(THREE, state), stones = [];
  const olives = new THREE.Group(); olives.name = 'anthology-deliberate-vegetation'; state.root.add(olives);
  const olivePrototype = makeOliveGeometry(THREE, state, palette);
  anchors.forEach(([ax, az, kind], ai) => {
    const count = kind === 'stone' ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = 1.8 + r() * (kind === 'stone' ? 5.5 : 4.2);
      const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (z > 300) continue;
      const y = game.groundAt(x, z);
      if (kind === 'stone' || i > 1) stones.push({ x, y: y - .03, z, s: .5 + r() * .65, sy: .7 + r() * .35, ry: r() * Math.PI * 2 });
      if (kind === 'olive' && i < 3) {
        const tree = olivePrototype.clone(true); tree.position.set(x, y - .12, z);
        tree.rotation.y = r() * Math.PI * 2; tree.scale.setScalar(.68 + r() * .28);
        olives.add(tree);
      }
    }
    const patchMat = standard(THREE, state, palette.soil, { roughness: 1 });
    const patch = addMesh(THREE, state, state.root, new THREE.CircleGeometry(kind === 'stone' ? 4.4 : 3.8, 20), patchMat, {
      x: ax, y: game.groundAt(ax, az) + .018, z: az, rx: -Math.PI / 2, sy: .72, receive: false,
    });
    patch.material.transparent = true; patch.material.opacity = kind === 'stone' ? .12 : .08;
    patch.material.depthWrite = false; patch.material.polygonOffset = true; patch.material.polygonOffsetFactor = -2;
    patch.renderOrder = 1; patch.rotation.z = ai * .7;
  });
  instance(THREE, state, state.root, stoneGeo, stoneMat, stones);
  olives.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // The prototype is only a source for clones and must not render itself.
  olivePrototype.clear();
}

function replacePalaceMaterials(THREE, state, palace, style) {
  palace.root.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  for (const object of palace.root.children) {
    if (!object.isMesh || !object.geometry) continue;
    object.geometry.computeBoundingBox(); object.geometry.boundingBox.getSize(size);
    let material = null;
    if (size.x > 16 && size.z > 25 && size.y < .35) material = standard(THREE, state, style.floor, { vertexColors: true, roughness: .78, flatShading: false });
    else if (size.x > 18 && size.z > 28 && size.y > 5) material = standard(THREE, state, style.wall, { vertexColors: true, roughness: .96, flatShading: false });
    else if (size.x > 10 && size.z > 20 && size.y > 4) material = standard(THREE, state, 0xd3c3a2, { vertexColors: true, roughness: .9, flatShading: false });
    else if (size.z > 18 && size.y > 2) material = standard(THREE, state, style.cloth, { vertexColors: true, roughness: .9, flatShading: false });
    if (!material) continue;
    state.replacements.push({ object, material: object.material }); object.material = material;
  }
}

function addPalaceArchitecture(THREE, state, game, key) {
  const palace = game.ch?.s?.P, style = PALACE_STYLE[key];
  if (!palace?.root || !style) return;
  state.palace = palace;
  const group = new THREE.Group(); group.name = `anthology-palace-${key}`; palace.root.add(group);
  const stone = standard(THREE, state, style.wall, { roughness: .94, flatShading: false });
  const trim = standard(THREE, state, style.trim, { roughness: .82, flatShading: false });
  const cloth = standard(THREE, state, style.cloth, { roughness: .9, flatShading: false });
  const accent = standard(THREE, state, style.accent, { roughness: .88, flatShading: false });
  const shade = standard(THREE, state, style.cool, { roughness: .98, flatShading: false });
  const glow = standard(THREE, state, 0xffcb86, { roughness: .7, emissive: style.warm, emissiveIntensity: .48, flatShading: false });
  state.palaceGlow = glow;
  replacePalaceMaterials(THREE, state, palace, style);
  const { hw, hd, H } = palace;

  // Stone courses, threshold and recessed ceiling beams give the room depth.
  for (const x of [-hw + .14, hw - .14]) {
    addMesh(THREE, state, group, new THREE.BoxGeometry(.18, .42, hd * 2 - .8), trim, { x, y: .23, receive: true });
    addMesh(THREE, state, group, new THREE.BoxGeometry(.16, .22, hd * 2 - .8), trim, { x, y: H - 1.02, receive: true });
  }
  for (let z = -hd + 1.6; z < hd - .8; z += 3) {
    addMesh(THREE, state, group, new THREE.BoxGeometry(hw * 2 - .9, .24, .26), trim, { y: H - .42, z, receive: true });
  }
  addMesh(THREE, state, group, new THREE.BoxGeometry(4.3, .18, .55), trim, { y: 3.45, z: hd - .16 });
  addMesh(THREE, state, group, new THREE.BoxGeometry(.34, 3.55, .42), trim, { x: -1.82, y: 1.72, z: hd - .16 });
  addMesh(THREE, state, group, new THREE.BoxGeometry(.34, 3.55, .42), trim, { x: 1.82, y: 1.72, z: hd - .16 });

  // Floor inlay and woven textile breaks up the old checkerboard without covering it.
  for (const x of [-3.05, 3.05]) addMesh(THREE, state, group, new THREE.BoxGeometry(.12, .025, hd * 2 - 2), trim, { x, y: .02, z: .2 });
  for (const z of [-hd + 1, hd - 1]) addMesh(THREE, state, group, new THREE.BoxGeometry(6.2, .025, .12), trim, { y: .022, z });
  for (let z = -hd + 6; z < hd - 3; z += 4.2) {
    addMesh(THREE, state, group, new THREE.BoxGeometry(2.25, .035, 2.6), (Math.round(z) & 1) ? cloth : accent, { y: .045, z, receive: true });
    addMesh(THREE, state, group, new THREE.BoxGeometry(2.42, .022, .08), trim, { y: .052, z: z - 1.24 });
    addMesh(THREE, state, group, new THREE.BoxGeometry(2.42, .022, .08), trim, { y: .052, z: z + 1.24 });
  }

  // Actual window recesses: dark reveals, warm panes, stone lintels and mullions.
  const windowZ = []; for (let z = -hd + 5.75; z < hd - 2; z += 4.5) windowZ.push(z);
  for (const z of windowZ) for (const side of [-1, 1]) {
    const x = side * (hw - .09), ry = -side * Math.PI / 2;
    addMesh(THREE, state, group, new THREE.PlaneGeometry(2.25, 2.65), shade, { x, y: H - 2.1, z, ry, receive: false });
    addMesh(THREE, state, group, new THREE.PlaneGeometry(1.58, 2.0), trim, { x: x - side * .012, y: H - 2.1, z, ry, receive: false });
    addMesh(THREE, state, group, new THREE.PlaneGeometry(1.04, 1.42), glow, { x: x - side * .025, y: H - 2.1, z, ry, receive: false });
    addMesh(THREE, state, group, new THREE.BoxGeometry(.15, 1.72, .12), stone, { x: x - side * .04, y: H - 2.1, z, ry });
    addMesh(THREE, state, group, new THREE.BoxGeometry(.15, 1.32, .12), stone, { x: x - side * .04, y: H - 2.1, z, ry, rz: Math.PI / 2 });
  }

  // Layered wall textiles, narrow enough to preserve sightlines and the existing table.
  for (const side of [-1, 1]) for (const z of [-hd + 3.5, -1, hd - 5]) {
    addMesh(THREE, state, group, new THREE.BoxGeometry(.045, 2.2, 1.14), side > 0 ? cloth : accent, { x: side * (hw - .13), y: H - 3.35, z });
    for (let i = -2; i <= 2; i++) addMesh(THREE, state, group, new THREE.ConeGeometry(.055, .22, 5), trim, {
      x: side * (hw - .16), y: H - 4.52, z: z + i * .21, rz: Math.PI, ry: side * Math.PI / 2,
    });
  }

  // Bounded, inward-facing window light. Short range avoids illumination outside closed rooms.
  const lights = [];
  for (const side of [-1, 1]) for (const z of [-5.5, 5.5]) {
    const light = new THREE.SpotLight(style.warm, 14, 8, .52, .88, 1.7);
    const target = new THREE.Object3D();
    light.position.set(side * (hw - .85), H - 2.0, z);
    target.position.set(side * (hw - 4.2), 1.0, z + 1.2);
    light.target = target; light.castShadow = false; group.add(light, target);
    lights.push({ light, base: 14, kind: 'warm' });
  }
  for (const z of [-8, 7]) {
    const light = new THREE.SpotLight(style.cool, 22, 7, .62, .9, 1.7);
    const target = new THREE.Object3D(); light.position.set(0, H - .72, z);
    target.position.set(0, .4, z + 1.5); light.target = target; light.castShadow = false;
    group.add(light, target); lights.push({ light, base: 22, kind: 'cool' });
  }
  state.lights.push(...lights);
}

function envPhase(ch, env) {
  for (const name of ['envIn', 'envOut', 'envNight', 'envDawn']) if (ch[name] === env) return name.slice(3).toLowerCase();
  return 'base';
}

function applyProfile(game, state, env) {
  if (!state || state.disposed || game.ch !== game.__anthologyChapters[state.key]) return;
  const ch = game.ch, phase = envPhase(ch, env);
  const indoor = PALACE_KEYS.has(state.key) && phase !== 'out' && (phase === 'in' || state.key === 'mephibosheth' || state.key === 'nathan');
  state.phase = phase; state.indoor = indoor;
  game.anthologyRenderProfile = `anthology:${state.key}:${phase}${indoor ? ':palace' : ':outdoor'}`;

  game.sun.shadow.bias = -.0004; game.sun.shadow.normalBias = .035; game.sun.shadow.radius = 2;
  if (state.key === 'engedi') {
    // Detection cones and cover stay readable; never turn the gorge into opaque haze.
    game.fog.near = Math.max(game.fog.near, 44); game.fog.far = Math.max(game.fog.far, 245);
  }
  if (state.key === 'ziklag') {
    // Existing particle smoke is sufficient. Keep contrast and avoid additive haze layers.
    game.motes.mat.opacity = Math.min(game.motes.mat.opacity, phase === 'night' ? .58 : .42);
  }
  if (state.palace) {
    state.lights.forEach(({ light, base, kind }) => {
      light.intensity = indoor ? base * (phase === 'night' ? (kind === 'warm' ? .72 : .18) : 1) : 0;
    });
    if (state.palaceGlow) state.palaceGlow.emissiveIntensity = indoor ? (phase === 'night' ? .72 : .48) : .14;
    if (indoor) {
      // Warm apertures against a local cool shade, without a blanket exposure lift.
      const style = PALACE_STYLE[state.key];
      const coolMix = state.key === 'harp' ? .72 : state.key === 'nathan' ? .58 : .52;
      game.hemi.color.lerp(game.sun.color.clone().set(style.cool), coolMix);
      game.hemi.groundColor.lerp(game.sun.color.clone().set(0x34333c), coolMix * .72);
      game.hemi.intensity *= .76;
      const lampScale = state.key === 'harp' ? .54 : state.key === 'jonathan' ? .7 : .62;
      for (const lamp of state.palace.lights || []) {
        if (lamp.userData.anthologyBase == null) lamp.userData.anthologyBase = lamp.intensity;
        lamp.intensity = lamp.userData.anthologyBase * lampScale;
      }
      game.sun.shadow.radius = 2.4;
    }
  }
}

function cleanup(game) {
  const state = game.__anthologyWorld;
  if (!state || state.disposed) return;
  state.disposed = true;
  if (state.terrain && state.terrainOriginal) state.terrain.material = state.terrainOriginal;
  for (const { object, material } of state.replacements) if (object) object.material = material;
  if (state.root.parent) state.root.parent.remove(state.root);
  if (state.palace?.root) {
    const palaceGroup = state.palace.root.getObjectByName(`anthology-palace-${state.key}`);
    if (palaceGroup) state.palace.root.remove(palaceGroup);
  }
  for (const geometry of state.geometries) geometry.dispose();
  for (const material of state.materials) material.dispose();
  for (const { light } of state.lights) light.dispose?.();
  game.__anthologyWorld = null; game.anthologyRenderProfile = null;
}

/**
 * Install after the existing Chapter 1 storybook modules.
 *
 * Required:
 *   installAnthologyWorld({ THREE, Game, chapters })
 * where chapters is the explicit keyed object documented by the caller.
 * Optional arguments such as MAT, PROTO, U and IS_TOUCH are accepted so the
 * parent boot module can pass its normal renderer dependency bundle unchanged.
 */
export function installAnthologyWorld({ THREE, Game, chapters, IS_TOUCH = false, ...helpers }) {
  if (!THREE || !Game?.prototype || !chapters) throw new Error('installAnthologyWorld requires THREE, Game, and chapters');
  for (const key of REQUIRED_KEYS) if (!chapters[key]) throw new Error(`installAnthologyWorld missing chapters.${key}`);
  const proto = Game.prototype;
  if (proto.__anthologyWorldInstalled) return;
  Object.defineProperty(proto, '__anthologyWorldInstalled', { value: true });

  const chapterByObject = new Map(REQUIRED_KEYS.map(key => [chapters[key], key]));
  const originalLoadWorld = proto.loadWorld;
  const originalClearChapter = proto.clearChapter;
  const originalApplyEnv = proto.applyEnv;

  proto.clearChapter = function anthologyClearChapter(...args) {
    cleanup(this);
    return originalClearChapter.apply(this, args);
  };

  proto.loadWorld = function anthologyLoadWorld(...args) {
    const result = originalLoadWorld.apply(this, args);
    const key = chapterByObject.get(this.ch);
    this.__anthologyChapters = chapters;
    if (!key || key === 'bethlehem') return result;
    const state = makeState(THREE, this, key);
    terrainMaterial(THREE, state, this, key);
    addOutdoorClusters(THREE, state, this, key);
    if (PALACE_KEYS.has(key)) addPalaceArchitecture(THREE, state, this, key);
    applyProfile(this, state, this.ch.env);
    return result;
  };

  proto.applyEnv = function anthologyApplyEnv(env) {
    const result = originalApplyEnv.call(this, env);
    applyProfile(this, this.__anthologyWorld, env);
    return result;
  };

  // Expose only small diagnostics, not a parallel engine.
  proto.getAnthologyWorldStatus = function getAnthologyWorldStatus() {
    const state = this.__anthologyWorld;
    return state ? {
      key: state.key, phase: state.phase, indoor: state.indoor,
      geometries: state.geometries.size, materials: state.materials.size,
      lights: state.lights.length, touch: !!IS_TOUCH,
    } : null;
  };
}
