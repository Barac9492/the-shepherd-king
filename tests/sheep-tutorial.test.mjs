import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { installSheepTutorial } from '../src/sheep-tutorial.js';

const FOLD = [0, -8];
const EXPECTED_ADULT_SPOTS = [
  [-4, 30],
  [13, 26],
  [5, 31],
  [5, 23],
  [4, 18],
  [3, 12],
];

function makeActor(x, z) {
  return {
    m: { graze: 0 },
    pos: new THREE.Vector3(x, 0, z),
    dest: new THREE.Vector3(x + 1, 0, z + 1),
    speed: 0.7,
    walkSpeed: 0.7,
    stopCalls: 0,
    syncCalls: 0,
    stop() { this.stopCalls++; this.dest = null; this.speed = 0; },
    sync() { this.syncCalls++; },
  };
}

function makeChapter() {
  const originalSpots = [[-4, 30], [13, 26], [-36, 16], [38, -8], [26, -52], [-30, -28]];
  const originalReturn = Symbol('original-build-return');
  const chapter = {
    id: 1,
    originalBuildCalls: 0,
    build(game) {
      this.originalBuildCalls++;
      const sheep = originalSpots.map(([x, z], index) => ({
        a: makeActor(x, z),
        st: 'graze',
        home: [x, z],
        t: index,
      }));
      const lamb = {
        a: makeActor(48, -42),
        st: 'graze',
        home: [48, -42],
        t: 0,
        lamb: true,
        noFollow: true,
      };
      sheep.push(lamb);
      this.s = {
        sheep,
        lamb,
        lion: { targetHits: 3, ammo: 5, refillSeconds: 1.2, carrySpeed: 2.2 },
        inFold: 0,
        canFollow: true,
        lionHits: 0,
      };
      game.every(() => { game.originalSheepUpdaterCalls++; });
      return originalReturn;
    },
  };
  return { chapter, originalReturn };
}

function makeGame(chapter, { lifecycle = true } = {}) {
  const game = {
    ch: chapter,
    mode: 'play',
    paused: false,
    dq: null,
    lock: false,
    sling: false,
    cine: null,
    player: { pos: new THREE.Vector3(80, 0, 80) },
    root: new THREE.Group(),
    beam: { visible: false },
    waypoint: null,
    updaters: [],
    cleanups: [],
    objectiveCalls: 0,
    originalSheepUpdaterCalls: 0,
    clearCalls: 0,
    groundAt() { return 0; },
    add(object) { this.root.add(object); return object; },
    every(fn) { this.updaters.push(fn); },
    setWaypoint(waypoint) { this.waypoint = waypoint; this.beam.visible = Boolean(waypoint); },
    setObjective() { this.objectiveCalls++; },
    clearChapter() { this.clearCalls++; },
  };
  if (lifecycle) game.onChapterCleanup = fn => game.cleanups.push(fn);
  return game;
}

function runTutorial(game, dt = 1 / 60) {
  return game.sheepTutorial.updater(dt);
}

function resolvedWaypoint(game) {
  return typeof game.waypoint === 'function' ? game.waypoint() : game.waypoint;
}

test('post-build wrapper preserves authored return/rules and relocates only the six adults', () => {
  const { chapter, originalReturn } = makeChapter();
  const installed = installSheepTutorial({ THREE, CH1: chapter, FOLD });
  assert.equal(installSheepTutorial({ THREE, CH1: chapter, FOLD }), installed);

  const game = makeGame(chapter);
  const result = chapter.build(game);
  assert.equal(result, originalReturn);
  assert.equal(chapter.originalBuildCalls, 1);
  assert.equal(game.updaters.length, 2, 'authored sheep updater remains and tutorial appends one updater');

  const adults = chapter.s.sheep.slice(0, 6);
  assert.deepEqual(adults.map(sheep => [sheep.a.pos.x, sheep.a.pos.z]), EXPECTED_ADULT_SPOTS);
  assert.deepEqual(adults.map(sheep => sheep.home), EXPECTED_ADULT_SPOTS);
  assert.ok(adults.every(sheep => Math.hypot(sheep.a.pos.x - FOLD[0], sheep.a.pos.z - FOLD[1]) > 12));
  assert.ok(adults.every(sheep => sheep.a.stopCalls === 1 && sheep.a.syncCalls === 1));

  assert.deepEqual(chapter.s.lamb.a.pos.toArray(), [48, 0, -42]);
  assert.deepEqual(chapter.s.lamb.home, [48, -42]);
  assert.equal(chapter.s.lamb.noFollow, true);
  assert.deepEqual(chapter.s.lion, { targetHits: 3, ammo: 5, refillSeconds: 1.2, carrySpeed: 2.2 });
  assert.equal(chapter.s.inFold, 0);
  assert.equal(game.objectiveCalls, 0, 'tutorial never replaces the authored 7-sheep objective');
});

