/** A compact cave set, using the game's existing David/Saul character factory. */
export function buildEngediWorld(g, { THREE, CH3, makeHuman }) {
  const materials = new Set();
  const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .93, ...extra }); m.userData.engediOwned = true; materials.add(m); return m; };
  const stone = mat(0x6b6157), floor = mat(0x625c50), cloth = mat(0x695077), gold = mat(0xcaa967), cut = mat(0xf4dc9c, { emissive: 0x8a5f24, emissiveIntensity: .5 });
  const mesh = (geo, material, x, y, z) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.root.add(m); return m; };
  g.ch = { id: 92, title: { ko: '엔게디 챌린지', en: 'En-Gedi Challenge' }, ref: { ko: '사무엘상 24장', en: '1 Samuel 24' }, height: () => 0, groundOverride: () => 0 };
  g.chIdx = -1;
  g.applyEnv({ ...CH3.env, top: 0x191e2b, horizon: 0x414453, bottom: 0x26232c, fog: 0x252630, fogNear: 15, fogFar: 65, sunInt: .2, hemiInt: 1.1, exposure: 1.1, moteOpacity: .08 });
  const ground = mesh(new THREE.CircleGeometry(24, 40), floor, 0, -.02, 0); ground.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 17; i++) {
    const a = Math.PI * .05 + i / 16 * Math.PI * .95;
    const rock = mesh(new THREE.DodecahedronGeometry(2.5, 0), stone, Math.cos(a) * 7.5, 1.4 + i % 3 * .2, -4 - Math.sin(a) * 3);
    rock.scale.set(1, 1.8 + i % 2 * .4, 1); rock.rotation.set(.1 * i, .6 * i, .2);
  }
  for (let i = 0; i < 9; i++) { const r = mesh(new THREE.DodecahedronGeometry(.3 + i % 3 * .16), stone, (i % 2 ? -1 : 1) * (3.4 + i * .2), .12, 1 - i * .55); r.scale.y = .6; }
  const light = new THREE.PointLight(0xffd9a0, 48, 22, 1.5); light.position.set(-3, 4, 3); g.root.add(light);
  const rim = new THREE.PointLight(0x93b6dc, 30, 18, 1.4); rim.position.set(3, 3, -3); g.root.add(rim);
  g.setDavid({ ...CH3.david, staff: false }); g.placePlayer(-.75, .75, Math.PI * .82); g.david.pose = 'kneel';
  const saul = makeHuman({ tunic: 0x5b2a3a, cloak: 0x3a2a4a, hat: 'crown', beard: true, hair: 0x3a2a1e, beardColor: 0x4a3a2e, scale: 1.12 });
  saul.root.position.set(.65, 0, -.75); saul.root.rotation.y = Math.PI; saul.pose = 'sit'; g.root.add(saul.root);
  // A draped corner leads away from Saul, clearly separating cloth from the person.
  const hem = mesh(new THREE.BoxGeometry(1.15, .055, 1.28), cloth, .35, .21, .15); hem.rotation.y = -.25;
  const border = mesh(new THREE.BoxGeometry(1.1, .012, .075), gold, .2, .245, .73); border.rotation.y = -.25;
  const seam = mesh(new THREE.BoxGeometry(.01, .015, .028), cut, -.25, .255, .44); seam.rotation.y = -.25;
  const tool = mesh(new THREE.BoxGeometry(.24, .025, .055), mat(0xadb0ab), -.25, .29, .44);
  const handle = mesh(new THREE.BoxGeometry(.13, .05, .08), mat(0x644634), -.43, .29, .44);
  const corner = mesh(new THREE.BoxGeometry(.33, .045, .3), cloth, -.18, .24, .68); corner.rotation.y = -.25;
  // Character materials belong to the shared factory cache; only dispose our set.
  g.audio.setMood('cave');
  let disposed = false;
  g.onChapterCleanup(() => { disposed = true; for (const material of materials) material.dispose(); materials.clear(); });
  return {
    update(dt, state, speed) {
      if (disposed) return;
      g.player.speed = 0; g.syncDavid(); g.david.pose = 'kneel'; g.david.update(dt, 0); saul.update(dt, 0);
      const phase = state.tick * .01 * 15;
      if (speed && state.status === 'playing') { g.david.armR.rotation.x = -.85 + Math.sin(phase) * .07; g.david.armR.rotation.z = -.3; }
      saul.head.rotation.y += state.alert / 100000 * .2;
      seam.scale.x = Math.max(1, state.progress / 1000000 * 95);
      seam.position.x = -.25 + state.progress / 1000000 * .46;
      corner.visible = state.status !== 'success';
      tool.visible = handle.visible = state.status === 'playing' && speed > 0;
      tool.position.x = -.25 + state.progress / 1000000 * .9; handle.position.x = tool.position.x - .18;
      tool.position.z = handle.position.z = .44 + (speed ? Math.sin(phase) * .025 : 0);
    },
    camera() {
      const portrait = g.camera.aspect < 1;
      g.camera.position.set(4.6, portrait ? 3.5 : 3.8, portrait ? 6.7 : 6);
      g.camLook.set(0, portrait ? 1.55 : 1.15, -.05); g.camera.lookAt(g.camLook);
    },
  };
}
