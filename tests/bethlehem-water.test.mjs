import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, LAYOUT, createState, startGame, step, targetFor, isBlocked, resetGame, findPath, guardSees,
} from '../src/bethlehem-water-core.js';

// Legacy mechanic adaptations: z-threshold checkpoint assertions are obsolete because
// retries now use only accomplished safe interactions. The former unobserved far-west
// edge walk is also obsolete at the intentionally longer sight range; its replacement
// uses the physical camp screen, wall/foliage chain, and live patrol-opening waits.

function ticks(state, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) step(state, input, 0.05);
  return state;
}

function moveTo(state, target, options = {}, maxTicks = 8000) {
  const crouch = options.crouch !== false;
  for (let i = 0; i < maxTicks; i++) {
    const dx = target.x - state.player.x, dz = target.z - state.player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.22) return i;
    assert.notEqual(state.phase, 'caught', 'the ordinary route must not require an intentional catch');
    const stride = Math.min(d, crouch ? 0.12 : 0.2);
    const probe = { x: state.player.x + dx / d * stride, z: state.player.z + dz / d * stride };
    const currentSeen = state.guards.some(g => guardSees(g, state.player, crouch));
    const probeSeen = state.guards.some(g => guardSees(g, probe, crouch));
    // Wait for the actual patrol opening. The former 1.25s forced stand/sprint
    // controller invalidated cover input; independent 0/4/8s launch runs prove
    // this unchanged gameplay route completes by waiting, without lowering any gate.
    const waiting = options.waitForOpening !== false && !currentSeen && probeSeen;
    const input = waiting
      ? { crouch }
      : { x: dx / d, z: dz / d, crouch, sprint: !!options.sprint };
    step(state, input, 0.05);
    for (const companion of state.companions) assert.equal(isBlocked(companion.x, companion.z), false, 'companion crossed solid geometry');
  }
  assert.fail('failed to reach waypoint ' + JSON.stringify(target));
}

const COVER_ROUTE_OUT = Object.freeze([
  { x: -6.2, z: 23 },
  { x: -6.2, z: 20.2 },
  { x: -9.5, z: 16.8 },
  { x: -13.6, z: 16.2 },
  { x: -13.6, z: 9.2 },
  { x: -15.5, z: 7 },
  { x: -15.7, z: -1.5 },
  { x: -15.9, z: -10.8 },
  { x: -16, z: -18 },
  { x: -8.2, z: -18.2 },
  { x: -7.5, z: -20.6 },
  { x: -4.8, z: -21.2 },
  LAYOUT.wellApproach,
]);
const COVER_ROUTE_BACK = Object.freeze([...COVER_ROUTE_OUT.slice(0, -1)].reverse().concat(LAYOUT.start));

function attemptRoute(state, waypoints, input, maxTicks = 5000) {
  let ticksUsed = 0;
  for (const target of waypoints) {
    while (ticksUsed < maxTicks) {
      if (state.phase === 'caught') return { reached: false, caught: true, ticks: ticksUsed };
      const dx = target.x - state.player.x, dz = target.z - state.player.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.22) break;
      step(state, { x: dx / d, z: dz / d, ...input }, 0.05);
      ticksUsed++;
    }
  }
  const final = waypoints.at(-1);
  return { reached: Math.hypot(state.player.x - final.x, state.player.z - final.z) < 0.3, caught: state.phase === 'caught', ticks: ticksUsed };
}

test('createState preserves legacy story fields and adds the frozen stealth schema', () => {
  const state = createState();
  assert.equal(state.phase, 'intro');
  assert.deepEqual({ x: state.player.x, z: state.player.z }, LAYOUT.start);
  assert.equal(state.player.sprinting, false);
  assert.equal(state.difficulty, 'normal');
  assert.equal(state.alerted, false);
  assert.equal(state.stones, 3);
  assert.equal(state.noise, null);
  assert.equal(state.movementNoise, null);
  assert.deepEqual(state.stats, { detections: 0, distractions: 0, catches: 0, distance: 0, hiddenTime: 0 });
  assert.equal(state.guards.length, LAYOUT.guards.length);
  assert.ok(state.guards.every(g => g.mode === 'patrol' && Array.isArray(g.patrol)));
  assert.equal(state.companions.length, 2);
});

test('intro and complete remain frozen while startGame begins the outbound leg', () => {
  const state = createState();
  const before = JSON.stringify(state);
  step(state, { x: 1, z: -1, sprint: true, distract: true, action: true }, 0.05);
  assert.equal(JSON.stringify(state), before);
  startGame(state);
  step(state, { x: 1, z: 0 }, 0.05);
  assert.notEqual(state.player.x, LAYOUT.start.x);
  state.phase = 'complete';
  const complete = JSON.stringify(state);
  step(state, { x: -1, z: -1, action: true }, 0.05);
  assert.equal(JSON.stringify(state), complete);
});

