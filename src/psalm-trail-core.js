import { TRAIL_TEXT } from './psalm-trail-text.js';

// Labels describe a symbolic trail, not historical or geographical locations.
const LABELS = ['목자의 들판', '쉴 만한 물가', '의의 길', '골짜기', '넘치는 잔', '여호와의 집'];
export const VERSES = Object.freeze(TRAIL_TEXT.map((text, index) => Object.freeze({
  id: index + 1,
  reference: `시편 23편 ${index + 1}절`,
  text,
  label: LABELS[index],
})));
export const MODES = Object.freeze(['copy', 'initials', 'recall']);
const INITIALS = Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');

/** Ignore only spacing and punctuation. Preserve the exact words of the selected edition. */
export function normalizeAnswer(text) {
  return typeof text === 'string' ? text.normalize('NFC').replace(/[\s\p{P}]/gu, '') : '';
}

/** Keep punctuation, spacing, non-Hangul characters and scripture unchanged. */
export function toInitials(text) {
  if (typeof text !== 'string') return '';
  return Array.from(text.normalize('NFC'), character => {
    const code = character.codePointAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? INITIALS[Math.floor(code / 588)] : character;
  }).join('');
}

/** Indexes count normalized Unicode characters, not source string offsets. */
export function inspectAnswer(input, target) {
  const typed = Array.from(normalizeAnswer(input));
  const expected = Array.from(normalizeAnswer(target));
  let prefix = 0;
  while (prefix < typed.length && prefix < expected.length && typed[prefix] === expected[prefix]) prefix++;
  return {
    correct: typed.length > 0 && typed.length === expected.length && prefix === expected.length,
    prefix,
    typed: typed.length,
    total: expected.length,
    errorIndex: prefix < typed.length ? prefix : -1,
  };
}

/** A run and its results exist only in memory. It never modifies scripture. */
export function createRun(mode = 'copy', ids = VERSES.map(verse => verse.id)) {
  if (!MODES.includes(mode)) throw new RangeError('Unknown Psalm trail mode');
  if (!Array.isArray(ids) || ids.length === 0 || Array.from(ids).some(id => !Number.isInteger(id) || !VERSES.some(verse => verse.id === id))) {
    throw new RangeError('Choose at least one valid Psalm trail verse');
  }
  if (new Set(ids).size !== ids.length) throw new RangeError('Psalm trail verse IDs must be unique');
  return { mode, ids: [...ids], index: 0, records: [], hinted: false, attempts: 0, phase: 'playing' };
}

export function currentVerse(run) {
  if (!run || run.phase === 'finished' || !Array.isArray(run.ids)) return null;
  return VERSES.find(verse => verse.id === run.ids[run.index]) ?? null;
}

export function revealHint(run) {
  if (run?.phase === 'playing' && currentVerse(run)) run.hinted = true;
  return run;
}

/**
 * Only an explicit correct submission creates a checkpoint. 'assisted' records
 * a requested hint; mode must also be considered before describing unaided recall.
 * Attempts counts prior nonblank wrong submissions, never keystrokes.
 */
export function submitAnswer(run, input) {
  const verse = currentVerse(run);
  if (run?.phase !== 'playing' || !verse || !normalizeAnswer(input)) {
    return { correct: false, ignored: true, analysis: null };
  }
  const analysis = inspectAnswer(input, verse.text);
  if (!analysis.correct) {
    run.attempts++;
    return { correct: false, ignored: false, analysis };
  }
  run.records.push(Object.freeze({
    id: verse.id,
    assisted: run.hinted,
    attempts: run.attempts,
    mode: run.mode,
  }));
  run.phase = 'checkpoint';
  return { correct: true, ignored: false, analysis };
}

/** A second explicit action leaves a checkpoint. Repeated calls cannot skip. */
export function advance(run) {
  if (run?.phase !== 'checkpoint' || !currentVerse(run)) return run;
  run.index++;
  run.hinted = false;
  run.attempts = 0;
  run.phase = run.index < run.ids.length ? 'playing' : 'finished';
  return run;
}

/** These are practice suggestions, not a measure of memory or faith. */
export function reviewIds(run) {
  if (!Array.isArray(run?.records)) return [];
  return [...new Set(run.records.filter(record => record.assisted || record.attempts > 0).map(record => record.id))];
}
