import {EDGES,node,neighbors} from './keilah-map.js';

const GATE_NAME={west:'서쪽',east:'동쪽'};
const FAMILY_IDS=['w1','w2','e1','e2'];
const SIDE_FAMILIES={west:['w1','w2'],east:['e1','e2']};
const SIDE_NODES={west:new Set(['west','wgate','w1','w2']),east:new Set(['east','egate','e1','e2'])};

const countDelivered=state=>Object.values(state?.delivered||{}).filter(Boolean).length;
const allDelivered=state=>FAMILY_IDS.every(id=>state?.delivered?.[id]);
const allOpened=state=>state?.gates?.west&&state?.gates?.east;
const hasRoleCredits=state=>state?.players?.every(player=>player&&player.opened>0&&player.rescued>0);
const quoteMove=id=>`“이동 · ${node(id)?.name||id}” 버튼`;
const gateLabel=gate=>`${GATE_NAME[gate]||gate} 통로`;

function partnerStatus(player,state){
 if(!player)return '동료가 아직 방에 들어오지 않았어요.';
 if(!player.online)return '동료가 다시 연결하는 중이에요.';
 if(player.escaped)return '동료는 남문 밖에서 기다리고 있어요.';
 if(player.job?.kind==='rescue')return `동료는 ${node(player.node)?.name||'가족 위치'}에서 가족을 모으는 중이에요.`;
 if(player.job?.kind==='move')return `동료는 ${node(player.job.to)?.name||'다음 장소'} 쪽으로 이동 중이에요.`;
 if(player.holding)return `동료는 ${gateLabel(player.holding)}를 열어 두고 있어요.`;
 if(player.carrying)return `동료는 가족을 ${node(player.node)?.name||'현재 위치'}에서 남문으로 인솔 중이에요.`;
 if(state?.phase==='lobby')return player.ready?'동료는 준비를 마쳤어요.':'동료는 아직 준비 중이에요.';
 return `동료는 ${node(player.node)?.name||'지도 위'}에서 다음 이동을 고르는 중이에요.`;
}

function checklist(state,me){
 const rescued=countDelivered(state);
 return [
  {done:me.opened>0,text:'내가 손잡이를 잡아 동료의 통로를 끝까지 열어 주기'},
  {done:me.rescued>0,text:'내가 가족을 한 팀 이상 직접 인솔하기'},
  {done:rescued===4,text:`가족 네 팀 남문 도착 (${rescued}/4)`},
  {done:state.players?.every(player=>player?.escaped),text:'두 사람 모두 각자 탈출 누르기'},
 ];
}

function nextOnSafePath(from,to,state){
 if(from===to)return null;
 const queue=[[from,[]]],seen=new Set([from]);
 while(queue.length){
  const [current,path]=queue.shift();
  for(const next of neighbors(current)){
   if(seen.has(next))continue;
   const edge=EDGES.find(item=>(item[0]===current&&item[1]===next)||(item[1]===current&&item[0]===next));
   if(!edge||edge[4]||(edge[3]&&!state.gates?.[edge[3]]))continue;
   const route=[...path,next];
   if(next===to)return route[0];
   seen.add(next);queue.push([next,route]);
  }
 }
 return null;
}

function moveGuide(me,target,state,reason){
 const next=nextOnSafePath(me.node,target,state);
 if(next)return {title:`다음 이동: ${node(next).name}`,detail:`${quoteMove(next)}을 누르세요. ${reason}`};
 return {title:'현재 위치에서 열린 길을 확인하세요',detail:`${reason} 지도에서 선으로 바로 이어진 장소만 이동할 수 있어요.`};
}

const OPENING_PLAN={
 west:{handle:'east',approach:'west',beyond:'wgate'},
 east:{handle:'west',approach:'east',beyond:'egate'},
};

function chooseOpeningPlan(state){
 const locked=['west','east'].filter(gate=>!state.gates[gate]);
 if(locked.length===1){
  const gate=locked[0];
  const missing=state.players.find(player=>player&&player.opened===0);
  return {gate,opener:missing||state.players.find(player=>player?.holding===gate)||state.players[gate==='west'?1:0]};
 }
 const active=state.players.find(player=>player?.holding&&locked.includes(player.holding));
 if(active)return {gate:active.holding,opener:active};
 for(const gate of ['west','east']){
  const plan=OPENING_PLAN[gate],opener=state.players.find(player=>player?.node===plan.handle),traveler=state.players.find(player=>player?.node===plan.approach);
  if(opener&&traveler&&opener.slot!==traveler.slot)return {gate,opener};
 }
 for(const gate of ['west','east']){
  const opener=state.players.find(player=>player?.node===OPENING_PLAN[gate].handle);
  if(opener)return {gate,opener};
 }
 return {gate:'west',opener:state.players[1]||state.players[0]};
}

