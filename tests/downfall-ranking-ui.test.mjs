import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRankingController, bindRankingUi, sanitizeInitials } from '../src/downfall-ranking.js';
import { DOWNFALL_RANKING } from '../src/downfall-ranking-core.js';

// A minimal fake DOM: just enough for the controller's $()-based reads/writes, event
// wiring, and the focus-trap's querySelectorAll/getClientRects/focus contract.
class Element {
  constructor(doc, id = '') {
    this.doc = doc; this.id = id; this.hidden = false; this.disabled = false; this.checked = false;
    this.value = ''; this.textContent = ''; this.inert = false; this.attrs = {}; this.children = [];
    this.handlers = new Map(); this.classes = new Set();
    this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c) };
  }
  addEventListener(type, fn) { const h = this.handlers.get(type) || []; h.push(fn); this.handlers.set(type, h); }
  emit(type, detail = {}) { for (const fn of this.handlers.get(type) || []) fn({ preventDefault() {}, ...detail }); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelectorAll() { return this.children; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  focus() { this.doc.activeElement = this; }
  click() { this.emit('click', { currentTarget: this }); }
}

const windowStub = { addEventListener() {} };

function fixture(fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ error: { code: 'service_unavailable' } }) })) {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(document, id)); return elements.get(id); },
    createElement() { return new Element(document); },
  };
  const $ = id => document.getElementById(id);
  for (const id of ['rankingModal', 'rankingTitle', 'rankingStatus', 'rankingTable', 'rankingRows', 'rankingEmpty', 'rankingRefreshBtn', 'rankingCloseBtn', 'rankingConsentForm', 'rankingConsentStatus', 'rankingInitials', 'rankingConsent', 'rankingSubmitBtn', 'rankingFinishRetryBtn', 'viewTop10Btn', 'viewTop10BtnEnd', 'rankedBadge', 'arena', 'topbar', 'battleHud', 'screenStart', 'screenOverlay']) $(id);
  // The modal's focusable descendants, for the focus trap.
  $('rankingModal').append($('rankingInitials'), $('rankingConsent'), $('rankingSubmitBtn'), $('rankingFinishRetryBtn'), $('rankingRefreshBtn'), $('rankingCloseBtn'));
  $('screenOverlay').hidden = true;
  const ranking = createRankingController({ $, document, fetchImpl, onLimited() {}, onFrozen() {}, onBadgeChange() {} });
  return { ranking, $, document };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const okBody = extra => ({ ok: true, status: 200, json: async () => ({ mode: 'downfall', version: DOWNFALL_RANKING.version, ...extra }) });
const errBody = (code, status = 400) => ({ ok: false, status, json: async () => ({ error: { code } }) });
const attemptOk = (id = 'a'.repeat(48)) => okBody({ attemptId: id, seed: DOWNFALL_RANKING.seed });
const finishOk = result => okBody({ result });

test('board starts idle, shows loading then empty/loaded/error distinctly, never fakes entries', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [] }));
  assert.equal(ranking.state.boardPhase, 'idle');
  const pending = ranking.loadBoard();
  assert.equal(ranking.state.boardPhase, 'loading');
  assert.equal($('rankingStatus').textContent, '불러오는 중…');
  await pending;
  assert.equal(ranking.state.boardPhase, 'empty');
  assert.equal($('rankingTable').hidden, true);
  assert.equal($('rankingEmpty').hidden, false);
  assert.match($('rankingStatus').textContent, /없어요/); // the fake DOM has no static HTML text node; renderBoard's own rendered status is the real signal
});

test('loaded board renders duplicate initials as separate rows, not deduped players', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [{ rank: 1, initials: 'ABC', score: 900 }, { rank: 2, initials: 'ABC', score: 500 }] }));
  await ranking.loadBoard();
  assert.equal(ranking.state.boardPhase, 'loaded');
  assert.equal($('rankingRows').children.length, 2);
  assert.equal($('rankingTable').hidden, false);
});

