import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,beginNextWave,finishGrace} from '../src/downfall-core.js';
import {DOWNFALL_RANKING as R,packRankingInput,applyRankingFrame,createRankingRecorder,replayDownfallRanking,RankingReplayError} from '../src/downfall-ranking-core.js';
function run({fire=false,orbit=false,oneWave=false}={}){
 const state=createBattle(R.seed),rec=createRankingRecorder();let ticks=0,waves=0;
 while(state.phase!=='grace'&&ticks<18000){
  if(state.phase==='intermission'){assert.ok(rec.nextWave());assert.ok(beginNextWave(state));waves++;}
  const target=state.enemies.reduce((a,b)=>Math.hypot(b.x-state.player.x,b.z-state.player.z)<Math.hypot(a.x-state.player.x,a.z-state.player.z)?b:a,state.enemies[0]||{x:0,z:-1});
  const shooting=fire&&(oneWave?waves===0:ticks<600);
  const theta=state.time*.45,dx=Math.cos(theta)*9-state.player.x,dz=Math.sin(theta)*9-state.player.z,n=Math.hypot(dx,dz)||1;
  const input=packRankingInput({moveX:orbit&&shooting?dx/n:0,moveZ:orbit&&shooting?dz/n:0,aimX:target.x-state.player.x,aimZ:target.z-state.player.z,firing:shooting});
  assert.ok(rec.record(input));applyRankingFrame(state,input);ticks++;
 }
 assert.equal(state.phase,'grace');return {state,rec,ticks,waves};
}
const zero=run(),positive=run({fire:true});
test('new protocol exports version, bounded recording, fixed time and unchanged local core',()=>{assert.equal(R.version,'downfall-top10-v1');assert.equal(R.seed,123);assert.equal(R.hz,60);assert.equal(R.maxTicks,108000);assert.equal(R.maxSegments,50000);assert.ok(Object.isFrozen(R));});
test('zero-score natural ending replays exactly without granting grace bonuses',()=>{const result=replayDownfallRanking(zero.rec.transcript());assert.equal(result.score,0);assert.equal(result.kills,0);assert.equal(result.activeMs,Math.round(zero.ticks*1000/60));const before={...result};finishGrace(zero.state);assert.deepEqual(replayDownfallRanking(zero.rec.transcript()),before);});
test('real positive run is derived from input, never a posted score',()=>{const result=replayDownfallRanking(positive.rec.transcript());assert.ok(result.score>0);assert.equal(result.score,positive.state.result.score);assert.equal(result.kills,positive.state.result.kills);assert.equal(result.wave,positive.state.result.wave);assert.equal(result.shots,positive.state.result.shots);assert.equal(result.hits,positive.state.result.hits);});
test('identical replay yields identical result',()=>{assert.deepEqual(replayDownfallRanking(positive.rec.transcript()),replayDownfallRanking(positive.rec.transcript()));});
test('input quantization is bounded and normalizes long aiming vectors without changing direction',()=>{const p=packRankingInput({moveX:NaN,moveZ:Infinity,aimX:3,aimZ:4,firing:true},true);assert.deepEqual(p,[0,0,600,800,3]);assert.deepEqual(packRankingInput({moveX:-1,moveZ:1,aimX:0,aimZ:0}),[-1000,1000,0,0,0]);});
test('dash is reproduced on the same fixed tick',()=>{const a=createBattle(),b=createBattle(),p=packRankingInput({moveX:1,aimZ:-1},true);applyRankingFrame(a,p);applyRankingFrame(b,p);assert.deepEqual(a,b);assert.ok(a.player.x>4);assert.ok(a.player.dashCooldown>0);});
test('recording uses RLE and immutable copied snapshots',()=>{const r=createRankingRecorder(),p=[0,0,0,-1000,0];r.record(p);r.record(p);p[0]=1000;const t=r.transcript();assert.deepEqual(t.segments,[[2,0,0,0,-1000,0]]);assert.ok(Object.isFrozen(t)&&Object.isFrozen(t.segments)&&Object.isFrozen(t.segments[0]));r.record(p);assert.equal(t.segments.length,1);assert.equal(r.ticks,3);});
test('recorder next-wave marker does not add active time',()=>{const r=createRankingRecorder();assert.ok(r.nextWave());assert.equal(r.ticks,0);assert.deepEqual(r.transcript().segments,[[1,0,0,0,0,4]]);});
test('legitimate next-wave trace is replayable',()=>{const {state,rec,waves}=run({fire:true,orbit:true,oneWave:true});assert.ok(waves>=1);assert.equal(replayDownfallRanking(rec.transcript()).score,state.result.score);});
for(const [name,mutate] of [
 ['posted score',t=>({...t,score:999999})],['extra seed',t=>({...t,seed:9})],['wrong version',t=>({...t,version:'other'})],['missing version',t=>({segments:t.segments})],['empty trace',t=>({...t,segments:[]})],['not completed',t=>({...t,segments:[[1,0,0,0,-1000,0]]})],['fractional count',t=>({...t,segments:[[1.5,0,0,0,0,0]]})],['negative count',t=>({...t,segments:[[-1,0,0,0,0,0]]})],['nonfinite axis',t=>({...t,segments:[[1,NaN,0,0,0,0]]})],['out of range axis',t=>({...t,segments:[[1,1001,0,0,0,0]]})],['fractional axis',t=>({...t,segments:[[1,0.5,0,0,0,0]]})],['unknown flags',t=>({...t,segments:[[1,0,0,0,0,8]]})],['early next wave',t=>({...t,segments:[[1,0,0,0,0,4],...t.segments]})],['invalid next-wave arguments',t=>({...t,segments:[[1,1,0,0,0,4],...t.segments]})],['extra fields in segment',t=>({...t,segments:[[1,0,0,0,0,0,9]]})],['after death input',t=>({...t,segments:[...t.segments,[1,0,0,0,0,0]]})],['after death wave',t=>({...t,segments:[...t.segments,[1,0,0,0,0,4]]})],['oversized run',t=>({...t,segments:[[R.maxTicks+1,0,0,0,0,0]]})],['oversized segments',t=>({...t,segments:Array(R.maxSegments+1).fill([1,0,0,0,0,0])})]
])test('replay rejects '+name,()=>assert.throws(()=>replayDownfallRanking(mutate(structuredClone(zero.rec.transcript()))),RankingReplayError));
test('recorder bounds active ticks without truncating a supposedly valid ranked attempt',()=>{const r=createRankingRecorder();for(let i=0;i<R.maxTicks;i++)assert.equal(r.record([0,0,0,0,0]),true);assert.equal(r.record([0,0,0,0,0]),false);assert.equal(r.limited,true);assert.equal(r.ticks,R.maxTicks);assert.equal(r.nextWave(),false);assert.ok(r.transcript().segments.length<100);});
test('recorder bounds rapidly varying input memory',()=>{const r=createRankingRecorder();for(let i=0;i<R.maxSegments;i++)assert.ok(r.record([i%2,0,0,0,0]));assert.equal(r.record([0,0,0,0,0]),false);assert.equal(r.limited,true);assert.equal(r.transcript().segments.length,R.maxSegments);});
