/**
 * Solo tutorial: one fixed role (나 = yellow circle) takes every personal action.
 * 친구 (blue diamond) is an explicitly disclosed scripted stand-in, never a second
 * set of controls the learner presses. No fetch/websocket/storage/timeouts: pure,
 * synchronous, independently testable state.
 *
 * Map vocabulary: friendly 왼쪽/오른쪽 labels are used throughout for the
 * teaching copy. The one formal-name mapping lives once in keilah.html's
 * persistent tutorial note (왼쪽=서쪽, 오른쪽=동쪽), matching the live game's
 * node names in src/keilah-map.js. Internal gate keys stay 'west'/'east' to
 * match that same source of truth; only display text changed here.
 */

const BASE_VIEW = {
 positions: ['exit', 'exit'],
 gates: [],
 holding: null,
 opened: [0, 0],
 rescued: [0, 0],
 rescuedNodes: [],
 carrying: [false, false],
 delivered: 0,
 escaped: [false, false],
 complete: false,
};

// Each entry is the single personal action "나" takes next (or ONE explicitly
// labeled recap of the already-taught rescue pattern, covering both remaining
// families at once). `result` describes the outcome of *this* step once taken;
// it is shown as the "last action result" on the step that follows. Friend
// moves are bundled into the same step only when explicitly narrated as
// scripted/automatic — never implied as something the learner pressed, and
// never phrased as if a button "opens" something it only crosses.
export const TUTORIAL_STEPS = [
 {
  phase: '길 열기', title: '광장으로 가볼까요',
  instruction: '아래 버튼을 한 번 누르면 내가 광장으로 이동해요.',
  action: '광장으로 이동',
  result: '내가 광장에 도착했어요. 친구는 아직 남문 밖에 있어요.',
  positions: ['square', 'exit'],
 },
 {
  phase: '길 열기', title: '왼쪽 손잡이로 가요',
  instruction: '왼쪽 손잡이로 이동해요. 친구가 자동으로 오른쪽 손잡이로 가요.',
  action: '왼쪽 손잡이로 이동',
  result: '왼쪽에 도착했어요. 친구가 오른쪽에서 내 길을 열어줬어요.',
  positions: ['west', 'east'], holding: 'west',
 },
 {
  phase: '길 열기', title: '친구가 내 길을 열어줬어요',
  instruction: '친구가 기다리는 동안 열린 왼쪽 길을 끝까지 건너요.',
  action: '왼쪽 길 건너기',
  result: '왼쪽 길을 끝까지 건넜어요. 친구가 열어 준 길이 이제 계속 열려 있어요.',
  positions: ['wgate', 'east'], gates: ['west'], holding: null, opened: [0, 1],
 },
 {
  phase: '길 열기', title: '이제 친구 차례예요',
  instruction: '친구의 길도 열어주려면 왼쪽 손잡이로 돌아가야 해요.',
  action: '왼쪽 손잡이로 돌아가기',
  result: '왼쪽 손잡이로 돌아왔어요. 친구는 오른쪽에서 기다리고 있어요.',
  positions: ['west', 'east'], gates: ['west'], holding: null, opened: [0, 1],
 },
 {
  phase: '길 열기', title: '친구의 길을 열어줘요',
  instruction: '한 번 누른 뒤, 친구가 다 건널 때까지 여기서 기다려요. 계속 누르고 있을 필요는 없어요.',
  action: '오른쪽 길 열어주기',
  result: '내가 오른쪽 길을 열어 준 동안 친구가 끝까지 건넜어요. 이제 둘 다 서로의 길을 한 번씩 열어 줬어요.',
  positions: ['west', 'egate'], gates: ['west', 'east'], holding: null, opened: [1, 1],
 },
 {
  phase: '가족 데려오기', title: '왼쪽 길로 다시 가요',
  instruction: '왼쪽 길 건너기 버튼을 눌러요. 이미 열려 있어서 바로 건너요.',
  action: '왼쪽 길 건너기',
  result: '왼쪽 길을 지나왔어요.',
  positions: ['wgate', 'egate'],
 },
 {
  phase: '가족 데려오기', title: '우리 가족에게 가요',
  instruction: '곡식 마당으로 이동 버튼을 눌러요.',
  action: '곡식 마당으로 이동',
  result: '곡식 마당에 도착했어요.',
  positions: ['w1', 'egate'],
 },
 {
  phase: '가족 데려오기', title: '가족을 데려가요',
  instruction: '가족 인솔 시작 버튼을 눌러요. 인솔 중에는 다른 가족을 데려갈 수 없어요.',
  action: '가족 인솔 시작',
  result: '가족을 데리고 이동할 준비가 됐어요. 한 번에 한 팀만 데려갈 수 있어요.',
  positions: ['w1', 'egate'], carrying: [true, false], rescued: [1, 0], rescuedNodes: ['w1'],
 },
 {
  phase: '가족 데려오기', title: '가족과 함께 왼쪽 길로',
  instruction: '왼쪽 길로 이동 버튼을 눌러 가족과 함께 이동해요.',
  action: '왼쪽 길로 이동',
  result: '가족과 함께 왼쪽 길을 지났어요.',
  positions: ['wgate', 'egate'], carrying: [true, false], rescued: [1, 0], rescuedNodes: ['w1'],
 },
 {
  phase: '가족 데려오기', title: '왼쪽 손잡이로',
  instruction: '왼쪽 손잡이로 이동 버튼을 눌러요.',
  action: '왼쪽 손잡이로 이동',
  result: '왼쪽 손잡이에 도착했어요. 가족은 계속 데리고 있어요.',
  positions: ['west', 'egate'], carrying: [true, false],
 },
 {
  phase: '가족 데려오기', title: '광장으로',
  instruction: '광장으로 이동 버튼을 눌러요.',
  action: '광장으로 이동',
  result: '광장에 도착했어요.',
  positions: ['square', 'egate'], carrying: [true, false],
 },
 {
  phase: '가족 데려오기', title: '가족과 남문으로 돌아가요',
  instruction: '남문에 도착하면 가족이 자동으로 내려요. 따로 내려놓기 버튼을 누르지 않아도 돼요.',
  action: '남문으로 이동',
  result: '내가 데려온 가족이 남문에 도착했어요. 친구도 오른쪽 가족 한 팀을 데려왔어요.',
  positions: ['exit', 'exit'], carrying: [false, false], rescued: [1, 1], rescuedNodes: ['w1', 'e1'], delivered: 2,
 },
 {
  phase: '가족 데려오기', recap: true,
  title: '남은 두 가족 · 반복 구간 요약',
  instruction: '남은 두 가족도 같은 방법으로 데려오면 돼요. 연습에서는 이 반복 구간을 건너뜁니다.',
  action: '반복 구간 건너뛰기',
  result: '남은 두 가족도 같은 방법으로 남문에 도착해서 가족 네 팀이 모두 도착했어요.',
  positions: ['exit', 'exit'], carrying: [false, false], rescued: [2, 2], rescuedNodes: ['w1', 'e1', 'w2', 'e2'], delivered: 4,
 },
 {
  phase: '함께 탈출', title: '함께 탈출해요',
  instruction: '실전에서는 두 사람 모두 각자 탈출을 눌러요. 여기서는 내 버튼만 눌러보세요.',
  action: '내 탈출 완료하기',
  result: '내 탈출을 마쳤어요. 연습 속 친구도 자동으로 탈출했어요. 가족 네 팀과 두 사람이 모두 안전해요.',
  positions: ['exit', 'exit'], escaped: [true, true], complete: true,
 },
];