test('movement normalizes diagonals, clamps dt, updates heading, and carrying slows travel', () => {
  const normal = createState(); startGame(normal);
  step(normal, { x: 1, z: 1, sprint: true }, 99);
  const sprintDistance = Math.hypot(normal.player.x, normal.player.z - LAYOUT.start.z);
  assert.ok(sprintDistance <= CONFIG.sprintSpeed * 0.05 + 1e-9);
  assert.ok(normal.player.sprinting);
  assert.ok(Math.abs(normal.player.heading - Math.atan2(normal.player.x, normal.player.z - LAYOUT.start.z)) < 1e-9);
  const carrying = createState(); startGame(carrying);
  carrying.carrying = true; carrying.phase = 'return';
  step(carrying, { x: 1, z: 0, sprint: true }, 0.05);
  assert.ok(Math.abs(carrying.player.x) < sprintDistance, 'the water load must make the return mechanically harder');
});

test('map exposes a safe physical camp screen, two real gate openings, cover chains, and a reachable well', () => {
  const screen = LAYOUT.obstacles.find(o => o.id === 'camp-spawn-screen');
  assert.ok(screen && screen.kind === 'wall' && screen.h > 3, 'spawn safety must be rendered tall geometry');
  assert.equal(isBlocked(0, 18.6), true, 'camp screen is physical rather than an invisible grace rule');
  assert.equal(isBlocked(-6.2, 18.6), false, 'the western camp exit remains a real gap');
  assert.equal(isBlocked(0, -15), false, 'center breach');
  assert.equal(isBlocked(-16, -15), false, 'west secondary gap');
  assert.equal(isBlocked(-9, -15), true, 'wall between routes');
  assert.equal(isBlocked(12, -15), true, 'east wall');
  assert.ok(LAYOUT.obstacles.filter(o => o.kind === 'cover').length >= 6);
  assert.ok(LAYOUT.shelters.some(s => s.id === 'olive-west-middle'));
  assert.ok(LAYOUT.shelters.some(s => s.id === 'olive-village-west'));
  assert.equal(isBlocked(LAYOUT.well.x, LAYOUT.well.z), true);
  assert.equal(isBlocked(LAYOUT.wellApproach.x, LAYOUT.wellApproach.z), false);
  const center = findPath(LAYOUT.start, LAYOUT.wellApproach);
  const side = findPath({ x: -16, z: 20 }, { x: -16, z: -20 });
  assert.ok(center.length > 0 && side.length > 0);
  for (const p of [...center, ...side]) assert.equal(isBlocked(p.x, p.z), false);
});

test('walls stop movement but axis sliding remains available', () => {
  const state = createState(); startGame(state);
  state.player.x = -9; state.player.z = -12.9;
  ticks(state, 2, { z: -1, crouch: true });
  const stopped = state.player.z;
  assert.ok(stopped > -13.7);
  step(state, { x: 1, z: -1, crouch: true }, 0.05);
  assert.ok(state.player.x > -9);
  assert.ok(state.player.z >= stopped - 1e-9);
});

test('filling requires proximity, stationary held action, and transitions to return pressure', () => {
  const state = createState(); startGame(state);
  state.player.x = LAYOUT.wellApproach.x; state.player.z = LAYOUT.wellApproach.z;
  step(state, { action: true, crouch: true }, 0.05);
  assert.equal(state.phase, 'filling');
  const progress = state.fill;
  step(state, { x: -1, action: true, crouch: true }, 0.05);
  assert.equal(state.fill, progress);
  assert.equal(state.phase, 'outbound');
  state.player.x = LAYOUT.wellApproach.x; state.player.z = LAYOUT.wellApproach.z;
  ticks(state, CONFIG.fillDuration + 0.1, { action: true, crouch: true });
  assert.equal(state.carrying, true);
  assert.equal(state.fill, 1);
  assert.equal(state.phase, 'return');
  assert.equal(state.alerted, true);
  assert.deepEqual(state.checkpoint, LAYOUT.wellApproach);
  assert.deepEqual(targetFor(state), { x: LAYOUT.start.x, z: LAYOUT.start.z, label: 'camp' });
  assert.equal(state.message, 'well-filled');
});

test('remote fill is impossible and targetFor keeps the legacy UI contract', () => {
  const state = createState();
  assert.equal(targetFor(state), null);
  startGame(state);
  assert.deepEqual(targetFor(state), { x: LAYOUT.well.x, z: LAYOUT.well.z, label: 'well' });
  state.player.x = 0; state.player.z = -19;
  step(state, { action: true }, 0.05);
  assert.equal(state.fill, 0);
  state.carrying = true; state.phase = 'return';
  assert.deepEqual(targetFor(state), { x: LAYOUT.start.x, z: LAYOUT.start.z, label: 'camp' });
  state.phase = 'ending'; assert.equal(targetFor(state), null);
});

