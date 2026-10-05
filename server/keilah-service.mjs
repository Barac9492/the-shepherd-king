import {randomBytes,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {MAP_VERSION,NODES,node,edge,RESCUE_MS} from '../src/keilah-map.js';
export class KeilahError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new KeilahError(code,status);};
const digest=s=>createHash('sha256').update(s).digest('hex');
const freshPlayer=(slot,token,now)=>({slot,secret:digest(token),lastSeen:now,seq:0,ready:false,node:'exit',job:null,holding:null,rescued:0,opened:0,carrying:null,escaped:false});
export function createKeilahService({now=()=>performance.now(),maxRooms=100}={}){
 const rooms=new Map(),records=[],receipts=new Map();
 let previousTick=now();
 const online=(p,t)=>p&&t-p.lastSeen<=8000;
 function reset(r){r.run++;r.phase='lobby';r.started=null;r.ended=null;r.eligible=true;r.reason='';r.gates={west:false,east:false};r.delivered={w1:false,w2:false,e1:false,e2:false};r.families=Object.fromEntries(NODES.filter(n=>n.family).map(n=>[n.id,null]));for(const p of r.players.filter(Boolean))Object.assign(p,{ready:false,node:'exit',job:null,holding:null,rescued:0,opened:0,carrying:null,escaped:false});}
 function view(r,slot){const t=now();return {code:r.code,map:MAP_VERSION,run:r.run,phase:r.phase,slot,serverNow:t,elapsed:r.started===null?0:(r.ended??t)-r.started,eligible:r.eligible,reason:r.reason,paused:r.phase==='playing'&&!r.players.every(p=>online(p,t)),families:{...r.families},delivered:{...r.delivered},gates:{...r.gates},players:r.players.map(p=>p?{slot:p.slot,seq:p.seq,ready:p.ready,node:p.node,job:p.job?{...p.job}:null,holding:p.holding,rescued:p.rescued,opened:p.opened,carrying:p.carrying,escaped:p.escaped,online:online(p,t)}:null)};}
 function held(r,gate,traveler){return r.players.some(p=>p&&p.slot!==traveler&&p.holding===gate&&online(p,now()));}
 function tick(){const t=now(),gap=t-previousTick;previousTick=t;
  for(const [id,r] of rooms){
   if(t-r.touched>30*60*1000){rooms.delete(id);continue;}
   if(r.phase!=='playing')continue;
   if(gap>2000){r.eligible=false;r.reason='서버 처리 지연: 연습 완주만 가능';}
   if(t-r.started>10*60*1000){r.phase='ended';r.ended=t;r.reason='10분 제한 종료';continue;}
   if(!r.players.every(p=>online(p,t))){
    r.eligible=false;r.reason='연결 중단: 다시 연결해 연습을 이어 갈 수 있어요';
    for(const p of r.players.filter(Boolean)){if(p.job){p.job.start+=gap;p.job.end+=gap;}p.holding=null;}
    if(r.players.some(p=>!p||t-p.lastSeen>60000)){r.phase='ended';r.ended=t;r.reason='연결 복구 시간 60초 초과';}
    continue;
   }
   for(const p of r.players){
    const j=p.job;if(!j)continue;
    if(j.gate&&!r.gates[j.gate]&&!held(r,j.gate,p.slot)){p.job=null;r.message='손잡이가 풀려 통로 입구로 돌아왔어요';continue;}
    if(t>=j.end){if(j.kind==='move'){p.node=j.to;if(j.gate&&!r.gates[j.gate]){const holder=r.players.find(q=>q.holding===j.gate);holder.opened++;r.gates[j.gate]=true;}if(p.node==='exit'&&p.carrying){r.delivered[p.carrying]=true;p.carrying=null;}}else if(j.kind==='rescue'&&r.families[p.node]===null){r.families[p.node]=p.slot;p.rescued++;p.carrying=p.node;}p.job=null;}
   }
   if(r.players.every(p=>p.escaped)&&Object.values(r.delivered).every(Boolean)&&r.players.every(p=>p.rescued>0&&p.opened>0)){
    r.phase='complete';r.ended=t;
    if(r.eligible){records.push({team:r.code,timeMs:Math.ceil((t-r.started)/100)*100,map:MAP_VERSION,run:r.run});records.sort((a,b)=>a.timeMs-b.timeMs);records.splice(10);}
   }
  }
  for(const [id,v] of receipts)if(t-v.at>120000)receipts.delete(id);
 }
 function auth(code,token){tick();const r=rooms.get(code);if(!r)fail('room_not_found',404);const p=r.players.find(p=>p&&p.secret===digest(String(token)));if(!p)fail('not_a_member',403);r.touched=now();return {r,p};}
 function receipt(id,payload,fn){if(!/^[a-f0-9-]{36}$/.test(id||''))fail('invalid_request_id');const sig=JSON.stringify(payload);const old=receipts.get(id);if(old){if(old.sig!==sig)fail('request_id_conflict',409);return old.value;}if(receipts.size>=500)fail('busy',429);const value=fn();receipts.set(id,{sig,value,at:now()});return value;}
 return {
 tick,
 create(requestId){tick();return receipt(requestId,['create'],()=>{if(rooms.size>=maxRooms)fail('rooms_full',429);let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));const token=randomBytes(32).toString('hex'),r={code,run:0,players:[freshPlayer(0,token,now()),null],touched:now()};reset(r);rooms.set(code,r);return {token,state:view(r,0)};});},
 join(code,requestId){tick();return receipt(requestId,['join',code],()=>{const r=rooms.get(code);if(!r)fail('room_not_found',404);if(r.phase!=='lobby')fail('already_started',409);const slot=r.players.findIndex(x=>!x);if(slot<0)fail('room_full',409);const token=randomBytes(32).toString('hex');r.players[slot]=freshPlayer(slot,token,now());r.touched=now();return {token,state:view(r,slot)};});},
 read(code,token){const {r,p}=auth(code,token);p.lastSeen=now();return view(r,p.slot);},
 command(code,token,input){const {r,p}=auth(code,token);p.lastSeen=now();if(!Number.isSafeInteger(input.seq)||input.seq<1||!Number.isSafeInteger(input.run))fail('invalid_sequence');if(input.run!==r.run)fail('stale_run',409);if(input.seq<=p.seq)return view(r,p.slot);if(input.seq!==p.seq+1)fail('sequence_gap',409);
  const action=input.action;if(!['ready','move','hold','release','rescue','escape','retry','leave'].includes(action))fail('unknown_action');
  if(action==='leave'){p.seq=input.seq;r.players[p.slot]=null;if(r.phase!=='lobby'){r.phase='ended';r.ended=now();r.eligible=false;r.reason='동료가 방에서 나갔어요';}else for(const q of r.players.filter(Boolean))q.ready=false;return {left:true};}
  if(action==='retry'){if(!['complete','ended'].includes(r.phase))fail('not_finished',409);p.seq=input.seq;reset(r);return view(r,p.slot);}
  if(action==='ready'){
   if(r.phase!=='lobby')fail('not_in_lobby',409);p.ready=!p.ready;
   if(r.players.every(q=>q&&q.ready&&online(q,now()))){r.phase='playing';r.started=now();r.reason='';}
  }else{
   if(r.phase!=='playing'||!r.players.every(q=>online(q,now())))fail('not_playing',409);
   if(p.escaped)fail('already_escaped',409);
   if(action==='release'){p.holding=null;}
   else{
    if(p.job)fail('busy_moving',409);
    if(action==='move'){
     const e=edge(p.node,input.to);if(!e)fail('not_adjacent');if(e[3]&&!r.gates[e[3]]&&!held(r,e[3],p.slot))fail('partner_must_hold',409);
     p.holding=null;let duration=e[2];if(e[4]){const phase=(now()-r.started)%24000;if(phase<10000)duration+=10000-phase;}
     p.job={kind:'move',from:p.node,to:input.to,start:now(),end:now()+duration,gate:e[3]||null};
    }else if(action==='hold'){const n=node(p.node);if(!n.holds)fail('not_a_switch');p.holding=n.holds;}
    else if(action==='rescue'){if(p.carrying)fail('escort_first',409);if(!node(p.node).family||r.families[p.node]!==null)fail('no_family');p.holding=null;p.job={kind:'rescue',start:now(),end:now()+RESCUE_MS};}
    else if(action==='escape'){if(p.node!=='exit'||Object.values(r.delivered).some(x=>!x)||!r.players.every(q=>q.rescued>0&&q.opened>0))fail('rescue_everyone_first',409);p.escaped=true;}
   }
  }
  p.seq=input.seq;tick();return view(r,p.slot);
 },
 ranking(){tick();return {map:MAP_VERSION,scope:'local-server',entries:records.map(x=>({...x}))};},
 stats(){return {rooms:rooms.size,receipts:receipts.size};}
 };
}