const POS = {exit:[150,260],square:[150,210],west:[80,160],east:[220,160],wgate:[35,105],egate:[265,105],w1:[65,50],w2:[105,24],e1:[235,50],e2:[195,24]};
const LABEL = {exit:'남문',square:'광장',west:'왼쪽 손잡이',east:'오른쪽 손잡이',wgate:'왼쪽 길',egate:'오른쪽 길',w1:'곡식 마당',w2:'왼쪽 지붕',e1:'우물가',e2:'오른쪽 지붕'};
const LINES = [['exit','square'],['square','west'],['square','east'],['west','east'],['west','wgate','west'],['east','egate','east'],['wgate','w1'],['w1','w2'],['egate','e1'],['e1','e2']];
const FAMILY_NODES = ['w1','w2','e1','e2'];

// Deep, independent snapshot of state after `completedSteps` steps have been
// taken. Never mutates TUTORIAL_STEPS or any shared object; safe to call out of
// order or repeatedly from tests.
export function tutorialViewAt(completedSteps) {
 const merged = {
  ...BASE_VIEW,
  positions: [...BASE_VIEW.positions],
  gates: [...BASE_VIEW.gates],
  opened: [...BASE_VIEW.opened],
  rescued: [...BASE_VIEW.rescued],
  rescuedNodes: [...BASE_VIEW.rescuedNodes],
  carrying: [...BASE_VIEW.carrying],
  escaped: [...BASE_VIEW.escaped],
 };
 const bound = Math.max(0, Math.min(completedSteps, TUTORIAL_STEPS.length));
 for (let i = 0; i < bound; i++) {
  const step = TUTORIAL_STEPS[i];
  if (step.positions) merged.positions = [...step.positions];
  if (step.gates) merged.gates = [...step.gates];
  if ('holding' in step) merged.holding = step.holding;
  if (step.opened) merged.opened = [...step.opened];
  if (step.rescued) merged.rescued = [...step.rescued];
  if (step.rescuedNodes) merged.rescuedNodes = [...step.rescuedNodes];
  if (step.carrying) merged.carrying = [...step.carrying];
  if ('delivered' in step) merged.delivered = step.delivered;
  if (step.escaped) merged.escaped = [...step.escaped];
  if ('complete' in step) merged.complete = step.complete;
 }
 return merged;
}

