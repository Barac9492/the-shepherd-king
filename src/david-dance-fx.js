import {createSideRanking} from './side-ranking.js';
import { ENGEDI_RULES, ENGEDI_KNOTS, createEngediState, createEngediClock, invalidateEngedi, isTightThread, formatEngediTime } from './engedi-challenge-core.js';
import { buildEngediWorld } from './engedi-challenge-world.js';
import { createEngediFx } from './engedi-challenge-fx.js';
const COPY = {
  name: ['엔게디 챌린지', 'En-Gedi Challenge'],
  ref: ['사무엘상 24장 · 로컬 시제품', '1 Samuel 24 · LOCAL PROTOTYPE'],
  title: ['조용히, 옷자락 끝까지', 'Quietly, to the last thread'],
  intro: ['다윗은 사울을 해칠 기회에도 그를 해치지 않고 하나님께 맡겼어요. 사울이 눈치채지 못하게 옷자락을 자르며 속도를 조절해 보세요. 약 20초 안에 끝까지 자르는 것이 목표예요.', 'David did not strike Saul even when he had the chance, and left the judgment to God. Cut the robe edge without being noticed as you control the speed. The goal is to finish the course without being noticed.'],
  controls: ['아래 패드를 누른 채 좌우로 움직여 속도를 정해요. 왼쪽은 천천히, 오른쪽은 빠르게. 손을 떼면 멈추고 경계가 빠르게 내려가지만 시간은 계속 흘러요.', 'Hold the pad below and move left or right to set the speed. Left is slow, right is fast. Release to stop; alert falls quickly, but time keeps running.'],
  keys: ['키보드: A / ← 느리게 · 스페이스 보통 · D / → 빠르게. 누르는 동안만 잘라요.', 'Keyboard: hold A / ← for slow, Space for medium, D / → for fast. Cut only while held.'],
  course: ['빠를수록 경계가 높아져요. 금빛 실밥 구간은 더 조심하세요. 매번 같은 코스이며, 경계 100이면 실패해요. 한 판은 최대 2분이에요.', 'Faster means higher alert. The golden thread sections are more dangerous. The course is fixed; alert 100 means failure. One run lasts up to two minutes.'],
  policy: ['창 전환·숨김·일시정지 또는 0.25초를 넘는 화면 중단은 기록 무효예요. 표시 소수 세 자리는 10ms 판정 단위이며, 기기 간 1ms 공정성을 뜻하겠습니다.', 'Switching tabs, hiding the page, pausing, or a frame freeze over 0.25s invalidates the record. The displayed decimals are 10ms timing units, representing 1ms fairness across devices.'],
  local: ['연습 최고는 이번 방문에만 남아요. 새로고침하면 사라져요. 공개 순위는 아래에서 새 도전으로 시작해요.', 'Practice bests last for this visit only and vanish on refresh. Open rankings start a new challenge below.'],
  start: ['연습으로 자르기', 'Practice cutting'], retry: ['연습 다시하기', 'Practice again'], exit: ['처음으로', 'Back to title'],
  progress: ['자른 길이', 'CUT LENGTH'], alert: ['경계', 'ALERT'], time: ['기록', 'TIME'],
  slow: ['천천히', 'SLOW'], fast: ['빠르게', 'FAST'], stop: ['쉬는 중 · 시간은 계속', 'RESTING · TIMER RUNNING'],
  cutting: ['조용히 자르는 중', 'CUTTING QUIETLY'], tight: ['촘촘한 실밥 · 속도를 낮춰요', 'TIGHT THREADS · EASE OFF'],
  pad: ['누르고 좌우로 속도 조절', 'Hold and slide to set speed'],
  done: ['옷자락을 잘랐어요', 'The robe’s edge is cut'],
  ending: ['다윗은 옷자락을 자른 일에도 마음이 찔렸어요. 그는 사울을 해치지 않았고, 동료들도 해치지 못하게 했어요. 판단은 하나님께 맡겼어요. 다음은 계속해 보세요.', 'David still felt convicted even after cutting the edge of Saul’s robe. He did not strike Saul or let others do so. He left the final judgment to God. Keep going.'],
  failed: ['사울이 눈치챘어요', 'Saul noticed'], failNote: ['다음에는 경계가 높아지기 전에 속도를 낮추거나 잠시 쉬어 보세요.', 'Next time, slow down or rest before alert rises.'],
  invalid: ['이번 기록은 무효예요', 'This run is invalid'], invalidNote: ['화면이나 입력 흐름이 중단되었어요. 새 도전에서 다시 시작해 주세요.', 'The screen or input flow was interrupted. Please start a fresh run.'],
  timeout: ['시간이 다 되었어요', 'Time is up'], best: ['이번 방문 최고', 'BEST THIS VISIT'], none: ['아직 완주 기록이 없어요', 'No completed run yet'],
};
const KEY_SPEED = { KeyA: 25, ArrowLeft: 25, Space: 60, KeyD: 100, ArrowRight: 100 };
export function installEngediChallenge(deps) {
  const { Game } = deps, p = Game.prototype;
  if (p.__engediInstalled) return;
  p.__engediInstalled = true;
  const original = Object.fromEntries(['setupUI', 'applyLang', 'showTitle', 'startChapter', 'clearChapter', 'updateAim', 'updatePlayer', 'updateCamera', 'toggleMenu', 'showHelp'].map(k => [k, p[k]]));
  p.setupUI = function(...args) { original.setupUI.apply(this, args); this.engediChallenge = createController(this, deps); };
  p.applyLang = function(...args) { const r = original.applyLang.apply(this, args); this.engediChallenge?.translate(); return r; };
  for (const key of ['showTitle', 'startChapter', 'clearChapter']) p[key] = function(...args) { this.engediChallenge?.close(); return original[key].apply(this, args); };
  for (const key of ['updateAim', 'updatePlayer']) p[key] = function(...args) { if (this.engediChallenge?.active) return; return original[key].apply(this, args); };
  p.updateCamera = function(dt) { if (this.engediChallenge?.active) return this.engediChallenge.frame(dt); return original.updateCamera.call(this, dt); };
  for (const key of ['toggleMenu', 'showHelp']) p[key] = function(...args) {
    const c = this.engediChallenge;
    if (!c?.active) return original[key].apply(this, args);
    if (c.phase === 'playing' || c.phase === 'preparing') c.interrupt();
  };
}
function createController(g, deps) {
  const $ = id => document.getElementById(id);
  const entry = document.createElement('button'); entry.className = 'btn'; entry.id = 'bEngedi'; $('bChallenge').after(entry);
  const ui = document.createElement('section'); ui.id = 'engedi'; ui.hidden = true;
  ui.innerHTML = `<div id="engediVignette"></div><div id="engediCue"></div><div id="engediSaulMark"></div><header class="engedi-top"><div><span data-engedi="ref"></span><h2 data-engedi="name"></h2></div><button class="btn ghost" id="engediExit" data-engedi="exit"></button></header>
    <section id="engediHud" aria-label="Challenge status" hidden><div class="engedi-stats"><div><small data-engedi="time"></small><strong id="engediTime">0.000</strong></div><div><small data-engedi="alert"></small><strong id="engediAlertValue">0 / 100</strong></div></div><div id="engediAlert" role="meter" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="engedi-track-label"><span data-engedi="progress"></span><b id="engediProgressValue">0%</b></div><div id="engediTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="engediProgress"></i>${ENGEDI_KNOTS.map(([a,b]) => `<span style="left:${a/10000}%;width:${(b-a)/10000}%"></span>`).join('')}<b id="engediGhost" hidden></b><b id="engediNeedle"></b></div><p id="engediFeedback"></p></section>
    <section id="engediPanel" role="dialog" aria-modal="true" aria-labelledby="engediHeading"><div class="engedi-panel-inner"><span class="eyebrow" data-engedi="ref"></span><h2 id="engediHeading"></h2><div id="engediIntro"><p data-engedi="intro"></p><ol class="engedi-howto"><li><b>1</b><p data-engedi="controls"></p></li><li><b>2</b><p data-engedi="course"></p></li><li class="engedi-keys"><b>3</b><p data-engedi="keys"></p></li></ol></div><p id="engediEnding" role="status"></p><div class="engedi-record"><small id="engediRecordLabel"></small><strong id="engediRecord"></strong><span id="engediBadge" hidden></span><span id="engediStats"></span><span id="engediBest"></span></div><p class="engedi-note" data-engedi="local"></p><details><summary id="engediPolicyTitle"></summary><p class="engedi-note" data-engedi="policy"></p></details><div class="engedi-actions"><button class="btn primary" id="engediStart"></button><button class="btn ghost" id="engediBack" data-engedi="exit"></button></div></div></section>
    <section id="engediControls" hidden><div id="engediPad" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-engedi="pad"></span><div><b data-engedi="slow"></b><i id="engediThumb"></i><b data-engedi="fast"></b></div></div><p data-engedi="keys"></p><p class="engedi-release"></p><button class="btn ghost" id="engediRetry" data-engedi="retry"></button></section>`;
  document.body.append(ui);
  let ranking,events=[];
  const pad = $('engediPad');
  const fx = createEngediFx({ g, $, lang: deps.getLanguage });
  const c = {
    active: false, phase: 'closed', state: null, best: null, speed: 0, pointerId: null, keys: new Map(), listeners: null, world: null,
    t(key) { return COPY[key][deps.getLanguage() === 'en' ? 1 : 0]; },
    translate() {
      entry.textContent = c.t('name');
      for (const el of ui.querySelectorAll('[data-engedi]')) el.textContent = c.t(el.dataset.engedi);
      pad.setAttribute('aria-label', c.t('pad')); $('engediAlert').setAttribute('aria-label', c.t('alert')); $('engediTrack').setAttribute('aria-label', c.t('progress'));
      $('engediPolicyTitle').textContent = deps.getLanguage() === 'en' ? 'Timing & interruption rules' : '기록·중단 규칙';
      ui.querySelector('.engedi-release').textContent = deps.getLanguage() === 'en' ? 'Release to rest · The timer keeps running' : '손을 떼면 멈춤 · 시간은 계속 흘러요';
      if (c.active) c.renderPanel();
    },
    open() {
      if (c.active || g.mode !== 'title' || g.slingChallenge?.phase !== 'closed' || g.slingChallenge?.navigationPending) return false;
      g.audio.init(); g.input.clearHeld(); g.clearChapter();
      c.world = buildEngediWorld(g, deps); c.active = true; c.phase = 'lobby'; c.state = createEngediState();
      g.mode = 'play'; g.paused = true; g.lock = false; g.cineOff(); g.cineW = 0; g.enableSling(false);
      for (const id of ['title','card','hud','touch','menu','help','dialog']) $(id).hidden = true;
      document.body.classList.remove('talking'); g._talk = false; document.body.classList.add('engedi-challenge');
      ui.hidden = false; c.bind(); c.translate(); c.world.camera(); g.renderer.compile(g.scene, g.camera); c.world.update(1, c.state, 0); $('engediStart').focus();
      return true;
    },
    start(ranked=false) {
      if (!c.active || c.phase === 'preparing') return;
      if(!ranked)ranking?.reset();events=[];
      c.resetInput(); g.input.clearHeld(); c.state = createEngediState(); c.clock = null; c.phase = 'preparing';
      c.prepareSince=c.prepareLast=performance.now(); c.readyFrames=0; fx.preparing();
      g.paused = true; $('engediPanel').hidden = true; $('engediHud').hidden = false; $('engediControls').hidden = false;
      c.render(); pad.focus();
    },
    advance() {
      if (c.phase !== 'playing') return;
      if (document.hidden || g.paused) { c.interrupt(); return; }
      c.clock.advance(performance.now(), c.speed);
      if (c.state.status !== 'playing') c.finish();
    },
    setSpeed(speed) { c.advance(); if (c.phase === 'playing') c.speed = speed; c.render(); },
    resetInput() {
      const pointer = c.pointerId; c.pointerId = null; c.keys.clear(); c.speed = 0;
      if (pointer !== null && pad.hasPointerCapture?.(pointer)) pad.releasePointerCapture(pointer);
      pad.classList.remove('on');
    },
    interrupt(reason = 'interrupted') { if (!['playing','preparing'].includes(c.phase)) return; invalidateEngedi(c.state, reason); c.finish(); },
    finish() {
      c.phase = 'result'; c.resetInput(); g.input.clearHeld(); g.paused = true;
      fx.finish(c, c.best);
      if (c.state.status === 'success') c.best = c.best === null ? c.state.tick : Math.min(c.best, c.state.tick);
      if(c.state.status==='success')ranking.complete({events,endedTick:c.state.tick,interrupted:false,maxGapMs:c.clock.maxGapMs});else ranking.invalidate();
      c.renderPanel(); $('engediStart').focus();
    },
    renderPanel() {
      const result = c.phase === 'result', success = c.state?.status === 'success', inRun=['playing','preparing'].includes(c.phase);
      $('engediPanel').hidden = inRun; $('engediHud').hidden = !inRun; $('engediControls').hidden = !inRun;
      $('engediIntro').hidden = result;
      $('engediHeading').textContent = c.t(!result ? 'title' : success ? 'done' : c.state.status === 'invalid' ? 'invalid' : c.state.reason === 'timeout' ? 'timeout' : 'failed');
      $('engediEnding').textContent = !result ? '' : c.t(success ? 'ending' : c.state.status === 'invalid' ? 'invalidNote' : 'failNote');
      $('engediRecordLabel').textContent = c.t(success ? 'time' : 'best');
      $('engediRecord').textContent = success ? `${formatEngediTime(c.state.tick)} s` : c.best === null ? c.t('none') : `${formatEngediTime(c.best)} s`;
      $('engediBest').textContent = success ? `${c.t('best')} · ${formatEngediTime(c.best)} s` : '';
      $('engediStart').textContent = c.t(result ? 'retry' : 'start');
    },
    render() {
      if (!c.state) return;
      const percent = c.state.progress / 10000, alert = c.state.alert / 1000;
      $('engediTime').textContent = formatEngediTime(c.state.tick); $('engediAlertValue').textContent = `${Math.ceil(alert)} / 100`;
      $('engediAlert').firstElementChild.style.width = `${alert}%`; $('engediAlert').setAttribute('aria-valuenow', Math.ceil(alert));
      $('engediHud').classList.toggle('danger', alert >= 70);
      $('engediProgressValue').textContent = `${Math.floor(percent)}%`; $('engediProgress').style.width = `${percent}%`; $('engediNeedle').style.left = `${percent}%`; $('engediTrack').setAttribute('aria-valuenow', Math.floor(percent));
      $('engediFeedback').textContent = c.phase==='preparing' ? (deps.getLanguage()==='en'?'Preparing the scene… timer has not started':'화면 준비 중… 아직 기록은 시작하지 않았어요') : (c.speed !== 0 && !isTightThread(c.state.progress) && fx.soon(c.state.progress)) || c.t(c.speed === 0 ? 'stop' : isTightThread(c.state.progress) ? 'tight' : 'cutting');
      $('engediHud').classList.toggle('tight', c.phase==='playing' && isTightThread(c.state.progress));
      pad.setAttribute('aria-valuenow', c.speed); pad.setAttribute('aria-valuetext', c.speed === 0 ? c.t('stop') : `${c.speed}%`);
      pad.classList.toggle('on', c.speed > 0); $('engediThumb').style.left = `${c.speed === 0 ? 0 : (c.speed-25)/75*100}%`;
    },
    frame(dt) {
      if(c.phase==='preparing'){
        const now=performance.now(),gap=now-c.prepareLast;c.prepareLast=now;
        c.readyFrames=gap>=0&&gap<=200?c.readyFrames+1:0;
        if(now-c.prepareSince>=1500&&c.readyFrames>=3&&!document.hidden){
          c.clock=createEngediClock(c.state,now,(tick,speed)=>{if(ranking?.active&&events.at(-1)?.speed!==speed){events.push({tick,speed});if(events.length>2048)ranking.invalidate();}});
          c.phase='playing';g.paused=false;pad.focus();fx.started();
        }
      }else c.advance();
      c.world?.update(dt,c.state,c.phase==='preparing'?60:c.speed);c.world?.camera();fx.frame(c,c.world,deps.THREE);
      if(['playing','preparing'].includes(c.phase))c.render();
    },
    bind() {
      c.listeners?.abort(); c.listeners = new AbortController(); const signal = c.listeners.signal;
      const listen = (target, event, fn, options = {}) => target.addEventListener(event, fn, { ...options, signal });
      const move = e => { const r = pad.getBoundingClientRect(); c.setSpeed(Math.round(25 + Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)) * 75)); };
      listen(pad, 'pointerdown', e => {
        if (c.phase !== 'playing' || c.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault(); c.pointerId = e.pointerId; c.keys.clear(); pad.focus();
        try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic test pointers cannot capture */ }
        move(e);
      });
      listen(pad, 'pointermove', e => { if (e.pointerId === c.pointerId) { e.preventDefault(); move(e); } });
      const release = e => { if (e.pointerId !== c.pointerId) return; c.setSpeed(0); c.resetInput(); };
      for (const name of ['pointerup','pointercancel','lostpointercapture']) listen(window, name, release);
      for (const name of ['keydown','keyup']) listen(window, name, e => {
        if (c.phase === 'preparing') { if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();c.interrupt();}return; }
        if (c.phase !== 'playing') return;
        if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); c.interrupt(); return; }
        if (!(e.code in KEY_SPEED) || (e.target?.tagName === 'BUTTON' && e.code === 'Space')) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.type === 'keydown') { if (e.repeat) return; c.keys.set(e.code, KEY_SPEED[e.code]); }
        else c.keys.delete(e.code);
        if (c.pointerId === null) c.setSpeed([...c.keys.values()].at(-1) ?? 0);
      }, { capture: true });
      for (const name of ['blur','pagehide','orientationchange']) listen(window, name, () => c.interrupt(name));
      listen(document, 'visibilitychange', () => { if (document.hidden) c.interrupt('hidden'); });
      listen(g.canvas, 'webglcontextlost', () => c.interrupt());
      listen(ui, 'keydown', e => {
        if (['playing','preparing'].includes(c.phase) || e.key !== 'Tab') return;
        const items = [...$('engediPanel').querySelectorAll('button,summary,input')].filter(el => !el.disabled&&el.getClientRects().length), first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    },
    close() {
      if (!c.active) return;
      fx.stop(); ranking.reset(); invalidateEngedi(c.state, 'left'); c.resetInput(); c.listeners?.abort(); c.listeners = null; c.world = null; c.active = false; c.phase = 'closed';
      ui.hidden = true; $('engediHud').hidden = true; $('engediControls').hidden = true; g.input.clearHeld(); g.paused = false;
      document.body.classList.remove('engedi-challenge');
    },
    back() { if (!c.active) return; void g.showTitle(); },
  };
  entry.onclick = () => c.open(); $('engediStart').onclick = () => c.start(); $('engediRetry').onclick = () => c.start();
  $('engediExit').onclick = $('engediBack').onclick = () => c.back();
  ranking=createSideRanking({mode:'engedi',host:$('engediPanel').querySelector('.engedi-panel-inner'),begin:()=>c.start(true)});
  c.translate(); return c;
}
