import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../land-of-david/src/ranking-ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../land-of-david/ranking.css', import.meta.url), 'utf8');
const VERSION = 'land-top10-v1';
const id = 'a'.repeat(48);
const metadata = act => ({mode: 'land', version: VERSION, act});
const payload = () => ({attemptId: id, version: VERSION, events: [{t: 1, action: 'move'}]});
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Small DOM double exercises request state without requiring a browser binary.
function harness(fetchImpl) {
  const nodes = [];
  let document;
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.textContent = ''; this.hidden = false; this.disabled = false; this.checked = false; this.value = ''; this.className = ''; this.open = false; nodes.push(this); }
    get classList() { return {contains: name => this.className.split(' ').includes(name)}; }
    get isConnected() { return !!this.parent || this === document.body; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    after(child) { child.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, child); }
    before(child) { child.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this), 0, child); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    async fire(type, extra = {}) { const event = {preventDefault() {}, stopPropagation() {}, ...extra}; await Promise.all((this.listeners[type] || []).map(fn => fn(event))); await settle(); }
    focus() { document.activeElement = this; }
    closest(selector) { return selector === '.hide' && this.classList.contains('hide') ? this : this.parent?.closest(selector); }
    querySelector(selector) { return this.children.find(n => selector === `#${n.id}`) || null; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    showModal() { this.open = true; }
    close() { this.open = false; void this.fire('close'); }
  }
  document = {body: new Node('body'), activeElement: null, createElement: tag => new Node(tag), getElementById: id => nodes.find(n => n.id === id)};
  const title = new Node('div'); title.id = 'title'; document.body.append(title);
  const hud = new Node('div'); hud.id = 'hud'; document.body.append(hud);
  const start = new Node('button'); start.id = 'startBtn'; const best = new Node('div'); best.id = 'best'; title.append(start, best);
  let blurCount = 0;
  const calls = [];
  const context = vm.createContext({document, window: {dispatchEvent: () => blurCount++}, Event, AbortController, setTimeout, clearTimeout, navigator: {onLine: true}, fetch: async (url, options) => {
    calls.push({url, ...options}); const data = await fetchImpl(url, options, calls.length);
    return {ok: data?.error ? false : true, json: async () => data};
  }});
  vm.runInContext(source.replace('export function mountLandRanking', 'function mountLandRanking') + '\nthis.api = {mountLandRanking, formatScore, validBoard};', context);
  return {api: context.api, nodes, calls, document, title, start, best, get blurCount() { return blurCount; }, byText: text => nodes.find(n => n.textContent === text), byId: id => nodes.find(n => n.id === id), byClass: cls => nodes.find(n => n.className.split(' ').includes(cls))};
}
const empty = (act = 'adullam') => ({...metadata(act), entries: []});

test('format and validate per-act criteria, ties, duplicate initials and malformed response', () => {
  const {api} = harness(() => empty());
  assert.equal(api.formatScore('hebron', 1234), '02:03.4');
  assert.equal(api.formatScore('temple', 95), '95%');
  assert.equal(api.formatScore('adullam', 400), '400명');
  const rows = [{rank: 1, initials: 'AAA', score: 4}, {rank: 1, initials: 'AAA', score: 4}, {rank: 3, initials: 'BBB', score: 2}];
  assert.equal(api.validBoard({...empty(), entries: rows}, 'adullam'), true);
  assert.equal(api.validBoard({...empty(), entries: [...rows].reverse()}, 'adullam'), false);
  assert.equal(api.validBoard({...empty(), entries: [{rank: 1, initials: '<x>', score: 2}]}, 'adullam'), false);
  assert.equal(api.validBoard({...empty(), version: 'bad'}, 'adullam'), false);
  assert.equal(api.validBoard({...empty('hebron'), entries: [{rank: 1, initials: 'AAA', score: 123}]}, 'hebron'), true);
});

test('hub inserts after best, five filters, read without consent, native modal restores focus', async () => {
  const h = harness(() => empty()); h.api.mountLandRanking({});
  assert.equal(h.title.children[h.title.children.indexOf(h.best) + 1].id, 'landRankingButton');
  const launch = h.byId('landRankingButton'); launch.focus(); await launch.fire('click');
  assert.equal(h.byId('landRankingDialog').open, true); assert.equal(h.blurCount, 1);
  assert.equal(h.nodes.filter(n => n.dataset.act).length, 5);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, 'GET');
  assert.ok(h.byText('아직 공개된 기록이 없어요.'));
  await h.byText('닫기').fire('click'); assert.equal(h.document.activeElement, launch);
});

test('stale board responses cannot overwrite newly selected act', async () => {
  let release;
  const h = harness(url => url.includes('adullam') ? new Promise(resolve => { release = resolve; }) : empty('hebron'));
  h.api.mountLandRanking({}); await h.byId('landRankingButton').fire('click');
  await h.nodes.find(n => n.dataset.act === 'hebron').fire('click');
  release({...empty(), entries: [{rank: 1, initials: 'OLD', score: 50}]}); await settle();
  assert.ok(h.byText('다윗성 · TOP 10')); assert.equal(h.nodes.some(n => n.textContent === 'OLD'), false);
});

test('network failure differs from valid empty leaderboard', async () => {
  const h = harness(() => { throw new Error('offline'); }); h.api.mountLandRanking({});
  await h.byId('landRankingButton').fire('click');
  assert.equal(h.byClass('land-ranking-status').textContent.includes('다시 시도'), true);
  assert.equal(h.byText('아직 공개된 기록이 없어요.'), undefined);
});