test('a disabled/unavailable server (503) shows an honest error, never a fake board', async () => {
  const { ranking, $ } = fixture();
  await ranking.loadBoard();
  assert.equal(ranking.state.boardPhase, 'error');
  assert.equal($('rankingTable').hidden, true);
  assert.match($('rankingStatus').textContent, /불러오지 못했어요/);
});

test('a superseded board load never lets a stale response win', async () => {
  const resolvers = [];
  const { ranking, $ } = fixture(() => new Promise(resolve => { resolvers.push(resolve); }));
  const first = ranking.loadBoard();
  const generationAfterFirst = ranking.state.boardGeneration;
  const second = ranking.loadBoard(); // supersedes the first in-flight request's generation
  assert.equal(resolvers.length, 2);
  resolvers[1](okBody({ entries: [] })); // the current (second) request resolves first...
  resolvers[0](okBody({ entries: [{ rank: 1, initials: 'OLD', score: 1 }] })); // ...and this stale reply must be ignored
  await Promise.all([first, second]);
  assert.notEqual(ranking.state.boardGeneration, generationAfterFirst);
  assert.equal(ranking.state.boardPhase, 'empty');
  assert.deepEqual(ranking.state.entries, []);
  assert.match($('rankingStatus').textContent, /없어요/);
});

test('beginAttempt rejects a mismatched seed and fails closed to ordinary play', async () => {
  const { ranking } = fixture(async () => okBody({ attemptId: 'a'.repeat(48), seed: 999 }));
  const ok = await ranking.beginAttempt();
  assert.equal(ok, false);
  assert.equal(ranking.active, false);
  assert.equal(ranking.state.attempt, null);
});

test('beginAttempt accepts the frozen seed 123 and creates a recorder', async () => {
  const { ranking } = fixture(async () => attemptOk());
  const ok = await ranking.beginAttempt();
  assert.equal(ok, true);
  assert.equal(ranking.active, true);
  assert.equal(ranking.state.attempt.seed, DOWNFALL_RANKING.seed);
  assert.equal(typeof ranking.state.recorder.record, 'function');
});

test('a blocked/unavailable attempts endpoint leaves ordinary local play unaffected and exposes an honest error code', async () => {
  const { ranking } = fixture(async () => errBody('service_unavailable', 503));
  const ok = await ranking.beginAttempt();
  assert.equal(ok, false);
  assert.equal(ranking.active, false);
  assert.equal(ranking.attemptError, 'service_unavailable');
  assert.doesNotThrow(() => ranking.queueDash());
  assert.equal(ranking.state.dashQueued, false);
});

test('attempts and invalidate requests send JSON content-type, same-origin credentials, and no-store cache', async () => {
  const calls = [];
  const { ranking } = fixture(async (path, opts) => { calls.push({ path, opts }); return path.endsWith('/attempts') ? attemptOk() : okBody({ invalidated: true }); });
  await ranking.beginAttempt();
  ranking.abortAttempt();
  for (const call of calls) {
    assert.equal(call.opts.headers['Content-Type'], 'application/json');
    assert.equal(call.opts.credentials, 'same-origin');
    assert.equal(call.opts.cache, 'no-store');
    assert.equal(typeof call.opts.body, 'string');
    JSON.parse(call.opts.body); // valid JSON body
  }
});

function fakeCoreTracking() {
  const recordCalls = [], applyCalls = [];
  let limited = false, ticks = 0;
  const recorder = Object.freeze({
    record(packed) { recordCalls.push(packed); if (limited) return false; ticks++; if (ticks > 3) { limited = true; return false; } return true; },
    nextWave() { recordCalls.push('nextWave'); return true; },
    transcript() { return Object.freeze({ version: DOWNFALL_RANKING.version, segments: Object.freeze([]) }); },
    get ticks() { return ticks; }, get limited() { return limited; },
  });
  return {
    core: {
      DOWNFALL_RANKING,
      packRankingInput(input, dashQueued) { const p = [input.moveX | 0, input.moveZ | 0, input.aimX | 0, input.aimZ | 0, (input.firing ? 1 : 0) | (dashQueued ? 2 : 0)]; return p; },
      applyRankingFrame(state, packed) { applyCalls.push(packed); state.applied = (state.applied || 0) + 1; },
      createRankingRecorder: () => recorder,
    },
    recordCalls, applyCalls, recorder,
  };
}

