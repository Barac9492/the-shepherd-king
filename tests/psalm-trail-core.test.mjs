import test from 'node:test';
import assert from 'node:assert/strict';
import { PSALM23 } from '../src/psalm23.js';
import { readFileSync } from 'node:fs';
import { TRAIL_TEXT, TRAIL_CITATION, TRAIL_SOURCES } from '../src/psalm-trail-text.js';
import {
  VERSES, MODES, normalizeAnswer, toInitials, inspectAnswer,
  createRun, currentVerse, revealHint, submitAnswer, advance, reviewIds,
} from '../src/psalm-trail-core.js';

const EXACT_TEXT = [
  "여호와는 나의 목자시니 내게 부족함이 없으리로다",
  "그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다",
  "내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다",
  "내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다",
  "주께서 내 원수의 목전에서 내게 상을 차려 주시고 기름을 내 머리에 부으셨으니 내 잔이 넘치나이다",
  "내 평생에 선하심과 인자하심이 반드시 나를 따르리니 내가 여호와의 집에 영원히 살리로다"
];
const copy = value => JSON.parse(JSON.stringify(value));

test('six stations retain exact user-selected 개역개정 text and verse identity', () => {
  assert.deepEqual(VERSES.map(verse => verse.text), EXACT_TEXT);
  assert.deepEqual(VERSES.map(verse => verse.text), TRAIL_TEXT);
  assert.ok(Object.isFrozen(TRAIL_TEXT));
  assert.deepEqual(VERSES.map(verse => verse.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(VERSES.map(verse => verse.reference), [1, 2, 3, 4, 5, 6].map(id => `시편 23편 ${id}절`));
  assert.deepEqual(VERSES.map(verse => verse.label), ['목자의 들판', '쉴 만한 물가', '의의 길', '골짜기', '넘치는 잔', '여호와의 집']);
  assert.ok(Object.isFrozen(VERSES));
  assert.ok(VERSES.every(Object.isFrozen));
  assert.deepEqual(MODES, ['copy', 'initials', 'recall']);
  assert.ok(Object.isFrozen(MODES));
});

test('normalization uses NFC and removes whitespace and punctuation only', () => {
  assert.equal(normalizeAnswer('  “나의,”\n목자!\t'), '나의목자');
  assert.equal(normalizeAnswer('나의 목자'.normalize('NFD')), '나의목자');
  assert.equal(normalizeAnswer('나+의=목자'), '나+의=목자');
  assert.equal(normalizeAnswer('Ａ'), 'Ａ');
  assert.notEqual(normalizeAnswer('Ａ'), normalizeAnswer('A'));
  assert.equal(normalizeAnswer('\u200b나'), '\u200b나');
  for (const value of ['', ' \n...!?「」', null, undefined, 123, {}, []]) assert.equal(normalizeAnswer(value), '');
});

test('Hangul initials preserve whitespace, punctuation and non-Hangul text', () => {
  assert.equal(toInitials('여호와는 나의 목자시니'), 'ㅇㅎㅇㄴ ㄴㅇ ㅁㅈㅅㄴ');
  assert.equal(toInitials('가까나다따라마바빠사싸아자짜차카타파하'), 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
  assert.equal(toInitials('힣, 한글!\nPsalm 23:1'), 'ㅎ, ㅎㄱ!\nPsalm 23:1');
  assert.equal(toInitials('나의'.normalize('NFD')), 'ㄴㅇ');
  assert.equal(toInitials(null), '');
});

test('answer inspection distinguishes partial, wrong, exact and extra characters', () => {
  assert.deepEqual(inspectAnswer('여호', '여호와는'), { correct: false, prefix: 2, typed: 2, total: 4, errorIndex: -1 });
  assert.deepEqual(inspectAnswer('여하', '여호와는'), { correct: false, prefix: 1, typed: 2, total: 4, errorIndex: 1 });
  assert.deepEqual(inspectAnswer('여 호,와는.', '여호와는'), { correct: true, prefix: 4, typed: 4, total: 4, errorIndex: -1 });
  assert.deepEqual(inspectAnswer('여호와는가', '여호와는'), { correct: false, prefix: 4, typed: 5, total: 4, errorIndex: 4 });
  assert.deepEqual(inspectAnswer('', ''), { correct: false, prefix: 0, typed: 0, total: 0, errorIndex: -1 });
  assert.equal(inspectAnswer('... ', VERSES[0].text).correct, false);
  assert.equal(inspectAnswer(VERSES[1].text.replace('가로', '가으로'), VERSES[1].text).correct, false);
  assert.equal(inspectAnswer(VERSES[3].text.replace('다닐지라도', '다닐찌라도'), VERSES[3].text).correct, false);
});

test('comparison indexes use code points and do not accept appended symbols', () => {
  assert.deepEqual(inspectAnswer('\u{1f30a}가', '\u{1f30a}나'), { correct: false, prefix: 1, typed: 2, total: 2, errorIndex: 1 });
  assert.equal(inspectAnswer(`${VERSES[0].text}+`, VERSES[0].text).correct, false);
  assert.equal(inspectAnswer(VERSES[0].text.normalize('NFD'), VERSES[0].text).correct, true);
});

test('a default run is detached, deterministic and starts with no results', () => {
  const run = createRun();
  assert.deepEqual(run, { mode: 'copy', ids: [1, 2, 3, 4, 5, 6], index: 0, records: [], hinted: false, attempts: 0, phase: 'playing' });
  assert.equal(currentVerse(run), VERSES[0]);
  const ids = [3, 1];
  const subset = createRun('recall', ids);
  ids.push(5);
  assert.deepEqual(subset.ids, [3, 1]);
  assert.equal(currentVerse(subset), VERSES[2]);
  assert.notEqual(run.records, createRun().records);
});

test('invalid modes, empty routes, unknown IDs and duplicate IDs fail at creation', () => {
  for (const mode of ['wrong', '', null, 0, {}, ['copy']]) assert.throws(() => createRun(mode), RangeError);
  for (const ids of [[], null, '1', [0], [7], ['1'], [1.5], [NaN], [1, 1], [1, 2, undefined], new Array(1)]) {
    assert.throws(() => createRun('recall', ids), RangeError);
  }
});

test('blank or nonstring input is ignored without changing a run', () => {
  const run = createRun('recall');
  const before = copy(run);
  for (const value of ['', ' \n...?!', null, undefined, 42, {}]) {
    assert.deepEqual(submitAnswer(run, value), { correct: false, ignored: true, analysis: null });
    assert.deepEqual(run, before);
  }
});

test('partial, wrong and overlong submissions never advance or produce records', () => {
  const run = createRun('initials');
  for (const value of ['여호', '다른 문장', VERSES[0].text + '가'.repeat(10000)]) {
    const result = submitAnswer(run, value);
    assert.equal(result.correct, false);
    assert.equal(result.ignored, false);
    assert.equal(run.phase, 'playing');
    assert.equal(run.index, 0);
    assert.deepEqual(run.records, []);
  }
  assert.equal(run.attempts, 3);
  const before = copy(run);
  assert.equal(advance(run), run);
  assert.deepEqual(run, before);
});

test('an exact submission records one checkpoint, and repeated submission is ignored', () => {
  const run = createRun('recall');
  submitAnswer(run, '오답');
  assert.equal(submitAnswer(run, VERSES[0].text).correct, true);
  assert.equal(run.index, 0);
  assert.equal(run.phase, 'checkpoint');
  assert.deepEqual(run.records, [{ id: 1, assisted: false, attempts: 1, mode: 'recall' }]);
  const checkpoint = copy(run);
  assert.deepEqual(submitAnswer(run, VERSES[0].text), { correct: false, ignored: true, analysis: null });
  revealHint(run);
  assert.deepEqual(run, checkpoint);
  advance(run);
  assert.equal(run.index, 1);
  assert.equal(run.phase, 'playing');
  assert.equal(run.attempts, 0);
  advance(run);
  assert.equal(run.index, 1);
});

test('hint use is captured once and resets at the next station', () => {
  const run = createRun('recall');
  assert.equal(revealHint(run), run);
  revealHint(run);
  assert.equal(run.hinted, true);
  submitAnswer(run, VERSES[0].text);
  assert.deepEqual(run.records[0], { id: 1, assisted: true, attempts: 0, mode: 'recall' });
  advance(run);
  assert.equal(run.hinted, false);
  submitAnswer(run, VERSES[1].text);
  assert.deepEqual(run.records[1], { id: 2, assisted: false, attempts: 0, mode: 'recall' });
  assert.deepEqual(reviewIds(run), [1]);
});

test('all modes can complete all six verses only through six explicit checkpoints', () => {
  const source = copy(PSALM23);
  for (const mode of MODES) {
    const run = createRun(mode);
    for (const verse of VERSES) {
      assert.equal(currentVerse(run), verse);
      const result = submitAnswer(run, verse.text);
      assert.equal(result.correct, true);
      assert.equal(run.phase, 'checkpoint');
      assert.equal(run.records.length, verse.id);
      assert.equal(run.records.at(-1).mode, mode);
      advance(run);
    }
    assert.equal(run.phase, 'finished');
    assert.equal(run.index, 6);
    assert.equal(currentVerse(run), null);
    assert.deepEqual(run.records.map(record => record.id), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(reviewIds(run), []);
  }
  assert.deepEqual(PSALM23, source);
});

test('finished runs cannot be mutated by submit, hint or advance', () => {
  const run = createRun('copy', [6]);
  submitAnswer(run, VERSES[5].text);
  advance(run);
  const finished = copy(run);
  assert.deepEqual(submitAnswer(run, VERSES[5].text), { correct: false, ignored: true, analysis: null });
  revealHint(run);
  advance(run);
  assert.deepEqual(run, finished);
  assert.equal(currentVerse(run), null);
});

test('review IDs include helped and previously wrong verses in route order', () => {
  const run = createRun('recall', [6, 2, 4]);
  revealHint(run);
  submitAnswer(run, VERSES[5].text);
  advance(run);
  submitAnswer(run, '오답');
  submitAnswer(run, '두 번째 오답');
  submitAnswer(run, VERSES[1].text);
  advance(run);
  submitAnswer(run, VERSES[3].text);
  advance(run);
  assert.deepEqual(reviewIds(run), [6, 2]);
  const replay = createRun(run.mode, reviewIds(run));
  assert.deepEqual(replay.ids, [6, 2]);
  assert.deepEqual(replay.records, []);
  assert.equal(currentVerse(replay).id, 6);
  assert.equal(run.records.length, 3);
});

test('copy and initials results retain their mode rather than claiming unaided recall', () => {
  for (const mode of ['copy', 'initials']) {
    const run = createRun(mode, [1]);
    submitAnswer(run, VERSES[0].text);
    advance(run);
    assert.deepEqual(run.records, [{ id: 1, assisted: false, attempts: 0, mode }]);
    assert.equal(run.records.filter(record => record.mode === 'recall' && !record.assisted && record.attempts === 0).length, 0);
    assert.equal(Object.hasOwn(run, 'score'), false);
    assert.equal(Object.hasOwn(run, 'mastered'), false);
  }
});

test('no active run returns no verse, result or mutation', () => {
  assert.equal(currentVerse(null), null);
  assert.equal(currentVerse({ phase: 'playing', ids: [99], index: 0 }), null);
  assert.deepEqual(submitAnswer(null, 'anything'), { correct: false, ignored: true, analysis: null });
  assert.equal(revealHint(null), null);
  assert.equal(advance(null), null);
  assert.deepEqual(reviewIds(null), []);
});


test('initials mode uses initial consonants as display cues and requires the full verse as the answer', () => {
  const run = createRun('initials');
  const verse = currentVerse(run);
  const initialsResult = submitAnswer(run, toInitials(verse.text));
  assert.equal(initialsResult.correct, false);
  assert.equal(initialsResult.ignored, false);
  assert.equal(run.phase, 'playing');
  assert.equal(run.index, 0);
  assert.deepEqual(run.records, []);
  const fullVerseResult = submitAnswer(run, verse.text);
  assert.equal(fullVerseResult.correct, true);
  assert.equal(fullVerseResult.ignored, false);
  assert.equal(run.phase, 'checkpoint');
  assert.deepEqual(run.records, [{ id: verse.id, assisted: false, attempts: 1, mode: 'initials' }]);
});

// Independent expected fixture above is the user's verbatim six-verse request.
test('old-edition variants cannot complete the newly selected text', () => {
  for (const mode of MODES) for (let i=0;i<6;i++) {
    const run=createRun(mode,[i+1]);
    if (PSALM23.ko[i] !== EXACT_TEXT[i]) {
      assert.equal(submitAnswer(run,PSALM23.ko[i]).correct,false);
      assert.equal(run.phase,'playing');
    }
    assert.equal(submitAnswer(run,EXACT_TEXT[i]).correct,true);
  }
  assert.equal(PSALM23.ko[0],'여호와는 나의 목자시니 내가 부족함이 없으리로다');
});

test('edition, attribution and source link match the selected text', () => {
  const html=readFileSync(new URL('../psalm-trail.html',import.meta.url),'utf8');
  assert.ok(!html.includes('개역한글'));
  assert.ok(html.includes('시편 23:1–6 · 개역개정'));
  assert.ok(html.includes('<span>개역개정</span>'));
  assert.ok(TRAIL_CITATION.includes('개역개정'));
  assert.ok(TRAIL_CITATION.includes('대한성서공회'));
  assert.equal(new URL(TRAIL_SOURCES.text).searchParams.get('version'),'GAE');
  assert.equal(new URL(TRAIL_SOURCES.text).searchParams.get('chap'),'23');
  assert.ok(html.includes(TRAIL_SOURCES.text.replaceAll('&','&amp;')));
});
