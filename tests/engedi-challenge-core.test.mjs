import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGEDI_RULES as R, createEngediState, stepEngedi, createEngediClock, invalidateEngedi, isTightThread, formatEngediTime } from '../src/engedi-challenge-core.js';
function run(strategy) { const s = createEngediState(); while (s.status === 'playing') stepEngedi(s, strategy(s)); return s; }
test('fixed course rewards reading thread sections with a 20–30 second run', () => {
  const smart = run(s => isTightThread(s.progress) ? 25 : 100);
  assert.equal(smart.status, 'success'); assert.ok(smart.tick >= 2000 && smart.tick <= 3000);
  assert.deepEqual(run(s => isTightThread(s.progress) ? 25 : 100), smart);
  assert.equal(run(() => 100).status, 'failed');
  const slow = run(() => 25); assert.equal(slow.status, 'success'); assert.ok(slow.tick > smart.tick);
  console.log('course-aware finish', formatEngediTime(smart.tick), 'slow finish', formatEngediTime(slow.tick));
});
test('rest stops progress, recovers alert faster than slow cutting, but consumes time', () => {
  const a = createEngediState(); a.alert = 50000; a.progress = 180000;
  const b = { ...a }; stepEngedi(a, 0); stepEngedi(b, 25);
  assert.equal(a.progress, 180000); assert.ok(b.progress > a.progress); assert.ok(a.alert < b.alert); assert.equal(a.tick, 1);
});
test('frame batching and identical tick inputs give identical results', () => {
  const a = createEngediState(), b = createEngediState(); const ac = createEngediClock(a, 0), bc = createEngediClock(b, 0);
  for(let t=10;t<=2000;t+=10) ac.advance(t,60);
  for(let t=200;t<=2000;t+=200) bc.advance(t,60);
  assert.deepEqual(a,b); assert.equal(formatEngediTime(a.tick),'2.000');
});
test('subtick remainder is carried; >250ms frame interruption invalidates instead of giving free rest', () => {
  const s=createEngediState(), clock=createEngediClock(s,0);
  clock.advance(9,100); assert.equal(s.tick,0); clock.advance(21,100); assert.equal(s.tick,2);
  const progress=s.progress; clock.advance(272,0); assert.equal(s.status,'invalid'); assert.equal(s.progress,progress);
});
test('alert at the finish wins; terminal states never keep accumulating or resume', () => {
  const s=createEngediState(); s.alert=99999; s.progress=R.length-1; stepEngedi(s,100);
  assert.equal(s.status,'failed'); const snapshot={...s}; stepEngedi(s,0); invalidateEngedi(s); assert.deepEqual(s,snapshot);
});
test('bad speed and invalid clocks are rejected; two minute limit includes resting', () => {
  for(const speed of [NaN,101,-1,1.5]) assert.throws(()=>stepEngedi(createEngediState(),speed),RangeError);
  for(const at of [-1,Infinity,NaN]) { const s=createEngediState(); createEngediClock(s,0).advance(at,0); assert.equal(s.status,'invalid'); }
  assert.equal(run(()=>0).reason,'timeout');
});
