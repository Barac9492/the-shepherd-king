import test from 'node:test';
import assert from 'node:assert/strict';
import {getHoldButtonLabel,getKeilahGuide} from '../src/keilah-guide.js';

function player(slot,overrides={}){
 return {slot,seq:0,ready:true,node:'exit',job:null,holding:null,rescued:0,opened:0,carrying:null,escaped:false,online:true,...overrides};
}
function state(overrides={}){
 return {phase:'playing',slot:0,paused:false,reason:'',gates:{west:false,east:false},families:{w1:null,w2:null,e1:null,e2:null},delivered:{w1:false,w2:false,e1:false,e2:false},players:[player(0),player(1)],...overrides};
}

test('opposite handle labels name the actual opened side and preserve release wording',()=>{
 assert.equal(getHoldButtonLabel(player(0,{node:'west'})),'동쪽 통로 열어 두기');
 assert.equal(getHoldButtonLabel(player(1,{node:'east'})),'서쪽 통로 열어 두기');
 assert.equal(getHoldButtonLabel(player(0,{node:'west',holding:'east'})),'손잡이 놓기');
});

test('crossing and holding states take priority and require a fully finished crossing',()=>{
 const crossing=state({players:[
  player(0,{node:'west',job:{kind:'move',from:'west',to:'wgate',gate:'west',start:0,end:10000}}),
  player(1,{node:'east',holding:'west'}),
 ]});
 const traveler=getKeilahGuide(crossing,0);
 const holder=getKeilahGuide(crossing,1);
 assert.match(traveler.title,/서쪽 통로를 건너는 중/);
 assert.match(traveler.detail,/완전히 도착/);
 assert.match(holder.title,/놓지 마세요/);
 assert.match(holder.detail,/완전히 도착/);
});

test('after the first gate opens the player without credit becomes the next opener',()=>{
 const exchanged=state({gates:{west:true,east:false},players:[
  player(0,{node:'wgate',opened:0}),
  player(1,{node:'east',holding:'west',opened:1}),
 ]});
 assert.match(getKeilahGuide(exchanged,0).title,/서쪽 손잡이/);
 const previousHolder=getKeilahGuide(exchanged,1);
 assert.match(previousHolder.title,/손잡이를 놓고 통과 역할/);
 assert.match(previousHolder.detail,/통로 역할이 아직 없는 동료/);
});

test('both locked gates honor mirrored west-first and east-first holds',()=>{
 const westFirst=state({players:[
  player(0,{node:'east',holding:'west'}),
  player(1,{node:'west'}),
 ]});
 assert.match(getKeilahGuide(westFirst,0).title,/서쪽 통로를 건너길 기다리기/);
 assert.match(getKeilahGuide(westFirst,1).title,/서쪽 통로를 끝까지 건너기/);
 const eastFirst=state({players:[
  player(0,{node:'east'}),
  player(1,{node:'west',holding:'east'}),
 ]});
 assert.match(getKeilahGuide(eastFirst,1).title,/동쪽 통로를 건너길 기다리기/);
 assert.match(getKeilahGuide(eastFirst,0).title,/동쪽 통로를 끝까지 건너기/);
});

test('with one gate left the missing-credit player opens it in either orientation',()=>{
 const eastRemaining=state({gates:{west:true,east:false},players:[
  player(0,{node:'east',opened:1}),
  player(1,{node:'west',holding:'east',opened:0}),
 ]});
 assert.match(getKeilahGuide(eastRemaining,1).title,/동쪽 통로를 건너길 기다리기/);
 assert.match(getKeilahGuide(eastRemaining,0).title,/동쪽 통로를 끝까지 건너기/);
 const westRemaining=state({gates:{west:false,east:true},players:[
  player(0,{node:'east',holding:'west',opened:0}),
  player(1,{node:'west',opened:1}),
 ]});
 assert.match(getKeilahGuide(westRemaining,0).title,/서쪽 통로를 건너길 기다리기/);
 assert.match(getKeilahGuide(westRemaining,1).title,/서쪽 통로를 끝까지 건너기/);
});

test('an actual crossing job always tells its holder to keep holding',()=>{
 const crossing=state({gates:{west:true,east:false},players:[
  player(0,{node:'west',holding:'east',opened:1}),
  player(1,{node:'east',opened:0,job:{kind:'move',from:'east',to:'egate',gate:'east',start:0,end:10000}}),
 ]});
 const holder=getKeilahGuide(crossing,0);
 assert.match(holder.title,/놓지 마세요/);
 assert.match(holder.detail,/완전히 도착/);
});

test('mirrored play keeps the player on the nearby east rescue side after both gates open',()=>{
 const mirrored=state({gates:{west:true,east:true},players:[
  player(0,{node:'egate',opened:1}),
  player(1,{node:'wgate',opened:1}),
 ]});
 const guide=getKeilahGuide(mirrored,0);
 assert.match(guide.title,/우물가/);
 assert.match(guide.detail,/최종 목적지는 우물가/);
 assert.doesNotMatch(guide.detail,/곡식 마당/);
});

