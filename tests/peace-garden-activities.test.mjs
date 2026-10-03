import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenJournal, GARDEN_JOURNAL_KEY } from '../src/peace-garden-activities.js';
const storage=()=>{const values=new Map([['david-progress','6']]);return{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),values};};
test('meeting an animal does not earn friendship; only completed activity steps do',()=>{
 const store=storage(),journal=createGardenJournal(store);journal.meet('lion');assert.deepEqual(journal.get('lion'),{met:true,step:0,friend:false});
 journal.advance('lion');assert.equal(journal.get('lion').friend,false);journal.advance('lion');assert.equal(journal.get('lion').friend,true);
 journal.advance('lion');assert.equal(journal.get('lion').step,2);assert.equal(store.values.get('david-progress'),'6');
 assert.deepEqual([...store.values.keys()].sort(),[GARDEN_JOURNAL_KEY,'david-progress'].sort());
});
test('activity checkpoints and friendships survive reopening the local journal',()=>{
 const store=storage(),journal=createGardenJournal(store);journal.advance('wolf');journal.advance('lamb');const restored=createGardenJournal(store);
 assert.equal(restored.get('wolf').step,1);assert.equal(restored.get('wolf').friend,false);assert.equal(restored.get('lamb').friend,true);
});
test('corrupt, unknown-version and invalid journal data safely become a fresh activity',()=>{
 for(const value of ['broken','null',JSON.stringify({version:1,animals:{lion:{step:999,friend:true}}}),JSON.stringify({version:2,animals:{lion:{step:2}}}),JSON.stringify({version:1,animals:{lion:{step:'2',friend:true},wolf:{step:-2}}})]){
  const journal=createGardenJournal({getItem:()=>value,setItem(){}});assert.equal(journal.get('lion').friend,false);assert.equal(journal.get('wolf').step,0);
 }
});
test('denied storage preserves earned memories for the page session and reports its limitation',()=>{
 const journal=createGardenJournal({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});
 journal.meet('lamb');journal.advance('lamb');assert.equal(journal.get('lamb').friend,true);assert.equal(journal.persistent,false);
});
