import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// GLTFExporter uses the browser FileReader API even for binary, texture-free GLBs.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    error = null;
    onload = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        result => {
          this.result = result;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        },
        error => {
          this.error = error;
          this.onerror?.({ target: this });
          this.onloadend?.({ target: this });
        },
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        result => {
          const base64 = Buffer.from(result).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        },
        error => {
          this.error = error;
          this.onerror?.({ target: this });
          this.onloadend?.({ target: this });
        },
      );
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../assets/storybook');
const TAU = Math.PI * 2;

function material(name, color, roughness = 0.86) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  mat.name = name;
  return mat;
}

function transformed(geometry, {
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
} = {}) {
  let result = geometry.clone();
  const object = new THREE.Object3D();
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  object.scale.set(sx, sy, sz);
  object.updateMatrix();
  result.applyMatrix4(object.matrix);
  if (result.index) result = result.toNonIndexed();
  for (const key of Object.keys(result.attributes)) {
    if (key !== 'position' && key !== 'normal') result.deleteAttribute(key);
  }
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  return result;
}

function merged(parts) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Unable to merge compatible geometry parts.');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addMesh(parent, name, mat, parts) {
  const mesh = new THREE.Mesh(merged(parts), mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addSingleMesh(parent, name, mat, geometry) {
  return addMesh(parent, name, mat, [transformed(geometry)]);
}

function makeLoft(rings, radialSegments = 18, phase = 0) {
  const positions = [];
  const indices = [];
  const ringSize = radialSegments;
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j];
    for (let i = 0; i < radialSegments; i++) {
      const a = i / radialSegments * TAU;
      const wrinkle = 1 + (ring.wrinkle || 0) * Math.cos(a * (ring.wrinkleCount || 4) + phase + j * 0.45);
      positions.push(
        (ring.x || 0) + Math.cos(a) * ring.rx * wrinkle,
        ring.y + (ring.wave || 0) * Math.cos(a * (ring.waveCount || 5) + phase),
        (ring.z || 0) + Math.sin(a) * ring.rz * wrinkle,
      );
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const n = (i + 1) % radialSegments;
      const a = j * ringSize + i;
      const b = j * ringSize + n;
      const c = (j + 1) * ringSize + n;
      const d = (j + 1) * ringSize + i;
      indices.push(a, d, b, b, d, c);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(rings[0].x || 0, rings[0].y, rings[0].z || 0);
  const topCenter = positions.length / 3;
  const top = rings[rings.length - 1];
  positions.push(top.x || 0, top.y, top.z || 0);
  for (let i = 0; i < radialSegments; i++) {
    const n = (i + 1) % radialSegments;
    indices.push(bottomCenter, n, i);
    const a = (rings.length - 1) * ringSize + i;
    const b = (rings.length - 1) * ringSize + n;
    indices.push(topCenter, a, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeLeaf(length = 0.2, width = 0.08, thickness = 0.018) {
  const p = [
    0, 0, thickness,
    width, length * 0.42, 0,
    0, length, 0,
    -width, length * 0.42, 0,
    0, 0, -thickness,
  ];
  const i = [
    0, 1, 2, 0, 2, 3,
    4, 2, 1, 4, 3, 2,
    0, 4, 1, 0, 3, 4,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setIndex(i);
  geometry.computeVertexNormals();
  return geometry;
}

function tube(points, radius, tubularSegments = 12, radialSegments = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
}

function roundedBox(width, height, depth, radius = 0.03, segments = 2) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: segments,
    steps: 1,
    bevelSize: radius * 0.45,
    bevelThickness: radius * 0.45,
    curveSegments: 2,
  });
  geometry.center();
  return geometry;
}

function buildDavid() {
  const mats = {
    tunic: material('David_Tunic_Ochre', 0xa96f3e, 0.93),
    tunicLight: material('David_Tunic_Fold_Light', 0xc58b50, 0.95),
    tunicShadow: material('David_Tunic_Fold_Shadow', 0x74462d, 0.96),
    sash: material('David_Sash_Indigo', 0x344f67, 0.9),
    sashEdge: material('David_Sash_Edge', 0x233746, 0.93),
    skin: material('David_Skin', 0xc98458, 0.88),
    skinWarm: material('David_Skin_Warm', 0xa95f3f, 0.9),
    hair: material('David_Hair', 0x3d2018, 0.94),
    hairLight: material('David_Hair_Highlight', 0x6b3824, 0.94),
    eye: material('David_Eyes', 0x17110e, 0.78),
    sandal: material('David_Sandals', 0x54331f, 0.96),
    sandalLight: material('David_Sandal_Straps', 0x7a4d2c, 0.95),
    staff: material('David_Staff', 0x6f4527, 0.98),
    staffLight: material('David_Staff_Highlight', 0x9b6538, 0.96),
  };

  const root = new THREE.Group();
  root.name = 'StorybookDavid';
  root.userData.asset = 'storybook-david';
  root.userData.provenance = 'Original procedural artwork generated in-repo';

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const tunic = makeLoft([
    { y: 0.77, rx: 0.46, rz: 0.29, wave: 0.025, waveCount: 5, wrinkle: 0.025, wrinkleCount: 5 },
    { y: 0.94, rx: 0.42, rz: 0.27, wrinkle: 0.02, wrinkleCount: 5 },
    { y: 1.20, rx: 0.35, rz: 0.245, wrinkle: 0.025, wrinkleCount: 4 },
    { y: 1.47, rx: 0.33, rz: 0.23, wrinkle: 0.018, wrinkleCount: 4 },
    { y: 1.64, rx: 0.27, rz: 0.20 },
  ], 20, 0.25);
  addSingleMesh(body, 'tunic', mats.tunic, tunic);

  const frontFolds = [
    [[-0.24, 1.34, 0.225], [-0.25, 1.08, 0.265], [-0.30, 0.80, 0.29]],
    [[-0.08, 1.36, 0.238], [-0.06, 1.08, 0.276], [-0.10, 0.78, 0.305]],
    [[0.09, 1.36, 0.237], [0.07, 1.05, 0.277], [0.13, 0.79, 0.302]],
    [[0.24, 1.34, 0.222], [0.24, 1.06, 0.263], [0.29, 0.81, 0.286]],
  ];
  addMesh(body, 'tunic-fold-highlights', mats.tunicLight, frontFolds.map((curve, i) => transformed(tube(curve, i % 2 ? 0.018 : 0.014, 8, 5))));
  addMesh(body, 'tunic-fold-shadows', mats.tunicShadow, [
    transformed(tube([[-0.17, 1.29, 0.24], [-0.17, 1.03, 0.282], [-0.20, 0.80, 0.297]], 0.009, 7, 5)),
    transformed(tube([[0.18, 1.29, 0.238], [0.16, 1.04, 0.281], [0.20, 0.81, 0.296]], 0.009, 7, 5)),
  ]);

  const sashBand = makeLoft([
    { y: 1.115, rx: 0.375, rz: 0.272 },
    { y: 1.205, rx: 0.368, rz: 0.267 },
  ], 20, 0.1);
  const sashTail = makeLoft([
    { y: 0.74, x: 0.235, z: 0.286, rx: 0.075, rz: 0.025 },
    { y: 0.95, x: 0.22, z: 0.286, rx: 0.085, rz: 0.027 },
    { y: 1.15, x: 0.20, z: 0.278, rx: 0.095, rz: 0.03 },
  ], 8, 0.3);
  addMesh(body, 'sash', mats.sash, [transformed(sashBand), transformed(sashTail), transformed(new THREE.DodecahedronGeometry(0.105, 0), { x: 0.21, y: 1.15, z: 0.30, sx: 0.85, sy: 0.72, sz: 0.45 })]);
  addMesh(body, 'sash-edge', mats.sashEdge, [transformed(tube([[0.15, 0.74, 0.31], [0.14, 0.94, 0.31], [0.13, 1.10, 0.30]], 0.012, 6, 5))]);
  addMesh(body, 'neck', mats.skin, [transformed(new THREE.CylinderGeometry(0.085, 0.095, 0.18, 10), { y: 1.70 })]);

  const legL = new THREE.Group();
  legL.name = 'legL';
  legL.position.set(0.12, 0.9, 0);
  body.add(legL);
  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(-0.12, 0.9, 0);
  body.add(legR);

  for (const [leg, mirror] of [[legL, 1], [legR, -1]]) {
    addMesh(leg, 'calf', mats.skin, [
      transformed(new THREE.CapsuleGeometry(0.068, 0.52, 4, 8), { y: -0.43, rz: mirror * 0.015, sx: 0.95, sz: 0.92 }),
      transformed(new THREE.SphereGeometry(0.075, 10, 7), { y: -0.12, sy: 0.75 }),
    ]);
    addMesh(leg, 'sandal-sole', mats.sandal, [
      transformed(roundedBox(0.17, 0.29, 0.055, 0.035, 1), { y: -0.825, z: 0.065, rx: Math.PI / 2 }),
    ]);
    addMesh(leg, 'sandal-straps', mats.sandalLight, [
      transformed(new THREE.TorusGeometry(0.072, 0.014, 5, 12, Math.PI * 1.18), { y: -0.785, z: 0.075, rx: Math.PI / 2, ry: mirror * 0.18, rz: 0.45 }),
      transformed(tube([[0, -0.79, -0.015], [mirror * 0.015, -0.66, 0.01], [mirror * 0.035, -0.55, 0]], 0.014, 6, 5)),
    ]);
  }

  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.set(0.39, 1.52, 0);
  body.add(armL);
  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(-0.39, 1.52, 0);
  body.add(armR);

  function buildArm(arm, mirror) {
    addMesh(arm, 'sleeve', mats.tunic, [
      transformed(makeLoft([
        { y: -0.34, rx: 0.105, rz: 0.10 },
        { y: -0.08, rx: 0.14, rz: 0.13 },
        { y: 0.02, rx: 0.12, rz: 0.115 },
      ], 12, mirror * 0.2)),
    ]);
    addMesh(arm, 'forearm', mats.skin, [
      transformed(new THREE.CapsuleGeometry(0.074, 0.31, 4, 8), { y: -0.43, rz: mirror * 0.025, sx: 0.92, sz: 0.88 }),
    ]);
    const hand = new THREE.Group();
    hand.name = mirror > 0 ? 'handL' : 'handR';
    hand.position.y = -0.64;
    arm.add(hand);
    addMesh(hand, 'hand', mats.skin, [
      transformed(new THREE.SphereGeometry(0.082, 10, 7), { y: -0.015, sy: 1.14, sx: 0.88, sz: 0.8 }),
      transformed(new THREE.CapsuleGeometry(0.019, 0.055, 3, 6), { x: mirror * 0.055, y: -0.075, z: 0.005, rz: mirror * 0.22 }),
    ]);
    return hand;
  }

  const handL = buildArm(armL, 1);
  const handR = buildArm(armR, -1);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.86;
  body.add(head);

  addMesh(head, 'face', mats.skin, [
    transformed(new THREE.SphereGeometry(0.205, 18, 12), { sy: 1.08, sz: 0.92 }),
    transformed(new THREE.SphereGeometry(0.12, 14, 9), { y: -0.135, z: 0.018, sx: 0.92, sy: 0.62, sz: 0.82 }),
    transformed(new THREE.SphereGeometry(0.052, 10, 7), { x: 0.202, y: -0.01, sx: 0.5, sy: 1.05, sz: 0.74 }),
    transformed(new THREE.SphereGeometry(0.052, 10, 7), { x: -0.202, y: -0.01, sx: 0.5, sy: 1.05, sz: 0.74 }),
    transformed(new THREE.ConeGeometry(0.045, 0.135, 8), { y: -0.015, z: 0.205, rx: Math.PI / 2, sy: 0.9 }),
  ]);
  addMesh(head, 'face-warmth', mats.skinWarm, [
    transformed(new THREE.SphereGeometry(0.026, 8, 5), { x: 0.11, y: -0.055, z: 0.184, sx: 1.5, sy: 0.55, sz: 0.35 }),
    transformed(new THREE.SphereGeometry(0.026, 8, 5), { x: -0.11, y: -0.055, z: 0.184, sx: 1.5, sy: 0.55, sz: 0.35 }),
    transformed(tube([[-0.045, -0.12, 0.19], [0, -0.13, 0.202], [0.05, -0.115, 0.19]], 0.009, 5, 5)),
  ]);
  addMesh(head, 'eyes', mats.eye, [
    transformed(new THREE.SphereGeometry(0.025, 9, 6), { x: 0.071, y: 0.035, z: 0.185, sx: 1.0, sy: 0.8, sz: 0.45 }),
    transformed(new THREE.SphereGeometry(0.025, 9, 6), { x: -0.071, y: 0.035, z: 0.185, sx: 1.0, sy: 0.8, sz: 0.45 }),
  ]);

  const hairParts = [
    transformed(new THREE.SphereGeometry(0.225, 20, 11, 0, TAU, 0, Math.PI * 0.49), { y: 0.025, z: -0.014, rx: -0.10, sy: 1.02, sz: 1.03 }),
    transformed(new THREE.SphereGeometry(0.175, 16, 10), { y: -0.005, z: -0.115, sy: 1.12, sx: 1.10, sz: 0.72 }),
  ];
  const hairCurves = [
    [[-0.17, 0.12, 0.04], [-0.22, 0.02, 0.02], [-0.20, -0.13, -0.02]],
    [[-0.12, 0.18, 0.07], [-0.17, 0.07, 0.08], [-0.16, -0.12, 0.02]],
    [[-0.04, 0.205, 0.075], [-0.09, 0.11, 0.13], [-0.11, -0.04, 0.11]],
    [[0.04, 0.205, 0.075], [0.01, 0.11, 0.145], [-0.03, -0.02, 0.13]],
    [[0.12, 0.18, 0.065], [0.09, 0.08, 0.13], [0.07, -0.06, 0.10]],
    [[0.18, 0.12, 0.035], [0.19, 0.00, 0.06], [0.16, -0.14, -0.01]],
    [[0.19, 0.07, -0.06], [0.24, -0.04, -0.10], [0.19, -0.20, -0.11]],
    [[-0.19, 0.07, -0.07], [-0.24, -0.04, -0.11], [-0.19, -0.20, -0.12]],
  ];
  for (const curve of hairCurves) hairParts.push(transformed(tube(curve, 0.034, 8, 6)));
  addMesh(head, 'swept-hair', mats.hair, hairParts);
  addMesh(head, 'hair-highlights', mats.hairLight, [
    transformed(tube([[-0.12, 0.185, 0.09], [-0.04, 0.22, 0.11], [0.05, 0.20, 0.105]], 0.012, 6, 5)),
    transformed(tube([[0.11, 0.17, 0.085], [0.17, 0.09, 0.09], [0.16, -0.01, 0.075]], 0.011, 6, 5)),
  ]);
  addMesh(head, 'brows', mats.hair, [
    transformed(tube([[-0.105, 0.078, 0.192], [-0.07, 0.088, 0.202], [-0.035, 0.08, 0.196]], 0.009, 4, 5)),
    transformed(tube([[0.035, 0.08, 0.196], [0.07, 0.088, 0.202], [0.105, 0.078, 0.192]], 0.009, 4, 5)),
  ]);

  const staff = new THREE.Group();
  staff.name = 'staff';
  staff.position.set(0, 0, 0.05);
  staff.rotation.x = 1.45;
  handL.add(staff);
  addMesh(staff, 'crook-staff', mats.staff, [
    transformed(tube([
      [0, -0.72, 0], [0.005, -0.25, 0], [-0.015, 0.30, 0], [0.02, 0.82, 0],
      [0.04, 1.08, 0], [0.14, 1.20, 0], [0.27, 1.17, 0], [0.31, 1.06, 0], [0.25, 0.98, 0],
    ], 0.033, 28, 7)),
  ]);
  addMesh(staff, 'staff-highlight', mats.staffLight, [
    transformed(tube([[0.018, -0.58, 0.028], [0.018, -0.05, 0.028], [0.005, 0.46, 0.028], [0.035, 0.88, 0.028]], 0.007, 13, 5)),
  ]);

  // Keep handR deliberately free of props so the game's current and future sling
  // visuals can continue attaching to the same named pivot.
  handR.userData.attachment = 'sling-compatible';
  // Keep the legacy attachment transform while authoring the crook upright at rest.
  staff.traverse(node => { if (node.isMesh) node.geometry.rotateX(-1.45); });
  handL.userData.attachment = 'staff-compatible';

  root.updateMatrixWorld(true);
  return root;
}

function buildSheep() {
  const mats = {
    wool: material('Sheep_Wool', 0xe8dfc9, 0.99),
    woolShade: material('Sheep_Wool_Shade', 0xcbbfa7, 1),
    face: material('Sheep_Face', 0x4b4038, 0.98),
    muzzle: material('Sheep_Muzzle', 0x7b6859, 0.97),
    eye: material('Sheep_Eyes', 0x17130f, 0.8),
    hoof: material('Sheep_Hooves', 0x292522, 1),
  };

  const root = new THREE.Group();
  root.name = 'StorybookSheep';
  root.userData.asset = 'storybook-sheep';
  root.userData.provenance = 'Original procedural artwork generated in-repo';

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const woolLumps = [
    [0, 0.65, 0, 0.39, 0.34, 0.56, 0.1],
    [0.18, 0.69, 0.08, 0.28, 0.29, 0.38, 0.6],
    [-0.18, 0.68, 0.06, 0.29, 0.30, 0.39, 1.1],
    [0.16, 0.64, -0.25, 0.27, 0.28, 0.37, 1.7],
    [-0.16, 0.64, -0.25, 0.27, 0.28, 0.37, 2.2],
    [0.13, 0.66, 0.31, 0.26, 0.29, 0.32, 2.8],
    [-0.13, 0.66, 0.31, 0.26, 0.29, 0.32, 3.2],
    [0, 0.84, 0.02, 0.29, 0.26, 0.42, 3.8],
    [0, 0.55, -0.38, 0.25, 0.25, 0.28, 4.3],
  ];
  const woolGeometry = woolLumps.map(([x, y, z, sx, sy, sz, ry]) =>
    transformed(new THREE.IcosahedronGeometry(1, 1), { x, y, z, sx, sy, sz, ry }));
  woolGeometry.push(transformed(new THREE.IcosahedronGeometry(1, 1), { y: 0.73, z: -0.60, sx: 0.16, sy: 0.16, sz: 0.20, rx: -0.25 }));
  addMesh(body, 'rounded-wool-body', mats.wool, woolGeometry);
  addMesh(body, 'wool-shadow-lobes', mats.woolShade, [
    transformed(new THREE.IcosahedronGeometry(1, 1), { x: 0.23, y: 0.51, z: -0.07, sx: 0.16, sy: 0.16, sz: 0.27, ry: 0.7 }),
    transformed(new THREE.IcosahedronGeometry(1, 1), { x: -0.22, y: 0.54, z: 0.18, sx: 0.15, sy: 0.15, sz: 0.24, ry: 1.4 }),
  ]);

  const legSpecs = [
    ['legFL', 0.14, 0.42, 0.28],
    ['legFR', -0.14, 0.42, 0.28],
    ['legBL', 0.14, 0.42, -0.28],
    ['legBR', -0.14, 0.42, -0.28],
  ];
  for (const [name, x, y, z] of legSpecs) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, y, z);
    body.add(leg);
    addMesh(leg, 'leg-and-hoof', mats.face, [
      transformed(new THREE.CapsuleGeometry(0.044, 0.27, 3, 7), { y: -0.235, sx: 0.92, sz: 0.88 }),
      transformed(roundedBox(0.095, 0.12, 0.075, 0.018, 1), { y: -0.425, z: 0.025, rx: Math.PI / 2 }),
    ]);
  }

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.76, 0.36);
  body.add(head);
  addMesh(head, 'face', mats.face, [
    transformed(new THREE.SphereGeometry(0.18, 14, 10), { y: 0.015, z: 0.13, sx: 0.82, sy: 1.03, sz: 1.22, rx: -0.12 }),
    transformed(makeLeaf(0.22, 0.075, 0.02), { x: 0.13, y: 0.07, z: 0.05, rx: -0.55, ry: -0.55, rz: -1.10 }),
    transformed(makeLeaf(0.22, 0.075, 0.02), { x: -0.13, y: 0.07, z: 0.05, rx: -0.55, ry: 0.55, rz: 1.10 }),
  ]);
  addMesh(head, 'muzzle', mats.muzzle, [
    transformed(new THREE.SphereGeometry(0.115, 12, 8), { y: -0.045, z: 0.305, sx: 0.86, sy: 0.64, sz: 0.92 }),
    transformed(new THREE.SphereGeometry(0.028, 8, 5), { x: 0.038, y: -0.045, z: 0.397, sx: 0.55, sy: 0.7, sz: 0.32 }),
    transformed(new THREE.SphereGeometry(0.028, 8, 5), { x: -0.038, y: -0.045, z: 0.397, sx: 0.55, sy: 0.7, sz: 0.32 }),
  ]);
  addMesh(head, 'eyes', mats.eye, [
    transformed(new THREE.SphereGeometry(0.027, 8, 5), { x: 0.105, y: 0.075, z: 0.255, sx: 0.65, sy: 0.85, sz: 0.42 }),
    transformed(new THREE.SphereGeometry(0.027, 8, 5), { x: -0.105, y: 0.075, z: 0.255, sx: 0.65, sy: 0.85, sz: 0.42 }),
  ]);
  addMesh(head, 'forehead-wool', mats.wool, [
    transformed(new THREE.IcosahedronGeometry(1, 1), { x: 0, y: 0.17, z: 0.09, sx: 0.13, sy: 0.12, sz: 0.11 }),
    transformed(new THREE.IcosahedronGeometry(1, 1), { x: 0.085, y: 0.135, z: 0.08, sx: 0.095, sy: 0.09, sz: 0.09, ry: 0.7 }),
    transformed(new THREE.IcosahedronGeometry(1, 1), { x: -0.085, y: 0.135, z: 0.08, sx: 0.095, sy: 0.09, sz: 0.09, ry: 1.4 }),
  ]);
  head.userData.animation = 'Rotate +X toward 0.95 radians for grazing';

  root.updateMatrixWorld(true);
  return root;
}

