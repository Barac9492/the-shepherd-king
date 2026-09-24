/** Decorative only: original house walls are ±.5, roof ±.52 with top y=1.03. */
export function createVillageDetails(THREE, placements) {
  const group = new THREE.Group();
  group.name = 'bethlehem-existing-village-details';
  const geometries = new Set(), materials = new Set(), meshes = [];
  let disposed = false;
  const result = { group, count: placements.length, dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const mesh of meshes) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
  // Do not allocate empty instanced buffers or compute empty bounds.
  if (!placements.length) return result;

  const box = new THREE.BoxGeometry(1, 1, 1);
  // Closed-section storage jar, including lip and inner neck, not a fantasy urn.
  const jar = new THREE.LatheGeometry([
    [0, 0], [.034, 0], [.047, .025], [.058, .072], [.047, .118],
    [.026, .143], [.026, .157], [.032, .158], [.032, .168],
    [.021, .168], [.019, .151], [.033, .116], [0, .108],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  geometries.add(box); geometries.add(jar);
  const batches = [
    { name: 'village-stone', geometry: box, color: 0xdfcda9, rows: [] },
    { name: 'village-recesses', geometry: box, color: 0x473b2d, rows: [] },
    { name: 'village-timbers', geometry: box, color: 0x71563a, rows: [] },
    { name: 'village-storage-jars', geometry: jar, color: 0xa96e49, rows: [] },
  ];
  const base = new THREE.Matrix4(), local = new THREE.Matrix4();
  const q = new THREE.Quaternion(), identity = new THREE.Quaternion();
  const p = new THREE.Vector3(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // Position-based hash is stable across placement reorderings and never consumes gameplay RNG.
  const hash = (t, salt) => {
    let n = (Math.round(t.x * 1000) ^ Math.imul(Math.round(t.z * 1000), 374761393) ^ salt) | 0;
    n = Math.imul(n ^ (n >>> 16), 2246822519);
    n = Math.imul(n ^ (n >>> 13), 3266489917);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  for (const t of placements) {
    const sx = t.sx ?? t.s ?? 1, sy = t.sy ?? t.s ?? 1, sz = t.sz ?? t.s ?? 1;
    q.setFromAxisAngle(up, t.ry || 0);
    base.compose(p.set(t.x, t.y, t.z), q, scale.set(sx, sy, sz));
    const tone = .94 + hash(t, 71) * .1;
    const add = (batch, x, y, z, w, h, d) => {
      local.compose(p.set(x, y, z), identity, scale.set(w, h, d));
      batches[batch].rows.push({ matrix: new THREE.Matrix4().multiplyMatrices(base, local), tone });
    };
    const height = .075 + Math.floor(hash(t, 13) * 3) * .035;
    // Continuous flat parapets with slightly higher masonry ends, not crenellations.
    for (const side of [-1, 1]) {
      add(0, side * .483, 1.03 + height / 2, 0, .064, height, .966);
      add(0, 0, 1.03 + height / 2, side * .483, .902, height, .064);
      for (const end of [-1, 1]) add(0, side * .479, 1.03 + (height + .027) / 2, end * .479, .072, height + .027, .072);
    }
    // Shallow dark panels plus projecting lintels/jambs suggest depth without cutting walls.
    const windowY = .75 + hash(t, 22) * .025;
    const windowH = .135 + hash(t, 23) * .03;
    for (const x of [-.29, .29]) {
      add(1, x, windowY, .503, .115, windowH, .006);
      add(0, x, windowY + windowH / 2 + .012, .508, .17, .033, .018);
      add(0, x, windowY - windowH / 2 - .008, .508, .153, .022, .018);
      for (const side of [-1, 1]) add(0, x + side * .066, windowY, .508, .018, windowH, .018);
      if (hash(t, 25) > .55) add(2, x, windowY, .51, .012, windowH, .01);
    }
    // Bethlehem door top ≈ house base + 1.3 burial offset + 1.7 door height.
    // Terrain at the doorway is unavailable here, so this is a visual header, not a new door.
    const doorTop = Math.min(.69, 3 / Math.max(Math.abs(sy), .001));
    const doorWidth = Math.min(.28, 1.16 / Math.max(Math.abs(sx), .001));
    add(0, 0, doorTop + .023, .508, doorWidth, .046, .02);
    for (const side of [-1, 1]) add(0, side * (doorWidth / 2 - .014), doorTop - .045, .508, .028, .09, .02);
    add(2, 0, doorTop - .005, .511, doorWidth - .04, .012, .012);

    // Exposed ends directly below the roof and a pair of stacked roof timbers.
    for (const x of [-.32, -.11, .11, .32]) add(2, x, .945, .505, .035, .03, .026);
    if (hash(t, 31) > .3) {
      for (const z of [-.16, -.09]) add(2, -.08, 1.05, z, .53, .04, .037);
    }
    // Small storage group at rear right; reserve the opposite corner for steps.
    if (hash(t, 41) > .32) {
      add(3, .28, 1.03, -.28, 1, 1, 1);
      if (hash(t, 42) > .48) add(3, .14, 1.03, -.32, .78, .84, .78);
    }
    // Modest three-block roof-access suggestion, never a new walkable stair/collider.
    if (hash(t, 51) > .64 && Math.abs(sx) >= 3 && Math.abs(sz) >= 3) {
      for (let step = 0; step < 3; step++) {
        const h = .035 * (step + 1);
        add(0, -.31, 1.03 + h / 2, -.13 - step * .087, .16, h, .085);
      }
    }
  }
  for (const batch of batches) {
    if (!batch.rows.length) continue;
    const material = new THREE.MeshStandardMaterial({ color: batch.color, roughness: 1 });
    materials.add(material);
    const mesh = new THREE.InstancedMesh(batch.geometry, material, batch.rows.length);
    mesh.name = batch.name;
    const color = new THREE.Color();
    batch.rows.forEach(({ matrix, tone }, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.setRGB(tone, tone, tone));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    group.add(mesh);
  }
  return result;
}
