import test from 'node:test';
import assert from 'node:assert/strict';
import {VERSES,normalize,compareVerse,createRound,submitVerse,nextVerse,revealHint,readScores,saveScore,SCORE_KEY} from '../src/david-dance-core.js';
test('canonical KRV text: six verses and historic spelling stay fixed',()=>{assert.equal(VERSES.length,6);assert.match(VERSES[1],/쉴만한 물 가으로/);assert.match(VERSES[3],/다닐찌라도/);assert.match(VERSES[5],/정녕/);});
test('whitespace, punctuation and decomposed Korean are accepted, other words/symbols are not',()=>{
 assert.equal(normalize('여 호와는, 나의!'),'여호와는나의');
 assert.ok(compareVerse(VERSES[0],VERSES[0].normalize('NFD').replaceAll(' ','\n')+'!').correct);
 assert.ok(compareVerse(VERSES[0],VERSES[0].replaceAll(' ','')).correct);
 for(const value of [VERSES[0].replace('내가','나는'),VERSES[0]+'x',VERSES[0]+'♡',VERSES[0].slice(1)])assert.equal(compareVerse(VERSES[0],value).correct,false);
});
test('alignment faithfully reconstructs changed, missing, inserted and repeated text',()=>{
 for(const [a,b] of [['목자시니','목사시니'],['가나다','가다'],['가나다','가라마다'],['가가나','가나가'],[VERSES[3],VERSES[3].replace('다닐찌라도','다닐지라도')]]){
  const result=compareVerse(a,b);assert.equal(result.groups.map(g=>g.expected).join(''),normalize(a));assert.equal(result.groups.map(g=>g.actual).join(''),normalize(b));assert.ok(result.groups.some(g=>!g.same));assert.ok(result.accuracy<100);
 }
});
test('wrong answer can be edited; empty/duplicate input and duplicate success cannot score',()=>{
 const r=createRound('challenge');assert.deepEqual(submitVerse(r,'  !'),{ignored:true});assert.equal(r.attempts,0);
 const wrong=VERSES[0].replace('목자','목사');assert.equal(submitVerse(r,wrong).correct,false);assert.equal(r.score,0);
 assert.deepEqual(submitVerse(r,wrong+'!'),{ignored:true});assert.equal(r.attempts,1);
 assert.equal(submitVerse(r,VERSES[0]).correct,true);assert.equal(r.streak,0);assert.ok(r.score<100);
 const points=r.score;submitVerse(r,VERSES[0]);assert.equal(r.score,points);assert.equal(r.stage,1);
 assert.ok(nextVerse(r));assert.equal(nextVerse(r),false);assert.equal(r.index,1);
});
test('perfect six verses score 1110 without any clock; finish is idempotent',()=>{
 const r=createRound('challenge');for(const verse of VERSES){submitVerse(r,verse);nextVerse(r);}
 assert.equal(r.score,1110);assert.equal(r.stage,6);assert.equal(r.phase,'complete');assert.equal(r.streak,6);
 submitVerse(r,VERSES[5]);assert.equal(r.score,1110);
});
test('hints reduce points once and break a clean streak',()=>{
 const r=createRound('challenge');submitVerse(r,VERSES[0]);nextVerse(r);revealHint(r);revealHint(r);submitVerse(r,VERSES[1]);assert.equal(r.score,180);assert.equal(r.streak,0);assert.equal(r.verses[1].earned,70);
});
test('only completed challenges save once, top5 is bounded; blocked/corrupt storage is safe',()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const r=createRound('challenge');assert.equal(saveScore(storage,r),null);
 for(const verse of VERSES){submitVerse(r,verse);nextVerse(r);}assert.equal(saveScore(storage,r).length,1);assert.equal(saveScore(storage,r),null);
 for(let i=0;i<7;i++)saveScore(storage,{...r,saved:false,score:400+i});assert.equal(readScores(storage).length,5);assert.equal(readScores(storage)[0].score,1110);
 const practice={...r,saved:false,mode:'practice'};assert.equal(saveScore(storage,practice),null);
 data.set(SCORE_KEY,'bad JSON');assert.deepEqual(readScores(storage),[]);data.set(SCORE_KEY,'null');assert.deepEqual(readScores(storage),[]);
 assert.equal(saveScore(undefined,{...r,saved:false}),null);assert.deepEqual(readScores(undefined),[]);
});