test('manual checkpoints replace obsolete free z-line checkpoints', () => {
  const state = createState(); startGame(state);
  for (const z of [9, -9, -20]) {
    state.player.x = 0; state.player.z = z;
    step(state, {}, 0.01);
    assert.deepEqual(state.checkpoint, LAYOUT.start, 'progress lines must not bank a teleport');
  }
  state.player.x = LAYOUT.wellApproach.x; state.player.z = LAYOUT.wellApproach.z;
  ticks(state, CONFIG.fillDuration + 0.1, { action: true, crouch: true });
  assert.deepEqual(state.checkpoint, LAYOUT.wellApproach);
});

test('companions trail collision-safely and remain cosmetic to detection', () => {
  const state = createState(); startGame(state);
  const before = state.companions.map(c => ({ x: c.x, z: c.z }));
  ticks(state, 1, { x: -1, z: 0, crouch: true });
  assert.ok(state.companions.some((c, i) => Math.hypot(c.x - before[i].x, c.z - before[i].z) > 0.05));
  for (const c of state.companions) assert.equal(isBlocked(c.x, c.z), false);
  const alarm = state.alarm;
  state.companions[0].x = state.guards[0].x; state.companions[0].z = state.guards[0].z;
  step(state, {}, 0.05);
  assert.ok(state.alarm <= alarm + 0.1);
});

test('resetGame preserves selected difficulty but restores a clean intro state', () => {
  const state = createState({ difficulty: 'hard' }); startGame(state);
  ticks(state, 0.5, { x: 1, sprint: true, distract: true });
  state.extraLegacyJunk = true;
  resetGame(state);
  assert.deepEqual(state, createState({ difficulty: 'hard' }));
});

test('canonical return action and timed 2 Samuel ending are preserved', () => {
  const state = createState(); startGame(state);
  state.carrying = true; state.fill = 1; state.phase = 'return';
  state.player.x = LAYOUT.start.x; state.player.z = LAYOUT.start.z - 1;
  step(state, { action: true }, 0.05);
  assert.equal(state.phase, 'ending');
  assert.equal(state.message, 'poured-out-to-the-lord');
  ticks(state, CONFIG.endingDuration - 0.1);
  assert.equal(state.phase, 'ending');
  ticks(state, 0.2);
  assert.equal(state.phase, 'complete');
  assert.equal(state.message, 'complete');
});

test('blind central sprint is riskier than the cover-aware west-gap route and does not dominate', () => {
  const central = createState(); startGame(central);
  const centralResult = attemptRoute(central, [
    { x: 6.2, z: 23 }, { x: 6.2, z: 16 }, { x: 7, z: 8 }, { x: 0, z: 5 },
    { x: 0, z: 0 }, { x: -2, z: -9 }, { x: 2.5, z: -9 }, { x: 2.5, z: -18 },
  ], { sprint: true });

  const covered = createState(); startGame(covered);
  for (const waypoint of COVER_ROUTE_OUT.slice(0, 9)) moveTo(covered, waypoint);

  assert.notEqual(covered.phase, 'caught', 'physical cover route must remain performable');
  assert.equal(covered.stats.catches, 0);
  assert.ok(centralResult.caught || !centralResult.reached || central.stats.detections > covered.stats.detections || central.alarm > covered.alarm + 0.2,
    'blind sprint must create a concrete detection/interception cost rather than dominate cover play');
});

test('finite ordinary-input cover route reaches the well and ending with zero catches', () => {
  const state = createState(); startGame(state);
  // This intentionally replaces the obsolete unobserved west-edge walk. Every movement
  // is ordinary input; waits happen only at real cover when the next stride is watched.
  for (const waypoint of COVER_ROUTE_OUT) moveTo(state, waypoint);
  ticks(state, CONFIG.fillDuration + 0.15, { action: true, crouch: true });
  assert.equal(state.phase, 'return');
  for (const waypoint of COVER_ROUTE_BACK) moveTo(state, waypoint);
  for (let i = 0; i < 20; i++) {
    step(state, { crouch: true }, 0.05);
    for (const companion of state.companions) assert.equal(isBlocked(companion.x, companion.z), false);
  }
  for (const companion of state.companions) {
    assert.ok(Math.hypot(companion.x - LAYOUT.start.x, companion.z - LAYOUT.start.z) < 3,
      'both companions must complete the full cover-aware return rather than stick at a wall corner');
  }
  step(state, { action: true, crouch: true }, 0.05);
  assert.equal(state.phase, 'ending');
  ticks(state, CONFIG.endingDuration + 0.1);
  assert.equal(state.phase, 'complete');
  assert.equal(state.retries, 0);
  assert.equal(state.stats.catches, 0);
});
