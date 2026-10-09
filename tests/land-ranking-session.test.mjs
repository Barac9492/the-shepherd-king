import test from 'node:test';
import assert from 'node:assert/strict';
import {createLandRecorder} from '../land-of-david/src/ranking-session.js';
import {replayLandRanking, LAND_ACTS, LAND_VERSION} from '../land-of-david/src/ranking-replay.js';
import {fullRun} from './land-ranking-replay.test.mjs';

for(const act of LAND_ACTS) test(`renderer recorder captures a complete replayable ${act} run`,async()=>{
 let complete=null,fail=null;
 const recorder=createLandRecorder({act,attemptId:'a'.repeat(48),onComplete:x=>complete=x,onFail:x=>fail=x});
 const {expected}=fullRun(act,recorder.wrap);
 await Promise.resolve();
 assert.equal(fail,null);assert.ok(complete);assert.equal(complete.attemptId,'a'.repeat(48));
 assert.deepEqual(replayLandRanking(act,{version:complete.version,events:complete.events}),expected);
 assert.equal(recorder.active,false);
});
test('ordinary play never records or overrides seed and carried values',()=>{
 const recorder=createLandRecorder({act:'herut',onComplete:()=>assert.fail('unexpected completion')});
 const logic={createHerut:(...args)=>args};
 assert.deepEqual(recorder.wrap(logic).createHerut('layout',99,999),['layout',99,999]);
 assert.equal(recorder.events.length,0);
});
test('ranked play fixes seed and carried count independent of local saves',()=>{
 for(const [act,carried]of Object.entries({herut:240,ziklag:400,hebron:470})){
  const recorder=createLandRecorder({act,attemptId:'a'.repeat(48)});
  assert.deepEqual(recorder.wrap({createState:(...args)=>args}).createState('layout',999,99999),['layout',7,carried]);
 }
});
