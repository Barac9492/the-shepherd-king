const REQUIRED_PIVOTS = ['root', 'body', 'legL', 'legR', 'armL', 'armR', 'head', 'handL', 'handR'];

function requireHuman(human) {
  if (!human || REQUIRED_PIVOTS.some(name => !human[name]) || typeof human.update !== 'function') {
    throw new TypeError('makeHuman must return the existing articulated human API.');
  }
  return human;
}

function detachHeadVisuals(head) {
  const removed = [];
  for (const child of [...head.children]) {
    if (!child.isMesh && !child.isLine && !child.isPoints) continue;
    head.remove(child);
    removed.push(child);
  }
  return removed;
}

function rearLathe(THREE, profile, segments = 18) {
  return new THREE.LatheGeometry(
    profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
    segments,
    Math.PI / 2,
    Math.PI,
  );
}

function rearMesh(THREE, name, geometry, material) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  result.userData.myShepherdOwnedVisual = true;
  result.userData.rearOnly = true;
  return result;
}

/**
 * Builds the Chapter 11 shepherd from the same makeHuman wrapper used by David,
 * Nathan, and the other storybook characters. The supplied factory may be the
 * ready storybook wrapper or the legacy factory; both expose the same live rig.
 */
export function createRearShepherd({ THREE, makeHuman } = {}) {
  if (!THREE || typeof makeHuman !== 'function') {
    throw new TypeError('THREE and makeHuman are required.');
  }

  const options = {
    skin: 0xb9825f,
    tunic: 0xeee5d4,
    sleeve: 0xe7dbc5,
    sash: 0x8a7358,
    hair: 0x30261f,
    beard: false,
    hat: null,
    scale: 1,
    simple: false,
    armor: false,
    staff: true,
    robeLen: 1.3,
    cloak: 0x9b8465,
    shield: false,
    storybookRole: 'jesus-rear',
  };
  const human = requireHuman(makeHuman(options));

  // Storybook heads are cached merged meshes containing face and hair together;
  // legacy heads are also a direct merged visual. Detach only this instance's
  // visual children. Never dispose their possibly shared geometry or material.
  const detachedHeadVisuals = detachHeadVisuals(human.head);
  const ownedDetachedGeometries = [...new Set(detachedHeadVisuals
    .filter(child => !child.userData.keepGeo && !child.geometry?.userData?.storybookShared)
    .map(child => child.geometry)
    .filter(Boolean))];
  let detachedGeometriesDisposed = false;
  human.ownedDetachedGeometries = ownedDetachedGeometries;
  human.disposeDetachedVisuals = () => {
    if (detachedGeometriesDisposed) return 0;
    detachedGeometriesDisposed = true;
    for (const geometry of ownedDetachedGeometries) geometry.dispose();
    return ownedDetachedGeometries.length;
  };

  const hairMaterial = new THREE.MeshStandardMaterial({
    name: 'MyShepherd_RearHair',
    color: options.hair,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const napeMaterial = new THREE.MeshStandardMaterial({
    name: 'MyShepherd_RearNape',
    color: options.skin,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  // Two smooth half-lathed shells form only the rear silhouette. The broad,
  // shoulder-length profile avoids a hood, cone, spikes, or a substitute face.
  const nape = rearMesh(THREE, 'rear-back-neck-shell', rearLathe(THREE, [
    [0.09, 0.055],
    [0.125, 0.015],
    [0.145, -0.095],
    [0.115, -0.225],
  ], 16), napeMaterial);
  nape.position.z = -0.012;

  const hair = rearMesh(THREE, 'rear-shoulder-hair-shell', rearLathe(THREE, [
    [0.035, 0.315],
    [0.135, 0.285],
    [0.215, 0.19],
    [0.252, 0.035],
    [0.248, -0.13],
    [0.215, -0.285],
    [0.155, -0.39],
  ], 22), hairMaterial);
  hair.position.z = -0.022;
  hair.scale.z = 1.07;

  human.head.add(nape, hair);

  const carryAnchor = new THREE.Group();
  carryAnchor.name = 'shepherd-carry-anchor';
  carryAnchor.position.set(-0.18, 1.27, 0.35);
  carryAnchor.rotation.set(-0.08, 0, 0.08);
  carryAnchor.userData.frontCarry = true;
  carryAnchor.userData.rearCameraVisibleOffset = true;
  human.body.add(carryAnchor);
  human.carryAnchor = carryAnchor;

  const initialPose = human.pose || 'auto';
  const initialStaffVisible = human.staff ? human.staff.visible !== false : false;
  let carrying = false;
  human.setCarrying = value => {
    const next = Boolean(value);
    if (next === carrying) return human;
    carrying = next;
    human.pose = carrying ? 'carryarms' : initialPose;
    if (human.staff) human.staff.visible = carrying ? false : initialStaffVisible;
    human.root.userData.carrying = carrying;
    return human;
  };

  human.root.name = human.root.name || 'rear-facing-shepherd';
  Object.assign(human.root.userData, {
    faceless: true,
    rearOnly: true,
    articulated: true,
    myShepherdCharacter: true,
  });

  // The base factory's storybook/legacy materials remain factory-owned. Chapter
  // cleanup should dispose only these two instance-local additions.
  human.ownedMaterials = [hairMaterial, napeMaterial];
  return human;
}
