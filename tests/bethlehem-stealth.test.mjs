import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, LAYOUT, createState, startGame, step, guardSees, sightPolygon,
  lineBlocked, hearingStrength, findPath, isBlocked, stealthInfo,
} from '../src/bethlehem-water-core.js';

// Legacy mechanic adaptations: total circular shelter invisibility is intentionally
// replaced by distance-limited foliage concealment, and x-only patrol assertions are
// replaced by per-guard waypoint/FSM/navigation tests because guards now investigate.

function run(state, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) step(state, input, 0.05);
}

function isolate(state, active = 0) {
  state.guards.forEach((g, i) => {
    g.speed = 0; g.baseSpeed = 0; g.suspicion = 0; g.mode = 'patrol'; g.lastSeen = null;
    if (i !== active) { g.x = 20; g.z = 26 - i; g.heading = 0; g.sightRange = 1; }
  });
  return state.guards[active];
}

const COVER_PRESSURE_ROUTE = Object.freeze([
  { x: -6.2, z: 23 }, { x: -6.2, z: 20.2 }, { x: -9.5, z: 16.8 },
  { x: -13.6, z: 16.2 }, { x: -13.6, z: 9.2 }, { x: -15.5, z: 7 },
  { x: -15.7, z: -1.5 }, { x: -15.9, z: -10.8 },
]);
const CENTRAL_EXPOSED_ROUTE = Object.freeze([
  { x: 6.2, z: 23 }, { x: 6.2, z: 16 }, { x: 7, z: 9 },
  { x: 7, z: 4 }, { x: 0, z: 1 }, { x: 0, z: -8 },
]);
const OUTER_EDGE_ROUTE = Object.freeze([
  { x: -19.5, z: 23 }, { x: -19.5, z: 12 }, { x: -19.5, z: 2 },
  { x: -19, z: -8 }, { x: -16, z: -11 },
]);

function traverseLiveRoute(state, waypoints, { tactical = false, sprint = false } = {}) {
  let peakAlarm = state.alarm;
  for (const target of waypoints) {
    let reached = false;
    for (let i = 0; i < 5000; i++) {
      if (state.phase === 'caught') return { reached: false, peakAlarm };
      const dx = target.x - state.player.x, dz = target.z - state.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.24) { reached = true; break; }
      const stride = Math.min(distance, 0.12);
      const probe = { x: state.player.x + dx / distance * stride, z: state.player.z + dz / distance * stride };
      const currentSeen = state.guards.some(g => guardSees(g, state.player, tactical));
      const nextSeen = state.guards.some(g => guardSees(g, probe, tactical));
      const waiting = tactical && !currentSeen && nextSeen;
      const input = waiting
        ? { crouch: true }
        : { x: dx / distance, z: dz / distance, crouch: tactical, sprint: !tactical && sprint };
      step(state, input, 0.05);
      peakAlarm = Math.max(peakAlarm, state.alarm);
    }
    if (!reached) return { reached: false, peakAlarm };
  }
  return { reached: true, peakAlarm };
}

function pressureOf(state, traversal) {
  return traversal.peakAlarm + state.stats.detections * 2 + state.stats.catches * 4 + (traversal.reached ? 0 : 0.5);
}

test('long open sight, stance-correct low cover, and tall occlusion remain hard limits', () => {
  assert.ok(CONFIG.sightRange >= 18 && CONFIG.sightRange <= 20);
  assert.ok(CONFIG.crouchSightMultiplier >= 0.9, 'crouching alone must not erase long-range vision');
  const openGuard = { x: -20, z: 25, heading: Math.PI / 2, sightRange: CONFIG.sightRange, fovHalf: CONFIG.fovHalf };
  assert.equal(guardSees(openGuard, { x: -5, z: 25 }, false), true, 'standing at 15m is visible');
  assert.equal(guardSees(openGuard, { x: -5, z: 25 }, true), true, 'crouching at 15m open ground is still visible');
  assert.equal(guardSees(openGuard, { x: -1.5, z: 25 }, false), true, 'standing retains the full long range');
  assert.equal(guardSees(openGuard, { x: -1.5, z: 25 }, true), false, 'the small crouch range difference remains finite and explicit');

  const low = LAYOUT.obstacles.find(o => o.id === 'north-broken-wall');
  const guard = { x: low.x, z: low.z + 3, heading: Math.PI, sightRange: CONFIG.sightRange, fovHalf: CONFIG.fovHalf };
  const player = { x: low.x, z: low.z - 3 };
  assert.equal(guardSees(guard, player, false), true, 'standing is visible over low cover');
  assert.equal(guardSees(guard, player, true), false, 'crouching is hidden by low cover');
  assert.equal(lineBlocked(guard.x, guard.z, player.x, player.z, { crouching: false }), false);
  assert.equal(lineBlocked(guard.x, guard.z, player.x, player.z, { crouching: true }), true);

  const wallGuard = { x: -9, z: -11, heading: Math.PI, sightRange: CONFIG.sightRange };
  assert.equal(guardSees(wallGuard, { x: -9, z: -19 }, false), false, 'tall gate blocks standing sight');
  assert.equal(guardSees(wallGuard, { x: -9, z: -19 }, true), false, 'tall gate blocks crouched sight');
  assert.equal(guardSees({ x: 0, z: 0, heading: 0 }, { x: 0, z: -3 }, false), false, 'rear arc is outside FOV');
  assert.equal(guardSees({ x: 0, z: 0, heading: 0 }, { x: 0, z: 20 }, false), false, 'range is finite');
});

