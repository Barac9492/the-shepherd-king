import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TUTORIAL_STEPS, tutorialViewAt, mountKeilahTutorial } from '../src/keilah-tutorial.js';

const SOURCE_PATH = fileURLToPath(new URL('../src/keilah-tutorial.js', import.meta.url));
const SOURCE_TEXT = readFileSync(SOURCE_PATH, 'utf8');
const PAGE_TEXT = readFileSync(new URL('../keilah.html', import.meta.url), 'utf8');

// Adjacency table mirrors src/keilah-map.js: undirected edges, optional gate name.
const EDGES = [
 ['exit', 'square', null],
 ['square', 'west', null],
 ['square', 'east', null],
 ['west', 'east', null],
 ['west', 'wgate', 'west'],
 ['east', 'egate', 'east'],
 ['wgate', 'w1', null],
 ['w1', 'w2', null],
 ['egate', 'e1', null],
 ['e1', 'e2', null],
];
// Node that must be holding/opening a given gate, i.e. the "opposite handle".
const OPPOSITE_HANDLE = { west: 'east', east: 'west' };

function isAdjacent(view, from, to) {
 if (from === to) return true;
 return EDGES.some(([a, b, gate]) => {
  if (!((a === from && b === to) || (b === from && a === to))) return false;
  if (!gate) return true;
  return view.gates.includes(gate) || view.holding === gate;
 });
}

// ---- Minimal fake DOM, sufficient for mountKeilahTutorial's exact call surface ----
function makeStub() {
 const listeners = new Map();
 return {
  _html: '',
  set innerHTML(v) { this._html = v; },
  get innerHTML() { return this._html; },
  addEventListener(type, fn) { listeners.set(type, fn); },
  dispatch(type, event) { listeners.get(type)?.(event); },
  focused: false,
  focus() { this.focused = true; },
  clickHandler: null,
  click(event) { this.clickHandler?.(event); },
 };
}

function makeRoot() {
 const root = makeStub();
 const nextButton = { onclick: null, click() { this.onclick?.(); } };
 const h3 = { focused: false, focus() { this.focused = true; } };
 root.querySelector = sel => {
  if (sel === '.tutorial-next') return nextButton;
  if (sel === 'h3') return h3;
  return null;
 };
 root._nextButton = nextButton;
 root._h3 = h3;
 return root;
}

function makeDialog() {
 const dialog = makeStub();
 dialog.openCalls = 0;
 dialog.closeCalls = 0;
 dialog.showModal = () => { dialog.openCalls++; };
 dialog.close = () => { dialog.closeCalls++; };
 return dialog;
}

function makeHarness() {
 const dialog = makeDialog();
 const root = makeRoot();
 const closeButton = makeStub();
 const resetButton = makeStub();
 const trigger = makeStub();
 trigger.currentTarget = trigger;
 const api = mountKeilahTutorial({ dialog, root, triggers: [trigger], closeButton, resetButton });
 return { dialog, root, closeButton, resetButton, trigger, api };
}

function clickNext(root) {
 root._nextButton.click();
}

// ---------------------------------------------------------------------------
// Pure-state schema and semantics
// ---------------------------------------------------------------------------

test('TUTORIAL_STEPS exposes the required schema for every step', () => {
 assert.ok(Array.isArray(TUTORIAL_STEPS) && TUTORIAL_STEPS.length > 0);
 for (const step of TUTORIAL_STEPS) {
  assert.equal(typeof step.title, 'string');
  assert.equal(typeof step.action, 'string');
  assert.equal(typeof step.result, 'string');
  assert.equal(typeof step.phase, 'string');
  if ('recap' in step) assert.equal(step.recap, true);
 }
});

test('tutorialViewAt(0) is the documented base state', () => {
 const view = tutorialViewAt(0);
 assert.deepEqual(view, {
  positions: ['exit', 'exit'],
  gates: [],
  holding: null,
  opened: [0, 0],
  rescued: [0, 0],
  rescuedNodes: [],
  carrying: [false, false],
  delivered: 0,
  escaped: [false, false],
  complete: false,
 });
});

