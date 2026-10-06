// Downfall online TOP10 ranking: UI-side controller + DOM wiring only.
// The fixed-60Hz physics/replay contract and the five API routes are owned by other agents;
// this module only drives them from the existing local battle UI (downfall.js / downfall-core.js).
import { DOWNFALL_RANKING, packRankingInput, applyRankingFrame, createRankingRecorder } from './downfall-ranking-core.js';

export const RANKING_API = '/api/downfall-challenge';
const FIXED_STEP = 1 / DOWNFALL_RANKING.hz;
const REQUEST_TIMEOUT_MS = 10000;

// Matches server/downfall-ranking-service.mjs error codes. Only these ever retry with the
// exact same frozen payload; everything else is a terminal, honestly-displayed status.
const RETRYABLE_CODES = new Set(['rate_limited', 'server_busy', 'service_unavailable', 'network']);
const INITIALS_EDITABLE_CODES = new Set(['invalid_initials', 'blocked_initials']);
const TERMINAL_MESSAGES = {
  attempt_expired: '이 도전의 제출 시간이 지났어요. 새 도전을 시작해 주세요.',
  attempt_invalid: '이 도전은 더 이상 유효하지 않아요. 새 도전을 시작해 주세요.',
  attempt_not_found: '이 도전을 찾을 수 없어요. 새 도전을 시작해 주세요.',
  attempt_conflict: '이 도전은 이전 요청과 충돌해요. 새 도전을 시작해 주세요.',
  unsupported_version: '랭킹 규칙이 바뀌었어요. 새 도전을 시작해 주세요.',
  future_timing: '기록을 확인할 수 없어요. 새 도전을 시작해 주세요.',
  attempt_unverified: '먼저 결과를 확인해야 해요.',
  not_qualified: '이 점수는 랭킹에 올릴 수 없어요.',
  invalid_result: '이 도전을 확인할 수 없었어요. 새 도전을 시작해 주세요.',
  public_consent_required: '공개 동의가 필요해요.',
  invalid_response: '랭킹 서버 응답을 확인할 수 없었어요. 새 도전을 시작해 주세요.',
};
const terminalMessage = code => TERMINAL_MESSAGES[code] || '이 요청을 처리할 수 없어요. 새 도전을 시작해 주세요.';

export const sanitizeInitials = raw => String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

const defaultFetch = (...args) => (typeof fetch === 'function' ? fetch(...args) : Promise.reject(new Error('no fetch')));

// Pure controller: all DOM reads/writes go through the injected `$` so this is testable
// with a minimal fake document and without any real network, Three.js, or timers.
// Inert while the modal is open: the landing page behind it, plus the in-battle chrome. Each
// element's PRIOR inert value is snapshotted and restored exactly on close, so this never
// fights with an already-inert ending overlay underneath.
const INERT_TARGETS = ['arena', 'topbar', 'battleHud', 'screenStart'];