test('challenge failure remains retryable without changing ordinary start', async () => {
  let tries = 0;
  const h = harness(() => empty()); h.api.mountLandRanking({act: 'adullam', onStart: async () => { if (++tries === 1) throw new Error(); return true; }});
  const challenge = h.byId('landRankingChallenge'); await challenge.fire('click');
  assert.equal(challenge.disabled, false); assert.equal(h.start.disabled, false);
  assert.ok(h.byClass('land-ranking-start-status').textContent.includes('다시 눌러'));
  await challenge.fire('click'); assert.equal(tries, 2); assert.equal(h.byClass('land-ranking-start-status').textContent, '');
});

test('completion only verifies; public registration requires initials AND unchecked-by-default consent', async () => {
  const h = harness(url => url.includes('finish') ? {...metadata('adullam'), result: {score: 40, activeMs: 120000}} : empty());
  const {complete} = h.api.mountLandRanking({act: 'adullam'}); await complete(payload());
  assert.equal(h.byId('landRankingDialog').open, true);
  const form = h.byClass('land-ranking-form'), consent = h.nodes.find(n => n.type === 'checkbox');
  assert.equal(consent.checked, false); assert.equal(form.hidden, false);
  await form.fire('submit'); assert.equal(h.calls.filter(c => c.url.includes('submit')).length, 0);
  h.byId('landRankingInitials').value = 'ABC'; await form.fire('submit');
  assert.equal(h.calls.filter(c => c.url.includes('submit')).length, 0);
});

test('finish retry retains exact transcript even if caller mutates payload', async () => {
  let finishes = 0;
  const h = harness(url => { if (!url.includes('finish')) return empty(); if (++finishes === 1) throw new Error('lost response'); return {...metadata('adullam'), result: {score: 50, activeMs: 120000}}; });
  const ui = h.api.mountLandRanking({act: 'adullam'}), data = payload();
  await ui.complete(data); data.events.push({t: 2});
  await h.byText('기록 확인 다시 시도').fire('click');
  const bodies = h.calls.filter(c => c.url.includes('finish')).map(c => c.body);
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
});

test('uncertain submit freezes identity/consent and retries identical request; confirmed stays locked', async () => {
  let submits = 0;
  const h = harness(url => { if (url.includes('finish')) return {...metadata('adullam'), result: {score: 50, activeMs: 120000}}; if (url.includes('submit')) { if (++submits === 1) throw new Error('lost response'); return {...metadata('adullam'), accepted: true, ranked: true}; } return empty(); });
  await h.api.mountLandRanking({act: 'adullam'}).complete(payload());
  const initials = h.byId('landRankingInitials'), consent = h.nodes.find(n => n.type === 'checkbox'), form = h.byClass('land-ranking-form');
  initials.value = 'ABC'; consent.checked = true; await form.fire('submit');
  assert.equal(initials.disabled, true); assert.equal(consent.disabled, true);
  initials.value = 'XYZ'; consent.checked = false; await form.fire('submit');
  const bodies = h.calls.filter(c => c.url.includes('submit')).map(c => c.body);
  assert.equal(bodies[0], bodies[1]); assert.equal(JSON.parse(bodies[1]).initials, 'ABC');
  assert.equal(JSON.parse(bodies[1]).rankingConsent, VERSION); assert.equal(JSON.parse(bodies[1]).publicConsent, true);
  assert.equal(h.byText('등록 확인 완료').disabled, true); await form.fire('submit'); assert.equal(submits, 2);
});

test('fail announces without interrupting gameplay, invalidates pending finish and blocks completion', async () => {
  let release;
  const h = harness(url => url.includes('finish') ? new Promise(resolve => { release = resolve; }) : empty());
  const ui = h.api.mountLandRanking({act: 'adullam'});
  const completion = ui.complete(payload()); await settle();
  ui.fail('랭킹 자격을 잃었어요. 플레이는 계속할 수 있어요.');
  release({...metadata('adullam'), result: {score: 50, activeMs: 120000}}); await completion;
  assert.equal(h.byClass('land-ranking-form').hidden, true);
  h.byId('landRankingDialog').close(); ui.fail('안내'); assert.equal(h.byId('landRankingDialog').open, false);
  await ui.complete(payload()); assert.equal(h.calls.filter(c => c.url.includes('finish')).length, 1);
});

test('modal keyboard isolation, Korean privacy copy and responsive internal scroll safeguards', async () => {
  const h = harness(() => empty()); h.api.mountLandRanking({}); const dialog = h.byId('landRankingDialog');
  let stopped = 0; for (const type of ['keydown', 'keyup', 'keypress']) await dialog.fire(type, {stopPropagation: () => stopped++});
  assert.equal(stopped, 3); assert.equal(dialog.attributes['data-land-ranking'], '');
  assert.match(source, /2시간/); assert.match(source, /신앙의 척도가 아니/); assert.doesNotMatch(source, /innerHTML|localStorage|Math\.random/);
  assert.match(css, /min-height: 44px/); assert.match(css, /overflow-y: auto/); assert.match(css, /touch-action: pan-y/); assert.match(css, /100dvh/);
});

test('HUD reopens results after title hides and completion resets internal scroll', async () => {
  const h = harness(url => url.includes('finish') ? {...metadata('adullam'), result: {score: 40, activeMs: 120000}} : empty());
  const ui = h.api.mountLandRanking({act: 'adullam'});
  h.byClass('land-ranking-content').scrollTop = 300; await ui.complete(payload());
  assert.equal(h.byClass('land-ranking-content').scrollTop, 0);
  h.byId('landRankingDialog').close(); h.title.className = 'hide';
  const hudButton = h.byId('landRankingHudButton'); hudButton.focus(); await hudButton.fire('click');
  assert.equal(h.byId('landRankingDialog').open, true);
  h.byId('landRankingDialog').close(); assert.equal(h.document.activeElement, hudButton);
});