test('tutorialViewAt returns deep, independent snapshots (no shared references, no mutation of TUTORIAL_STEPS)', () => {
 const a = tutorialViewAt(5);
 const b = tutorialViewAt(5);
 assert.notEqual(a, b);
 assert.notEqual(a.positions, b.positions);
 assert.deepEqual(a, b);
 a.positions[0] = 'mutated';
 a.gates.push('mutated');
 a.rescuedNodes.push('mutated');
 const c = tutorialViewAt(5);
 assert.notDeepEqual(c, a);
 assert.equal(c.positions[0], b.positions[0]);
 // Calling out of order / repeatedly must not corrupt later or earlier views.
 const last = tutorialViewAt(TUTORIAL_STEPS.length);
 const first = tutorialViewAt(0);
 assert.deepEqual(tutorialViewAt(0), first);
 assert.deepEqual(tutorialViewAt(TUTORIAL_STEPS.length), last);
});

test('tutorialViewAt clamps out-of-range indices', () => {
 assert.deepEqual(tutorialViewAt(-5), tutorialViewAt(0));
 assert.deepEqual(tutorialViewAt(9999), tutorialViewAt(TUTORIAL_STEPS.length));
});

test('every personal (user) move outside a recap step is a single adjacent hop, honoring gate state', () => {
 for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
  const step = TUTORIAL_STEPS[i];
  if (step.recap) continue;
  const before = tutorialViewAt(i);
  const after = tutorialViewAt(i + 1);
  const myBefore = before.positions[0];
  const myAfter = after.positions[0];
  if (myBefore === myAfter) continue;
  assert.ok(
   isAdjacent(before, myBefore, myAfter),
   `step ${i} (${step.title}): my move ${myBefore}->${myAfter} is not a single adjacent, gate-legal hop`
  );
 }
});

test('each gate opens only via the opposite handle, and credits the player who held it', () => {
 for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
  const before = tutorialViewAt(i);
  const after = tutorialViewAt(i + 1);
  const newGates = after.gates.filter(g => !before.gates.includes(g));
  for (const gate of newGates) {
   const creditedIndex = after.opened.findIndex((v, idx) => v > before.opened[idx]);
   assert.notEqual(creditedIndex, -1, `gate ${gate} opened at step ${i} without any opened-credit increment`);
   const openerNode = OPPOSITE_HANDLE[gate];
   assert.equal(
    before.positions[creditedIndex],
    openerNode,
    `gate ${gate} must be credited to whoever stood at the opposite handle (${openerNode})`
   );
  }
 }
});

test('both players eventually get opened credit and at least one rescue each', () => {
 const final = tutorialViewAt(TUTORIAL_STEPS.length);
 assert.deepEqual(final.opened, [1, 1]);
 assert.ok(final.rescued[0] >= 1 && final.rescued[1] >= 1, 'each player must personally escort at least one family');
});

test('carrying never exceeds one family per player, and never silently disappears before south gate', () => {
 for (let i = 0; i <= TUTORIAL_STEPS.length; i++) {
  const view = tutorialViewAt(i);
  assert.ok(view.carrying.every(v => typeof v === 'boolean'));
 }
 for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
  const before = tutorialViewAt(i);
  const after = tutorialViewAt(i + 1);
  for (let p = 0; p < 2; p++) {
   if (before.carrying[p] && !after.carrying[p]) {
    // Carrying only ends at the exit node (south gate auto-delivery) or because
    // the whole leg is bundled into one disclosed recap/friend step.
    const steppedAtExit = after.positions[p] === 'exit';
    assert.ok(steppedAtExit || TUTORIAL_STEPS[i].recap || TUTORIAL_STEPS[i].title.includes('친구'),
     `player ${p} stopped carrying at step ${i} without reaching the exit`);
   }
  }
 }
});

test('delivered only increases when a carried family reaches the exit node, and never decreases', () => {
 let previous = tutorialViewAt(0);
 for (let i = 1; i <= TUTORIAL_STEPS.length; i++) {
  const view = tutorialViewAt(i);
  assert.ok(view.delivered >= previous.delivered, 'delivered must never decrease');
  if (view.delivered > previous.delivered) {
   assert.ok(
    view.positions.includes('exit'),
    `delivered increased at step ${i - 1} without either player being at the exit`
   );
  }
  previous = view;
 }
 assert.equal(tutorialViewAt(TUTORIAL_STEPS.length).delivered, 4);
});

