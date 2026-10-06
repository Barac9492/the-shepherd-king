import { normalize, compareVerse } from './david-dance-core.js';
import { PSALM_PRESCRIPTIONS } from './psalm-prescriptions.js';
export { normalize };
export function getPrescription(id) {
  const item = PSALM_PRESCRIPTIONS.find(item => item.id === id);
  if (!item) throw new RangeError('Unknown psalm prescription');
  return item;
}
export function createSession(id = 'grace') {
  getPrescription(id);
  return { id, mode: 'read', revealed: false, phase: 'input', completed: [], lastInput: null, lastResult: null };
}
export function selectPrescription(session, id) {
  getPrescription(id);
  Object.assign(session, { id, mode: 'read', revealed: false, phase: 'input', lastInput: null, lastResult: null });
  return session;
}
export function setMode(session, mode) {
  if (!['read', 'recall'].includes(mode)) throw new RangeError('Unknown reading mode');
  if (session.phase === 'complete') { session.phase = 'input'; session.lastInput = null; session.lastResult = null; }
  session.mode = mode; session.revealed = false;
  return session;
}
export function revealSource(session) { session.revealed = true; }
export function restartPrescription(session) { return selectPrescription(session, session.id); }
export function nextPrescription(session) {
  const index = PSALM_PRESCRIPTIONS.findIndex(item => item.id === session.id);
  return selectPrescription(session, PSALM_PRESCRIPTIONS[(index + 1) % PSALM_PRESCRIPTIONS.length].id);
}
export function needsDiscardConfirmation(session, input) { return session.phase === 'input' && String(input).trim().length > 0; }
export function submitAnswer(session, input) {
  if (session.phase === 'complete') return { status: 'complete' };
  const text = String(input);
  if (text.length > 600) return { status: 'too-long' };
  const normalized = normalize(text);
  if (!normalized) return { status: 'blank' };
  if (normalized === session.lastInput) return { ...session.lastResult, status: 'duplicate' };
  const { correct, groups } = compareVerse(getPrescription(session.id).text, text);
  const result = { status: correct ? 'correct' : 'incorrect', correct, groups };
  session.lastInput = normalized; session.lastResult = result;
  if (correct) {
    session.phase = 'complete';
    if (!session.completed.includes(session.id)) session.completed.push(session.id);
  }
  return result;
}