test('nearest adult guidance, 8m recruitment, fold return, and bounded graze upkeep are behavioral', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter);
  chapter.build(game);
  const state = chapter.s;
  const adults = state.sheep.slice(0, 6);

  game.player.pos.set(60, 0, 60);
  runTutorial(game);
  const nearest = adults.reduce((best, sheep) => {
    const distance = sheep.a.pos.distanceToSquared(game.player.pos);
    return !best || distance < best.distance ? { sheep, distance } : best;
  }, null).sheep;
  assert.equal(resolvedWaypoint(game), nearest.a.pos);
  assert.equal(game.sheepTutorial.marker.visible, true);
  assert.equal(game.sheepTutorial.marker.position.x, nearest.a.pos.x);
  assert.equal(game.sheepTutorial.marker.position.z, nearest.a.pos.z);

  for (const sheep of adults.slice(1)) sheep.st = 'fold';
  const target = adults[0];
  target.st = 'graze';
  target.a.pos.set(target.home[0], 0, target.home[1]);
  game.player.pos.set(target.a.pos.x + 7.9, 0, target.a.pos.z);
  const beforeCount = state.inFold;
  runTutorial(game);
  assert.equal(target.st, 'follow');
  assert.equal(state.inFold, beforeCount, 'recruitment does not count a sheep or bypass the fold');
  assert.deepEqual(resolvedWaypoint(game).toArray(), [FOLD[0], 0, FOLD[1]]);

  target.st = 'graze';
  target.a.pos.set(target.home[0] + 6, 0, target.home[1]);
  target.a.dest = new THREE.Vector3(target.home[0] + 20, 0, target.home[1]);
  game.player.pos.set(80, 0, 80);
  runTutorial(game);
  assert.ok(Math.hypot(target.a.dest.x - target.home[0], target.a.dest.z - target.home[1]) < 0.001);
  assert.equal(target.a.walkSpeed, 1.1);
  assert.ok(game.sheepTutorial.diagnostics.boundedReturns >= 1);
});

test('adapter yields during dialogue, lock, sling, cinema, pause, non-play, and canFollow false', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter);
  chapter.build(game);

  game.player.pos.set(60, 0, 60);
  runTutorial(game);
  assert.equal(typeof game.waypoint, 'function');

  for (const [field, value] of [
    ['dq', {}],
    ['lock', true],
    ['sling', true],
    ['cine', {}],
    ['paused', true],
    ['mode', 'intro'],
  ]) {
    game.dq = null; game.lock = false; game.sling = false; game.cine = null; game.paused = false; game.mode = 'play';
    runTutorial(game);
    assert.equal(typeof game.waypoint, 'function');
    game[field] = value;
    runTutorial(game);
    assert.equal(game.waypoint, null, field + ' clears only the tutorial waypoint');
    assert.equal(game.sheepTutorial.marker.visible, false, field + ' hides the tutorial marker');
  }

  game.mode = 'play'; game.paused = false;
  runTutorial(game);
  chapter.s.canFollow = false;
  runTutorial(game);
  assert.equal(game.waypoint, null);
  assert.equal(game.sheepTutorial.marker.visible, false);

  const adult = chapter.s.sheep[0];
  adult.st = 'graze';
  game.player.pos.copy(adult.a.pos);
  runTutorial(game);
  assert.equal(adult.st, 'graze', 'canFollow=false disables extended recruitment');

  chapter.s.canFollow = true;
  game.sling = true;
  runTutorial(game);
  assert.equal(adult.st, 'graze', 'sling mode disables extended recruitment');

  const authoredLionWaypoint = () => chapter.s.lion;
  game.setWaypoint(authoredLionWaypoint);
  runTutorial(game);
  assert.equal(game.waypoint, authoredLionWaypoint, 'inactive adapter does not clear the authored lion waypoint');
});