export function createRankingController({
  $,
  document,
  fetchImpl = defaultFetch,
  rankingCore = { DOWNFALL_RANKING, packRankingInput, applyRankingFrame, createRankingRecorder },
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  onLimited = () => {},
  onFrozen = () => {},
  onBadgeChange = () => {},
} = {}) {
  const core = rankingCore;
  const state = {
    boardPhase: 'idle', // idle | loading | loaded | empty | error
    entries: [],
    attempt: null, // {id, seed}
    attemptError: null,
    recorder: null,
    active: false, // ranked fixed-step physics currently engaged for this run
    limited: false, // 30-minute / segment cap reached; ordinary local play continues unranked
    frozen: false, // HP0 grace entered; score is frozen, no further frames recorded
    dashQueued: false,
    accumulator: 0,
    boardGeneration: 0,
    attemptGeneration: 0,
    finishGeneration: 0,
    finishBusy: false,
    submitBusy: false,
    derivedResult: null,
    // none | pending | offered | zero | limited | network-error | terminal-error |
    // submitting | initials-rejected | submit-network-error | submit-terminal-error | ranked | not-ranked
    consentPhase: 'none',
    pendingFinishPayload: null,
    pendingSubmitPayload: null,
    boardOpen: false,
    returnFocus: null,
    overlayWasVisible: false,
    previousInert: null,
  };

  async function request(path, { method = 'GET', body } = {}) {
    const hasAbort = typeof AbortController === 'function';
    const controller = hasAbort ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), requestTimeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(`${RANKING_API}${path}`, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller?.signal,
      });
    } catch {
      const err = new Error('network'); err.code = 'network'; err.retryable = true; throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    let responseBody = null;
    try { responseBody = await res.json(); } catch { responseBody = null; }
    if (!res.ok) {
      const code = responseBody?.error?.code || 'service_unavailable';
      const err = new Error(code);
      err.code = code; err.status = res.status;
      err.retryable = res.status === 429 || res.status === 503 || RETRYABLE_CODES.has(code);
      err.editableInitials = INITIALS_EDITABLE_CODES.has(code);
      throw err;
    }
    if (!responseBody || responseBody.mode !== 'downfall' || responseBody.version !== core.DOWNFALL_RANKING.version) {
      const err = new Error('invalid_response'); err.code = 'invalid_response'; throw err;
    }
    return responseBody;
  }

  function updateBadge() { onBadgeChange({ active: state.active, limited: state.limited }); }

  // ---- TOP10 board (landing + end screen; viewable without any attempt/consent) ----
  function renderBoard() {
    const status = $('rankingStatus'), table = $('rankingTable'), rows = $('rankingRows'), empty = $('rankingEmpty'), refresh = $('rankingRefreshBtn');
    if (!status) return;
    if (state.boardPhase === 'loading') { status.textContent = '불러오는 중…'; table.hidden = true; empty.hidden = true; refresh.hidden = true; return; }
    if (state.boardPhase === 'error') { status.textContent = '랭킹을 불러오지 못했어요. 온라인 순위표가 아직 연결되지 않았을 수 있어요.'; table.hidden = true; empty.hidden = true; refresh.hidden = false; return; }
    if (state.boardPhase === 'empty') { status.textContent = '아직 TOP 10 랭킹에 제출된 기록이 없어요.'; table.hidden = true; empty.hidden = false; refresh.hidden = false; return; }
    status.textContent = '모두에게 보이는 TOP 10 랭킹입니다. 동점은 먼저 제출된 기록이 앞서요.'; table.hidden = false; empty.hidden = true; refresh.hidden = false;
    rows.replaceChildren(...state.entries.map(entry => {
      const tr = document.createElement('tr');
      const rank = document.createElement('td'); rank.textContent = String(entry.rank);
      const initials = document.createElement('td'); initials.textContent = String(entry.initials ?? '');
      const score = document.createElement('td'); score.textContent = Number(entry.score ?? 0).toLocaleString('ko-KR');
      tr.append(rank, initials, score);
      return tr;
    }));
  }

  async function loadBoard() {
    const g = ++state.boardGeneration;
    state.boardPhase = 'loading'; renderBoard();
    try {
      const body = await request('/record', { method: 'GET' });
      if (g !== state.boardGeneration) return;
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 10) : [];
      state.entries = entries;
      state.boardPhase = entries.length ? 'loaded' : 'empty';
    } catch {
      if (g !== state.boardGeneration) return;
      state.entries = [];
      state.boardPhase = 'error';
    }
    renderBoard();
  }

  function focusablesIn(panel) {
    return [...panel.querySelectorAll('button:not([hidden]),a[href],input:not([hidden])')].filter(el => !el.disabled && el.getClientRects().length > 0);
  }

  function trapFocus(panelId) {
    const panel = $(panelId);
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeBoard(); return; }
      if (e.key !== 'Tab') return;
      const focusables = focusablesIn(panel);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // Snapshot every target's current inert value once, then restore each one exactly on close --
  // never force-clear inert on an element the ending overlay (or anything else) already needed.
  function applyInert(on) {
    if (on) {
      state.previousInert = {};
      for (const id of INERT_TARGETS) { const el = $(id); if (el) { state.previousInert[id] = el.inert; el.inert = true; } }
    } else {
      for (const id of INERT_TARGETS) { const el = $(id); if (el) el.inert = state.previousInert?.[id] ?? false; }
      state.previousInert = null;
    }
  }

  // Only one dialog may be the active aria-modal at a time. If the pause/victory overlay is
  // already open underneath, demote it (aria-modal=false + inert) while this one is open, and
  // restore it exactly as found on close -- never leave two competing modal dialogs.
  function demoteUnderlyingOverlay(demote) {
    const overlay = $('screenOverlay');
    if (!overlay) return;
    if (demote) {
      state.overlayWasVisible = !overlay.hidden;
      if (state.overlayWasVisible) { overlay.setAttribute('aria-modal', 'false'); overlay.inert = true; }
    } else if (state.overlayWasVisible) {
      overlay.setAttribute('aria-modal', 'true'); overlay.inert = false;
    }
    if (!demote) state.overlayWasVisible = false;
  }

  function openBoard(opener) {
    state.boardOpen = true;
    state.returnFocus = opener || document.activeElement;
    demoteUnderlyingOverlay(true);
    $('rankingModal').hidden = false;
    applyInert(true);
    const focusable = ['offered', 'initials-rejected'].includes(state.consentPhase) ? $('rankingInitials') : $('rankingTitle');
    focusable?.focus();
    loadBoard();
  }

  function closeBoard() {
    state.boardOpen = false;
    $('rankingModal').hidden = true;
    applyInert(false);
    demoteUnderlyingOverlay(false);
    state.returnFocus?.focus?.();
  }

  // ---- Ranked run lifecycle: one attempt owns one recorder; restart always invalidates the old one ----
  function resetRunState() {
    state.active = false; state.limited = false; state.frozen = false; state.recorder = null;
    state.accumulator = 0; state.dashQueued = false; state.derivedResult = null;
    state.consentPhase = 'none'; state.pendingFinishPayload = null; state.pendingSubmitPayload = null;
    state.finishBusy = false; state.submitBusy = false;
  }

  function abortAttempt() {
    const attempt = state.attempt;
    state.attemptGeneration++; state.finishGeneration++;
    resetRunState();
    state.attempt = null; state.attemptError = null;
    updateBadge();
    if (attempt) request('/invalidate', { method: 'POST', body: { attemptId: attempt.id } }).catch(() => {});
  }

  async function beginAttempt() {
    abortAttempt();
    const g = state.attemptGeneration;
    try {
      const body = await request('/attempts', { method: 'POST', body: {} });
      if (g !== state.attemptGeneration) {
        // A restart/abort superseded this in-flight request after the server already issued an
        // attempt id. That orphaned capability is never ours to use; invalidate it too.
        if (body.attemptId) request('/invalidate', { method: 'POST', body: { attemptId: body.attemptId } }).catch(() => {});
        return false;
      }
      if (body.attemptId == null || body.seed !== core.DOWNFALL_RANKING.seed) { const err = new Error('invalid_attempt'); err.code = 'invalid_attempt'; throw err; }
      state.attempt = { id: body.attemptId, seed: body.seed };
      state.recorder = core.createRankingRecorder();
      state.active = true;
      updateBadge();
      return true;
    } catch (err) {
      if (g !== state.attemptGeneration) return false;
      state.active = false; state.attempt = null;
      state.attemptError = err?.code || 'network';
      updateBadge();
      return false;
    }
  }

  function queueDash() { if (state.active && !state.limited) state.dashQueued = true; }

  // Fixed 60Hz ranked step: record each frame BEFORE applying it, so a frame that hits the
  // segment/tick cap is never silently applied-but-unrecorded, and never invents extra frames
  // to cover a slow render (dt is capped, never stretched).
  function stepRanked(battleState, dt, rawInput) {
    if (!state.active || state.limited || !state.recorder) return false;
    if (battleState.phase !== 'playing') return false;
    state.accumulator = Math.min(state.accumulator + Math.max(0, Math.min(dt, 0.05)), FIXED_STEP * 4);
    let stepped = false;
    while (state.accumulator >= FIXED_STEP && !state.limited && battleState.phase === 'playing') {
      const packed = core.packRankingInput(rawInput, state.dashQueued);
      state.dashQueued = false;
      const recorded = state.recorder.record(packed);
      if (!recorded) { state.limited = true; updateBadge(); onLimited(); break; }
      core.applyRankingFrame(battleState, packed);
      stepped = true;
      state.accumulator -= FIXED_STEP;
    }
    return stepped;
  }

  function markNextWave() {
    if (!state.active || state.limited || !state.recorder) return false;
    const ok = state.recorder.nextWave();
    if (!ok) { state.limited = true; updateBadge(); onLimited(); }
    return ok;
  }

  // Called once the battle enters HP0 grace: score is already frozen by the core battle module.
  // Grace itself is never logged and awards nothing further.
  function freeze() {
    if (!state.active || state.frozen) return;
    state.frozen = true;
    updateBadge();
    onFrozen();
  }

  function renderConsentStatus(text, { showRetry = false } = {}) {
    const status = $('rankingConsentStatus'); if (status) status.textContent = text;
    const retry = $('rankingFinishRetryBtn'); if (retry) retry.hidden = !showRetry;
  }

  // Only the two phases where the player can actually act (a fresh offer, or redoing rejected
  // initials) show the editable form; every other phase is status + optional retry only.
  function syncFormVisibility() {
    const form = $('rankingConsentForm'); if (!form) return;
    form.hidden = !['offered', 'initials-rejected'].includes(state.consentPhase);
  }

  function renderConsentForm() {
    $('rankingInitials').value = ''; $('rankingInitials').disabled = false;
    $('rankingConsent').checked = false;
    syncFormVisibility();
    syncSubmitEnabled();
  }

  function syncSubmitEnabled() {
    const btn = $('rankingSubmitBtn'); if (!btn) return;
    const eligible = ['offered', 'initials-rejected'].includes(state.consentPhase) && !state.submitBusy;
    const initials = sanitizeInitials($('rankingInitials').value);
    btn.disabled = !(eligible && initials.length === 3 && !!$('rankingConsent').checked);
  }

  // Only ever asks the server, never the client's own score, whether the run qualifies.
  async function completeRanked() {
    if (!state.active || !state.frozen || !state.attempt || !state.recorder) return;
    if (state.limited) {
      // The 30-minute/segment cap was hit mid-run: local play continued unranked and the
      // recorded transcript no longer represents the full completed run. No finish call.
      state.consentPhase = 'limited';
      syncFormVisibility();
      renderConsentStatus('랭킹 기록 한도(시간 또는 입력 수)에 닿아 이번 플레이는 순위에 반영되지 않아요.', { showRetry: false });
      return;
    }
    const transcript = state.recorder.transcript();
    state.pendingFinishPayload = { attemptId: state.attempt.id, version: core.DOWNFALL_RANKING.version, segments: transcript.segments };
    state.consentPhase = 'pending';
    syncFormVisibility();
    renderConsentStatus('서버에서 점수를 확인하는 중…', { showRetry: false });
    await finishWithRetry();
  }

  async function finishWithRetry() {
    const payload = state.pendingFinishPayload;
    if (!payload || state.finishBusy) return;
    state.finishBusy = true;
    const g = state.finishGeneration;
    try {
      const body = await request('/finish', { method: 'POST', body: payload });
      if (g !== state.finishGeneration) return; // a restart invalidated this run meanwhile
      state.derivedResult = body.result;
      state.pendingFinishPayload = null;
      if (state.derivedResult && Number(state.derivedResult.score) > 0) {
        state.consentPhase = 'offered';
        renderConsentForm();
        renderConsentStatus('기록을 확인했어요. 원하면 공개 랭킹에 제출할 수 있어요.', { showRetry: false });
      } else {
        state.consentPhase = 'zero';
        syncFormVisibility();
        renderConsentStatus('점수 0점은 확인되었지만 TOP 10 랭킹에는 올릴 수 없어요.', { showRetry: false });
      }
    } catch (err) {
      if (g !== state.finishGeneration) return;
      if (err.retryable) {
        state.consentPhase = 'network-error';
        syncFormVisibility();
        renderConsentStatus('연결이 끊겼어요. 다시 시도하면 같은 결과로 재시도해요.', { showRetry: true });
      } else {
        state.pendingFinishPayload = null;
        state.consentPhase = 'terminal-error';
        syncFormVisibility();
        renderConsentStatus(terminalMessage(err.code), { showRetry: false });
      }
    } finally {
      state.finishBusy = false;
    }
  }

  async function submit() {
    if (state.submitBusy || !['offered', 'initials-rejected'].includes(state.consentPhase)) return;
    const initials = sanitizeInitials($('rankingInitials').value);
    const consent = !!$('rankingConsent').checked;
    if (initials.length !== 3 || !consent || !state.attempt) return;
    state.pendingSubmitPayload = { attemptId: state.attempt.id, initials, publicConsent: true, rankingConsent: core.DOWNFALL_RANKING.version };
    state.consentPhase = 'submitting';
    syncFormVisibility();
    await submitWithRetry();
  }

  async function submitWithRetry() {
    const payload = state.pendingSubmitPayload;
    if (!payload || state.submitBusy) return;
    state.submitBusy = true;
    $('rankingInitials').disabled = true; syncSubmitEnabled();
    const g = state.finishGeneration;
    try {
      const body = await request('/submit', { method: 'POST', body: payload });
      if (g !== state.finishGeneration) return;
      state.pendingSubmitPayload = null;
      state.consentPhase = body.ranked ? 'ranked' : 'not-ranked';
      syncFormVisibility();
      renderConsentStatus(body.ranked ? 'TOP 10 랭킹에 올랐어요!' : '이번 기록은 TOP 10 밖이라 랭킹에는 올리지 않았어요.', { showRetry: false });
      loadBoard();
    } catch (err) {
      if (g !== state.finishGeneration) return;
      if (err.editableInitials) {
        // The server did not publish this; it is not a network failure, so the frozen payload
        // must be discarded and the player allowed to choose different initials.
        state.pendingSubmitPayload = null;
        state.consentPhase = 'initials-rejected';
        syncFormVisibility();
        $('rankingInitials').disabled = false; $('rankingInitials').value = ''; $('rankingConsent').checked = false;
        renderConsentStatus(err.code === 'blocked_initials' ? '다른 이니셜을 선택해 주세요.' : '영문 대문자 3자를 입력해 주세요.', { showRetry: false });
      } else if (err.retryable) {
        state.consentPhase = 'submit-network-error';
        syncFormVisibility();
        renderConsentStatus('연결이 끊겼어요. 같은 이니셜로 다시 시도하면 돼요.', { showRetry: true });
      } else {
        state.pendingSubmitPayload = null;
        state.consentPhase = 'submit-terminal-error';
        syncFormVisibility();
        renderConsentStatus(terminalMessage(err.code), { showRetry: false });
      }
    } finally {
      state.submitBusy = false;
      syncSubmitEnabled();
    }
  }

  function retry() {
    if (state.pendingFinishPayload) return finishWithRetry();
    if (state.pendingSubmitPayload) return submitWithRetry();
    return Promise.resolve();
  }

  // Best-effort only: fired on pagehide (actual tab close/navigation), never on blur or
  // visibilitychange pause, which must keep the attempt alive. No retry, no state mutation,
  // since the page may already be gone by the time any response would arrive.
  function bestEffortInvalidateOnUnload() {
    if (!state.attempt) return;
    try {
      fetchImpl(`${RANKING_API}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: state.attempt.id }),
        credentials: 'same-origin', cache: 'no-store', keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  return {
    get state() { return state; },
    get active() { return state.active; },
    get limited() { return state.limited; },
    get frozen() { return state.frozen; },
    get attemptError() { return state.attemptError; },
    openBoard, closeBoard, loadBoard, trapFocus, renderBoard,
    abortAttempt, beginAttempt, queueDash, stepRanked, markNextWave, freeze, completeRanked,
    retry, submit, syncSubmitEnabled, bestEffortInvalidateOnUnload,
  };
}

// DOM event wiring, kept separate from the pure controller above so controller logic can be
// unit-tested without simulating every click.
export function bindRankingUi(ranking, { $, window } = {}) {
  $('rankingInitials').addEventListener('input', () => {
    $('rankingInitials').value = sanitizeInitials($('rankingInitials').value);
    ranking.syncSubmitEnabled();
  });
  $('rankingConsent').addEventListener('change', () => ranking.syncSubmitEnabled());
  $('rankingSubmitBtn').addEventListener('click', () => ranking.submit());
  $('rankingRefreshBtn').addEventListener('click', () => ranking.loadBoard());
  $('rankingFinishRetryBtn').addEventListener('click', () => ranking.retry());
  $('rankingCloseBtn').addEventListener('click', () => ranking.closeBoard());
  $('viewTop10Btn')?.addEventListener('click', e => ranking.openBoard(e.currentTarget));
  $('viewTop10BtnEnd')?.addEventListener('click', e => ranking.openBoard(e.currentTarget));
  ranking.trapFocus('rankingModal');
  // Actual tab close/navigation only; blur and visibilitychange pause are handled separately
  // by the host game and must never invalidate a live attempt.
  window?.addEventListener?.('pagehide', () => ranking.bestEffortInvalidateOnUnload());
  return ranking;
}

export function installDownfallRanking(deps) {
  return createRankingController(deps);
}
