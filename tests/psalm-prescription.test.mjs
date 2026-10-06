import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PSALM_PRESCRIPTIONS } from '../src/psalm-prescriptions.js';
import { normalize, createSession, getPrescription, selectPrescription, setMode, revealSource, submitAnswer, restartPrescription, nextPrescription, needsDiscardConfirmation } from '../src/psalm-prescription-core.js';

test('five representative verses retain attachment order, not full chapters', () => {
  assert.deepEqual(PSALM_PRESCRIPTIONS.map(p => [p.chapter, p.verseNumber]), [[103,2],[56,3],[23,3],[18,2],[20,4]]);
  assert.equal(new Set(PSALM_PRESCRIPTIONS.map(p => p.id)).size, 5);
  assert.ok(PSALM_PRESCRIPTIONS.every(p => p.translation === '새번역' && p.text && p.explanation));
});
test('initial state is read mode and has no scoring fields', () => {
  assert.deepEqual(createSession(), {id:'grace',mode:'read',revealed:false,phase:'input',completed:[],lastInput:null,lastResult:null});
  assert.throws(() => createSession('psalm51'), RangeError);
});
test('all five representative verses complete with no score or accuracy exposure', () => {
  const s = createSession();
  for (const p of PSALM_PRESCRIPTIONS) {
    selectPrescription(s,p.id); const r = submitAnswer(s,p.text);
    assert.equal(r.status,'correct'); assert.equal(s.phase,'complete');
    assert.equal('accuracy' in r,false); assert.equal('score' in s,false);
  }
  assert.equal(s.completed.length,5);
});
test('punctuation and whitespace optional, Korean words strict', () => {
  const s=createSession('trust');
  assert.equal(submitAnswer(s,normalize(getPrescription('trust').text)).status,'correct');
  restartPrescription(s);
  assert.equal(submitAnswer(s,getPrescription('trust').text.replace('주님','사람')).status,'incorrect');
  assert.equal(s.phase,'input'); assert.equal(s.completed.length,1);
});
test('blank and overlong input do not mutate session', () => {
  const s=createSession(), before=structuredClone(s);
  assert.equal(submitAnswer(s,' , ! \n ').status,'blank');
  assert.equal(submitAnswer(s,'가'.repeat(601)).status,'too-long');
  assert.deepEqual(s,before);
});
test('wrong input returns exact correction groups without interpreting faith', () => {
  const s=createSession(); const r=submitAnswer(s,getPrescription(s.id).text.replace('영혼','영원'));
  assert.equal(r.correct,false); assert.ok(r.groups.some(g=>!g.same));
  assert.equal(s.completed.length,0); assert.equal(s.phase,'input');
});
test('duplicate wrong answer does not change state or accumulate attempts', () => {
  const s=createSession(); submitAnswer(s,'본문과 다릅니다'); const before=structuredClone(s);
  assert.equal(submitAnswer(s,'본문과다릅니다!').status,'duplicate'); assert.deepEqual(s,before);
});
test('duplicate correct answer cannot increase completed count', () => {
  const s=createSession(); submitAnswer(s,getPrescription(s.id).text);
  assert.equal(submitAnswer(s,getPrescription(s.id).text).status,'complete');
  assert.equal(s.completed.length,1);
});
test('restart or repeat same case keeps unique session completion', () => {
  const s=createSession(); submitAnswer(s,getPrescription(s.id).text);
  restartPrescription(s); assert.equal(s.phase,'input'); assert.equal(s.mode,'read');
  submitAnswer(s,getPrescription(s.id).text); assert.deepEqual(s.completed,['grace']);
});
test('selection resets mode, hint and answer-check state but retains session count', () => {
  const s=createSession(); submitAnswer(s,getPrescription(s.id).text); setMode(s,'recall'); revealSource(s);
  selectPrescription(s,'trust'); assert.equal(s.mode,'read'); assert.equal(s.revealed,false);
  assert.equal(s.lastInput,null); assert.equal(s.lastResult,null); assert.deepEqual(s.completed,['grace']);
});
test('switching modes after completion supports fresh recall without losing session progress', () => {
  const s=createSession(); submitAnswer(s,getPrescription(s.id).text); setMode(s,'recall');
  assert.equal(s.phase,'input'); assert.equal(s.revealed,false); assert.equal(s.lastInput,null); assert.deepEqual(s.completed,['grace']);
});
test('source reveal carries no score or penalty and resets when changing mode', () => {
  const s=createSession(); setMode(s,'recall'); revealSource(s); assert.equal(s.revealed,true);
  setMode(s,'read'); assert.equal(s.revealed,false);
  assert.equal(submitAnswer(s,getPrescription(s.id).text).status,'correct');
});
test('next cycles through all five then returns first in read mode', () => {
  const s=createSession(); const ids=[];
  for(let i=0;i<5;i++){ids.push(s.id);nextPrescription(s);assert.equal(s.mode,'read');}
  assert.deepEqual(ids,PSALM_PRESCRIPTIONS.map(p=>p.id));assert.equal(s.id,'grace');
});
test('discard confirmation required for unconfirmed content only', () => {
  const s=createSession();assert.equal(needsDiscardConfirmation(s,''),false);assert.equal(needsDiscardConfirmation(s,'  '),false);
  assert.equal(needsDiscardConfirmation(s,'<script>not evaluated</script>'),true);
  submitAnswer(s,getPrescription(s.id).text);assert.equal(needsDiscardConfirmation(s,getPrescription(s.id).text),false);
});
test('invalid case or mode fails before mutating state', () => {
  const s=createSession(), before=structuredClone(s);
  assert.throws(()=>selectPrescription(s,'unknown'),RangeError);assert.throws(()=>setMode(s,'score'),RangeError);
  assert.deepEqual(s,before);
});
test('new UI contains no persistence, external request, audio, or HTML injection sinks', async () => {
  const ui=await readFile(new URL('../src/psalm-prescription.js',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|sendBeacon|AudioContext|innerHTML/);
  assert.match(ui,/event\.isComposing/);assert.match(ui,/compositionstart/);assert.match(ui,/compositionend/);
  const html=await readFile(new URL('../dance.html',import.meta.url),'utf8');
  assert.match(html,/다윗의 시편 처방전/);assert.doesNotMatch(html,/side-ranking|david-dance\.js|id="sound"|id="stage"/);
});
