/** Server replay rules. Browser telemetry is evidence, never proof of human memorization. */
import {createRound, submitVerse, nextVerse, revealHint} from '../src/david-dance-core.js';
import {ENGEDI_RULES, createEngediState, stepEngedi} from '../src/engedi-challenge-core.js';
import {ChallengeServiceError} from './challenge-service.mjs';
export const SIDE_VERSION='side-top10-v1';
export const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function reject(code='invalid_result',status=400){throw new ChallengeServiceError(code,'This attempt could not be verified; start a fresh challenge',status);}
export function replaySide(mode, input){
  if(mode==='dance'){
    if(!exact(input,['actions'])||!Array.isArray(input.actions)||input.actions.length>128)reject();
    const round=createRound('challenge');
    for(const action of input.actions){
      if(round.phase==='complete')reject();
      if(exact(action,['type'])&&action.type==='hint'){
        if(round.phase!=='input'||round.hinted)reject();revealHint(round);
      }else if(exact(action,['type'])&&action.type==='next'){
        if(!nextVerse(round))reject();
      }else if(exact(action,['type','text'])&&action.type==='answer'&&typeof action.text==='string'&&action.text.length<=600){
        if(submitVerse(round,action.text).ignored)reject();
      }else reject();
    }
    if(round.phase!=='complete')reject();
    return {metric:round.score,activeMs:0};
  }
  if(mode!=='engedi'||!exact(input,['events','endedTick','interrupted','maxGapMs'])||input.interrupted!==false||
     !Number.isFinite(input.maxGapMs)||input.maxGapMs<0||input.maxGapMs>ENGEDI_RULES.maxGapMs||
     !Number.isInteger(input.endedTick)||input.endedTick<1||input.endedTick>ENGEDI_RULES.maxTicks||
     !Array.isArray(input.events)||!input.events.length||input.events.length>2048)reject();
  let previous=0,lastSpeed=-1;
  for(const event of input.events){
    if(!exact(event,['tick','speed'])||!Number.isInteger(event.tick)||event.tick<=previous||event.tick>input.endedTick||
      !Number.isInteger(event.speed)||event.speed<0||event.speed>100||event.speed===lastSpeed)reject();
    previous=event.tick;lastSpeed=event.speed;
  }
  if(input.events[0].tick!==1)reject();
  const state=createEngediState();let cursor=0,speed=0;
  for(let tick=1;tick<=input.endedTick;tick++){
    if(input.events[cursor]?.tick===tick)speed=input.events[cursor++].speed;
    if(state.status!=='playing')reject();stepEngedi(state,speed);
  }
  if(state.status!=='success')reject();
  return {metric:state.tick,activeMs:state.tick*ENGEDI_RULES.tickMs};
}