function openingGuide(state,me,other){
 if(me.holding&&other?.job?.kind==='move'&&other.job.gate===me.holding)return {title:'지금은 손잡이를 놓지 마세요',detail:`동료가 ${gateLabel(me.holding)}를 건너는 중이에요. 완전히 도착해야 내 역할도 인정돼요.`};
 const selected=chooseOpeningPlan(state),gate=selected.gate,plan=OPENING_PLAN[gate],opener=selected.opener,traveler=state.players.find(player=>player&&player.slot!==opener?.slot);
 if(!opener||!traveler)return {title:'동료와 통로 역할을 정해요',detail:'한 사람은 반대편 손잡이를 잡고, 다른 사람은 열린 통로를 완전히 건너야 해요.'};
 const amOpener=me.slot===opener.slot;
 if(amOpener){
  if(me.holding&&me.holding!==gate)return {title:'먼저 손잡이를 놓고 역할 바꾸기',detail:`“손잡이 놓기”를 누른 뒤 ${gateLabel(gate)}를 여는 ${node(plan.handle).name}에서 다시 손잡이를 잡으세요.`};
  if(me.node!==plan.handle)return moveGuide(me,plan.handle,state,`${node(plan.handle).name}에서 반대편인 ${gateLabel(gate)}를 열어 주세요.`);
  if(me.holding===gate)return {title:`동료가 ${gateLabel(gate)}를 건너길 기다리기`,detail:'손잡이를 잡은 채 기다리세요. 이동하면 손잡이가 자동으로 놓여요.'};
  return {title:`다음: ${gateLabel(gate)} 열기`,detail:`“${gateLabel(gate)} 열어 두기” 버튼을 누르세요. 동료가 완전히 건널 때까지 기다려야 내 통로 역할이 인정돼요.`};
 }
 if(me.holding)return {title:'손잡이를 놓고 통과 역할로 바꾸기',detail:`“손잡이 놓기”를 누르세요. 이번에는 통로 역할이 아직 없는 동료가 ${gateLabel(gate)}를 열어야 해요.`};
 const crossingFrom=me.node===plan.approach?plan.beyond:me.node===plan.beyond?plan.approach:null;
 if(crossingFrom){
  if(other?.holding===gate)return {title:`다음: ${gateLabel(gate)}를 끝까지 건너기`,detail:`${quoteMove(crossingFrom)}을 누르세요. 완전히 도착할 때까지 동료가 손잡이를 계속 잡아야 해요.`};
  return {title:`동료의 ${gateLabel(gate)} 열기를 기다리기`,detail:`동료가 ${node(plan.handle).name}에서 “${gateLabel(gate)} 열어 두기”를 누르면 건너세요.`};
 }
 const staging=nextOnSafePath(me.node,plan.approach,state)?plan.approach:plan.beyond;
 return moveGuide(me,staging,state,`${node(staging).name}에서 동료가 반대편 손잡이를 잡을 때까지 기다리세요.`);
}

function rescueSide(state,me){
 const owned={west:0,east:0};
 for(const id of FAMILY_IDS)if(state.families?.[id]===me.slot)owned[id.startsWith('w')?'west':'east']++;
 if(owned.west!==owned.east)return owned.west>owned.east?'west':'east';
 if(SIDE_NODES.west.has(me.node))return 'west';
 if(SIDE_NODES.east.has(me.node))return 'east';
 return me.slot===0?'west':'east';
}

function rescueTarget(state,me,other){
 const preferred=SIDE_FAMILIES[rescueSide(state,me)];
 const partnerTarget=other?.job?.kind==='rescue'?other.node:null;
 return [...preferred,...FAMILY_IDS.filter(id=>!preferred.includes(id))].find(id=>id!==partnerTarget&&state.families?.[id]===null&&!state.delivered?.[id])||null;
}

export function getHoldButtonLabel(player){
 if(player?.holding)return '손잡이 놓기';
 const gate=node(player?.node)?.holds;
 return gate?`${gateLabel(gate)} 열어 두기`:'통로 열어 두기';
}