function countTriangles(root) {
  let triangles = 0;
  let meshes = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    triangles += geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute('position').count / 3;
  });
  return { triangles: Math.round(triangles), meshes };
}

async function exportGLB(root, filename) {
  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(root, {
    binary: true,
    trs: true,
    onlyVisible: false,
    truncateDrawRange: true,
    includeCustomExtensions: false,
  });
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(path.join(OUT_DIR, filename), buffer);
  return buffer.length;
}

function hierarchy(root) {
  const names = [];
  root.traverse(object => {
    if (object.name) names.push(object.name);
  });
  return names;
}

await mkdir(OUT_DIR, { recursive: true });
const david = buildDavid();
const sheep = buildSheep();
const davidStats = countTriangles(david);
const sheepStats = countTriangles(sheep);

if (davidStats.triangles >= 12000) throw new Error(`David triangle budget exceeded: ${davidStats.triangles}`);
if (sheepStats.triangles >= 5000) throw new Error(`Sheep triangle budget exceeded: ${sheepStats.triangles}`);

const davidBytes = await exportGLB(david, 'david.glb');
const sheepBytes = await exportGLB(sheep, 'sheep.glb');
const manifest = {
  generator: 'scripts/build-storybook-assets.mjs',
  threeVersion: THREE.REVISION,
  deterministic: true,
  assets: {
    david: {
      file: 'david.glb',
      bytes: davidBytes,
      triangles: davidStats.triangles,
      meshes: davidStats.meshes,
      requiredPivots: ['body', 'legL', 'legR', 'armL', 'armR', 'head', 'handR', 'handL', 'staff'],
      hierarchy: hierarchy(david),
    },
    sheep: {
      file: 'sheep.glb',
      bytes: sheepBytes,
      triangles: sheepStats.triangles,
      meshes: sheepStats.meshes,
      requiredPivots: ['body', 'legFL', 'legFR', 'legBL', 'legBR', 'head'],
      hierarchy: hierarchy(sheep),
    },
  },
};
await writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(OUT_DIR, 'README.md'), `# Storybook character assets\n\nThese GLBs are original procedural artwork authored for **The Shepherd King**. They are generated deterministically by \`scripts/build-storybook-assets.mjs\` using Three.js r${THREE.REVISION} and GLTFExporter. No downloaded, paid, traced, or third-party character art is included.\n\n## Files\n\n- \`david.glb\`: young David with a folded tunic, woven sash, swept sculpted hair, readable face, sandals, hands, and crook staff.\n- \`sheep.glb\`: rounded clustered wool silhouette, articulated head, ears, muzzle, tail, and four named leg pivots.\n- \`manifest.json\`: generated sizes, triangle counts, mesh counts, and pivot names.\n\n## Runtime contract\n\nUse \`src/storybook-assets.js\`. Call \`await loadStorybookAssets()\` once, then pass an existing \`makeHuman(...)\` result to \`createStorybookDavid(...)\` or an existing \`makeQuadruped('sheep', ...)\` result to \`createStorybookSheep(...)\`. The adapters keep the existing controller/root objects, graft in shared GLB geometry, preserve David's hand/staff attachment transforms, and mark shared geometry with \`userData.keepGeo\` so chapter cleanup does not dispose cached assets.\n\n## Generated budgets\n\n- David: ${davidStats.triangles.toLocaleString('en-US')} triangles, ${davidStats.meshes} meshes, ${davidBytes.toLocaleString('en-US')} bytes.\n- Sheep: ${sheepStats.triangles.toLocaleString('en-US')} triangles, ${sheepStats.meshes} meshes, ${sheepBytes.toLocaleString('en-US')} bytes.\n\nRebuild with \`node scripts/build-storybook-assets.mjs\`.\n`);

console.log(JSON.stringify(manifest, null, 2));
