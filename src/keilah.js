import {NODES,EDGES,node,neighbors} from './keilah-map.js';
const $=id=>document.getElementById(id),key='keilah-session-v1';
const ERR={online_disabled:'그일라 온라인 연결이 아직 열리지 않았어요.',service_unavailable:'잠시 연결할 수 없어요. 자동으로 다시 확인해요.',consent_required:'기록 공개 동의를 확인해 주세요.',sequence_conflict:'이전 입력을 서버에서 확인하고 있어요.',request_expired:'이전 입장 요청이 만료됐어요. 다시 참가해 주세요.',room_not_found:'방이 없거나 만료됐어요. 새 방을 만들어 주세요.',room_full:'이미 두 명이 있는 방이에요.',already_started:'이미 출발한 방이에요.',not_a_member:'이 자리의 연결 정보가 만료됐어요.',partner_must_hold:'동료가 반대편 손잡이를 켜야 통로를 지나갈 수 있어요.',rescue_everyone_first:'가족 전원 구출과 두 사람의 역할 교대가 먼저예요.',escort_first:'지금 인솔 중인 가족을 남문까지 데려다 주세요.',not_playing:'동료 연결과 출발 상태를 확인해 주세요.',stale_run:'새 판의 상태로 갱신했어요.',sequence_gap:'서버 상태를 다시 확인해 주세요.',rate_limited:'요청이 많아요. 잠시 후 다시 시도해 주세요.',busy_moving:'이동 또는 구출이 끝나면 선택해 주세요.',server_error:'서버에 연결할 수 없어요.',origin_rejected:'같은 로컬 서버 주소에서 접속해 주세요.'};
let session=null,state=null,busy=false,connected=true,timer=null,stopped=false,leavingToMenu=false;
let settings={backend:'memory',requiresConsent:false,pollMs:350},configured=false;
const controllers=new Set();const transient=e=>!e.code||['service_unavailable','server_busy','rate_limited'].includes(e.code);
const uuid=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
try{session=JSON.parse(sessionStorage.getItem(key)||'null');}catch{sessionStorage.removeItem(key);}
const time=ms=>`${Math.floor(ms/60000)}:${(ms/1000%60).toFixed(1).padStart(4,'0')}`;
const setText=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
const notice=text=>setText('notice',text);
async function request(path,body,token=session?.token){
 const own=new AbortController();controllers.add(own);const timeout=setTimeout(()=>own.abort(),4500);
 try{const response=await fetch('/api/keilah'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:own.signal});const data=await response.json();if(!response.ok)throw Object.assign(Error(ERR[data.error]||'요청을 완료하지 못했어요.'),{code:data.error});return data;}
 finally{clearTimeout(timeout);controllers.delete(own);}
}
function store(){if(session)sessionStorage.setItem(key,JSON.stringify(session));else sessionStorage.removeItem(key);}
function accept(value){if(state&&value.code===state.code&&(value.revision??value.serverNow)<(state.revision??state.serverNow))return;if(!connected)notice('연결이 복구됐어요.');const previous=state?.phase;state=value;connected=true;render();if(value.phase!==previous&&value.phase==='playing'){$('position').focus({preventScroll:true});$('play').scrollIntoView({block:'start'});}if(value.phase!==previous&&value.phase==='complete')$('result').scrollIntoView({block:'start'});}
function lock(value){busy=value;$('create').disabled=value||!configured;$('join').disabled=value||!configured;render();}
async function enter(join){
 if(busy||!configured)return;lock(true);notice('방에 연결하고 있어요…');
 try{
  const code=$('code').value.trim().toUpperCase(),path=join?`/rooms/${code}/join`:'/rooms';
  let pending;try{pending=JSON.parse(sessionStorage.getItem('keilah-entry-v1'));}catch{}
  if(!pending||pending.path!==path)pending={path,requestId:uuid()};
  sessionStorage.setItem('keilah-entry-v1',JSON.stringify(pending));
  const value=await request(path,{requestId:pending.requestId},null);
  session={code:value.state.code,token:value.token};store();sessionStorage.removeItem('keilah-entry-v1');accept(value.state);notice('초대 코드를 동료에게 알려 주세요.');schedule();$('roomCode').scrollIntoView({block:'start'});
 }catch(e){if(!transient(e))sessionStorage.removeItem('keilah-entry-v1');notice(e.code?e.message:'연결을 확인한 뒤 다시 눌러 주세요. 같은 입장 요청으로 재시도해요.');}finally{lock(false);}
}
async function sendPending(){
 const value=await request(`/rooms/${session.code}/command`,session.pending);
 session.pending=null;store();
 if(value.left){session=null;state=null;store();clearTimeout(timer);render();notice('방에서 나왔어요.');if(leavingToMenu)location.href='./?menu=challenge';return;}
 accept(value);notice('');
}
async function command(action,to){
 if(busy||!session||!state||!connected||session.pending)return;lock(true);
 session.pending={seq:state.players[state.slot].seq+1,run:state.run,action,...(to?{to}:{}),...(action==='ready'&&settings.requiresConsent?{consent:$('consent').checked}:{})};store();
 try{await sendPending();}catch(e){notice(e.code?e.message:'입력 결과를 서버에서 확인하고 있어요.');if(!transient(e)&&session){session.pending=null;store();}if(['room_not_found','not_a_member'].includes(e.code)){session=null;state=null;store();}connected=false;}
 finally{lock(false);schedule();}
}
function schedule(){clearTimeout(timer);if(session&&configured&&!stopped)timer=setTimeout(poll,settings.backend==='postgres'?(state?.phase==='playing'?settings.pollMs:state?.phase==='lobby'?2500:5000):settings.pollMs);}
async function poll(){
 if(stopped||!session)return;if(busy){schedule();return;}
 try{
  const value=await request(`/rooms/${session.code}`);accept(value);
  if(session.pending){
   const p=value.players[value.slot];
   if(value.run!==session.pending.run||p.seq>=session.pending.seq){session.pending=null;store();render();}
   else{lock(true);try{await sendPending();}catch(e){if(!transient(e)&&session){session.pending=null;store();}throw e;}finally{lock(false);}}
  }
 }catch(e){connected=false;if(['room_not_found','not_a_member'].includes(e.code)){session=null;state=null;store();notice(e.message);}else notice('서버 연결을 확인 중이에요. 이 탭을 열어 두면 자동 복구해요.');render();}finally{schedule();}
}
function render(){
 document.body.dataset.phase=state?.phase||'entry';
 const leaveHost=state?.phase==='playing'?document.querySelector('header'):document.querySelector('.room-head');if($('leave').parentElement!==leaveHost)leaveHost.append($('leave'));
 $('entry').hidden=!!session;$('room').hidden=!session;if(!state||!session)return;
 const me=state.players[state.slot],other=state.players[1-state.slot];if(!me)return;
 $('roomCode').textContent=state.code;
 const members=state.players.map((p,i)=>`<div class="member"><strong>${i===state.slot?'● 나':'◆ 동료'} · ${i+1}번</strong>${!p?'입장 대기':!p.online?'연결 복구 중':state.phase==='lobby'?(p.ready?'준비 완료':'준비 중'):p.escaped?'탈출 완료':p.holding?'통로를 열고 있어요':p.job?.kind==='rescue'?'가족 인솔 중':p.job?'이동 중':'목적지 선택 중'}</div>`).join('');
 if($('members').innerHTML!==members)$('members').innerHTML=members;
 $('lobby').hidden=state.phase!=='lobby';$('play').hidden=state.phase==='lobby';$('result').hidden=!['complete','ended'].includes(state.phase);
 if(me.ready&&settings.requiresConsent)$('consent').checked=me.consent===true;
 $('consent').disabled=busy||!!session.pending||!!me.ready||state.phase!=='lobby';
 $('ready').textContent=me.ready?'준비 취소':'준비하기';$('ready').disabled=busy||!connected||!!session.pending||(settings.requiresConsent&&!me.ready&&!$('consent').checked);
 $('leave').disabled=busy;$('retry').disabled=busy||!connected;
 $('rescued').textContent=Object.values(state.delivered).filter(Boolean).length+' / 4';$('clock').textContent=time(state.elapsed);$('role').textContent=me.holding?'통로 확보':me.carrying?'가족 인솔':'이동 준비';
 const paused=state.paused||!connected||!!session.pending,playing=state.phase==='playing';
 setText('objective',!connected?'내 연결 복구 중 · 조작이 잠겨 있어요':state.paused?'동료를 기다려요 · 60초 안에 돌아오면 이어가요':state.phase==='complete'?'가족 네 팀과 두 동료가 모두 안전하게 성 밖으로 나왔어요.':state.phase==='ended'?state.reason:me.escaped?'남문에서 동료가 탈출하기를 기다려요.':Object.values(state.delivered).every(Boolean)?'전원 구출! 두 사람 모두 남문으로 돌아와 탈출을 눌러요.':me.carrying?'가족을 인솔 중이에요. 남문으로 데려다 준 뒤 다음 가족에게 가요.':me.holding?(state.gates[me.holding]?'통로 확보 완료! 손잡이를 놓고 구출하러 갈 수 있어요.':'동료가 처음 통과할 때까지 손잡이를 켜 두세요.'):me.job?.kind==='rescue'?'가족을 모으고 있어요. 잠시 기다려 주세요.':'지도와 아래 버튼으로 이웃 장소를 선택해요. 반대편 손잡이가 통로를 열어요.');
 $('position').textContent=`내 위치 · ${node(me.node).name} / ${me.carrying?'가족 인솔 중':'단독 이동'}`;
 const targets=neighbors(me.node),movesKey=targets.join(',');
 if($('moves').dataset.key!==movesKey){$('moves').dataset.key=movesKey;$('moves').replaceChildren(...targets.map(id=>{const b=document.createElement('button');b.dataset.to=id;b.textContent='→ '+node(id).name;b.onclick=()=>command('move',id);return b;}));}
 for(const b of $('moves').children)b.disabled=busy||paused||!playing||!!me.job||me.escaped;
 $('hold').hidden=!node(me.node).holds;$('hold').textContent=me.holding?'손잡이 놓기':'반대편 통로 열어 두기';$('hold').disabled=busy||paused||!playing||!!me.job;
 $('rescue').hidden=!node(me.node).family||state.families[me.node]!==null;$('rescue').disabled=busy||paused||!playing||!!me.job||!!me.carrying;
 $('escape').hidden=me.node!=='exit';$('escape').disabled=busy||paused||!playing||me.escaped||Object.values(state.delivered).some(x=>!x)||!state.players.every(p=>p&&p.rescued&&p.opened);
 $('activity').textContent=me.job?`${me.job.kind==='move'?'이동':'인솔'} 중 · ${Math.max(0,(me.job.end-state.serverNow)/1000).toFixed(1)}초`:state.eligible?'두 사람 모두 구출 1팀 이상 + 통로 확보 1회 이상':state.reason;
 if(state.phase==='complete'){$('resultTitle').textContent='모두 함께 구출 성공';$('resultText').textContent=`${time(state.elapsed)} · ${state.eligible?'두 사람의 완주 기록을 저장했어요.':'연결 또는 서버 중단으로 연습 완주예요.'} 역할을 바꾸고 다른 길로 다시 도전해 보세요.`;}
 else if(state.phase==='ended'){$('resultTitle').textContent='이번 구출전 종료';$('resultText').textContent=state.reason+' 새 판에서 다시 준비해 주세요.';}
 drawMap(me);
}
function drawMap(me){
 const open=gate=>state.gates[gate]||state.players.some(p=>p?.holding===gate&&p.online);
 const roads=EDGES.map(e=>{const a=node(e[0]),b=node(e[1]);return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="${e[3]?(open(e[3])?'#e9c06c':'#b57866'):'#82917b'}" stroke-width="${e[3]?9:6}" ${e[4]?'stroke-dasharray="7 7"':''}/>`;}).join('');
 const places=NODES.map(n=>`<g data-node="${n.id}"><circle cx="${n.x}" cy="${n.y}" r="25" fill="${n.holds?'#bd955a':'#193632'}" stroke="#a1b294" stroke-width="2"/><text x="${n.x}" y="${n.y+7}" text-anchor="middle" font-size="23" fill="#f4ecd2">${n.family?(state.families[n.id]===null?'♟':'✓'):n.holds?'⚙':n.id==='exit'?'⌂':'·'}</text><text x="${n.x}" y="${n.y+47}" text-anchor="middle" font-size="19" fill="#f2ead7">${n.name}</text></g>`).join('');
 const players=state.players.filter(Boolean).map(p=>{let a=node(p.node),x=a.x,y=a.y;if(p.job?.kind==='move'){const b=node(p.job.to),f=Math.max(0,Math.min(1,(state.serverNow-p.job.start)/(p.job.end-p.job.start)));x+=(b.x-x)*f;y+=(b.y-y)*f;}const mine=p.slot===state.slot;x+=p.slot===0?-15:15;y-=23;return `<g><circle cx="${x}" cy="${y}" r="15" fill="${mine?'#ffdc75':'#9ac7ff'}" stroke="#102a2b" stroke-width="3"/><text x="${x}" y="${y+6}" text-anchor="middle" fill="#102a2b" font-size="17" font-weight="bold">${p.slot+1}</text>${p.carrying?`<text x="${x}" y="${y-20}" text-anchor="middle" fill="#fff3c7" font-size="18">♟</text>`:''}</g>`;}).join('');
 $('map').innerHTML=`<defs><pattern id="field" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M0 30L30 0" stroke="#ffffff" stroke-opacity=".025"/></pattern></defs><rect width="600" height="630" fill="url(#field)"/><path d="M25 320V100Q300 -60 575 100V320" fill="none" stroke="#c1bc89" stroke-opacity=".16" stroke-width="24"/>${roads}${places}${players}`;
}
$('map').onclick=e=>{const id=e.target.closest('[data-node]')?.dataset.node;if(id&&state&&neighbors(state.players[state.slot].node).includes(id))command('move',id);};
$('create').onclick=()=>enter(false);$('joinForm').onsubmit=e=>{e.preventDefault();enter(true);};$('ready').onclick=()=>command('ready');$('hold').onclick=()=>command(state.players[state.slot].holding?'release':'hold');$('rescue').onclick=()=>command('rescue');$('escape').onclick=()=>command('escape');$('retry').onclick=()=>command('retry');
$('invite').onclick=async()=>{const url=new URL('./keilah.html',location.href);url.searchParams.set('room',session.code);try{await navigator.clipboard.writeText(url.href);notice('초대 링크를 복사했어요.');}catch{notice('초대 코드 '+session.code+' · 같은 서버 주소에서 입력해 주세요.');}};
function askLeave(menu=false){leavingToMenu=menu;$('confirm').showModal();$('cancelLeave').focus();}
$('leave').onclick=()=>askLeave();$('cancelLeave').onclick=()=>$('confirm').close();$('confirmLeave').onclick=()=>{$('confirm').close();if(!connected){session=null;state=null;store();clearTimeout(timer);render();notice('이 기기에서 나왔어요. 서버의 판은 연결 복구 제한 후 종료돼요.');if(leavingToMenu)location.href='./?menu=challenge';}else command('leave');};$('back').onclick=e=>{if(session){e.preventDefault();askLeave(true);}else sessionStorage.removeItem('keilah-entry-v1');};
$('ranking').onclick=async()=>{if(busy)return;lock(true);try{const data=await request('/ranking',undefined,null);$('rankingList').replaceChildren(...data.entries.map((r,i)=>{const li=document.createElement('li');li.textContent=`${i+1}위 · 팀 ${r.team} · ${time(r.timeMs)}`;return li;}));$('rankingStatus').textContent=data.entries.length?'서버가 판정한 완주 기록이에요.':'아직 완주 기록이 없어요. 첫 팀에 도전해 보세요.';}catch{ $('rankingStatus').textContent='기록 서버를 확인해 주세요.';}finally{lock(false);}};
$('consent').onchange=render;
const invited=new URLSearchParams(location.search).get('room');if(/^[A-Fa-f0-9]{8}$/.test(invited||''))$('code').value=invited.toUpperCase();
window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);for(const c of controllers)c.abort();});window.addEventListener('pageshow',()=>{stopped=false;schedule();});
lock(false);
(async()=>{
 try{
  sessionStorage.setItem('keilah-storage-check','1');sessionStorage.removeItem('keilah-storage-check');
  settings=await request('/config',undefined,null);configured=true;
  $('connectionLabel').textContent=settings.localDatabase?'로컬 DB 검증':settings.backend==='postgres'?'2인 협동 · 온라인':'로컬 메모리 연습';
  $('consentLabel').hidden=!settings.requiresConsent;
  if(settings.localDatabase)notice('운영 DB에 연결하지 않은 로컬 검증 화면이에요.');
  if(session){notice('이전 자리를 복구하고 있어요…');poll();}
  else{let pending;try{pending=JSON.parse(sessionStorage.getItem('keilah-entry-v1'));}catch{}if(pending?.path==='/rooms')await enter(false);else if(/^\/rooms\/[A-F0-9]{8}\/join$/.test(pending?.path||'')){$('code').value=pending.path.split('/')[2];await enter(true);}}
  lock(false);
 }catch(e){notice(e.code?e.message:'연결 또는 브라우저 저장 공간을 사용할 수 없어요.');lock(false);}
})();
