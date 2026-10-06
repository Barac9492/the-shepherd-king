import test from 'node:test';
import assert from 'node:assert/strict';
import {DANCE_PSALMS} from '../src/dance-psalms.js';
import {VERSES,SCORE_KEY,getPsalm,scoreKey,maxScore,createRound,submitVerse,nextVerse,revealHint,readScores,saveScore,compareVerse} from '../src/david-dance-core.js';
const finish=(id,mode='challenge')=>{const r=createRound(mode,id);for(const text of getPsalm(id).verses){assert.equal(submitVerse(r,text).correct,true);nextVerse(r);}return r;};
const memory=()=>{const values=new Map();return {values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};

test('supplied collections retain requested order and every verse',()=>{
 assert.deepEqual(DANCE_PSALMS.map(p=>[p.id,p.chapter,p.verses.length]),[['psalm23',23,6],['psalm3',3,8],['psalm51',51,19]]);
 assert.equal(getPsalm('psalm23').verses[0],'여호와는 나의 목자시니 내게 부족함이 없으리로다');
 assert.match(getPsalm('psalm23').verses[3],/다닐지라도/);
 assert.match(getPsalm('psalm23').verses[5],/반드시/);
 assert.match(getPsalm('psalm51').verses[18],/수소를 주의 제단에 드리리이다$/);
});
for(const psalm of DANCE_PSALMS)test(`${psalm.id}: complete all ${psalm.verses.length}, score and finish idempotent`,()=>{
 const r=createRound('challenge',psalm.id);
 for(let i=0;i<psalm.verses.length;i++){
  assert.equal(r.index,i);assert.equal(submitVerse(r,psalm.verses[i]).correct,true);assert.equal(r.stage,i+1);
  assert.equal(r.phase,i===psalm.verses.length-1?'complete':'success');
  const before=r.score;assert.deepEqual(submitVerse(r,psalm.verses[i]),{ignored:true});assert.equal(r.score,before);
  assert.equal(nextVerse(r),i<psalm.verses.length-1);assert.equal(nextVerse(r),false);
 }
 assert.equal(r.score,maxScore(psalm.id));assert.equal(r.verses.length,psalm.verses.length);
 assert.equal(r.streak,psalm.verses.length);assert.equal(r.phase,'complete');
});
test('maximum score follows each length; legacy remains unchanged',()=>{
 assert.deepEqual(DANCE_PSALMS.map(p=>maxScore(p.id)),[1110,1460,4100]);
 assert.equal(getPsalm().verses,VERSES);assert.equal(scoreKey(),SCORE_KEY);assert.equal(maxScore(),1110);
 assert.equal(finish().score,1110);
});
test('Selah is required but punctuation and spaces remain optional',()=>{
 const verse=getPsalm('psalm3').verses[1];assert.match(verse,/\(셀라\)$/);
 assert.ok(compareVerse(verse,verse.replace('(셀라)','셀라').replaceAll(' ','')).correct);
 assert.equal(compareVerse(verse,verse.replace(' (셀라)','')).correct,false);
 assert.deepEqual(getPsalm('psalm3').verses.flatMap((v,i)=>v.includes('(셀라)')?[i+1]:[]),[2,4,8]);
});
test('hints, corrections, empty and duplicate inputs preserve the same scoring rules',()=>{
 const r=createRound('challenge','psalm51'),text=getPsalm('psalm51').verses;
 assert.deepEqual(submitVerse(r,' ! '),{ignored:true});assert.equal(r.attempts,0);
 revealHint(r);revealHint(r);submitVerse(r,text[0]);assert.equal(r.score,70);assert.equal(r.streak,0);
 nextVerse(r);assert.equal(submitVerse(r,text[1]+'추가').correct,false);
 assert.deepEqual(submitVerse(r,text[1]+'추가!'),{ignored:true});assert.equal(r.attempts,1);
 submitVerse(r,text[1]);assert.equal(r.streak,0);assert.equal(r.stage,2);
});
test('per-psalm versioned scores never mix with each other or legacy',()=>{
 const storage=memory(),all=[undefined,...DANCE_PSALMS.map(p=>p.id)];
 for(const id of all){const round=finish(id);assert.equal(saveScore(storage,round).length,1);assert.equal(saveScore(storage,round),null);}
 assert.equal(new Set(all.map(scoreKey)).size,4);
 for(const id of all){assert.equal(readScores(storage,id).length,1);assert.equal(readScores(storage,id)[0].score,maxScore(id));}
 storage.values.delete(scoreKey('psalm3'));
 assert.deepEqual(readScores(storage,'psalm3'),[]);assert.equal(readScores(storage,'psalm51').length,1);assert.equal(readScores(storage).length,1);
 assert.equal(saveScore(storage,finish('psalm51','practice')),null);
});
test('new records bound top five, reject impossible records and tolerate blocked storage',()=>{
 const storage=memory(),r=finish('psalm51');
 for(let i=0;i<8;i++)saveScore(storage,{...r,saved:false,score:300+i});
 assert.equal(readScores(storage,'psalm51').length,5);assert.equal(readScores(storage,'psalm51')[0].score,307);
 storage.setItem(scoreKey('psalm3'),JSON.stringify([{score:4100,at:1},{score:1460,at:1},null]));
 assert.deepEqual(readScores(storage,'psalm3'),[{score:1460,at:1}]);
 storage.setItem(scoreKey('psalm51'),'null');assert.deepEqual(readScores(storage,'psalm51'),[]);
 assert.equal(saveScore(undefined,{...r,saved:false}),null);assert.deepEqual(readScores(undefined,'psalm51'),[]);
});
test('unknown explicit ids fail closed rather than silently use another scripture',()=>{
 for(const id of ['psalm22','',null,23]){
  assert.throws(()=>createRound('practice',id),RangeError);assert.throws(()=>getPsalm(id),RangeError);
  assert.throws(()=>scoreKey(id),RangeError);assert.throws(()=>readScores(memory(),id),RangeError);
 }
});
