import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.js';
import { createGameplayCues, installGameplayCues, slingCueState } from '../src/gameplay-cues.js';

class Element {
  constructor() {
    this.hidden = true; this.textContent = ''; this.firstChild = { style: {} };
    const classes = new Set();
    this.classList = { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
      toggle: (key, on) => on ? classes.add(key) : classes.delete(key) };
  }
}
function fixture() {
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  const CH1 = {};
  const game = { ch: CH1, mode: 'play', time: 0, paused: false, lock: false, dq: null, cine: null,
    sling: true, bow: false, aiming: true, aimCharge: 0.3, root: new THREE.Group(), groundAt: (x, z) => x * 0.05 + z * 0.02 };
  const options = { game, THREE, CH1, FOLD: [0, -8], document, translate: text => text.en };
  const cues = game.gameplayCues = createGameplayCues(options);
  return { game, cues, options, $: id => document.getElementById(id) };
}
function flockFixture() {
  const f = fixture(); f.game.sling = false; f.game.aiming = false;
  f.game.objective = { text: { en: 'Gather the sheep into the stone fold', ko: '양들을 돌 우리로 모으기' } };
  f.flock = { inFold: 0, canFollow: true, sheep: [{ st: 'graze' }, { st: 'graze' }] };
  f.cues.attachFold(f.flock); return f;
}

test('ready cue uses existing strict threshold and never promises charge power', () => {
  const f = fixture();
  for (const charge of [0, 0.15, 0.3]) { f.game.aimCharge = charge; assert.equal(slingCueState(f.game), 'winding'); }
  for (const charge of [0.300001, 0.7, 1]) { f.game.aimCharge = charge; assert.equal(slingCueState(f.game), 'ready'); }
  f.game.aimCharge = 0.3; f.cues.updateAim(); assert.equal(f.$('charge').firstChild.style.width, '99%');
  f.game.aimCharge = 1; f.cues.updateAim(); assert.match(f.$('slingCue').textContent, /fixed power/);
  assert.equal(f.$('charge').firstChild.style.width, '100%');
  assert.equal(f.$('cross').classList.contains('sling-ready'), true);
});

test('bow retains its native charge bar and receives no sling release or miss cue', () => {
  const f = fixture(); f.game.bow = true; f.$('charge').firstChild.style.width = '72%';
  f.cues.release({ arrow: true }); f.cues.removed({ arrow: true }); f.cues.updateAim();
  assert.equal(f.$('charge').firstChild.style.width, '72%'); assert.equal(f.$('slingCue').hidden, true);
  assert.equal(f.$('cross').classList.contains('sling-ready'), false);
});

test('released and missed cues expire on game time without timers or input changes', () => {
  const f = fixture(); f.game.aiming = false;
  const projectile = { arrow: false }; f.cues.release(projectile); f.cues.updateAim();
  assert.equal(f.$('slingCue').textContent, 'Stone released');
  f.game.time = 0.6; f.cues.updateAim(); assert.equal(f.$('slingCue').hidden, true);
  f.cues.removed(projectile); f.cues.updateAim(); assert.match(f.$('slingCue').textContent, /Missed/);
  f.game.time = 2; f.cues.updateAim(); assert.equal(f.$('slingCue').hidden, true);
  assert.equal(f.game.aiming, false); assert.equal(f.game.aimCharge, 0.3);
});

test('any authoritative onHit contact, including armor, suppresses false miss feedback', () => {
  const f = fixture(); f.game.aiming = false;
  for (const outcome of ['hit', 'blocked']) {
    const s = { outcome, arrow: false }; f.cues.hit(s); f.cues.removed(s); f.cues.updateAim();
    assert.equal(f.$('slingCue').hidden, true);
  }
});

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const updateStonesSource = html.slice(html.indexOf('  updateStones(dt) {'), html.indexOf('  updateInteract() {')).trim();
const actualUpdateStones = vm.runInNewContext(`(function ${updateStonesSource})`, { V3: THREE.Vector3, clamp: (x, a, b) => Math.max(a, Math.min(b, x)) });
function projectile(x, y, life = 3, arrow = false) {
  const m = new THREE.Mesh(); m.position.set(x, y, 0);
  return { m, p: m.position.clone(), v: new THREE.Vector3(), g: 0, life, arrow };
}
function collisionFixture() {
  const f = fixture(); f.game.aiming = false;
  f.effects = []; f.game.scene = new THREE.Scene(); f.game.groundAt = () => 0;
  f.game.particles = { emit: () => f.effects.push('particles') }; f.game.audio = { sfx: name => f.effects.push(name) };
  f.game.targets = []; f.game.stonesInAir = []; return f;
}