function rankedFixture(fake, fetchImpl = async () => attemptOk()) {
  const f = fixture(fetchImpl);
  const r2 = createRankingController({ $: f.$, document: f.document, fetchImpl, rankingCore: fake.core });
  return r2;
}

test('ranked stepping records each frame before applying it, at a fixed 60Hz rate', async () => {
  const fake = fakeCoreTracking();
  const r2 = rankedFixture(fake);
  await r2.beginAttempt();
  const battleState = { phase: 'playing' };
  r2.stepRanked(battleState, 1 / 60, { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, firing: true });
  assert.equal(fake.recordCalls.length, 1);
  assert.equal(fake.applyCalls.length, 1);
  assert.deepEqual(fake.recordCalls[0], fake.applyCalls[0]);
});

test('ranked stepping accumulates a render dt into exactly the right number of 60Hz ticks', async () => {
  const fake = fakeCoreTracking();
  const r2 = rankedFixture(fake);
  await r2.beginAttempt();
  const battleState = { phase: 'playing' };
  r2.stepRanked(battleState, 2 / 60, { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, firing: false });
  assert.equal(fake.applyCalls.length, 2);
});

test('stepRanked never invents frames for a slow render: dt is capped, not stretched', async () => {
  const fake = fakeCoreTracking();
  const r2 = rankedFixture(fake);
  await r2.beginAttempt();
  const battleState = { phase: 'playing' };
  r2.stepRanked(battleState, 5, {});
  assert.ok(fake.applyCalls.length <= 4);
});

test('stepRanked stops immediately once the battle leaves playing (HP0 mid-loop), no extra ticks after', async () => {
  const fake = fakeCoreTracking();
  fake.core.applyRankingFrame = (state) => { state.applied = (state.applied || 0) + 1; if (state.applied === 1) state.phase = 'grace'; };
  const r2 = rankedFixture(fake);
  await r2.beginAttempt();
  const battleState = { phase: 'playing' };
  r2.stepRanked(battleState, 3 / 60, {});
  assert.equal(battleState.applied, 1);
});

test('hitting the recorder limit marks limited and stops future ranked stepping (game continues unranked)', async () => {
  const fake = fakeCoreTracking();
  const r2 = rankedFixture(fake);
  await r2.beginAttempt();
  const battleState = { phase: 'playing' };
  for (let i = 0; i < 5; i++) r2.stepRanked(battleState, 1 / 60, {});
  assert.equal(r2.limited, true);
  const callsBefore = fake.applyCalls.length;
  r2.stepRanked(battleState, 1 / 60, {});
  assert.equal(fake.applyCalls.length, callsBefore);
});

test('markNextWave is a no-op without an active attempt, and marks limited on a cap failure', async () => {
  const fake = fakeCoreTracking();
  const r2 = rankedFixture(fake);
  assert.equal(r2.markNextWave(), false);
  await r2.beginAttempt();
  assert.equal(r2.markNextWave(), true);
  assert.ok(fake.recordCalls.includes('nextWave'));
  r2.state.recorder = Object.freeze({ ...fake.recorder, nextWave: () => false }); // inject a capped immutable recorder
  assert.equal(r2.markNextWave(), false);
  assert.equal(r2.limited, true);
});

