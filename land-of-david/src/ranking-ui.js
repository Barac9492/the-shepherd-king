const VERSION = 'land-top10-v1';
const ACTS = Object.freeze({adullam: '아둘람', herut: '헤렛·그일라·엔게디', ziklag: '시글락', hebron: '다윗성', temple: '성전 준비'});
const CONDITIONS = '랭킹 도전은 같은 시작 조건으로 겨뤄요. 일반 플레이의 이전 막 인원은 이어받지 않아요.';
const ERRORS = {
  attempt_expired: '도전 기록의 보관 시간이 지났어요. 새 랭킹 도전을 시작해 주세요.',
  attempt_not_found: '도전 기록을 찾을 수 없어요. 새 랭킹 도전을 시작해 주세요.',
  attempt_invalid: '이번 도전은 랭킹에 등록할 수 없어요. 일반 플레이는 계속할 수 있어요.',
  invalid_result: '서버에서 이번 기록을 확인하지 못했어요.',
  unsupported_version: '랭킹 규칙이 바뀌었어요. 페이지를 새로 열고 도전해 주세요.',
  attempt_conflict: '이미 확인한 도전 내용과 달라요. 새 랭킹 도전을 시작해 주세요.',
  blocked_initials: '사용할 수 없는 이니셜이에요. 다른 이니셜을 입력해 주세요.',
  invalid_initials: '영문 대문자 세 글자를 입력해 주세요.',
  not_qualified: '이번 점수는 공개 등록 대상이 아니에요.',
  rate_limited: '요청이 많아요. 잠시 뒤 다시 시도해 주세요.',
};
const cap = act => act === 'hebron' ? 18000 : act === 'temple' ? 100 : 10000;
const scoreValid = (act, score) => Number.isInteger(score) && score >= 0 && score <= cap(act);
const metaValid = (data, act) => data && data.mode === 'land' && data.version === VERSION && data.act === act;
function formatScore(act, score) {
  if (act === 'hebron') return `${String(Math.floor(score / 600)).padStart(2, '0')}:${String(Math.floor(score / 10) % 60).padStart(2, '0')}.${score % 10}`;
  return `${score}${act === 'temple' ? '%' : '명'}`;
}
function validBoard(data, act) {
  if (!metaValid(data, act) || !Array.isArray(data.entries) || data.entries.length > 10) return false;
  let previous, previousRank;
  return data.entries.every((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.initials !== 'string' || !/^[A-Z]{3}$/.test(entry.initials) || !scoreValid(act, entry.score) || entry.score === 0) return false;
    const rank = i > 0 && entry.score === previous ? previousRank : i + 1;
    if (entry.rank !== rank || (i > 0 && (act === 'hebron' ? entry.score < previous : entry.score > previous))) return false;
    previous = entry.score; previousRank = rank;
    return true;
  });
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, handler) {
  const node = element('button', text, 'land-ranking-button');
  node.type = 'button'; node.addEventListener('click', handler);
  return node;
}
async function request(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      ...(body ? {headers: {'Content-Type': 'application/json'}, body} : {})});
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(ERRORS[data?.error?.code] || '랭킹 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.code && ERRORS[error.code]) throw error;
    throw new Error(globalThis.navigator?.onLine === false ? '인터넷 연결이 끊겼어요. 연결한 뒤 다시 시도해 주세요.' : '랭킹 서버의 응답을 확인하지 못했어요. 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
}

export function mountLandRanking({act = null, onStart = null} = {}) {
  if (act !== null && !Object.hasOwn(ACTS, act)) throw new TypeError('지원하지 않는 막이에요.');
  const title = document.getElementById('title');
  if (!title) throw new Error('시작 화면을 찾을 수 없어요.');
  let selected = act || 'adullam', boardGeneration = 0, attemptGeneration = 0;
  let lostEligibility = false;
  let returnFocus = null, finishBody = null, submitBody = null, verifying = false, submitting = false, verified = false, published = false;
  const dialog = element('dialog', undefined, 'land-ranking-dialog');
  dialog.id = 'landRankingDialog'; dialog.setAttribute('data-land-ranking', ''); dialog.setAttribute('aria-labelledby', 'landRankingHeading');
  const heading = element('h2', '다윗의 땅 · 막별 TOP 10'); heading.id = 'landRankingHeading';
  const close = button('닫기', () => dialog.close()); close.setAttribute('aria-label', '막별 랭킹 닫기');
  const header = element('header', undefined, 'land-ranking-header'); header.append(heading, close);
  const content = element('div', undefined, 'land-ranking-content');
  const filters = element('div', undefined, 'land-ranking-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '막 선택');
  const filterButtons = [];
  if (!act) for (const [key, name] of Object.entries(ACTS)) {
    const tab = button(`${filterButtons.length + 1}막 · ${name}`, () => { selected = key; void loadBoard(); });
    tab.dataset.act = key; filters.append(tab); filterButtons.push(tab);
  }
  const boardHeading = element('h3');
  const criterion = element('p', undefined, 'land-ranking-muted');
  const boardStatus = element('p', '', 'land-ranking-status'); boardStatus.setAttribute('role', 'status');
  const board = element('ol', undefined, 'land-ranking-list'); board.setAttribute('aria-label', '상위 열 개 기록');
  const refresh = button('다시 불러오기', () => void loadBoard());
  const result = element('section', undefined, 'land-ranking-result'); result.hidden = true;
  const resultHeading = element('h3', '이번 도전 결과');
  const resultStatus = element('p', '', 'land-ranking-status'); resultStatus.setAttribute('role', 'status');
  const finishRetry = button('기록 확인 다시 시도', () => void verify()); finishRetry.hidden = true;
  const form = element('form', undefined, 'land-ranking-form'); form.hidden = true;
  const initialsLabel = element('label', '영문 이니셜 세 글자'); initialsLabel.htmlFor = 'landRankingInitials';
  const initials = element('input'); initials.id = 'landRankingInitials'; initials.type = 'text'; initials.maxLength = 3;
  initials.pattern = '[A-Z]{3}'; initials.required = true; initials.autocomplete = 'off'; initials.setAttribute('autocapitalize', 'characters'); initials.spellcheck = false;
  initials.addEventListener('input', () => { initials.value = initials.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); });
  const consentLabel = element('label', undefined, 'land-ranking-consent');
  const consent = element('input'); consent.type = 'checkbox'; consent.required = true; consent.checked = false;
  consentLabel.append(consent, element('span', '이니셜과 점수가 공개되는 데 동의해요. (선택)'));
  const submit = element('button', '공개 랭킹에 등록', 'land-ranking-button land-ranking-primary'); submit.type = 'submit';
  const submitStatus = element('p', '', 'land-ranking-status'); submitStatus.setAttribute('role', 'status');
  form.append(initialsLabel, initials, consentLabel, submit, submitStatus);
  result.append(resultHeading, resultStatus, finishRetry, form);
  const privacy = element('p', '상위 10명이 아니라 상위 10개 기록을 보여줘요. 같은 이니셜도 여러 번 나올 수 있어요. 공개 기록은 상위 10개만 보관하며, 임시 도전 기록은 2시간 뒤 만료돼요. 점수는 신앙의 척도가 아니에요. 랭킹 열람에는 동의가 필요 없고, 등록하지 않아도 플레이할 수 있어요.', 'land-ranking-privacy');
  content.append(result, filters, boardHeading, criterion, boardStatus, board, refresh, element('p', CONDITIONS, 'land-ranking-muted'), privacy);
  dialog.append(header, content); document.body.append(dialog);
  const launch = button('막별 랭킹', () => open()); launch.id = 'landRankingButton';
  const hud = document.getElementById('hud');
  if (hud) {
    const hudLaunch = button('랭킹', () => open());
    hudLaunch.id = 'landRankingHudButton'; hudLaunch.setAttribute('aria-label', '막별 랭킹 열기'); hud.append(hudLaunch);
  }
  const anchor = title.querySelector('#best'); const ordinaryStart = title.querySelector('#startBtn');
  if (anchor) anchor.after(launch); else if (ordinaryStart) ordinaryStart.before(launch); else title.append(launch);
  const notice = element('p', '', 'land-ranking-notice'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); document.body.append(notice);
  const startStatus = element('p', '', 'land-ranking-start-status'); startStatus.setAttribute('role', 'status');
  if (act && typeof onStart === 'function') {
    const challenge = button('랭킹 도전', async () => {
      challenge.disabled = true; startStatus.textContent = '같은 시작 조건으로 도전을 준비하고 있어요…';
      try {
        const success = await onStart();
        if (success !== true) throw new Error('도전을 시작하지 못했어요.');
        lostEligibility = false; attemptGeneration++; finishBody = null; submitBody = null; verifying = false; submitting = false; verified = false; published = false;
        result.hidden = true; form.hidden = true; initials.value = ''; consent.checked = false; initials.disabled = false; consent.disabled = false;
        submit.disabled = false; submit.textContent = '공개 랭킹에 등록'; submitStatus.textContent = ''; finishRetry.hidden = true;
        notice.textContent = ''; startStatus.textContent = '';
      } catch { startStatus.textContent = '랭킹 도전을 시작하지 못했어요. 다시 눌러 주세요. 일반 플레이는 그대로 시작할 수 있어요.'; }
      finally { challenge.disabled = false; }
    });
    challenge.id = 'landRankingChallenge'; launch.after(challenge);
    const explanation = element('p', CONDITIONS, 'land-ranking-start-note'); challenge.after(explanation); explanation.after(startStatus);
  }
  // Native modal supplies inert background and focus trapping; stop bubbled game keys too.
  for (const eventName of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(eventName, event => event.stopPropagation());
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('close', () => {
    boardGeneration++;
    if (returnFocus?.isConnected && !returnFocus.closest('.hide')) returnFocus.focus();
    else if (!title.classList.contains('hide')) launch.focus();
  });
  function open() {
    if (!dialog.open) { returnFocus = document.activeElement; window.dispatchEvent(new Event('blur')); dialog.showModal(); close.focus(); }
    void loadBoard();
  }
  async function loadBoard() {
    const generation = ++boardGeneration, current = selected;
    filterButtons.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.act === current)));
    boardHeading.textContent = `${ACTS[current]} · TOP 10`;
    criterion.textContent = current === 'hebron' ? '완수 시간이 짧을수록 높은 순위예요. 같은 기록은 공동 순위예요.' : `${current === 'temple' ? '준비율' : '함께한 인원'}이 높을수록 높은 순위예요. 같은 기록은 공동 순위예요.`;
    board.replaceChildren(); boardStatus.textContent = '기록을 불러오고 있어요…'; refresh.disabled = true;
    try {
      const data = await request(`/api/land-ranking/record?act=${encodeURIComponent(current)}`);
      if (generation !== boardGeneration) return;
      if (!validBoard(data, current)) throw new Error('랭킹 응답을 확인하지 못했어요. 다시 불러와 주세요.');
      for (const entry of data.entries) {
        const row = element('li'); row.append(element('span', `${entry.rank}위`, 'land-ranking-rank'), element('strong', entry.initials), element('span', formatScore(current, entry.score), 'land-ranking-score')); board.append(row);
      }
      boardStatus.textContent = data.entries.length ? '현재 공개된 상위 기록이에요.' : '아직 공개된 기록이 없어요.';
    } catch (error) { if (generation === boardGeneration) boardStatus.textContent = error.message; }
    finally { if (generation === boardGeneration) refresh.disabled = false; }
  }
  async function verify() {
    if (!finishBody || verifying || verified) return;
    const generation = attemptGeneration;
    verifying = true; finishRetry.hidden = true; resultStatus.textContent = '서버에서 플레이 기록을 확인하고 있어요…';
    try {
      const data = await request('/api/land-ranking/finish', finishBody);
      if (generation !== attemptGeneration) return;
      if (!metaValid(data, act) || !scoreValid(act, data.result?.score) || !Number.isInteger(data.result?.activeMs) || data.result.activeMs < 0 || data.result.activeMs > 1800000) throw new Error('기록 확인 응답을 읽지 못했어요. 다시 시도해 주세요.');
      verified = true; resultStatus.textContent = `서버 확인 완료 · ${formatScore(act, data.result.score)}`;
      form.hidden = data.result.score === 0;
      if (data.result.score === 0) resultStatus.textContent += ' · 이번 점수는 공개 등록 대상이 아니에요.';
    } catch (error) {
      if (generation === attemptGeneration) { resultStatus.textContent = error.message; finishRetry.hidden = false; }
    } finally { if (generation === attemptGeneration) verifying = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!verified || submitting || published) return;
    if (!submitBody) {
      if (!/^[A-Z]{3}$/.test(initials.value) || !consent.checked) { submitStatus.textContent = '영문 대문자 세 글자와 공개 동의를 확인해 주세요.'; return; }
      submitBody = JSON.stringify({act, attemptId: JSON.parse(finishBody).attemptId, initials: initials.value, publicConsent: true, rankingConsent: VERSION});
    }
    const generation = attemptGeneration;
    submitting = true; submit.disabled = true; initials.disabled = true; consent.disabled = true;
    submitStatus.textContent = '공개 등록 결과를 확인하고 있어요…';
    try {
      const data = await request('/api/land-ranking/submit', submitBody);
      if (generation !== attemptGeneration) return;
      if (!metaValid(data, act) || data.accepted !== true || typeof data.ranked !== 'boolean') throw new Error('등록 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.');
      published = true; submit.textContent = '등록 확인 완료';
      submitStatus.textContent = data.ranked ? '공개 랭킹에 등록됐어요.' : '기록을 확인했어요. 현재 상위 10개에 들지 않아 공개 목록에는 남지 않아요.';
      if (dialog.open) void loadBoard();
    } catch (error) {
      if (generation !== attemptGeneration) return;
      // Only definite input rejection may unlock editing. Network uncertainty retains the exact request.
      if (['blocked_initials', 'invalid_initials'].includes(error.code)) { submitBody = null; initials.disabled = false; consent.disabled = false; }
      submitStatus.textContent = error.message; submit.textContent = '공개 등록 다시 시도';
    } finally { if (generation === attemptGeneration) { submitting = false; submit.disabled = published; } }
  });
  function fail(message) {
    lostEligibility = true; attemptGeneration++; finishBody = null; submitBody = null; verified = false; verifying = false; submitting = false;
    form.hidden = true; finishRetry.hidden = true;
    const text = typeof message === 'string' && message ? message : '이번 도전은 랭킹에 등록되지 않아요. 일반 플레이는 계속할 수 있어요.';
    notice.textContent = text; resultStatus.textContent = text;
  }
  return {
    async complete(payload) {
      if (!act || lostEligibility) return;
      if (!finishBody) {
        if (!payload || typeof payload.attemptId !== 'string' || !/^[a-f0-9]{48}$/.test(payload.attemptId) || payload.version !== VERSION || !Array.isArray(payload.events)) {
          fail('도전 기록을 확인하지 못했어요. 이번 플레이는 랭킹에 등록되지 않아요.'); return;
        }
        // Serialize once: later gameplay mutation cannot change a retry's transcript.
        finishBody = JSON.stringify({act, attemptId: payload.attemptId, version: payload.version, events: payload.events});
      }
      result.hidden = false; open(); content.scrollTop = 0; await verify();
    },
    fail,
  };
}
