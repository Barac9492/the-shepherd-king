import { PRESCRIPTION_INTRO, PSALM_PRESCRIPTIONS } from './psalm-prescriptions.js';
import { createSession, getPrescription, selectPrescription, setMode, revealSource, submitAnswer, restartPrescription, nextPrescription, needsDiscardConfirmation } from './psalm-prescription-core.js';
const $ = id => document.getElementById(id);
const session = createSession();
let composing = false, pendingAction = null;
$('introText').textContent = PRESCRIPTION_INTRO;
for (const item of PSALM_PRESCRIPTIONS) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'choice'; button.dataset.prescription = item.id;
  const number = document.createElement('span'); number.className = 'choice-number'; number.textContent = item.number; number.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span'); copy.className = 'choice-copy';
  const title = document.createElement('span'); title.className = 'choice-title'; title.textContent = item.situation;
  const reference = document.createElement('span'); reference.className = 'choice-ref'; reference.textContent = `시편 ${item.chapter}편`;
  copy.append(title, reference); button.append(number, copy);
  button.addEventListener('click', () => { if (session.id !== item.id) requestAction(() => { selectPrescription(session, item.id); resetInput(); render(); focusReading(); }); else focusReading(); });
  $('prescriptionChoices').append(button);
}
function render() {
  const item = getPrescription(session.id);
  const visible = session.mode === 'read' || session.revealed || session.phase === 'complete';
  $('selectedNumber').textContent = item.number;
  $('verseLabel').textContent = `${item.reference} · 대표 구절`;
  $('situationTitle').textContent = item.situation;
  $('verse').textContent = visible ? item.text : '';
  $('verse').hidden = !visible; $('hiddenSource').hidden = visible;
  $('hint').hidden = visible;
  $('explanationWrap').hidden = !visible;
  $('explanation').textContent = visible ? item.explanation : '';
  $('modeNote').textContent = session.mode === 'read' ? '말씀을 읽으며 한 번 적어 보세요.' : '기억한 말씀을 적어 보세요. 언제든 본문을 다시 볼 수 있어요.';
  $('readMode').setAttribute('aria-pressed', String(session.mode === 'read'));
  $('recallMode').setAttribute('aria-pressed', String(session.mode === 'recall'));
  $('result').hidden = session.phase !== 'complete';
  $('answerForm').hidden = session.phase === 'complete';
  $('completedCount').textContent = `${session.completed.length} / ${PSALM_PRESCRIPTIONS.length}`;
  for (const button of $('prescriptionChoices').children) button.setAttribute('aria-pressed', String(button.dataset.prescription === session.id));
}
function resetInput() { $('answer').value = ''; $('feedback').replaceChildren(); composing = false; $('check').disabled = false; }
function focusReading() {
  $('situationTitle').focus({ preventScroll: true });
  if (window.matchMedia('(max-width: 760px)').matches) document.querySelector('.reading-panel').scrollIntoView({ block: 'start' });
}
function requestAction(action) {
  if ($('confirm').open) return;
  if (needsDiscardConfirmation(session, $('answer').value)) {
    pendingAction = action; $('confirm').showModal(); $('cancelAction').focus();
  } else action();
}
function cancelAction() { pendingAction = null; $('confirm').close(); $('answer').focus(); }
$('cancelAction').addEventListener('click', cancelAction);
$('confirm').addEventListener('cancel', event => { event.preventDefault(); cancelAction(); });
$('confirmAction').addEventListener('click', () => {
  const action = pendingAction; pendingAction = null; $('confirm').close();
  if (action) action();
});
function changeMode(mode) {
  if (session.mode === mode && session.phase !== 'complete') return;
  if (session.phase === 'complete') { restartPrescription(session); resetInput(); }
  setMode(session, mode); $('feedback').replaceChildren(); render(); $('answer').focus();
}
$('readMode').addEventListener('click', () => changeMode('read'));
$('recallMode').addEventListener('click', () => changeMode('recall'));
$('hint').addEventListener('click', () => { revealSource(session); render(); $('answer').focus(); });
$('restart').addEventListener('click', () => requestAction(() => { restartPrescription(session); resetInput(); render(); focusReading(); }));
$('next').addEventListener('click', () => {
  if (session.phase !== 'complete') return;
  nextPrescription(session); resetInput(); render(); focusReading();
});
$('leave').addEventListener('click', event => {
  if (!needsDiscardConfirmation(session, $('answer').value)) return;
  event.preventDefault(); requestAction(() => { resetInput(); window.location.assign($('leave').href); });
});
window.addEventListener('beforeunload', event => {
  if (needsDiscardConfirmation(session, $('answer').value)) { event.preventDefault(); event.returnValue = ''; }
});
$('answer').addEventListener('compositionstart', () => { composing = true; $('check').disabled = true; });
$('answer').addEventListener('compositionend', () => { composing = false; $('check').disabled = false; });
$('answer').addEventListener('keydown', event => {
  if (event.isComposing || composing || event.keyCode === 229) return;
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('answerForm').requestSubmit(); }
});
$('answerForm').addEventListener('submit', event => {
  event.preventDefault();
  if (composing || $('confirm').open) return;
  const result = submitAnswer(session, $('answer').value);
  if (result.status === 'complete') return;
  const feedback = $('feedback'); feedback.replaceChildren();
  if (result.status === 'blank') { feedback.textContent = '기억한 말씀을 먼저 입력해 주세요.'; return; }
  if (result.status === 'too-long') { feedback.textContent = '한 구절씩, 600자 이내로 입력해 주세요.'; return; }
  if (result.status === 'correct') {
    feedback.textContent = `${getPrescription(session.id).reference}을 확인했어요.`;
    render(); $('resultTitle').focus(); return;
  }
  const message = document.createElement('p');
  message.textContent = result.status === 'duplicate' ? '같은 내용을 다시 확인했어요. 아래 부분을 살펴보세요.' : '본문과 다른 부분이 있어요. 천천히 다시 살펴보세요.';
  feedback.append(message);
  const differences = result.groups?.filter(group => !group.same) || [];
  for (const group of differences) {
    const correction = document.createElement('div'); correction.className = 'correction';
    const expected = document.createElement('p'); expected.textContent = `본문: ${group.expected || '(추가된 글자 없이)'} `;
    const actual = document.createElement('p'); actual.textContent = `입력: ${group.actual || '(빠진 글자)'} `;
    correction.append(expected, actual); feedback.append(correction);
  }
});
render();