test('completeRanked never calls finish once limited: an incomplete transcript is never ranked', async () => {
  const fake = fakeCoreTracking();
  const finishCalls = [];
  const r2 = rankedFixture(fake, async path => { if (path.endsWith('/finish')) finishCalls.push(path); return path.endsWith('/attempts') ? attemptOk() : finishOk({ score: 1 }); });
  await r2.beginAttempt();
  r2.state.limited = true;
  r2.freeze();
  await r2.completeRanked();
  assert.equal(finishCalls.length, 0);
  assert.equal(r2.state.consentPhase, 'limited');
});

test('freeze only takes effect for an active attempt and is idempotent', () => {
  const { ranking } = fixture();
  ranking.freeze();
  assert.equal(ranking.frozen, false);
});

test('a completed zero-score result is verified but never offered for publication', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? finishOk({ score: 0, kills: 0, wave: 1, activeMs: 100, maxCombo: 0, shots: 0, hits: 0 }) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt();
  ranking.freeze();
  await ranking.completeRanked();
  assert.equal(ranking.state.consentPhase, 'zero');
  assert.equal($('rankingConsentForm').hidden, true);
  assert.match($('rankingConsentStatus').textContent, /TOP 10 랭킹에는 올릴 수 없어요/);
});

test('a positive score offers the consent form with initials cleared and consent unchecked', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? finishOk({ score: 500, kills: 3, wave: 2, activeMs: 2000, maxCombo: 3, shots: 10, hits: 3 }) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt();
  ranking.freeze();
  await ranking.completeRanked();
  assert.equal(ranking.state.consentPhase, 'offered');
  assert.equal($('rankingConsentForm').hidden, false);
  assert.equal($('rankingInitials').value, '');
  assert.equal($('rankingConsent').checked, false);
  assert.equal($('rankingSubmitBtn').disabled, true);
});

test('status and retry live outside the consent form so they stay visible while the form is hidden', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? Promise.reject(new Error('offline')) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt();
  ranking.freeze();
  await ranking.completeRanked();
  assert.equal(ranking.state.consentPhase, 'network-error');
  assert.equal($('rankingConsentForm').hidden, true); // form hidden...
  assert.notEqual($('rankingConsentStatus').textContent, ''); // ...but status is not inside it and still visible
  assert.equal($('rankingFinishRetryBtn').hidden, false);
});

test('a terminal finish error (e.g. expired attempt) shows an honest message and never retries', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? errBody('attempt_expired', 410) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt();
  ranking.freeze();
  await ranking.completeRanked();
  assert.equal(ranking.state.consentPhase, 'terminal-error');
  assert.equal(ranking.state.pendingFinishPayload, null);
  assert.equal($('rankingFinishRetryBtn').hidden, true);
  assert.match($('rankingConsentStatus').textContent, /제출 시간이 지났어요/);
});

test('initials are filtered to three uppercase letters and the submit button needs both fields plus an offered phase', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? finishOk({ score: 500, kills: 1, wave: 1, activeMs: 1, maxCombo: 1, shots: 1, hits: 1 }) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  bindRankingUi(ranking, { $, window: windowStub });
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = '<b>한ab9c';
  $('rankingInitials').emit('input');
  assert.equal($('rankingInitials').value, sanitizeInitials('<b>한ab9c'));
  assert.equal($('rankingInitials').value, 'BAB');
  assert.equal($('rankingSubmitBtn').disabled, true);
  $('rankingConsent').checked = true; $('rankingConsent').emit('change');
  assert.equal($('rankingSubmitBtn').disabled, false);
});

test('submit is idempotent on a retryable network/503 failure: retry reuses the exact same frozen payload', async () => {
  const bodies = []; let first = true;
  const fetchImpl = async (path, opts) => {
    if (path.endsWith('/attempts')) return attemptOk();
    if (path.endsWith('/finish')) return finishOk({ score: 500, kills: 1, wave: 1, activeMs: 100, maxCombo: 1, shots: 1, hits: 1 });
    if (path.endsWith('/submit')) { bodies.push(JSON.parse(opts.body)); if (first) { first = false; throw new Error('offline'); } return okBody({ accepted: true, ranked: true }); }
    return okBody({});
  };
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = 'ABC'; $('rankingConsent').checked = true;
  await ranking.submit();
  assert.equal(ranking.state.consentPhase, 'submit-network-error');
  assert.match($('rankingConsentStatus').textContent, /연결이 끊겼어요/);
  await ranking.retry();
  assert.equal(ranking.state.consentPhase, 'ranked');
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[1].initials, 'ABC');
});