test('the idle camp spawn is screened by real tall geometry while both exits remain connected', () => {
  const screen = LAYOUT.obstacles.find(o => o.id === 'camp-spawn-screen');
  assert.ok(screen && screen.kind === 'wall' && screen.h >= 4);
  const state = createState(); startGame(state);
  assert.ok(state.guards.every(g => !guardSees(g, state.player, false)), 'no guard sees the idle spawn');
  assert.equal(isBlocked(screen.x, screen.z), true);
  assert.equal(isBlocked(-6.2, screen.z), false);
  assert.equal(isBlocked(6.2, screen.z), false);
  assert.ok(findPath(LAYOUT.start, { x: -9.5, z: 16.8 }).length > 0);
});

test('the real west sentry watches blind edge transit while foliage and low cover protect crouched crossings', () => {
  const spec = LAYOUT.guards.find(g => g.id === 'west-overwatch');
  assert.ok(spec && spec.watchHeading === 0);
  const sentry = { x: -19, z: -3, heading: 0, sightRange: CONFIG.sightRange, fovHalf: CONFIG.fovHalf };
  assert.equal(guardSees(sentry, { x: -19, z: 12 }, false), true, '15m standing edge runner is watched');
  assert.equal(guardSees(sentry, { x: -19, z: 12 }, true), true, 'crouching in open edge terrain is also watched');
  assert.equal(guardSees(sentry, { x: -15.5, z: 7 }, true), false, 'recorded olive grove provides real concealment');
  assert.equal(guardSees(sentry, { x: -15.7, z: 2 }, true), false, 'crouched crossing is hidden by the physical west low wall');
  assert.equal(guardSees(sentry, { x: -15.7, z: 2 }, false), true, 'sprinting upright past that low wall remains exposed');
});

test('the posted well sentry makes the physical well essential crouched cover', () => {
  const spec = LAYOUT.guards.find(g => g.id === 'well-sentry');
  assert.ok(spec && spec.watchHeading === -Math.PI / 2);
  const sentry = { x: 4, z: -23, heading: -Math.PI / 2, sightRange: CONFIG.sightRange, fovHalf: CONFIG.fovHalf };
  assert.equal(guardSees(sentry, LAYOUT.wellApproach, false), true, 'standing at the fill point is exposed');
  assert.equal(guardSees(sentry, LAYOUT.wellApproach, true), false, 'crouching uses the real well cylinder as LOS cover');

  const state = createState(); startGame(state);
  const live = state.guards.find(g => g.id === 'well-sentry');
  live.heading = 0.7;
  step(state, {}, 0.05);
  assert.equal(live.heading, -Math.PI / 2, 'a posted sentry restores authored facing only in patrol mode');
});

test('blind central and outer-edge transit create more live pressure at three launch offsets', () => {
  for (const launchOffset of [0, 1.75, 3.5]) {
    const covered = createState(); startGame(covered); run(covered, launchOffset, { crouch: true });
    const protectedRun = traverseLiveRoute(covered, COVER_PRESSURE_ROUTE, { tactical: true });
    assert.equal(protectedRun.reached, true, 'cover route must remain connected at launch offset ' + launchOffset);
    assert.equal(covered.stats.catches, 0, 'cover route cannot depend on retry at launch offset ' + launchOffset);

    const central = createState(); startGame(central); run(central, launchOffset);
    const centralRun = traverseLiveRoute(central, CENTRAL_EXPOSED_ROUTE, { sprint: true });
    const outer = createState(); startGame(outer); run(outer, launchOffset);
    const outerRun = traverseLiveRoute(outer, OUTER_EDGE_ROUTE, { sprint: true });
    const exposedPressure = Math.max(pressureOf(central, centralRun), pressureOf(outer, outerRun));
    const protectedPressure = pressureOf(covered, protectedRun);
    assert.ok(exposedPressure > protectedPressure + 0.15,
      `launch ${launchOffset}s should punish at least one blind route (${exposedPressure} vs ${protectedPressure})`);
  }
});