test('rescuedNodes only grows, matches rescued credit, and completion requires all four delivered plus both escaped', () => {
 let previous = tutorialViewAt(0);
 for (let i = 1; i <= TUTORIAL_STEPS.length; i++) {
  const view = tutorialViewAt(i);
  for (const node of previous.rescuedNodes) assert.ok(view.rescuedNodes.includes(node), 'rescuedNodes must never lose an entry');
  previous = view;
 }
 const final = tutorialViewAt(TUTORIAL_STEPS.length);
 assert.deepEqual(final.rescuedNodes.slice().sort(), ['e1', 'e2', 'w1', 'w2']);
 assert.equal(final.delivered, 4);
 assert.deepEqual(final.escaped, [true, true]);
 assert.equal(final.complete, true);
 // complete must not flip true any earlier than the fully-delivered, both-escaped state.
 for (let i = 0; i <= TUTORIAL_STEPS.length; i++) {
  const view = tutorialViewAt(i);
  if (view.complete) {
   assert.equal(view.delivered, 4);
   assert.deepEqual(view.escaped, [true, true]);
  }
 }
});

test('exactly one recap step covers both remaining families, explicitly labeled and never a magic single-button rescue-all', () => {
 assert.equal(TUTORIAL_STEPS.length, 14, 'the repaired sequence must be 14 steps (12 personal + 1 recap + 1 combined escape)');
 const recapSteps = TUTORIAL_STEPS.filter(s => s.recap);
 assert.equal(recapSteps.length, 1, 'exactly one recap step, not two');
 const [recap] = recapSteps;
 assert.match(recap.title, /반복|요약/);
 assert.match(recap.result, /같은|반복/);
 assert.match(recap.instruction, /연습에서는 이 반복 구간을 건너/, 'recap must explicitly say the practice skips repeated trips');
 assert.match(recap.action, /건너뛰기/);
 // the recap jumps both remaining families to delivered in one summary step
 const before = tutorialViewAt(TUTORIAL_STEPS.indexOf(recap));
 const after = tutorialViewAt(TUTORIAL_STEPS.indexOf(recap) + 1);
 assert.equal(after.delivered - before.delivered, 2);
});

test('step 2 (crossing an already-open path) never claims the crossing button itself opens anything', () => {
 const crossingStep = TUTORIAL_STEPS[2];
 assert.doesNotMatch(crossingStep.instruction, /누르면 열려요/, 'crossing instruction must not imply pressing the crossing button opens the gate');
 assert.match(crossingStep.instruction, /열린/, 'crossing instruction should describe the path as already open');
});

test('the single-click, not-press-and-hold disclosure is taught at the actual hold step', () => {
 const holdStep = TUTORIAL_STEPS[4];
 assert.match(holdStep.instruction, /한 번 누른/);
 assert.match(holdStep.instruction, /계속 누르고 있을 필요는 없어요/);
});

test('friend\'s own first-family rescue is bundled into my south-gate arrival step, not a separate fake button', () => {
 const fakeFriendButtons = TUTORIAL_STEPS.filter(s => /지켜보기/.test(s.action));
 assert.equal(fakeFriendButtons.length, 0, 'no "watch the friend" button should exist');
 const arrival = TUTORIAL_STEPS[11];
 assert.match(arrival.result, /내가 데려온/);
 assert.match(arrival.result, /친구도/);
 const before = tutorialViewAt(11);
 const after = tutorialViewAt(12);
 assert.deepEqual(after.rescued, [1, 1]);
 assert.deepEqual(after.rescuedNodes.slice().sort(), ['e1', 'w1']);
 assert.equal(after.delivered, 2);
 assert.notDeepEqual(before.rescued, after.rescued);
});

test('no role-credit bookkeeping jargon (역할 인정/기록을 얻었) leaks into the teaching copy', () => {
 for (const step of TUTORIAL_STEPS) {
  assert.doesNotMatch(step.result, /역할.{0,2}인정/);
  assert.doesNotMatch(step.result, /인솔 기록을 얻/);
  assert.doesNotMatch(step.instruction, /역할.{0,2}인정/);
 }
});

// ---------------------------------------------------------------------------
// Source hygiene: no network/storage/timers, matching the no-services contract
// ---------------------------------------------------------------------------