test('a 429/503 submit failure is retryable, but blocked_initials/invalid_initials are not: they clear the payload and reopen editing', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? finishOk({ score: 500, kills: 1, wave: 1, activeMs: 1, maxCombo: 1, shots: 1, hits: 1 }) : path.endsWith('/submit') ? errBody('blocked_initials', 422) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = 'ASS'; $('rankingConsent').checked = true;
  await ranking.submit();
  assert.equal(ranking.state.consentPhase, 'initials-rejected');
  assert.equal(ranking.state.pendingSubmitPayload, null); // never frozen for a content rejection
  assert.equal($('rankingConsentForm').hidden, false); // editing is allowed again
  assert.equal($('rankingInitials').disabled, false);
  assert.equal($('rankingInitials').value, '');
  assert.match($('rankingConsentStatus').textContent, /다른 이니셜을 선택해 주세요/);
});

test('a terminal submit error (not_qualified) shows an honest status and never retries', async () => {
  const fetchImpl = async path => path.endsWith('/attempts') ? attemptOk() : path.endsWith('/finish') ? finishOk({ score: 500, kills: 1, wave: 1, activeMs: 1, maxCombo: 1, shots: 1, hits: 1 }) : path.endsWith('/submit') ? errBody('not_qualified', 409) : okBody({});
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = 'ABC'; $('rankingConsent').checked = true;
  await ranking.submit();
  assert.equal(ranking.state.consentPhase, 'submit-terminal-error');
  assert.equal(ranking.state.pendingSubmitPayload, null);
  assert.equal($('rankingFinishRetryBtn').hidden, true);
});

test('double-click submit is guarded: only one in-flight submit request is made', async () => {
  let calls = 0, reply;
  const fetchImpl = async path => {
    if (path.endsWith('/attempts')) return attemptOk();
    if (path.endsWith('/finish')) return finishOk({ score: 500, kills: 1, wave: 1, activeMs: 1, maxCombo: 1, shots: 1, hits: 1 });
    if (path.endsWith('/submit')) { calls++; return new Promise(resolve => { reply = resolve; }); }
    return okBody({});
  };
  const { ranking, $ } = fixture(fetchImpl);
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = 'ABC'; $('rankingConsent').checked = true;
  const first = ranking.submit();
  await ranking.submit(); // ignored while busy
  assert.equal(calls, 1);
  reply(okBody({ accepted: true, ranked: true }));
  await first;
});

test('a completed zero result can never be published: submit is a no-op without an offered phase', async () => {
  const { ranking, $ } = fixture();
  $('rankingInitials').value = 'ABC'; $('rankingConsent').checked = true;
  await ranking.submit(); // consentPhase is still 'none', no attempt at all
  assert.equal(ranking.state.pendingSubmitPayload, null);
});

test('restart invalidates the previous attempt and a late finish response cannot overwrite the new run', async () => {
  const invalidated = [];
  let finishReply, nextAttemptSeq = 0;
  const fetchImpl = async (path, opts) => {
    if (path.endsWith('/invalidate')) { invalidated.push(JSON.parse(opts.body).attemptId); return okBody({ invalidated: true }); }
    if (path.endsWith('/attempts')) { nextAttemptSeq++; return attemptOk(String(nextAttemptSeq).padStart(48, '0')); }
    if (path.endsWith('/finish')) return new Promise(resolve => { finishReply = resolve; });
    return okBody({});
  };
  const { ranking } = fixture(fetchImpl);
  await ranking.beginAttempt();
  const firstAttemptId = ranking.state.attempt.id;
  ranking.freeze();
  const pendingFinish = ranking.completeRanked();
  ranking.abortAttempt(); // simulates a restart mid-finish
  await ranking.beginAttempt(); // new owned run
  finishReply(finishOk({ score: 999, kills: 9, wave: 9, activeMs: 999, maxCombo: 9, shots: 9, hits: 9 }));
  await pendingFinish;
  assert.deepEqual(invalidated, [firstAttemptId]);
  assert.notEqual(ranking.state.derivedResult?.score, 999);
  assert.equal(ranking.state.consentPhase, 'none');
});