test('lamb is ignored until release, then follows without an unreachable proximity gate', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter);
  chapter.build(game);
  const state = chapter.s;
  const adults = state.sheep.slice(0, 6);
  adults.forEach(sheep => { sheep.st = 'fold'; });
  state.inFold = 6;
  game.player.pos.copy(state.lamb.a.pos);

  runTutorial(game);
  assert.equal(game.waypoint, null, 'captured lamb is not a tutorial target');
  assert.equal(state.lamb.st, 'graze', 'captured lamb cannot be recruited by the adapter');

  game.player.pos.set(70, 0, 70);
  state.lamb.noFollow = false;
  runTutorial(game);
  assert.equal(state.lamb.st, 'follow');
  assert.equal(state.inFold, 6);
  assert.deepEqual(resolvedWaypoint(game).toArray(), [FOLD[0], 0, FOLD[1]]);

  state.inFold = 7;
  assert.equal(runTutorial(game), false);
  assert.equal(game.waypoint, null);
  assert.equal(game.sheepTutorial.marker.visible, false);

  const familyWaypoint = new THREE.Vector3(-46, 0, -47);
  game.setWaypoint(familyWaypoint);
  assert.equal(runTutorial(game), false);
  assert.equal(game.waypoint, familyWaypoint, 'completed tutorial cannot overwrite servant/family guidance');
});

test('rescued lamb waits through story/input locks, while distant ordinary sheep still need proximity', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter);
  chapter.build(game);
  const state = chapter.s;
  const lamb = state.lamb;
  lamb.a.pos.set(125, 0, -100);
  lamb.home = [125, -100];
  lamb.noFollow = false;
  game.player.pos.set(0, 0, 0);

  for (const [field, value, normal] of [
    ['dq', {}, null], ['lock', true, false], ['sling', true, false],
    ['cine', {}, null], ['paused', true, false], ['mode', 'intro', 'play'],
  ]) {
    game[field] = value;
    runTutorial(game);
    assert.equal(lamb.st, 'graze', `${field} must still gate rescue recruitment`);
    game[field] = normal;
  }
  state.canFollow = false;
  runTutorial(game);
  assert.equal(lamb.st, 'graze');
  state.canFollow = true;
  lamb.st = 'carried';
  runTutorial(game);
  assert.equal(lamb.st, 'carried', 'the lion must release the lamb before it can follow');

  lamb.st = 'graze';
  runTutorial(game);
  assert.equal(lamb.st, 'follow');
  assert.ok(state.sheep.slice(0, 6).every(sheep => sheep.st === 'graze'));
  assert.equal(state.inFold, 0, 'automatic rescue recruitment never grants fold credit');
});