test('sightPolygon clips the same center ray that guardSees uses for crouched low cover', () => {
  const guard = { x: 1.5, z: 13, heading: Math.PI, sightRange: 10, fovHalf: CONFIG.fovHalf };
  const standing = sightPolygon(guard, false);
  const crouched = sightPolygon(guard, true);
  assert.equal(standing.length, 22);
  assert.equal(crouched.length, 22);
  const standingCenter = standing[11], crouchedCenter = crouched[11];
  assert.ok(standingCenter.z < 4, 'standing fan crosses low cover');
  assert.ok(crouchedCenter.z > 10.4 && crouchedCenter.z < 10.7, 'crouched fan stops at its north face');
  assert.equal(guardSees(guard, { x: 1.5, z: 7 }, false), true);
  assert.equal(guardSees(guard, { x: 1.5, z: 7 }, true), false);
});

test('foliage is strong real concealment, never point-blank magic invisibility', () => {
  assert.ok(CONFIG.foliageCrouchRangeMultiplier >= 0.25 && CONFIG.foliageCrouchRangeMultiplier <= 0.35);
  assert.ok(CONFIG.foliageStandRangeMultiplier >= 0.25 && CONFIG.foliageStandRangeMultiplier <= 0.35);
  const foliage = LAYOUT.shelters.find(s => s.id === 'olive-start-west');
  const close = { x: foliage.x, z: foliage.z + 1, heading: Math.PI, sightRange: CONFIG.sightRange };
  assert.equal(guardSees(close, { x: foliage.x, z: foliage.z }, true), true, 'point-blank crouched player is visible');
  const medium = { x: foliage.x, z: foliage.z + 6, heading: Math.PI, sightRange: CONFIG.sightRange };
  assert.equal(guardSees(medium, { x: foliage.x, z: foliage.z }, true), false, 'foliage cuts crouched effective range to about five metres');
  assert.equal(guardSees(medium, { x: foliage.x, z: foliage.z }, false), true, 'standing remains visible slightly farther inside foliage');
  const far = { x: foliage.x, z: foliage.z + 7, heading: Math.PI, sightRange: CONFIG.sightRange };
  assert.equal(guardSees(far, { x: foliage.x, z: foliage.z }, false), false, 'actual foliage also meaningfully limits standing acquisition');
});

test('movement noise scales deterministically by crouch, walk, sprint, and carried water', () => {
  const sample = input => {
    const state = createState(); startGame(state); state.graceTimer = 99;
    step(state, input, 0.05);
    return state.noise?.radius || 0;
  };
  const crouch = sample({ x: 1, crouch: true });
  const walk = sample({ x: 1 });
  const sprint = sample({ x: 1, sprint: true });
  const carrying = createState(); startGame(carrying); carrying.graceTimer = 99; carrying.carrying = true; carrying.phase = 'return';
  step(carrying, { x: 1, sprint: true }, 0.05);
  assert.ok(crouch > 0 && crouch < walk && walk < sprint);
  assert.ok(carrying.noise.radius > sprint);
  const still = createState(); startGame(still); step(still, {}, 0.05);
  assert.equal(still.noise, null);
});

