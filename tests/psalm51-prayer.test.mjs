import test from 'node:test';
import assert from 'node:assert/strict';
import {getPsalm,createRound,submitVerse,nextVerse,revealHint,saveScore,readScores,scoreKey,maxScore} from '../src/david-dance-core.js';

test('Psalm51 never earns points, streaks or completion bonus in either visibility mode',()=>{
 for(const mode of ['practice','challenge']){
  const r=createRound(mode,'psalm51'),text=getPsalm('psalm51').verses;
  for(let i=0;i<text.length;i++){
   if(i===2){revealHint(r);assert.equal(submitVerse(r,text[i]+'가').correct,false);}
   const result=submitVerse(r,text[i]);assert.equal(result.correct,true);assert.equal(result.earned,0);assert.equal(r.score,0);assert.equal(r.streak,0);assert.equal(r.stage,i+1);
   nextVerse(r);
  }
  assert.equal(r.phase,'complete');assert.equal(r.score,0);assert.ok(r.verses.every(v=>v.earned===0));assert.equal(maxScore('psalm51'),0);
 }
});

test('Psalm51 cannot write or expose scored records, even when a completed round is tampered',()=>{
 const values=new Map([[scoreKey('psalm51'),'[{"score":4100,"at":123}]']]);let writes=0;
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>{writes++;values.set(k,v);}};
 const before=values.get(scoreKey('psalm51'));
 const r=createRound('challenge','psalm51');for(const text of getPsalm('psalm51').verses){submitVerse(r,text);nextVerse(r);}
 assert.equal(saveScore(storage,r),null);assert.equal(saveScore(storage,{...r,saved:false,score:4100}),null);
 assert.deepEqual(readScores(storage,'psalm51'),[]);assert.equal(values.get(scoreKey('psalm51')),before);assert.equal(writes,0);
});

test('prayer completion does not change dance scoring or legacy server defaults',()=>{
 for(const id of [undefined,'psalm23','psalm3']){
  const r=createRound('challenge',id),verses=getPsalm(id).verses;
  for(const text of verses){submitVerse(r,text);nextVerse(r);}
  assert.equal(r.score,id==='psalm3'?1460:1110);assert.equal(r.streak,verses.length);
 }
});