function mapMarkup(view, phase, targetId) {
 const roads = LINES.map(([a, b, gate]) => {
  const [x1, y1] = POS[a], [x2, y2] = POS[b];
  const open = !gate || view.gates.includes(gate) || view.holding === gate;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${gate ? (open ? 'tutorial-road open' : 'tutorial-road locked') : 'tutorial-road'}"/>`;
 }).join('');
 const symbol = id => {
  if (id === 'exit') return '⌂';
  if (id === 'square' || id.includes('gate')) return '·';
  if (id === 'west' || id === 'east') return '⚙';
  return view.rescuedNodes.includes(id) ? '·' : '♟';
 };
 const nodes = Object.entries(POS).map(([id, [x, y]]) => {
  const future = FAMILY_NODES.includes(id) && phase === '길 열기' && !view.rescuedNodes.includes(id) && !view.positions.includes(id);
  const handleClass = id === 'west' || id === 'east' ? ' handle' : '';
  const futureClass = future ? ' future' : '';
  const ring = id === targetId ? `<circle cx="${x}" cy="${y}" r="${(id.includes('gate') ? 10 : 13) + 5}" class="tutorial-target-ring"/>` : '';
  return `<g>${ring}<circle cx="${x}" cy="${y}" r="${id.includes('gate') ? 10 : 13}" class="tutorial-node${handleClass}${futureClass}"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="tutorial-symbol${futureClass}">${symbol(id)}</text><text x="${x}" y="${y + 24}" text-anchor="middle" class="tutorial-label">${LABEL[id]}</text></g>`;
 }).join('');
 const players = view.positions.map((id, index) => {
  const [x, y] = POS[id], px = x + (index ? -8 : 8), py = y - 13, carrying = view.carrying[index];
  const shape = index
   ? `<polygon points="${px},${py - 9} ${px + 9},${py} ${px},${py + 9} ${px - 9},${py}" class="tutorial-player p2"/>`
   : `<circle cx="${px}" cy="${py}" r="8" class="tutorial-player p1"/>`;
  const label = index ? '친구' : '나';
  return `<g role="img" aria-label="${label}"><title>${label}</title>${shape}<text x="${px}" y="${py + 3}" text-anchor="middle" class="tutorial-player-label">${label[0]}</text>${carrying ? `<text x="${px}" y="${py - 13}" text-anchor="middle" class="tutorial-carry">♟</text>` : ''}</g>`;
 }).join('');
 return `<svg viewBox="0 0 300 290" role="img" aria-label="그일라 연습 지도">${roads}${nodes}${players}</svg>`;
}

export function mountKeilahTutorial({dialog, root, triggers = [], closeButton, resetButton}) {
 let step = 0, opener = null;
 const render = () => {
  const finished = step === TUTORIAL_STEPS.length;
  const item = finished ? null : TUTORIAL_STEPS[step];
  const view = tutorialViewAt(step);
  const phase = finished ? '함께 탈출' : item.phase;
  const title = finished ? '연습 완료' : item.title;
  const instruction = finished ? '이제 실제 방에서 같은 순서로 협력해 보세요. 이 연습은 방 상태나 기록을 바꾸지 않았어요.' : item.instruction;
  const previousResult = step === 0 ? '지금 나는 남문에 있어요.' : TUTORIAL_STEPS[step - 1].result;
  const recapBadge = !finished && item.recap ? ' <span class="tutorial-recap-badge">복습</span>' : '';
  const actionLabel = finished ? '연습 닫기' : item.action;
  // Ring the map node my next press will move me to; never shown for a recap
  // summary (no single real move) or the finished screen.
  const targetId = (!finished && !item.recap && item.positions && item.positions[0] !== view.positions[0]) ? item.positions[0] : null;
  const status = phase === '길 열기' ? '' : `<p class="tutorial-status">남문에 도착한 가족 ${view.delivered}/4팀${view.delivered === 4 ? ` · 탈출 ${view.escaped.filter(Boolean).length}/2명` : ''}</p>`;
  root.innerHTML = `<div class="tutorial-progress" aria-label="연습 진행 ${step}/${TUTORIAL_STEPS.length}"><span style="width:${(step / TUTORIAL_STEPS.length) * 100}%"></span></div><h3 tabindex="-1"><span class="tutorial-phase-tag">${phase}</span> ${title}${recapBadge}</h3><p class="tutorial-result" role="status">${previousResult}</p><p class="tutorial-instruction">${instruction}</p><div class="tutorial-map">${mapMarkup(view, phase, targetId)}<div class="tutorial-legend"><span>● 나</span><span>◆ 친구</span><span>♟ 가족</span></div></div>${status}<button type="button" class="primary tutorial-next">${actionLabel}</button>`;
  const next = root.querySelector('.tutorial-next');
  next.onclick = () => {
   if (finished) { dialog.close(); return; }
   step++;
   render();
   root.querySelector('h3').focus();
  };
 };
 const open = event => { opener = event.currentTarget; step = 0; render(); dialog.showModal(); closeButton.focus(); };
 for (const trigger of triggers) trigger?.addEventListener('click', open);
 closeButton.addEventListener('click', () => dialog.close());
 resetButton.addEventListener('click', () => { step = 0; render(); root.querySelector('h3').focus(); });
 dialog.addEventListener('close', () => opener?.focus());
 dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
 render();
 return {reset() { step = 0; render(); }, open};
}