test('return sprint creates a wider hearing/interception cost while a broken chase remains escapable', () => {
  const outbound = createState(); startGame(outbound);
  const outboundGuard = isolate(outbound);
  outboundGuard.x = 10; outboundGuard.z = 23; outboundGuard.sightRange = 0.1;
  step(outbound, { x: 1, sprint: true }, 0.05);
  assert.equal(outboundGuard.hearing, false, 'ordinary sprint stays below this deliberately chosen distance');

  const returning = createState(); startGame(returning);
  const returnGuard = isolate(returning);
  returning.carrying = true; returning.phase = 'return'; returning.alerted = true;
  returnGuard.x = 10; returnGuard.z = 23; returnGuard.sightRange = 0.1;
  step(returning, { x: 1, sprint: true }, 0.05);
  assert.equal(returnGuard.hearing, true, 'sloshing carried water makes the same sprint audible');
  assert.equal(returnGuard.mode, 'investigate');

  const chase = createState(); startGame(chase);
  chase.player.x = LAYOUT.wellApproach.x; chase.player.z = LAYOUT.wellApproach.z;
  const preSpeed = chase.guards[0].speed, preSight = chase.guards[0].sightRange;
  run(chase, CONFIG.fillDuration + 0.1, { action: true, crouch: true });
  assert.equal(chase.phase, 'return');
  assert.ok(chase.guards[0].speed > preSpeed && chase.guards[0].sightRange > preSight);
  chase.guards.forEach((g, i) => { if (i) { g.x = 20; g.z = 26 - i; g.speed = 0; g.sightRange = 0.1; } });
  const pursuer = chase.guards[0];
  chase.player.x = 12; chase.player.z = 0; chase.player.heading = 0;
  pursuer.x = 12; pursuer.z = -3; pursuer.heading = 0; pursuer.mode = 'alert'; pursuer.suspicion = 1; pursuer.lastSeen = { x: 12, z: 0 };
  run(chase, 0.8, { z: 1, sprint: true });
  assert.notEqual(chase.phase, 'caught', 'breaking away in open ground remains possible');
  assert.ok(Math.hypot(chase.player.x - pursuer.x, chase.player.z - pursuer.z) > 3,
    'carried sprint can open distance even though it broadcasts the chase');
});

test('walls attenuate hearing rather than granting omniscient full-strength sound', () => {
  const noise = { x: -9, z: -19, radius: 12 };
  const walled = hearingStrength({ x: -9, z: -11 }, noise);
  const open = hearingStrength({ x: 0, z: -11 }, { x: 0, z: -19, radius: 12 });
  assert.ok(walled >= 0 && walled < open);
  assert.equal(hearingStrength({ x: -9, z: -11 }, { ...noise, radius: 4 }), 0);
});

test('stone distraction is forward, limited, rising-edge-only, and cooldown-gated', () => {
  const state = createState(); startGame(state); state.graceTimer = 99;
  const origin = { x: state.player.x, z: state.player.z };
  step(state, { distract: true }, 0.05);
  assert.equal(state.stones, 2);
  assert.equal(state.stats.distractions, 1);
  assert.equal(state.noise.kind, 'stone');
  assert.ok(Math.hypot(state.noise.x - origin.x, state.noise.z - origin.z) >= 0.5);
  assert.notDeepEqual({ x: state.noise.x, z: state.noise.z }, origin);
  const landing = { x: state.noise.x, z: state.noise.z };
  run(state, 0.3, { distract: true });
  assert.equal(state.stones, 2, 'holding cannot auto-spend stones');
  step(state, { distract: false }, 0.05);
  step(state, { distract: true }, 0.05);
  assert.equal(state.stones, 2, 'cooldown blocks a new rising edge');
  step(state, { distract: false }, 0.05);
  run(state, CONFIG.distractionCooldown + 0.1);
  step(state, { distract: true }, 0.05);
  assert.equal(state.stones, 1);
  assert.equal(state.stats.distractions, 2);
  assert.ok(Number.isFinite(landing.x) && Number.isFinite(landing.z));
});

test('active stone does not suppress simultaneous sprint footsteps for a nearer guard', () => {
  const state = createState(); startGame(state);
  const guard = isolate(state);
  state.player.x = 0; state.player.z = 0; state.player.heading = 0;
  guard.x = 0; guard.z = -6.5; guard.speed = 0; guard.sightRange = 0.1;
  step(state, { z: 1, sprint: true, distract: true }, 0.05);
  assert.equal(state.noise.kind, 'stone', 'primary API continues to expose the active distraction');
  assert.equal(state.movementNoise.kind, 'sprint');
  assert.equal(hearingStrength(guard, state.noise), 0, 'guard is outside the thrown stone radius');
  assert.ok(hearingStrength(guard, state.movementNoise) > 0, 'guard is inside the simultaneous footstep radius');
  assert.equal(guard.hearing, true);
  assert.equal(guard.mode, 'investigate');
  assert.deepEqual(guard.lastSeen, { x: state.movementNoise.x, z: state.movementNoise.z },
    'guard must remember the actual strongest audible event, not the globally primary stone');
});