test('native collision path invokes the authored hit once and adds no duplicate audio or particles', () => {
  const f = collisionFixture(); const s = projectile(0, 2); f.game.stonesInAir = [s];
  f.game.targets = [{ pos: () => new THREE.Vector3(0, 2, 0), r: 1, onHit: () => { f.effects.push('clang', 'authored-particles'); } }];
  actualUpdateStones.call(f.game, 0.02); f.cues.updateAim();
  assert.deepEqual(f.effects, ['clang', 'authored-particles']); assert.equal(f.game.stonesInAir.length, 0);
  assert.equal(f.$('slingCue').hidden, true);
});

test('simultaneous hit and miss are classified per stone by native callbacks, without a predictive pass', () => {
  const f = collisionFixture(); f.game.stonesInAir = [projectile(0, 2), projectile(8, -1)];
  let hits = 0; f.game.targets = [{ pos: () => new THREE.Vector3(0, 2, 0), r: 1, onHit: () => hits++ }];
  actualUpdateStones.call(f.game, 0.02); f.cues.updateAim();
  assert.equal(hits, 1); assert.equal(f.game.stonesInAir.length, 0);
  assert.match(f.$('slingCue').textContent, /Missed/); assert.deepEqual(f.effects, ['particles', 'thud']);
});

test('native lifetime expiry without onHit reports a miss, while arrow expiry stays silent', () => {
  const f = collisionFixture(); f.game.stonesInAir = [projectile(8, 2, 0.01)];
  actualUpdateStones.call(f.game, 0.02); f.cues.updateAim(); assert.match(f.$('slingCue').textContent, /Missed/);
  f.cues.clearAim(); f.game.stonesInAir = [projectile(8, 2, 0.01, true)];
  actualUpdateStones.call(f.game, 0.02); f.cues.updateAim(); assert.equal(f.$('slingCue').hidden, true);
});

test('entrance ring is grounded and visible only for the active flock objective', () => {
  const f = flockFixture(); f.cues.updateFlock(); const ring = f.cues.foldRing;
  assert.equal(ring.visible, true); assert.equal(ring.position.x, 0); assert.ok(Math.abs(ring.position.z + 1.6) < 1e-8);
  for (let i = 0; i < ring.geometry.attributes.position.count; i++) {
    const p = ring.geometry.attributes.position;
    assert.ok(Math.abs(p.getY(i) - f.game.groundAt(p.getX(i), p.getZ(i) + ring.position.z) - 0.055) < 1e-6);
  }
  for (const [key, value] of [['paused', true], ['lock', true], ['dq', {}], ['cine', {}], ['sling', true], ['mode', 'title']]) {
    const before = f.game[key]; f.game[key] = value; f.cues.updateFlock(); assert.equal(ring.visible, false, key); f.game[key] = before;
  }
  f.game.objective = { text: { en: 'Chase the lion and strike it with your sling' } }; f.cues.updateFlock(); assert.equal(ring.visible, false);
});

test('recruitment observation covers authored and tutorial transitions, dedupes per sheep, and expires', () => {
  const f = flockFixture();
  f.flock.sheep[0].st = 'follow'; f.cues.updateFlock(); assert.equal(f.$('flockCue').hidden, false);
  f.game.time = 2; f.cues.updateFlock(); assert.equal(f.$('flockCue').hidden, true);
  f.flock.sheep[0].st = 'graze'; f.cues.updateFlock(); f.flock.sheep[0].st = 'follow'; f.cues.updateFlock();
  assert.equal(f.$('flockCue').hidden, true, 'same sheep cannot reannounce');
  f.flock.sheep[1].st = 'follow'; f.cues.updateFlock(); assert.equal(f.$('flockCue').hidden, false, 'second path/new sheep can announce');
  f.flock.inFold = 7; f.cues.updateFlock(); assert.equal(f.$('flockCue').hidden, true); assert.equal(f.cues.foldRing.visible, false);
});

