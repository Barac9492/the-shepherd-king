// Ranked runs are fresh opt-in runs; historical localStorage records are never submitted.
import { mountLandRanking } from './ranking-ui.js';
const VERSION = 'land-top10-v1';
const ACTIONS = {
  adullam: ['startLeaving'], herut: ['leaveStop', 'cutRobe', 'finish'],
  ziklag: ['answerCall', 'returnToZiklag', 'startPursuit', 'startGuide', 'returnToBesor', 'giveShare', 'finish'],
  hebron: ['startTribes', 'goToZion', 'startBuild', 'finish'],
  temple: ['night', 'toSit', 'startPrepare', 'callGivers', 'callSolomon', 'finish'],
};
const CARRIED = { herut: 240, ziklag: 400, hebron: 470 };

/** Capture only logic inputs, never score or renderer state. Exported for headless tests. */
export function createLandRecorder({act, attemptId, onComplete, onFail}) {
  let eligible = !!attemptId, finished = false, bytes = 100, seconds = 0, lastDavid = null;
  const events = [];
  function reject(message) { if (!eligible || finished) return; eligible = false; onFail?.(message); }
  function append(event) {
    if (!eligible || finished) return;
    bytes += JSON.stringify(event).length + 1;
    if (events.length >= 108000 || bytes > 3800000 || seconds > 1800) {
      reject('기록 길이 한도를 넘었어요. 게임은 계속할 수 있지만 이번 기록은 공개 랭킹에 올릴 수 없어요.'); return;
    }
    events.push(event);
  }
  function complete(s) {
    if (!eligible || finished || !(act === 'adullam' ? s.phase === 'done' : s.act === 'done')) return;
    finished = true;
    queueMicrotask(() => onComplete?.({attemptId, version: VERSION, events}));
  }
  return {
    get active() { return eligible && !finished; },
    get events() { return events; },
    reject,
    wrap(logic) {
      const cache = new Map();
      return new Proxy(logic, { get(target, name) {
        const fn = target[name];
        if (typeof fn !== 'function' || !eligible) return fn;
        if (cache.has(name)) return cache.get(name);
        let wrapped = fn;
        if (String(name).startsWith('create')) wrapped = (layout) => fn(layout, 7, CARRIED[act]);
        else if (name === 'step') wrapped = (s, dt, input) => {
          const d = input.david;
          if (eligible && !finished) {
            lastDavid = {x: d.x, z: d.z, moving: !!d.moving}; seconds += dt;
            append(['step', dt, d.x, d.z, !!d.moving]);
          }
          const result = fn(s, dt, input);
          // The renderer applies scripted teleports immediately after a simulation step.
          if (s.teleport) lastDavid = {...s.teleport, moving: !!d.moving};
          complete(s); return result;
        };
        else if (ACTIONS[act]?.includes(name)) wrapped = (s, d) => {
          const before = JSON.stringify(s), position = d || lastDavid;
          const result = fn(s, d);
          if (position && before !== JSON.stringify(s)) append(['action', name, position.x, position.z, !!position.moving]);
          complete(s); return result;
        };
        cache.set(name, wrapped); return wrapped;
      }});
    },
  };
}

export function createLandRankingSession(act) {
  const storageKey = `land-ranking-pending:${act}`;
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    sessionStorage.removeItem(storageKey);
    if (!pending || pending.version !== VERSION || pending.act !== act || !/^[a-f0-9]{48}$/.test(pending.attemptId) || Date.now() - pending.createdAt > 120000 || pending.createdAt > Date.now()) pending = null;
  } catch { pending = null; }
  let ui;
  const recorder = createLandRecorder({act,attemptId:pending?.attemptId,
    onComplete: payload => ui.complete(payload),
    onFail: message => {
      ui.fail(message);
      if (pending) fetch('/api/land-ranking/invalidate', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({act,attemptId:pending.attemptId})}).catch(()=>{});
    },
  });
  ui = mountLandRanking({act,onStart:async () => {
    // Confirm storage works before consuming a server attempt.
    sessionStorage.setItem(storageKey, 'null'); sessionStorage.removeItem(storageKey);
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),18000);
    try {
      const response = await fetch('/api/land-ranking/attempts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({act}),signal:controller.signal});
      const data = await response.json();
      if (!response.ok || data.mode !== 'land' || data.version !== VERSION || data.act !== act || data.seed !== 7 || !/^[a-f0-9]{48}$/.test(data.attemptId)) throw new Error('랭킹 도전을 시작하지 못했어요. 잠시 후 다시 눌러 주세요. 일반 플레이는 할 수 있어요.');
      sessionStorage.setItem(storageKey,JSON.stringify({...data,createdAt:Date.now()}));
      location.assign(location.pathname); return true;
    } finally { clearTimeout(timer); }
  }});
  return {
    wrap: recorder.wrap,
    isOpen: () => !!document.querySelector('dialog[data-land-ranking]')?.open,
    ready(start) { if (pending) { const label = document.createElement('span'); label.className='land-ranked-badge'; label.textContent='랭킹 도전 · 같은 시작 조건'; document.getElementById('hud')?.append(label); start(); } },
    get ranked() { return !!pending; },
  };
}
