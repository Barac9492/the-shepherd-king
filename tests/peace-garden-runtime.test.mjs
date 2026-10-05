import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile),cwd=new URL('..',import.meta.url);
// Software-rendered mobile/legacy scenes plus the public menu path can exceed eight minutes.
// This is the suite's wall-clock budget; game timers and all nineteen assertions stay intact.
test('peace garden desktop/mobile lifecycle, scripture, companions and existing flow regressions', {timeout:660000},async()=>{
 const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd,env:{...process.env,PORT:'43987',CHALLENGE_MOCK:'1'},stdio:'ignore'});
 let serverError;server.on('error',e=>{serverError=e;});
 try{
  let ready=false;for(let i=0;i<50;i++){if(serverError)throw serverError;try{if((await fetch('http://127.0.0.1:43987',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  const{stdout,stderr}=await exec(process.execPath,['scripts/check-peace-garden.mjs'],{cwd,env:{...process.env,BASE_URL:'http://127.0.0.1:43987'},timeout:600000,maxBuffer:8*1024*1024});
  console.log(stdout);if(stderr)console.error(stderr);const row=stdout.split('\n').find(s=>s.startsWith('PEACE_GARDEN_RESULT '));assert.ok(row);const result=JSON.parse(row.slice('PEACE_GARDEN_RESULT '.length));assert.equal(result.checks,19);assert.deepEqual(result.errors,[]);
 }catch(e){assert.fail(`${e.stdout||''}\n${e.stderr||''}\n${e.message}`);}finally{server.kill('SIGTERM');}
});