export function getKeilahGuide(state,slot,{connected=true,pending=false}={}){
 const me=state?.players?.[slot],other=state?.players?.[1-slot];
 const base={title:'다음 행동을 확인해요',detail:'서버 상태를 기다리고 있어요.',partner:'동료 상태를 확인하고 있어요.',checklist:[]};
 if(!state||!me)return base;
 const result={...base,partner:partnerStatus(other,state),checklist:checklist(state,me)};
 if(state.phase==='complete')return {...result,title:'구출 성공',detail:'가족 네 팀과 두 사람이 모두 남문 밖으로 나왔어요.'};
 if(state.phase==='ended')return {...result,title:'이번 판이 끝났어요',detail:state.reason||'같은 방에서 재도전할 수 있어요.'};
 if(state.phase==='lobby')return {...result,title:me.ready?'동료의 준비를 기다려요':'준비되면 “준비하기”를 누르세요',detail:'실전에서는 기본 이동 6–15초, 가족 인솔 14초가 걸려요. 먼저 혼자 연습을 열어도 방 상태는 바뀌지 않아요.'};
 if(!connected)return {...result,title:'내 연결을 복구하는 중이에요',detail:'연결되기 전에는 버튼이 잠겨요. 이 탭을 그대로 두세요.'};
 if(pending)return {...result,title:'방금 누른 입력을 확인 중이에요',detail:'서버가 같은 입력을 확인할 때까지 버튼이 잠겨요.'};
 if(state.paused)return {...result,title:'동료의 연결을 기다려요',detail:'진행이 멈춘 상태예요. 동료가 돌아오면 이어서 움직일 수 있어요.'};
 if(me.job?.kind==='rescue')return {...result,title:'가족을 모으는 중이에요',detail:'실전 인솔 준비는 14초예요. 끝나면 가족과 함께 남문으로 돌아가세요.'};
 if(me.job?.kind==='move'){
  if(me.job.gate&&!state.gates[me.job.gate])return {...result,title:`${gateLabel(me.job.gate)}를 건너는 중이에요`,detail:'완전히 도착할 때까지 동료가 반대편 손잡이를 놓으면 안 돼요.'};
  return {...result,title:`${node(me.job.to)?.name||'다음 장소'} 쪽으로 이동 중이에요`,detail:'이동이 끝나면 다음 버튼이 열려요.'};
 }
 if(allOpened(state)&&state.players.some(player=>player&&player.opened===0))return {...result,title:'이번 판에서는 두 사람 탈출 조건을 채울 수 없어요',detail:'두 통로가 이미 같은 사람의 손잡이 역할로 영구 개방됐어요. 가족 구출 동작은 더 해 볼 수 있지만 탈출 완료는 불가능해요. 이번 판을 종료한 뒤 새 판에서 손잡이 역할을 바꿔 주세요.'};
 if(allDelivered(state)&&state.players.some(player=>player&&player.rescued===0))return {...result,title:'이번 판에서는 직접 인솔 조건을 채울 수 없어요',detail:'가족 네 팀이 이미 모두 남문에 도착했지만 한 사람이 가족을 직접 인솔하지 않았어요. 이번 판에서는 탈출할 수 없으므로 종료 뒤 새 판에서 두 사람 모두 한 팀 이상 인솔하세요.'};
 if(!allOpened(state)||state.players.some(player=>player&&player.opened===0))return {...result,...openingGuide(state,me,other)};
 if(me.holding)return {...result,title:`${gateLabel(me.holding)} 확보 완료`,detail:'이제 “손잡이 놓기”를 누르고 가족 구출을 시작하세요.'};
 if(me.escaped)return {...result,title:'내 탈출 완료',detail:other?.escaped?'완주 결과를 확인하고 있어요.':'동료도 남문에서 “내 탈출 완료하기”를 눌러야 끝나요.'};
 if(me.carrying){
  if(me.node==='exit')return {...result,title:'가족이 남문에 자동 도착했어요',detail:'별도 내려놓기 버튼은 없어요. 다음 가족에게 이동하세요.'};
  const guide=moveGuide(me,'exit',state,'남문에 도착하면 가족은 자동으로 안전 도착 처리돼요.');
  return {...result,...guide};
 }
 if(allDelivered(state)){
  if(!hasRoleCredits(state))return {...result,title:'각자의 역할 조건을 확인하세요',detail:'두 사람 모두 손잡이 역할 1회와 직접 인솔 1팀이 필요해요. 이번 판을 종료한 뒤 역할을 나누어 다시 도전하세요.'};
  if(me.node!=='exit')return {...result,...moveGuide(me,'exit',state,'가족 네 팀이 도착했어요. 두 사람 모두 남문으로 돌아갑니다.')};
  return {...result,title:'다음: 내 탈출 완료하기',detail:'“내 탈출 완료하기” 버튼을 누르세요. 동료도 각자 눌러야 완주예요.'};
 }
 const target=rescueTarget(state,me,other);
 if(target&&me.node===target)return {...result,title:`다음: ${node(target).family} 인솔 시작`,detail:'“가족 인솔 시작 · 14초” 버튼을 누르세요. 한 팀을 인솔 중일 때는 다른 가족을 데려갈 수 없어요.'};
 if(target){
  const guide=moveGuide(me,target,state,`최종 목적지는 ${node(target).name}예요. 그곳에서 ${node(target).family} 인솔을 시작하세요. 점선 지붕길보다 중간 가족 장소를 거치는 길이 처음에는 안전해요.`);
  return {...result,...guide};
 }
 if(other?.carrying||other?.job?.kind==='rescue'){
  const guide=me.node==='exit'?{title:'남문에서 동료를 기다려요',detail:'지도에 남은 ♟이 없다면 동료가 마지막 가족을 인솔 중이에요. 가족이 남문에 도착하면 다음 안내가 바뀝니다.'}:moveGuide(me,'exit',state,'남은 가족은 이미 동료가 인솔 중이에요. 남문 쪽으로 돌아와 자동 도착을 함께 확인하세요.');
  return {...result,...guide};
 }
 return {...result,title:'가족 이동 상태를 확인하세요',detail:`현재 남문 도착은 ${countDelivered(state)}/4예요. 가족 표시가 없는데 숫자가 남았다면 동료가 인솔 중이거나 서버 결과를 확인하는 중이에요.`};
}
