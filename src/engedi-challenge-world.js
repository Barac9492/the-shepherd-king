/** Presentation-only tension layer for En-Gedi. Reads simulation state; never steps, mutates or times it. */
import { ENGEDI_KNOTS, formatEngediTime, isTightThread } from './engedi-challenge-core.js';

const SAMPLE_EVERY = 5; // ticks (50 ms) per ghost sample
const T = {
  breathe: ['숨을 고르고…', 'Steady your breath…'], go: ['지금!', 'Now!'], knot: ['촘촘한 실밥!', 'Tight threads!'],
  soon: ['곧 촘촘한 실밥 · 속도를 낮출 준비', 'Tight threads ahead · get ready to ease off'],
  newBest: ['개인 최고 기록!', 'New personal best!'],
  cut: ['옷자락을 잘랐어요', 'The edge is cut'], caught: ['들켰어요!', 'Spotted!'],
};

export function createEngediFx({ g, $, lang }) {
  const t = key => T[key][lang() === 'en' ? 1 : 0];
  let samples = [], bestSamples = null, peak = 0, restTicks = 0, lastTick = 0, lastBeat = 0, lastSnip = 0, wasTight = false, cueTimer = 0;
  let vec = null;
  const cue = (text, cls = '', ms = 900) => {
    const el = $('engediCue'); el.textContent = text; el.className = ''; void el.offsetWidth; el.className = `show ${cls}`;
    clearTimeout(cueTimer); if (ms) cueTimer = setTimeout(() => { el.className = ''; }, ms);
  };
  const audio = () => (g.audio?.ctx && g.audio.ctx.state === 'running' && !g.audio.muted ? g.audio : null);
  function heartbeat(alert, now) {
    const a = audio(); if (!a) return;
    const interval = 920 - alert * 5.4;
    if (now - lastBeat < interval) return; lastBeat = now;
    const at = a.ctx.currentTime, vol = .05 + alert / 100 * .32;
    a.tone(62, at, .16, vol, 'sine', null, 40); a.tone(55, at + .17, .14, vol * .7, 'sine', null, 38);
  }
  function snip(speed, now) {
    const a = audio(); if (!a || !speed) return;
    if (now - lastSnip < 330 - speed * 2.4) return; lastSnip = now;
    a.noise(a.ctx.currentTime, .05, .03 + speed / 100 * .05, 'highpass', 3800 + Math.random() * 1200, 1);
  }
  function markSaul(world, state) {
    const mark = $('engediSaulMark'); const head = world?.saulHead; if (!head || !vec) { mark.className = ''; return; }
    const alert = state.alert / 1000, noticed = state.status === 'failed' && state.reason === 'noticed';
    const level = noticed ? 'caught' : state.status !== 'playing' ? '' : alert >= 88 ? 'danger' : alert >= 68 ? 'wary' : alert >= 45 ? 'stir' : '';
    const label = { caught: '!', danger: '?!', wary: '?', stir: '…' }[level] || '';
    mark.textContent = label;
    mark.className = level ? `show ${level}` : '';
    if (!level) return;
    head.getWorldPosition(vec); vec.y += .3; vec.project(g.camera);
    mark.style.left = `${(vec.x * .5 + .5) * innerWidth + 44}px`; mark.style.top = `${(-vec.y * .5 + .5) * innerHeight}px`;
  }
  return {
    preparing() { $('engediPanel').classList.remove('reveal'); samples = [0]; peak = 0; restTicks = 0; lastTick = 0; wasTight = false; $('engediStats').textContent = ''; $('engediBadge').hidden = true; cue(t('breathe'), 'soft', 0); },
    started() { cue(t('go'), 'go', 700); const a = audio(); if (a) { const at = a.ctx.currentTime; a.tone(587, at, .25, .05, 'triangle'); } },
    frame(c, world, THREE) {
      vec ??= new THREE.Vector3();
      const s = c.state; if (!s) return;
      const alert = s.alert / 1000, now = performance.now(), playing = c.phase === 'playing';
      document.getElementById('engedi').style.setProperty('--alert', (playing || c.phase === 'result' ? alert / 100 : 0).toFixed(3));
      $('engedi').classList.toggle('engedi-danger', playing && alert >= 70);
      if (playing) {
        if (samples.length <= s.tick / SAMPLE_EVERY) samples.push(s.progress);
        if (c.speed === 0) restTicks += s.tick - lastTick; lastTick = s.tick; peak = Math.max(peak, alert);
        heartbeat(alert, now); snip(c.speed, now);
        const tight = isTightThread(s.progress);
        if (tight && !wasTight) cue(t('knot'), 'warn', 900);
        wasTight = tight;
      }
      const ghost = $('engediGhost');
      if (bestSamples && (playing || c.phase === 'preparing')) {
        const at = bestSamples[Math.min(bestSamples.length - 1, Math.floor(s.tick / SAMPLE_EVERY))] ?? ENGEDI_KNOTS.length;
        ghost.hidden = false; ghost.style.left = `${at / 10000}%`;
      } else ghost.hidden = true;
      markSaul(world, s);
    },
    soon(progress) {
      if (isTightThread(progress)) return null;
      const next = ENGEDI_KNOTS.find(([a]) => a > progress);
      return next && next[0] - progress < 70000 ? t('soon') : null;
    },
    finish(c, previousBest) {
      const s = c.state, en = lang() === 'en', stats = [];
      $('engediCue').className = '';
      if (s.status === 'success' || s.reason === 'noticed') { $('engediPanel').classList.add('reveal'); cue(t(s.status === 'success' ? 'cut' : 'caught'), s.status === 'success' ? 'go' : 'warn', 1200); }
      if (s.status === 'success') {
        const improved = previousBest === null || s.tick < previousBest;
        if (improved) { while (samples.length <= s.tick / SAMPLE_EVERY) samples.push(s.progress); bestSamples = samples.slice(); }
        $('engediBadge').hidden = !improved; $('engediBadge').textContent = t('newBest');
        stats.push(en ? `Peak alert ${Math.ceil(peak)}` : `최고 경계 ${Math.ceil(peak)}`);
        stats.push(en ? `Rested ${formatEngediTime(restTicks)} s` : `쉰 시간 ${formatEngediTime(restTicks)}초`);
        if (previousBest !== null) {
          const diff = Math.abs(s.tick - previousBest);
          stats.push(s.tick < previousBest ? (en ? `${formatEngediTime(diff)} s faster than your best` : `이전 최고보다 ${formatEngediTime(diff)}초 빨라요`) : s.tick === previousBest ? (en ? 'Tied your best' : '최고 기록과 같아요') : (en ? `${formatEngediTime(diff)} s behind your best` : `최고 기록까지 ${formatEngediTime(diff)}초`));
        }
        const a = audio(); if (a) { const at = a.ctx.currentTime; [0, 3, 7, 10].forEach((n, i) => a.tone(220 * Math.pow(2, n / 12), at + i * .14, 1.4, .035, 'sine')); }
      } else if (s.reason === 'noticed') {
        stats.push(en ? `Noticed at ${Math.floor(s.progress / 10000)}% of the cut` : `${Math.floor(s.progress / 10000)}% 지점에서 들켰어요`);
        const a = audio(); if (a) { const at = a.ctx.currentTime; a.tone(330, at, .5, .06, 'triangle', null, 220); a.noise(at, .35, .05, 'lowpass', 600); }
      }
      $('engediStats').textContent = stats.join(' · ');
    },
    stop() { $('engediPanel').classList.remove('reveal'); clearTimeout(cueTimer); $('engediCue').className = ''; $('engediSaulMark').className = ''; $('engedi').style.setProperty('--alert', '0'); $('engedi').classList.remove('engedi-danger'); },
  };
}
