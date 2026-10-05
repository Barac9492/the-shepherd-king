/** Presentation-only juice for the Psalm 23 dance. Never touches scoring or ranking state.
 * Music uses the page's single gesture-created AudioContext, so closing it stops every layer. */
const MOVES = [
  null,
  ['손뼉 걸음', '첫 절! 다윗이 손뼉을 치며 걸어요'],
  ['빙글 한 바퀴', '두 절! 다윗이 빙글 돌아요'],
  ['깡충 뛰기', '세 절! 음악에 맞춰 뛰어올라요'],
  ['두 팔 높이', '네 절! 두 팔을 하늘로 들어요'],
  ['친구와 스텝', '다섯 절! 양 친구가 함께 춰요'],
  ['힘을 다해 춤', '여섯 절 완주! 온 들판이 축제예요'],
];
const COLORS = ['#f3ce77', '#e8b274', '#f9e4a3', '#9cc28a', '#f2a07b', '#fff3d1'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function danceTier(score, mode) {
  if (mode !== 'challenge') return ['연습 완주', '이제 도전 모드에서 말씀을 가리고 춤춰 보세요.'];
  if (score >= 1110) return ['완벽한 여섯 걸음', '힌트 없이 한 번에, 여섯 절 모두!'];
  if (score >= 950) return ['기쁨의 춤꾼', '거의 완벽해요. 한 번 더 하면 만점도 가능해요.'];
  if (score >= 750) return ['리듬 타는 목동', '여섯 절을 끝까지 외웠어요.'];
  return ['첫 걸음 춤꾼', '완주했어요! 다시 하면 더 크게 춤춰요.'];
}

export function createDanceFx({ stage }) {
  const layer = document.createElement('div'); layer.className = 'dance-fx'; layer.setAttribute('aria-hidden', 'true');
  const banner = document.createElement('div'); banner.className = 'move-banner';
  const combo = document.createElement('div'); combo.className = 'combo-badge';
  layer.append(banner, combo); stage.append(layer);
  let energy = 0, raf = 0, timers = [];
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter(t => t !== id); fn(); }, ms); timers.push(id); };

  function pulse(cls, ms) { stage.classList.remove(cls); void stage.offsetWidth; stage.classList.add(cls); later(() => stage.classList.remove(cls), ms); }
  function confetti(count, spread = 1) {
    if (reduced()) return;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i'); bit.className = 'confetti';
      const angle = (Math.random() - .5) * Math.PI * spread, power = 120 + Math.random() * 160;
      bit.style.setProperty('--x', `${Math.sin(angle) * power}px`);
      bit.style.setProperty('--y', `${-Math.cos(angle) * power * .9 - 40}px`);
      bit.style.setProperty('--r', `${(Math.random() - .5) * 900}deg`);
      bit.style.setProperty('--d', `${.9 + Math.random() * .7}s`);
      bit.style.background = COLORS[i % COLORS.length];
      if (i % 3 === 0) bit.classList.add('round');
      layer.append(bit); later(() => bit.remove(), 1800);
    }
  }
  function rain(ms) {
    if (reduced()) return;
    const end = performance.now() + ms;
    const drop = () => {
      if (performance.now() > end) return;
      for (let i = 0; i < 4; i++) {
        const bit = document.createElement('i'); bit.className = 'confetti fall';
        bit.style.left = `${Math.random() * 100}%`; bit.style.background = COLORS[(Math.random() * COLORS.length) | 0];
        bit.style.setProperty('--r', `${(Math.random() - .5) * 1080}deg`); bit.style.setProperty('--d', `${1.6 + Math.random() * 1.2}s`);
        if (Math.random() < .4) bit.classList.add('round');
        layer.append(bit); later(() => bit.remove(), 3000);
      }
      later(drop, 110);
    };
    drop();
  }
  function float(text, cls = '') {
    const el = document.createElement('div'); el.className = `float-score ${cls}`; el.textContent = text; layer.append(el); later(() => el.remove(), 1500);
  }
  const groove = () => {
    energy = Math.max(0, energy - .012);
    stage.style.setProperty('--groove', energy.toFixed(3));
    raf = energy > 0 ? requestAnimationFrame(groove) : 0;
  };

  return {
    /** Typing activity only (never length or correctness), so the hidden verse leaks nothing. */
    typed() { energy = Math.min(1, energy + .16); if (!raf && !reduced()) raf = requestAnimationFrame(groove); },
    success(level, earned, streak, complete) {
      const move = MOVES[level];
      banner.innerHTML = `<b>${level} / 6</b><strong></strong><span></span>`;
      banner.querySelector('strong').textContent = move[0]; banner.querySelector('span').textContent = move[1];
      pulse('show-banner', 2200); pulse('burst', 1100); pulse('flash', 700);
      confetti(complete ? 46 : 18 + level * 4, complete ? 1.6 : 1.1);
      float(`+${earned}`);
      if (streak >= 2) { combo.textContent = `연속 ${streak}절!`; pulse('show-combo', 1800); }
      if (complete) { later(() => { stage.classList.add('finale'); rain(3200); }, 500); }
    },
    stumble() { pulse('stumble', 650); },
    reset() { for (const id of timers) clearTimeout(id); timers = []; layer.querySelectorAll('.confetti,.float-score').forEach(el => el.remove()); stage.classList.remove('finale', 'burst', 'flash', 'stumble', 'show-banner', 'show-combo'); energy = 0; stage.style.setProperty('--groove', '0'); },
  };
}