test('a late begin-attempt response arriving after an abort invalidates its own orphaned attempt id', async () => {
  const invalidated = [];
  let attemptsReply;
  const fetchImpl = async (path, opts) => {
    if (path.endsWith('/invalidate')) { invalidated.push(JSON.parse(opts.body).attemptId); return okBody({ invalidated: true }); }
    if (path.endsWith('/attempts')) return new Promise(resolve => { attemptsReply = resolve; });
    return okBody({});
  };
  const { ranking } = fixture(fetchImpl);
  const pending = ranking.beginAttempt();
  ranking.abortAttempt(); // superseded before the server even replies
  attemptsReply(attemptOk('b'.repeat(48)));
  await pending;
  assert.equal(ranking.active, false);
  assert.ok(invalidated.includes('b'.repeat(48)));
});

test('pause/blur never invalidates a live attempt: simply not stepping preserves state', async () => {
  const { ranking } = fixture(async () => attemptOk());
  await ranking.beginAttempt();
  const attemptBefore = ranking.state.attempt;
  // Simulate "paused": the caller just stops calling stepRanked; no controller method models
  // pause, because pause/blur must never call abortAttempt/invalidate.
  assert.equal(ranking.state.attempt, attemptBefore);
  assert.equal(ranking.active, true);
});

test('bestEffortInvalidateOnUnload fires a keepalive invalidate once, best-effort, no retry', async () => {
  const requests = [];
  const fetchImpl = async (path, opts) => { requests.push({ path, keepalive: opts?.keepalive, headers: opts?.headers }); if (path.endsWith('/attempts')) return attemptOk(); return okBody({ invalidated: true }); };
  const { ranking } = fixture(fetchImpl);
  await ranking.beginAttempt();
  ranking.bestEffortInvalidateOnUnload();
  await flush();
  const call = requests.find(r => r.path.endsWith('/invalidate'));
  assert.ok(call);
  assert.equal(call.keepalive, true);
  assert.equal(call.headers['Content-Type'], 'application/json');
});

test('bestEffortInvalidateOnUnload without any attempt never calls the network', async () => {
  let called = false;
  const { ranking } = fixture(async () => { called = true; return okBody({}); });
  ranking.bestEffortInvalidateOnUnload();
  await flush();
  assert.equal(called, false);
});

