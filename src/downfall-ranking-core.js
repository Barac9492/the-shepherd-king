// Shared deterministic transcript rules. This verifies consistency, not human identity or bot use.
import {createBattle,stepBattle,dash,beginNextWave} from './downfall-core.js';
export const DOWNFALL_RANKING=Object.freeze({version:'downfall-top10-v1',seed:123,hz:60,maxTicks:108000,maxSegments:50000});
const R=DOWNFALL_RANKING,MAX_RUN=3600;
export class RankingReplayError extends Error{constructor(code='invalid_result'){super(code);this.name='RankingReplayError';this.code=code;}}
const fail=(code)=>{throw new RankingReplayError(code);};
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function validPacked(p){return Array.isArray(p)&&p.length===5&&p.slice(0,4).every(n=>int(n,-1000,1000))&&int(p[4],0,3);}
export function packRankingInput(input={},dashQueued=false){
 const finite=n=>Number.isFinite(n)?n:0,axis=n=>Math.round(Math.max(-1,Math.min(1,finite(n)))*1000);
 let ax=finite(input.aimX),az=finite(input.aimZ),len=Math.hypot(ax,az);
 if(len>0){ax/=len;az/=len;}
 return [axis(input.moveX),axis(input.moveZ),axis(ax),axis(az),(input.firing===true?1:0)|(dashQueued===true?2:0)];
}
export function applyRankingFrame(state,packed){
 if(!validPacked(packed)||state?.phase!=='playing')fail();
 const [mx,mz,ax,az,flags]=packed,input={moveX:mx/1000,moveZ:mz/1000,aimX:ax/1000,aimZ:az/1000,firing:!!(flags&1)};
 if(flags&2)dash(state,mx||mz?input.moveX:input.aimX,mx||mz?input.moveZ:input.aimZ);
 return stepBattle(state,1/R.hz,input);
}
export function createRankingRecorder(){
 const segments=[];let ticks=0,limited=false;
 const append=(packed)=>{
  const last=segments.at(-1);
  if(last&&last[5]!==4&&last[0]<MAX_RUN&&packed.every((v,i)=>v===last[i+1])){last[0]++;return true;}
  if(segments.length>=R.maxSegments){limited=true;return false;}
  segments.push([1,...packed]);return true;
 };
 return Object.freeze({
  record(packed){if(!validPacked(packed))fail();if(limited)return false;if(ticks>=R.maxTicks){limited=true;return false;}if(!append(packed))return false;ticks++;return true;},
  nextWave(){if(limited)return false;if(segments.length>=R.maxSegments){limited=true;return false;}segments.push([1,0,0,0,0,4]);return true;},
  transcript(){return Object.freeze({version:R.version,segments:Object.freeze(segments.map(s=>Object.freeze([...s])))});},
  get ticks(){return ticks;},get limited(){return limited;}
 });
}
export function replayDownfallRanking(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==2||!Object.hasOwn(payload,'version')||!Object.hasOwn(payload,'segments'))fail();
 if(payload.version!==R.version)fail('unsupported_version');
 if(!Array.isArray(payload.segments)||!payload.segments.length||payload.segments.length>R.maxSegments)fail();
 const state=createBattle(R.seed);let ticks=0;
 for(const segment of payload.segments){
  if(!Array.isArray(segment)||segment.length!==6||!int(segment[0],1,MAX_RUN))fail();
  const [count,...packed]=segment;
  if(packed[4]===4){
   if(count!==1||packed.slice(0,4).some(n=>n!==0)||state.phase!=='intermission'||!beginNextWave(state))fail();
   continue;
  }
  if(!validPacked(packed)||ticks+count>R.maxTicks)fail();
  for(let i=0;i<count;i++){applyRankingFrame(state,packed);ticks++;}
 }
 if(state.phase!=='grace'||!state.result)fail();
 const {score,kills,wave,maxCombo,shots,hits}=state.result;
 return Object.freeze({score,kills,wave,activeMs:Math.round(ticks*1000/R.hz),maxCombo,shots,hits});
}