test('companions use bounded cached navigation around a wall instead of sticking or portaling', () => {
  const state = createState(); startGame(state); state.graceTimer = 99;
  state.player.x = -9; state.player.z = -19; state.player.heading = Math.PI;
  state.companions[0].x = -9; state.companions[0].z = -11;
  state.companions[1].x = -10; state.companions[1].z = -11;
  const before = state.companions.map(c => ({ x: c.x, z: c.z }));
  step(state, {}, 0.05);
  const cached = state.companions[0]._path;
  assert.ok(cached.length > 1, 'wall-separated companion needs a real route');
  step(state, {}, 0.05);
  assert.equal(state.companions[0]._path, cached, 'unchanged follow target reuses cached navigation');
  let previous = state.companions.map(c => ({ x: c.x, z: c.z }));
  for (let i = 0; i < 400; i++) {
    step(state, {}, 0.05);
    state.companions.forEach((c, index) => {
      assert.equal(isBlocked(c.x, c.z), false);
      assert.ok(Math.hypot(c.x - previous[index].x, c.z - previous[index].z) <= 5.8 * 0.05 + 1e-9,
        'companion movement must stay speed-bounded');
    });
    previous = state.companions.map(c => ({ x: c.x, z: c.z }));
  }
  state.companions.forEach((c, i) => {
    assert.ok(Math.hypot(c.x - state.player.x, c.z - state.player.z) < 3,
      'companion ' + i + ' should navigate around the gate to rejoin');
    assert.ok(Math.hypot(c.x - before[i].x, c.z - before[i].z) > 1);
  });
});

test('hearing stores the actual sound location and uses a cached collision-safe route around walls', () => {
  const state = createState(); startGame(state);
  const guard = isolate(state);
  guard.x = -9; guard.z = -11; guard.heading = Math.PI; guard.speed = 2.4; guard.baseSpeed = 2.4;
  state.noise = { x: -9, z: -19, radius: 20, ttl: 0.9, kind: 'stone' };
  const initialDistance = Math.hypot(guard.x + 9, guard.z + 19);
  step(state, {}, 0.05);
  assert.equal(guard.mode, 'investigate');
  assert.deepEqual(guard.lastSeen, { x: -9, z: -19 });
  assert.equal(guard.hearing, true);
  const cached = guard._path;
  step(state, {}, 0.05);
  assert.equal(guard._path, cached, 'unchanged last-known target reuses the cached grid route');
  for (let i = 0; i < 180; i++) {
    step(state, {}, 0.05);
    assert.equal(isBlocked(guard.x, guard.z), false, 'investigator must never penetrate geometry');
  }
  assert.ok(Math.hypot(guard.x + 9, guard.z + 19) < initialDistance);
});

test('grid navigation finds an open route around the solid gate without corner cutting', () => {
  const path = findPath({ x: -9, z: -11 }, { x: -9, z: -19 });
  assert.ok(path.length > 1);
  assert.ok(path.some(p => Math.abs(p.x) < 3.2 || p.x < -14.9), 'route must use a real gate opening');
  for (const p of path) assert.equal(isBlocked(p.x, p.z), false);
});

test('visual FSM rises through suspicion to alert, remembers last known position, searches, then returns to patrol', () => {
  const state = createState(); startGame(state);
  const guard = isolate(state);
  guard.x = 0; guard.z = 5; guard.heading = Math.PI; guard.sightRange = 10;
  state.player.x = 0; state.player.z = 1;
  step(state, {}, 0.05);
  assert.ok(guard.suspicion > 0 && guard.suspicion < 1);
  assert.ok(['patrol', 'suspicious'].includes(guard.mode));
  run(state, 2.5);
  assert.equal(guard.mode, 'alert');
  assert.equal(state.alerted, true);
  assert.equal(state.stats.detections, 1);
  assert.deepEqual(guard.lastSeen, { x: 0, z: 1 });
  assert.notEqual(state.phase, 'caught', 'alarm one is not itself an instant catch');

  guard.x = -9; guard.z = -11; guard.speed = 0;
  state.player.x = -9; state.player.z = -19;
  assert.equal(guardSees(guard, state.player, false), false);
  run(state, CONFIG.searchDuration + 0.5);
  assert.equal(guard.mode, 'search');
  assert.deepEqual(guard.lastSeen, { x: 0, z: 1 });
  run(state, CONFIG.searchDuration + 2);
  assert.equal(guard.mode, 'patrol');
  assert.equal(guard.lastSeen, null);
});