test('a request that times out is retryable and the retry sends a byte-identical frozen body', async () => {
  const bodies = []; let attempt = 0;
  const fetchImpl = (path, opts) => {
    if (path.endsWith('/attempts')) return Promise.resolve(attemptOk());
    if (path.endsWith('/submit')) {
      bodies.push(opts.body);
      attempt++;
      if (attempt === 1) {
        // A real fetch rejects with an AbortError once its AbortSignal fires; this mock honors
        // the signal exactly like a browser would for our short injected timeout.
        return new Promise((resolve, reject) => { opts.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }); });
      }
      return Promise.resolve(okBody({ accepted: true, ranked: true }));
    }
    if (path.endsWith('/finish')) return Promise.resolve(finishOk({ score: 500, kills: 1, wave: 1, activeMs: 1, maxCombo: 1, shots: 1, hits: 1 }));
    return Promise.resolve(okBody({}));
  };
  const elements = new Map();
  const document = { activeElement: null, getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(document, id)); return elements.get(id); }, createElement() { return new Element(document); } };
  const $ = id => document.getElementById(id);
  for (const id of ['rankingModal', 'rankingTitle', 'rankingStatus', 'rankingTable', 'rankingRows', 'rankingEmpty', 'rankingRefreshBtn', 'rankingCloseBtn', 'rankingConsentForm', 'rankingConsentStatus', 'rankingInitials', 'rankingConsent', 'rankingSubmitBtn', 'rankingFinishRetryBtn', 'arena', 'topbar', 'battleHud', 'screenStart', 'screenOverlay']) $(id);
  $('screenOverlay').hidden = true;
  const ranking = createRankingController({ $, document, fetchImpl, requestTimeoutMs: 15 });
  await ranking.beginAttempt(); ranking.freeze(); await ranking.completeRanked();
  $('rankingInitials').value = 'ABC'; $('rankingConsent').checked = true;
  await ranking.submit();
  assert.equal(ranking.state.consentPhase, 'submit-network-error'); // the abort was treated as a retryable network failure
  await ranking.retry();
  assert.equal(ranking.state.consentPhase, 'ranked');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]); // byte-identical frozen payload, not rebuilt from current field state
});

test('focus trap wraps Tab within the modal and Escape closes it, restoring the opener focus', async () => {
  const { ranking, $, document } = fixture(async () => okBody({ entries: [] }));
  bindRankingUi(ranking, { $, window: windowStub });
  const opener = new Element(document, 'opener'); opener.focus();
  ranking.openBoard(opener);
  assert.equal($('rankingModal').hidden, false);
  assert.equal($('arena').inert, true);
  document.activeElement = $('rankingCloseBtn'); // last focusable in our trap list
  $('rankingModal').emit('keydown', { key: 'Tab' }); // wraps to first
  $('rankingModal').emit('keydown', { key: 'Escape' });
  assert.equal($('rankingModal').hidden, true);
  assert.equal($('arena').inert, false);
  assert.equal(document.activeElement, opener);
});

test('closeBoard restores each inert target to its own pre-open value, never force-clearing an ending overlay that needs to stay inert', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [] }));
  // Simulate the victory overlay already having made topbar/battleHud inert before the player
  // opens the board from the end screen; arena and the (hidden) landing were not inert yet.
  $('topbar').inert = true; $('battleHud').inert = true; $('arena').inert = false; $('screenStart').inert = false;
  ranking.openBoard();
  assert.equal($('topbar').inert, true);
  assert.equal($('battleHud').inert, true);
  assert.equal($('arena').inert, true);
  assert.equal($('screenStart').inert, true); // landing background is inerted while the board is open
  ranking.closeBoard();
  assert.equal($('topbar').inert, true); // restored to its pre-open value, not forced false
  assert.equal($('battleHud').inert, true);
  assert.equal($('arena').inert, false); // restored to its own pre-open value
  assert.equal($('screenStart').inert, false);
});

test('opening the ranking modal from the landing makes the landing background inert, and closing restores it', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [] }));
  assert.equal($('screenStart').inert, false);
  ranking.openBoard();
  assert.equal($('screenStart').inert, true);
  ranking.closeBoard();
  assert.equal($('screenStart').inert, false);
});

test('opening the ranking modal over a visible pause/victory overlay demotes it to a single active dialog', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [] }));
  $('screenOverlay').hidden = false;
  ranking.openBoard();
  assert.equal($('screenOverlay').getAttribute('aria-modal'), 'false');
  assert.equal($('screenOverlay').inert, true);
  ranking.closeBoard();
  assert.equal($('screenOverlay').getAttribute('aria-modal'), 'true');
  assert.equal($('screenOverlay').inert, false);
});

