/*
 * Chapter 1 environment uplift for The Shepherd King.
 *
 * The art is intentionally procedural: low-poly forms, vertex colour, and a
 * few instanced silhouettes keep the miniature-book look without textures or
 * post-processing. Nothing here creates colliders or changes story state.
 */

const PATHS = [
  [[6, 44], [3, 20], [0, 4], [0, -2]],
  [[-2, -14], [-14, -26], [-28, -36], [-38, -43], [-44, -47]],
];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function positionHash(x, z) {
  let h = Math.imul(Math.round(x * 19), 374761393) ^ Math.imul(Math.round(z * 23), 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return (h ^ h >>> 16) >>> 0;
}

function transformGeometry(THREE, geometry, o = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
  matrix.compose(
    new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0),
    rotation,
    new THREE.Vector3(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1),
  );
  g.applyMatrix4(matrix);
  const c = new THREE.Color(o.color ?? 0xffffff);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function mergeColored(THREE, parts) {
  const converted = parts.map(({ geometry, ...o }) => transformGeometry(THREE, geometry, o));
  let count = 0;
  for (const g of converted) count += g.attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let offset = 0;
  for (const g of converted) {
    positions.set(g.attributes.position.array, offset * 3);
    normals.set(g.attributes.normal.array, offset * 3);
    colors.set(g.attributes.color.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function roughen(geometry, amount, seed) {
  const p = geometry.attributes.position;
  const r = seeded(seed);
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let d = cache.get(key);
    if (!d) {
      d = [(r() - 0.5) * amount, (r() - 0.5) * amount * 0.55, (r() - 0.5) * amount];
      cache.set(key, d);
    }
    p.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeOliveGeometry(THREE, variant) {
  const P = [];
  const trunk = variant ? 0x66513b : 0x5c4936;
  const leaf = variant ? [0x71805b, 0x87916a, 0x9aa17a] : [0x667955, 0x7e8d63, 0x929b72];
  P.push(
    { geometry: new THREE.CylinderGeometry(0.23, 0.39, 2.15, 7), y: 1.04, rz: variant ? -0.13 : 0.12, color: trunk },
    { geometry: new THREE.CylinderGeometry(0.12, 0.22, 1.55, 6), x: variant ? 0.35 : -0.3, y: 2.3, rz: variant ? -0.48 : 0.44, color: trunk },
    { geometry: new THREE.CylinderGeometry(0.1, 0.18, 1.35, 6), x: variant ? -0.31 : 0.34, y: 2.24, rz: variant ? 0.55 : -0.5, color: trunk },
  );
  const clusters = variant
    ? [[0, 3.05, 0, 1.0, .62], [1.0, 2.85, .15, .9, .55], [-.9, 2.8, -.15, .82, .58], [.35, 3.55, -.2, .82, .58], [1.15, 3.42, -.35, .68, .5], [-.5, 3.48, .5, .72, .54], [.1, 2.85, .85, .72, .48], [-.05, 2.95, -.9, .7, .5]]
    : [[0, 3.0, 0, 1.08, .58], [.95, 2.85, .38, .82, .55], [-1.0, 2.9, -.25, .88, .53], [.05, 3.6, .05, .82, .55], [.7, 3.42, -.65, .72, .48], [-.65, 3.38, .65, .75, .5], [1.15, 3.25, -.15, .62, .47], [-1.08, 3.35, .2, .62, .5]];
  clusters.forEach((v, i) => P.push({
    geometry: new THREE.IcosahedronGeometry(v[3], 0), x: v[0], y: v[1], z: v[2],
    sx: 1.08, sy: v[4], sz: .82 + (i % 3) * .08, ry: i * 0.71, color: leaf[i % leaf.length],
  }));
  return mergeColored(THREE, P);
}

function makeLimestoneGeometry(THREE, variant) {
  const box = new THREE.BoxGeometry(1.72, 0.9, 1.15, 2, 1, 1);
  roughen(box, variant ? 0.13 : 0.1, 70 + variant);
  return mergeColored(THREE, [
    // Keep the block centred on the original boulder's placement point so
    // the inherited two-course wall heights still sit against the terrain.
    { geometry: box, ry: variant ? 0.05 : -0.04, color: variant ? 0xc5b692 : 0xd0c19d },
    { geometry: new THREE.BoxGeometry(1.28, 0.06, .92), y: .46, x: variant ? .08 : -.07, color: variant ? 0xddd0ad : 0xe3d5b2 },
  ]);
}

function makePebbleGeometry(THREE) {
  return mergeColored(THREE, [
    { geometry: new THREE.DodecahedronGeometry(.22, 0), y: .12, sx: 1.25, sy: .62, sz: .9, color: 0xb9aa8d },
    { geometry: new THREE.DodecahedronGeometry(.13, 0), x: .26, z: .08, y: .08, sx: 1.1, sy: .55, color: 0xd2c19e },
    { geometry: new THREE.DodecahedronGeometry(.1, 0), x: -.23, z: -.05, y: .06, sy: .5, color: 0x9f927b },
  ]);
}

function own(state, resource) {
  if (resource?.isBufferGeometry) state.geometries.add(resource);
  if (resource?.isMaterial) state.materials.add(resource);
  return resource;
}

function makeState(THREE, game) {
  const group = new THREE.Group();
  group.name = 'chapter1-storybook-world';
  game.root.add(group);
  const state = {
    group, hidden: [], patches: [], geometries: new Set(), materials: new Set(),
    oliveGeo: [null, null], stoneGeo: [null, null], oliveMat: null, stoneMat: null,
    terrain: null, terrainOriginalMaterial: null, cameraPitchOriginal: null,
  };
  game.__storybookWorld = state;
  return state;
}

function instanced(THREE, state, geometry, material, list) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  list.forEach((t, i) => {
    euler.set(t.rx || 0, t.ry || 0, t.rz || 0);
    quaternion.setFromEuler(euler);
    const s = t.s ?? 1;
    scale.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
    matrix.compose(position.set(t.x, t.y, t.z), quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    if (t.tint != null) mesh.setColorAt(i, color.set(t.tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  state.group.add(mesh);
  return mesh;
}

function addEnhancedOlives(THREE, state, game, list) {
  if (!state.oliveMat) state.oliveMat = own(state, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: .96, metalness: 0,
  }));
  for (let v = 0; v < 2; v++) if (!state.oliveGeo[v]) state.oliveGeo[v] = own(state, makeOliveGeometry(THREE, v));
  const variants = [[], []];
  list.forEach(t => {
    const v = positionHash(t.x, t.z) & 1;
    variants[v].push(t);
    state.patches.push({ x: t.x, z: t.z, sx: 1.15 * (t.s || 1), sz: .78 * (t.s || 1), ry: t.ry || 0 });
  });
  variants.forEach((items, v) => {
    const mesh = instanced(THREE, state, state.oliveGeo[v], state.oliveMat, items);
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
}

function addLimestoneWalls(THREE, state, game, list) {
  if (!state.stoneMat) state.stoneMat = own(state, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
  }));
  for (let v = 0; v < 2; v++) if (!state.stoneGeo[v]) state.stoneGeo[v] = own(state, makeLimestoneGeometry(THREE, v));
  const variants = [[], []];
  list.forEach((t, i) => {
    variants[positionHash(t.x + i, t.z) & 1].push(t);
    if (i % 2 === 0) state.patches.push({ x: t.x, z: t.z, sx: .56, sz: .42, ry: t.ry || 0 });
  });
  variants.forEach((items, v) => {
    const mesh = instanced(THREE, state, state.stoneGeo[v], state.stoneMat, items);
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
}

function addPathBorders(THREE, state, game) {
  const r = seeded(1601);
  const P = [], N = [], C = [];
  const pebbles = [];
  const earth = [new THREE.Color(0xa58d63), new THREE.Color(0xb59a6c), new THREE.Color(0x8f7d5d)];
  const pushVertex = (x, z, color) => {
    P.push(x, game.groundAt(x, z) + .035, z); N.push(0, 1, 0); C.push(color.r, color.g, color.b);
  };
  for (const path of PATHS) for (let s = 0; s < path.length - 1; s++) {
    const [ax, az] = path[s], [bx, bz] = path[s + 1];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const nx = -dz / length, nz = dx / length;
    const steps = Math.max(2, Math.ceil(length / 1.7));
    for (let j = 0; j < steps; j++) {
      const t0 = j / steps, t1 = (j + 1) / steps;
      const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
      for (const side of [-1, 1]) {
        const inner = 1.55 + (r() - .5) * .12, outer = 2.35 + (r() - .5) * .22;
        const a0 = [x0 + nx * inner * side, z0 + nz * inner * side];
        const a1 = [x0 + nx * outer * side, z0 + nz * outer * side];
        const b0 = [x1 + nx * inner * side, z1 + nz * inner * side];
        const b1 = [x1 + nx * outer * side, z1 + nz * outer * side];
        const c0 = earth[(j + (side > 0 ? 1 : 0)) % earth.length], c1 = earth[(j + 1) % earth.length];
        pushVertex(...a0, c0); pushVertex(...b0, c1); pushVertex(...b1, c1);
        pushVertex(...a0, c0); pushVertex(...b1, c1); pushVertex(...a1, c0);
        if (r() > .3) {
          const t = (j + .25 + r() * .5) / steps;
          const x = ax + dx * t + nx * (1.9 + (r() - .5) * .45) * side;
          const z = az + dz * t + nz * (1.9 + (r() - .5) * .45) * side;
          pebbles.push({ x, y: game.groundAt(x, z) + .015, z, s: .65 + r() * .55, sy: .7 + r() * .35, ry: r() * Math.PI * 2, tint: [0xb7a887, 0xc9b993, 0x988b74][Math.floor(r() * 3)] });
        }
      }
    }
  }
  const geometry = own(state, new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geometry.computeBoundingSphere();
  const material = own(state, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  const borders = new THREE.Mesh(geometry, material);
  borders.receiveShadow = true;
  state.group.add(borders);

  const pebbleGeo = own(state, makePebbleGeometry(THREE));
  const pebbleMat = own(state, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  const pebbleMesh = instanced(THREE, state, pebbleGeo, pebbleMat, pebbles);
  if (pebbleMesh) { pebbleMesh.castShadow = false; pebbleMesh.receiveShadow = true; }
}

function addContactPatches(THREE, state, game) {
  if (!state.patches.length) return;
  const geo = own(state, new THREE.CircleGeometry(1, 18));
  geo.rotateX(-Math.PI / 2);
  const mat = own(state, new THREE.MeshBasicMaterial({
    color: 0x59482f, transparent: true, opacity: .115, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  const items = state.patches.map(t => ({ ...t, y: game.groundAt(t.x, t.z) + .025, sx: t.sx, sy: 1, sz: t.sz }));
  const patches = instanced(THREE, state, geo, mat, items);
  if (patches) { patches.castShadow = false; patches.receiveShadow = false; patches.renderOrder = 1; }
}

function enhanceTerrain(THREE, state, game, MAT) {
  if (!game.terrain || state.terrain) return;
  const base = game.terrain.material || MAT?.vc;
  if (!base?.clone) return;
  const material = own(state, base.clone());
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    if (previous) previous(shader);
    shader.vertexShader = `varying vec3 vStoryWorld;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vStoryWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = `varying vec3 vStoryWorld;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float storyNear = 1.0 - smoothstep(22.0, 78.0, distance(vStoryWorld, cameraPosition));
       float woven = sin(vStoryWorld.x * 1.37 + sin(vStoryWorld.z * .41))
                   * sin(vStoryWorld.z * 1.11 - sin(vStoryWorld.x * .33));
       float broad = sin(vStoryWorld.x * .16 + vStoryWorld.z * .11) * .5 + .5;
       diffuseColor.rgb *= 1.0 + storyNear * (woven * .018 + (broad - .5) * .014);
       diffuseColor.rgb += storyNear * vec3(.010, .006, -.004) * (1.0 - abs(woven));`,
    );
  };
  material.customProgramCacheKey = () => 'chapter1-storybook-terrain-v1';
  material.needsUpdate = true;
  state.terrain = game.terrain;
  state.terrainOriginalMaterial = base;
  game.terrain.material = material;
  game.terrain.receiveShadow = true;
}

function addCoolFill(THREE, state, game) {
  const fill = new THREE.DirectionalLight(0x9dbfe2, .34);
  fill.castShadow = false;
  const target = fill.target;
  state.group.add(fill, target);
  const sync = () => {
    const p = game.mode === 'play' ? game.player.pos : game.camLook;
    fill.position.set(p.x - 75, p.y + 48, p.z + 88);
    target.position.set(p.x, p.y + 2, p.z);
  };
  sync();
  game.every(() => { sync(); });
}

function finishChapterOne(THREE, state, game, MAT) {
  enhanceTerrain(THREE, state, game, MAT);
  addPathBorders(THREE, state, game);
  addContactPatches(THREE, state, game);
  addCoolFill(THREE, state, game);
  if (game.cam && !game.aiming) {
    state.cameraPitchOriginal = game.cam.pitch;
    game.cam.pitch = Math.max(game.cam.pitch, .36);
  }
}

function cleanup(game) {
  const state = game.__storybookWorld;
  if (!state) return;
  if (state.terrain && state.terrainOriginalMaterial) state.terrain.material = state.terrainOriginalMaterial;
  if (state.cameraPitchOriginal != null && game.cam) game.cam.pitch = state.cameraPitchOriginal;
  for (const object of state.hidden) object.visible = true;
  if (state.group.parent) state.group.parent.remove(state.group);
  for (const geometry of state.geometries) geometry.dispose();
  for (const material of state.materials) material.dispose();
  game.__storybookWorld = null;
}

function setCameraFov(game, CH1) {
  const portrait = typeof innerWidth !== 'undefined' && innerWidth < innerHeight;
  const base = portrait ? 68 : 55;
  const desired = game.ch === CH1 && game.mode === 'play' && !game.aiming ? (portrait ? 64 : 51) : base;
  if (Math.abs(game.camera.fov - desired) > .01) {
    game.camera.fov = desired;
    game.camera.updateProjectionMatrix();
  }
}

/**
 * Install once after Game and CH1 have been defined.
 * Required contract: installStorybookWorld({ THREE, Game, CH1, MAT }).
 */
export function installStorybookWorld({ THREE, Game, CH1, MAT }) {
  if (!THREE || !Game?.prototype || !CH1) throw new Error('installStorybookWorld requires THREE, Game, and CH1');
  const proto = Game.prototype;
  if (proto.__storybookWorldInstalled) return;
  Object.defineProperty(proto, '__storybookWorldInstalled', { value: true });

  const originalPlace = proto.place;
  const originalLoadWorld = proto.loadWorld;
  const originalClearChapter = proto.clearChapter;
  const originalApplyEnv = proto.applyEnv;
  const originalUpdateCamera = proto.updateCamera;
  const originalResize = proto.resize;

  proto.place = function storybookPlace(protoName, list, options = {}) {
    const placed = originalPlace.call(this, protoName, list, options);
    if (this.ch !== CH1) return placed;
    if (['olive', 'boulder', 'rock', 'house', 'bush', 'cypress', 'door', 'jar', 'post'].includes(protoName)) placed.receiveShadow = true;
    const state = this.__storybookWorld || makeState(THREE, this);
    if (protoName === 'olive') {
      placed.visible = false; state.hidden.push(placed);
      addEnhancedOlives(THREE, state, this, list);
    } else if (protoName === 'boulder') {
      // CH1 uses boulders only for the sheepfold and Jesse's courtyard walls.
      placed.visible = false; state.hidden.push(placed);
      addLimestoneWalls(THREE, state, this, list);
    }
    return placed;
  };

  proto.loadWorld = function storybookLoadWorld(...args) {
    const result = originalLoadWorld.apply(this, args);
    if (this.ch === CH1) {
      const state = this.__storybookWorld || makeState(THREE, this);
      finishChapterOne(THREE, state, this, MAT);
    }
    return result;
  };

  proto.clearChapter = function storybookClearChapter(...args) {
    cleanup(this);
    return originalClearChapter.apply(this, args);
  };

  proto.applyEnv = function storybookApplyEnv(env) {
    const result = originalApplyEnv.call(this, env);
    if (this.ch === CH1) {
      this.sun.color.set(0xffd39a);
      this.sun.intensity = Math.max(this.sun.intensity, 2.95);
      this.hemi.color.set(0xacc9e7);
      this.hemi.groundColor.set(0x746b50);
      this.hemi.intensity = .62;
      this.sun.shadow.bias = -.00035;
      this.sun.shadow.normalBias = .035;
      this.sun.shadow.radius = 2;
    } else {
      this.sun.shadow.bias = -.0005;
      this.sun.shadow.normalBias = .05;
      this.sun.shadow.radius = 1;
    }
    return result;
  };

  proto.updateCamera = function storybookUpdateCamera(dt) {
    const result = originalUpdateCamera.call(this, dt);
    setCameraFov(this, CH1); // Sling aiming and every other chapter retain the engine FOV.
    if (this.ch === CH1 && !this.aiming && !this.cine && this.cineW < .01) {
      // Keep the view in front of a rising hillside instead of looking through it.
      // Sample the existing collision terrain; no raycast across the whole mesh.
      const from = this.camLook, to = this.camera.position;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      for (let i = 2; i <= 16; i++) {
        const t = i / 16, x = from.x + dx * t, z = from.z + dz * t;
        if (from.y + dy * t < this.groundAt(x, z) + .5) {
          const safe = Math.max(.18, t - .09);
          to.set(from.x + dx * safe, from.y + dy * safe, from.z + dz * safe);
          break;
        }
      }
      to.y = Math.max(to.y, this.groundAt(to.x, to.z) + .85);
      this.camera.lookAt(from);
    }
    return result;
  };

  proto.resize = function storybookResize(...args) {
    const result = originalResize.apply(this, args);
    setCameraFov(this, CH1);
    return result;
  };
}