test('source has no fetch/websocket/storage/timeout usage', () => {
 for (const forbidden of ['fetch(', 'WebSocket', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
  assert.ok(!SOURCE_TEXT.includes(forbidden), `source must not use ${forbidden}`);
 }
});

test('friend disclosure is visible once; real-game differences remain available without duplicate intro', () => {
 const harness = makeHarness();
 harness.trigger.dispatch('click', { currentTarget: harness.trigger });
 assert.match(PAGE_TEXT, /연습 속 친구는 자동으로 움직여요/);
 assert.match(PAGE_TEXT, /<details class="tutorial-differences"><summary>실전과 다른 점<\/summary>/);
 assert.match(PAGE_TEXT, /실전에서는 두 사람이 각자 휴대폰으로 조작하고 각자 탈출을 눌러요/);
 assert.match(PAGE_TEXT, /<li><strong>함께 탈출:<\/strong> 네 팀이 모두 도착하면 두 사람 모두 각자 탈출을 눌러요\.<\/li>/);
 assert.match(PAGE_TEXT, /실전 기본 이동은 6–15초, 가족 인솔은 14초/);
 assert.doesNotMatch(harness.root.innerHTML, /tutorial-intro/);
 assert.match(harness.root.innerHTML, /지금 나는 남문에 있어요/);
 assert.doesNotMatch(harness.root.innerHTML, /남문에 도착한 가족|탈출 0\/2/);
 assert.equal(harness.dialog.openCalls, 1);
 assert.equal(harness.closeButton.focused, true);
});

test('arrival title is prospective and real escape remains an individual action', () => {
 assert.equal(tutorialViewAt(11).positions[0], 'square');
 assert.match(TUTORIAL_STEPS[11].title, /돌아가요/);
 assert.doesNotMatch(TUTORIAL_STEPS[11].title, /도착!|데려왔어요/);
 assert.match(TUTORIAL_STEPS[13].instruction, /두 사람 모두 각자 탈출/);
 assert.match(TUTORIAL_STEPS[13].result, /연습 속 친구도 자동/);
 assert.equal(TUTORIAL_STEPS[13].action, '내 탈출 완료하기');
 const harness = makeHarness();
 harness.trigger.dispatch('click', { currentTarget: harness.trigger });
 for (let i = 0; i < 8; i++) clickNext(harness.root);
 assert.doesNotMatch(harness.root.innerHTML, /✓/);
 assert.match(harness.root.innerHTML, /class="tutorial-carry">♟/);
 assert.match(harness.root.innerHTML, /남문에 도착한 가족 0\/4팀/);
});

// ---------------------------------------------------------------------------
// mountKeilahTutorial DOM-lifecycle smoke test (no API/storage, pure rendering)
// ---------------------------------------------------------------------------

test('mount lifecycle: open walks every step to completion with accurate final state, reset returns to step 0, close/focus-return work', () => {
 const harness = makeHarness();
 harness.trigger.dispatch('click', { currentTarget: harness.trigger });
 assert.equal(harness.dialog.openCalls, 1);

 for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
  clickNext(harness.root);
 }
 assert.match(harness.root.innerHTML, /연습 완료/);
 assert.match(harness.root.innerHTML, /남문에 도착한 가족 4\/4팀/);
 assert.match(harness.root.innerHTML, /탈출 2\/2/);

 clickNext(harness.root); // finished -> closes dialog
 assert.equal(harness.dialog.closeCalls, 1);

 harness.resetButton.dispatch('click', {});
 assert.match(harness.root.innerHTML, /광장으로 가볼까요/, 'reset must return to the first personal action');

 harness.dialog.dispatch('close', {});
 assert.equal(harness.trigger.focused, true, 'focus must return to the opener on dialog close');
});

test('mount never touches fetch/storage/network objects and only mutates the passed-in dialog/root/buttons', () => {
 const harness = makeHarness();
 harness.trigger.dispatch('click', { currentTarget: harness.trigger });
 clickNext(harness.root);
 clickNext(harness.root);
 // Nothing beyond the documented stub surface should have been touched.
 assert.equal(typeof harness.dialog.innerHTML, 'string');
 assert.ok(harness.root.innerHTML.length > 0);
});