test('capture requires alert, proximity, and an unblocked posture-correct LOS', () => {
  const state = createState(); startGame(state);
  const guard = isolate(state);
  guard.x = 1.5; guard.z = 10.58; guard.speed = 0; guard.mode = 'alert'; guard.suspicion = 1;
  guard.lastSeen = { x: 1.5, z: 9.42 }; guard.heading = Math.PI;
  state.player.x = 1.5; state.player.z = 9.42;
  step(state, { crouch: true }, 0.05);
  assert.notEqual(state.phase, 'caught', 'low cover breaks crouched capture LOS');
  guard.mode = 'alert'; guard.suspicion = 1; guard.lastSeen = { x: state.player.x, z: state.player.z };
  step(state, { crouch: false }, 0.05);
  assert.equal(state.phase, 'caught', 'standing restores LOS and permits close alert capture');
});

test('catch and retry retain water, use only safe interaction checkpoints, and restore fair grace', () => {
  const state = createState(); startGame(state);
  state.carrying = true; state.fill = 1; state.phase = 'return'; state.alerted = true;
  state.checkpoint = { ...LAYOUT.wellApproach };
  const guard = isolate(state);
  state.player.x = 0; state.player.z = 0;
  guard.x = 0; guard.z = 1; guard.heading = Math.PI; guard.mode = 'alert'; guard.suspicion = 1; guard.lastSeen = { x: 0, z: 0 };
  step(state, {}, 0.05);
  assert.equal(state.phase, 'caught');
  assert.equal(state.retries, 1);
  assert.equal(state.stats.catches, 1);
  step(state, { x: 1 }, 0.05);
  assert.equal(state.phase, 'caught', 'movement alone cannot clear catch');
  step(state, { action: true }, 0.05);
  assert.equal(state.phase, 'return');
  assert.deepEqual({ x: state.player.x, z: state.player.z }, LAYOUT.wellApproach);
  assert.equal(state.carrying, true);
  assert.equal(state.alerted, true);
  assert.equal(state.graceTimer, CONFIG.gracePeriod);
  assert.ok(state.guards.every(g => g.mode === 'patrol' && g.suspicion === 0));
  run(state, 0.5);
  assert.equal(state.phase, 'return', 'grace prevents an unfair immediate recatch');
});

test('stealthInfo exposes all cover meanings, current noise, and highest per-guard mode', () => {
  const state = createState(); startGame(state);
  state.player.crouching = true;
  state.player.x = LAYOUT.shelters[0].x; state.player.z = LAYOUT.shelters[0].z;
  state.noise = { x: state.player.x, z: state.player.z, radius: 3.4, ttl: 0.1, kind: 'walk' };
  state.guards[0].mode = 'suspicious'; state.guards[1].mode = 'search'; state.guards[2].mode = 'investigate';
  state.guards[1].seeing = true;
  assert.deepEqual(stealthInfo(state), { cover: 'concealed', mode: 'search', noiseRadius: 3.4, threats: 1 });

  const low = createState(); startGame(low); isolate(low);
  low.player.crouching = true; low.player.x = 1.5; low.player.z = 7;
  low.guards[0].x = 1.5; low.guards[0].z = 13; low.guards[0].sightRange = 10;
  assert.equal(stealthInfo(low).cover, 'low-cover');

  const hard = createState(); startGame(hard); isolate(hard);
  hard.player.x = -9; hard.player.z = -19;
  hard.guards[0].x = -9; hard.guards[0].z = -11; hard.guards[0].sightRange = 12;
  assert.equal(stealthInfo(hard).cover, 'occluded');

  const open = createState(); startGame(open); isolate(open);
  open.player.x = 0; open.player.z = 1;
  open.guards[0].x = 0; open.guards[0].z = 5; open.guards[0].sightRange = 10;
  assert.equal(stealthInfo(open).cover, 'exposed');
});

test('hard difficulty raises fair pressure without changing geometry or creating instant death', () => {
  const normal = createState(); const hard = createState({ difficulty: 'hard' });
  assert.ok(hard.guards[0].speed > normal.guards[0].speed);
  assert.ok(hard.guards[0].sightRange > normal.guards[0].sightRange);
  startGame(hard);
  const guard = isolate(hard);
  guard.x = 0; guard.z = 5; guard.heading = Math.PI; guard.sightRange = 12;
  hard.player.x = 0; hard.player.z = 1;
  step(hard, {}, 0.05);
  assert.notEqual(hard.phase, 'caught');
  assert.ok(guard.suspicion > 0 && guard.suspicion < 1);
});