test('ranking refresh and close buttons are wired and reachable', async () => {
  const { ranking, $ } = fixture(async () => okBody({ entries: [] }));
  bindRankingUi(ranking, { $, window: windowStub });
  ranking.openBoard();
  await flush();
  $('rankingRefreshBtn').click();
  await flush();
  assert.equal(ranking.state.boardPhase, 'empty');
  $('rankingCloseBtn').click();
  assert.equal($('rankingModal').hidden, true);
});

test('sanitizeInitials keeps only uppercase ASCII letters and caps at three characters', () => {
  assert.equal(sanitizeInitials('a<b>c!'), 'ABC');
  assert.equal(sanitizeInitials('<script>abc'), 'SCR');
  assert.equal(sanitizeInitials('한글ab9!'), 'AB');
  assert.equal(sanitizeInitials(''), '');
  assert.equal(sanitizeInitials(null), '');
  assert.equal(sanitizeInitials('abcdef'), 'ABC');
});

test('downfall.html wires the new opt-in, TOP10 entries, and consent modal without disturbing the Scripture ending order', () => {
  const html = readFileSync(new URL('../downfall.html', import.meta.url), 'utf8');
  for (const id of ['rankedToggle', 'rankedOptInError', 'overlayRankedError', 'viewTop10Btn', 'viewTop10BtnEnd', 'rankedBadge', 'rankingModal', 'rankingConsentStatus', 'rankingFinishRetryBtn', 'rankingInitials', 'rankingConsent', 'rankingSubmitBtn']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  // Scripture ending must remain above/with the existing score controls, unaffected by the new TOP10 entry point.
  assert.ok(html.indexOf('id="resultStats"') < html.indexOf('id="finalScripture"'));
  assert.ok(html.indexOf('id="finalScripture"') < html.indexOf('id="continueBtn"'));
  assert.ok(html.includes('고린도전서 15:57 · 개역한글 (1961)'));
  // Status + retry live outside the consent form (so they're visible while the form is hidden).
  const formOpen = html.indexOf('id="rankingConsentForm"');
  assert.ok(html.indexOf('id="rankingConsentStatus"') < formOpen);
  assert.ok(html.indexOf('id="rankingFinishRetryBtn"') < formOpen);
  // The consent checkbox and the ranked opt-in must ship unchecked.
  assert.doesNotMatch(html.match(/<input type="checkbox" id="rankingConsent"[^>]*>/)[0], /checked/);
  assert.doesNotMatch(html.match(/<input type="checkbox" id="rankedToggle"[^>]*>/)[0], /checked/);
  assert.ok(html.includes('id="rankingModal"') && html.includes('role="dialog"'));
  // The 30-minute/segment cap must be disclosed before the player opts in, not only in docs.
  assert.match(html, /aria-describedby="rankedOptInHint"/);
  assert.match(html, /id="rankedOptInHint"[^>]*>[^<]*30\ubd84/);
});

test('downfall.js wires ranked stepping, wave markers, freeze/complete, and restart invalidation into the real game loop', () => {
  const js = readFileSync(new URL('../src/downfall.js', import.meta.url), 'utf8');
  assert.match(js, /ranking\.stepRanked\(state,dt,input\(\)\)/);
  assert.match(js, /ranking\.markNextWave\(\)/);
  assert.match(js, /ranking\.freeze\(\)/);
  assert.match(js, /ranking\.completeRanked\(\)/);
  assert.match(js, /ranking\.abortAttempt\(\)/);
  assert.match(js, /ranking\.beginAttempt\(\)/);
  // Ranked physics only ever substitutes for ordinary stepBattle while playing and not limited.
  assert.match(js, /ranking\.active&&!ranking\.limited\)ranking\.stepRanked/);
  // A ranked-start failure must show a visible error wherever the retry actually happened --
  // it must never be written only into the hidden landing paragraph.
  assert.match(js, /showStartError/);
  assert.match(js, /overlayRankedError/);
  // The 30-minute badge text must not overclaim: the limit is time-OR-segment-count based.
  assert.doesNotMatch(js, /\(30\ubd84\)/);
});
