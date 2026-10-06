import test from 'node:test';import assert from 'node:assert/strict';
import {PSALM_PRESCRIPTIONS} from '../src/psalm-prescriptions.js';
import {createSession,selectPrescription,setMode,submitAnswer,revealSource,restartPrescription} from '../src/psalm-prescription-core.js';

test('five representative answers complete once each without a score or spiritual assessment',()=>{
 const s=createSession();
 for(const item of PSALM_PRESCRIPTIONS){selectPrescription(s,item.id);setMode(s,'recall');const wrong=submitAnswer(s,item.text+' 추가된 말');assert.equal(wrong.correct,false);const answer=submitAnswer(s,item.text.normalize('NFD').replaceAll(' ','\n'));assert.equal(answer.correct,true);assert.equal('accuracy' in answer,false);assert.equal('earned' in answer,false);const count=s.completed.length;submitAnswer(s,item.text);assert.equal(s.completed.length,count);assert.equal('score' in s,false);assert.equal('streak' in s,false);}
 assert.deepEqual(s.completed,PSALM_PRESCRIPTIONS.map(x=>x.id));
});
test('completion state stays in one session and reading/reveal does not complete anything',()=>{
 const first=createSession('rescue'),second=createSession('rescue');revealSource(first);assert.deepEqual(first.completed,[]);submitAnswer(first,PSALM_PRESCRIPTIONS[3].text);assert.deepEqual(second.completed,[]);restartPrescription(first);assert.equal(first.phase,'input');assert.equal(first.mode,'read');assert.equal(first.revealed,false);assert.deepEqual(first.completed,['rescue']);
});
test('unknown ids and reading modes cannot mutate a valid session',()=>{
 const s=createSession(),before=JSON.stringify(s);for(const bad of ['psalm51','',null,23]){assert.throws(()=>selectPrescription(s,bad),RangeError);assert.equal(JSON.stringify(s),before);}assert.throws(()=>setMode(s,'scored'),RangeError);assert.equal(JSON.stringify(s),before);
});