test('an established east rescue history persists from the neutral south gate',()=>{
 const established=state({gates:{west:true,east:true},families:{w1:null,w2:null,e1:0,e2:null},delivered:{w1:false,w2:false,e1:true,e2:false},players:[
  player(0,{node:'exit',opened:1,rescued:1}),
  player(1,{node:'exit',opened:1,rescued:0}),
 ]});
 const guide=getKeilahGuide(established,0);
 assert.match(guide.title,/성 안 광장/);
 assert.match(guide.detail,/최종 목적지는 동쪽 지붕/);
 assert.match(guide.detail,/그곳에서 동쪽 지붕 가족/);
});

test('carrying guidance uses the open non-patrol route and explains automatic delivery',()=>{
 const carrying=state({gates:{west:true,east:true},players:[
  player(0,{node:'w1',carrying:'w1',rescued:1,opened:1}),
  player(1,{node:'e1',rescued:1,opened:1}),
 ]});
 const guide=getKeilahGuide(carrying,0);
 assert.match(guide.title,/서쪽 통로/);
 assert.match(guide.detail,/자동으로 안전 도착/);
});

test('a family already being rescued by the partner is not offered as a duplicate target',()=>{
 const claimed=state({gates:{west:true,east:true},families:{w1:null,w2:0,e1:1,e2:1},delivered:{w1:false,w2:true,e1:true,e2:true},players:[
  player(0,{node:'exit',rescued:1,opened:1}),
  player(1,{node:'w1',rescued:2,opened:1,job:{kind:'rescue',start:0,end:14000}}),
 ]});
 const guide=getKeilahGuide(claimed,0);
 assert.match(guide.title,/남문에서 동료를 기다려요/);
 assert.doesNotMatch(guide.title,/인솔 시작/);
});

test('rescue wait, completion, and escaped states report the partner action',()=>{
 const waiting=state({gates:{west:true,east:true},families:{w1:0,w2:0,e1:1,e2:1},delivered:{w1:true,w2:true,e1:true,e2:false},players:[
  player(0,{node:'exit',rescued:2,opened:1}),
  player(1,{node:'e1',carrying:'e2',rescued:2,opened:1}),
 ]});
 assert.match(getKeilahGuide(waiting,0).title,/남문에서 동료/);
 assert.match(getKeilahGuide(waiting,0).partner,/인솔 중/);
 const escaped={...waiting,delivered:{w1:true,w2:true,e1:true,e2:true},players:[player(0,{node:'exit',rescued:2,opened:1,escaped:true}),player(1,{node:'exit',rescued:2,opened:1})]};
 assert.match(getKeilahGuide(escaped,0).title,/내 탈출 완료/);
 assert.match(getKeilahGuide({...escaped,phase:'complete'},0).title,/구출 성공/);
});

test('off-route locked position falls back to factual context without recommending a locked crossing',()=>{
 const offRoute=state({players:[player(0,{node:'e2'}),player(1,{node:'exit'})]});
 const before=structuredClone(offRoute);
 const guide=getKeilahGuide(offRoute,0);
 assert.match(guide.title,/현재 위치에서 열린 길/);
 assert.doesNotMatch(guide.detail,/통로로 건너/);
 assert.deepEqual(offRoute,before);
});

test('all delivered with one player never rescuing reports the unrecoverable rescue condition',()=>{
 const impossible=state({gates:{west:true,east:true},families:{w1:0,w2:0,e1:0,e2:0},delivered:{w1:true,w2:true,e1:true,e2:true},players:[
  player(0,{node:'exit',opened:1,rescued:4}),
  player(1,{node:'exit',opened:1,rescued:0}),
 ]});
 const guide=getKeilahGuide(impossible,1);
 assert.match(guide.title,/직접 인솔 조건을 채울 수 없어요/);
 assert.match(guide.detail,/탈출할 수 없/);
 assert.match(guide.detail,/두 사람 모두 한 팀 이상/);
});

test('two gates credited to one holder reports the unrecoverable role condition',()=>{
 const impossible=state({gates:{west:true,east:true},players:[
  player(0,{node:'west',opened:0,rescued:1}),
  player(1,{node:'east',opened:2,rescued:1}),
 ]});
 const guide=getKeilahGuide(impossible,0);
 assert.match(guide.title,/탈출 조건을 채울 수 없어요/);
 assert.match(guide.detail,/탈출 완료는 불가능/);
 assert.match(guide.detail,/새 판/);
});

test('pending, paused, and rescue jobs are prioritized over route advice',()=>{
 const base=state({gates:{west:true,east:true},players:[player(0,{node:'w1',job:{kind:'rescue',start:0,end:14000}}),player(1,{node:'e1'})]});
 assert.match(getKeilahGuide(base,0).title,/가족을 모으는 중/);
 assert.match(getKeilahGuide({...base,paused:true},0).title,/연결을 기다려요/);
 assert.match(getKeilahGuide(base,0,{pending:true}).title,/입력을 확인 중/);
});