test('suspend clears ready/release/recruitment cues immediately without changing input or sheep state', () => {
  const f = flockFixture(); f.flock.sheep[0].st = 'follow'; f.cues.updateFlock();
  f.game.sling = true; f.game.aiming = true; f.game.aimCharge = 1; f.cues.updateAim(); f.cues.suspend();
  assert.equal(f.$('slingCue').hidden, true); assert.equal(f.$('flockCue').hidden, true); assert.equal(f.cues.foldRing.visible, false);
  assert.equal(f.$('cross').classList.contains('sling-ready'), false);
  assert.equal(f.game.aiming, true); assert.equal(f.flock.sheep[0].st, 'follow');
});

test('chapter reset disposes owned geometry/material once and recruitment may reannounce on restart', () => {
  const f = flockFixture(); const ring = f.cues.foldRing; let geometries = 0, materials = 0;
  ring.geometry.addEventListener('dispose', () => geometries++); ring.material.addEventListener('dispose', () => materials++);
  f.flock.sheep[0].st = 'follow'; f.cues.updateFlock(); f.cues.reset(); f.cues.reset();
  assert.equal(geometries, 1); assert.equal(materials, 1); assert.equal(ring.parent, null); assert.equal(f.cues.foldRing, null);
  assert.equal(f.$('flockCue').hidden, true);
  f.flock.sheep[0].st = 'graze'; f.cues.attachFold(f.flock); f.flock.sheep[0].st = 'follow'; f.cues.updateFlock();
  assert.equal(f.$('flockCue').hidden, false);
});

test('installation preserves native returns/args, observes after chapter AIs, and hooks interruption cleanup', () => {
  const f = fixture(); const calls = [];
  class Game {
    loadWorld(index) { this.clearChapter(); if (index === 0) { this.ch = f.options.CH1; this.ch.build(this); } return 'loaded'; }
    clearChapter() { this.updaters = []; this.root = new THREE.Group(); calls.push('clear'); return 'cleared'; }
    updateAim(dt) { this.aimCharge = dt; return 'aimed'; }
    throwStone() { this.stonesInAir.push({ arrow: this.bow }); return 'thrown'; }
    enableSling(on, n, max, bow) { this.sling = on; this.bow = bow; return n; }
    every(fn) { this.updaters.push(fn); }
  }
  class Input { abortAim(reason) { this.g.aiming = false; calls.push(reason); return 'aborted'; } }
  f.options.CH1.build = function(g) { this.s = { inFold: 0, canFollow: true, sheep: [{ st: 'graze' }] }; g.every(() => { this.s.sheep[0].st = 'follow'; }); };
  installGameplayCues({ ...f.options, Game, Input }); const wrapper = Game.prototype.updateAim;
  installGameplayCues({ ...f.options, Game, Input }); assert.equal(Game.prototype.updateAim, wrapper);
  const g = Object.assign(new Game(), f.game, { gameplayCues: undefined, stonesInAir: [] });
  assert.equal(g.loadWorld(0), 'loaded'); assert.equal(g.updaters.length, 2);
  g.sling = false; g.objective = { text: { en: 'Gather the sheep into the stone fold' } }; g.updaters.forEach(fn => fn());
  assert.equal(f.$('flockCue').hidden, false);
  g.sling = true; g.aiming = true; assert.equal(g.updateAim(0.8), 'aimed'); assert.equal(f.$('slingCue').hidden, false);
  const input = new Input(); input.g = g; assert.equal(input.abortAim('pause'), 'aborted'); assert.equal(f.$('slingCue').hidden, true);
  assert.equal(g.throwStone(), 'thrown'); assert.equal(g.enableSling(true, 3, 3, true), 3); assert.equal(f.$('slingCue').hidden, true);
  assert.equal(g.clearChapter(), 'cleared'); assert.equal(g.gameplayCues.foldRing, null); assert.deepEqual(calls, ['clear', 'pause', 'clear']);
});