/** Layered worship-folk loop: one instrument joins per completed verse (frame drum → clap → lyre → drone → flute → tambourine). */
export function createDanceMusic() {
  let ctx = null, out = null, timer = 0, next = 0, step = 0, level = 0, walk = 0;
  const D = 293.66, scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const f = semi => D * Math.pow(2, semi / 12);
  let noise = null;
  function noiseBuffer() {
    if (noise) return noise; noise = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noise;
  }
  function tone(freq, t, dur, vol, type = 'sine', bend) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(bend, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  function hiss(t, dur, vol, type, freq) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuffer();
    fl.type = type; fl.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * .3); s.stop(t + dur + .02); s.onended = () => { s.disconnect(); fl.disconnect(); g.disconnect(); };
  }
  function flute(freq, t, dur, vol) {
    const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; v.frequency.value = 5.2; vg.gain.value = freq * .012; v.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .06); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); v.start(t); o.stop(t + dur + .02); v.stop(t + dur + .02); o.onended = () => { o.disconnect(); v.disconnect(); vg.disconnect(); g.disconnect(); };
  }
  const MELODY = [7, null, 9, 7, 4, null, 2, 4, 7, null, 4, 2, 0, null, null, null, 4, null, 7, 9, 12, null, 9, 7, 4, null, 2, 4, 2, null, null, null];
  const ARP = [[0, 4, 7, 12], [-3, 2, 7, 9], [0, 4, 9, 12], [2, 7, 9, 14]];
  function schedule(t, s) {
    const beat = s % 4 === 0, bar = (s / 16 | 0) % 4, in16 = s % 16, L = level;
    if (L === 0 && in16 === 0) tone(80, t, .35, .12, 'sine', 45);
    if (L >= 1) {
      if (in16 === 0 || in16 === 8 || (L >= 5 && in16 === 10)) tone(95, t, .32, .3, 'sine', 48);
      if (in16 === 4 || in16 === 12) { tone(220, t, .08, .06, 'triangle', 140); hiss(t, .09, .1, 'bandpass', 1800); }
    }
    if (L >= 2 && s % 4 === 2) hiss(t, .05, .06, 'highpass', 6000);
    if (L >= 3 && s % 2 === 0) { const ch = ARP[bar], n = ch[(s / 2 | 0) % 4]; tone(f(n), t, .45, .045, 'triangle'); }
    if (L >= 4 && in16 === 0) { tone(D / 2 * Math.pow(2, [0, -3, 0, 2][bar] / 12), t, 1.9, .07, 'sine'); }
    if (L >= 5 && s % 2 === 0) { const n = MELODY[(s / 2 | 0) % 32]; if (n !== null) flute(f(n + 12), t, .42, .05); }
    if (L >= 6) { if (s % 2 === 1) hiss(t, .07, .05, 'highpass', 8000); if (beat) tone(f(24 + [0, 4, 7, 9][(s / 4 | 0) % 4]), t, .25, .02, 'sine'); }
  }
  function tick() {
    if (!ctx || ctx.state === 'closed') return;
    const sixteenth = 60 / (96 + level * 4) / 4;
    while (next < ctx.currentTime + .14) { schedule(next, step++); next += sixteenth; }
  }
  return {
    start(context, startLevel) { this.stop(); ctx = context; out = ctx.createGain(); out.gain.value = .55; out.connect(ctx.destination); level = startLevel; next = ctx.currentTime + .08; step = 0; timer = setInterval(tick, 40); tick(); },
    setLevel(n) { level = n; },
    keyNote() { if (!ctx || ctx.state !== 'running') return; walk = Math.max(0, Math.min(scale.length - 1, walk + (Math.random() < .5 ? -1 : 1) * (1 + (Math.random() * 2 | 0)))); tone(f(scale[walk] + 12), ctx.currentTime, .22, .018, 'triangle'); },
    sting(complete) { if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime; (complete ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12]).forEach((n, i) => tone(f(n), t + i * .07, .6, .06, 'triangle')); },
    oops() { if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime; tone(196, t, .18, .05, 'triangle', 170); tone(165, t + .12, .25, .05, 'triangle', 150); },
    stop() { clearInterval(timer); timer = 0; try { out?.disconnect(); } catch { /* closed context */ } out = null; ctx = null; noise = null; },
  };
}