// Use the real authored Actor and sheep updater, rather than a second model of
// their movement/counting rules, to exercise the complete recovery path.
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const actorSource = source.slice(source.indexOf('class Actor {'), source.indexOf('\nclass Game {'));
const sheepStart = source.indexOf('    // sheep AI\n');
const sheepSource = source.slice(sheepStart, source.indexOf('\n  },\n  async run(g)', sheepStart));
const boundSource = source.match(/  bound\(x, z\) \{ const r = Math\.hypot\(x, z\); return r > 104[^\n]+/)[0];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dampF = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrapA = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const AuthoredActor = new Function('V3', 'clamp', 'dampF', 'wrapA', 'lerp', `${actorSource}; return Actor;`)(
  THREE.Vector3, clamp, dampF, wrapA, (a, b, t) => a + (b - a) * t,
);
const runAuthoredSheep = new Function('S', 'g', 'V3', 'TAU', 'clamp', 'FOLD', sheepSource);
const bound = new Function(`return ({ ${boundSource} }).bound;`)();

for (const [x, z] of [[120, 0], [90, -110], [-125, -90], [300, 300]]) {
  test(`released lamb at (${x}, ${z}) outside David's boundary walks back and counts exactly once`, () => {
    const { chapter } = makeChapter();
    installSheepTutorial({ THREE, CH1: chapter, FOLD });
    const game = makeGame(chapter);
    chapter.build(game);
    const state = chapter.s;
    const lamb = state.lamb;
    state.sheep.slice(0, 6).forEach(sheep => { sheep.st = 'fold'; });
    state.inFold = 6;
    game.actors = [];
    game.audio = { sfx() {} };
    game.particles = { emit() {} };
    lamb.a = new AuthoredActor(game, { root: new THREE.Group(), update() {} }, x, z);
    lamb.home = [x, z];
    lamb.t = 5;
    lamb.noFollow = false;
    const [px, pz] = bound(x, z);
    game.player.pos.set(px, 0, pz);
    game.player.yaw = 0;
    assert.ok(Math.hypot(x - px, z - pz) > 8, 'even the nearest allowed player position cannot recruit the old way');

    game.updaters = [];
    runAuthoredSheep(state, game, THREE.Vector3, Math.PI * 2, clamp, FOLD);
    const authoredUpdate = game.updaters[0];
    const tick = () => {
      const before = lamb.a.pos.clone();
      lamb.a.update(0.05);
      authoredUpdate(0.05);
      runTutorial(game, 0.05);
      assert.ok(lamb.a.pos.distanceTo(before) <= 8.6 * 0.05 + 1e-8, 'rescue walks normally, never teleports');
    };
    tick();
    assert.equal(lamb.st, 'follow');
    assert.equal(state.inFold, 6);
    assert.deepEqual(lamb.home, [x, z], 'the authored drop location is not rewritten');
    for (let i = 0; i < 1800 && lamb.a.pos.distanceTo(game.player.pos) > 4; i++) tick();
    assert.ok(lamb.a.pos.distanceTo(game.player.pos) < 4, 'the lamb returns to reachable ground');

    for (const [tx, tz] of [[0, 0], FOLD]) {
      for (let i = 0; i < 1000; i++) {
        const dx = tx - game.player.pos.x, dz = tz - game.player.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.01) break;
        const step = Math.min(distance, 4.8 * 0.05);
        const [nx, nz] = bound(game.player.pos.x + dx / distance * step, game.player.pos.z + dz / distance * step);
        game.player.pos.set(nx, 0, nz);
        game.player.yaw = Math.atan2(dx, dz);
        tick();
      }
    }
    for (let i = 0; i < 100; i++) tick();
    assert.equal(lamb.st, 'fold');
    assert.equal(state.inFold, 7, 'existing fold entry completes the seven-sheep objective exactly once');
  });
}

test('chapter cleanup disposes marker resources once and reload replaces prior state', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter);
  chapter.build(game);
  const first = game.sheepTutorial;
  first.lamb.noFollow = false;
  first.lamb.st = 'follow';
  first.lamb.a.pos.set(120, 0, -90);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  first.marker.traverse(object => {
    object.geometry?.addEventListener('dispose', () => { geometryDisposals++; });
    object.material?.addEventListener('dispose', () => { materialDisposals++; });
  });

  assert.equal(game.cleanups.length, 1);
  game.cleanups[0]();
  first.dispose();
  assert.equal(first.diagnostics.disposed, true);
  assert.equal(game.sheepTutorial, null);
  assert.equal(first.marker.parent, null);
  assert.equal(geometryDisposals, 2);
  assert.equal(materialDisposals, 2);

  chapter.build(game);
  assert.notEqual(game.sheepTutorial, first);
  assert.equal(game.cleanups.length, 2);
  assert.equal(game.sheepTutorial.lamb.noFollow, true, 'restart restores the authored rescue gate');
  assert.equal(game.sheepTutorial.lamb.st, 'graze');
  assert.deepEqual(game.sheepTutorial.lamb.a.pos.toArray(), [48, 0, -42]);
  runTutorial(game);
  assert.equal(game.sheepTutorial.lamb.st, 'graze', 'a prior rescue does not leak into a restarted chapter');
});

test('legacy games without onChapterCleanup clean up through clearChapter and support direct reload', () => {
  const { chapter } = makeChapter();
  installSheepTutorial({ THREE, CH1: chapter, FOLD });
  const game = makeGame(chapter, { lifecycle: false });
  const originalClear = game.clearChapter;

  chapter.build(game);
  const first = game.sheepTutorial;
  assert.notEqual(game.clearChapter, originalClear);

  chapter.build(game);
  assert.equal(first.diagnostics.disposed, true, 'direct legacy reload disposes the previous adapter');
  const second = game.sheepTutorial;
  assert.notEqual(second, first);

  game.clearChapter();
  assert.equal(second.diagnostics.disposed, true);
  assert.equal(game.sheepTutorial, null);
  assert.equal(game.clearChapter, originalClear);
  assert.equal(game.clearCalls, 1);
});
