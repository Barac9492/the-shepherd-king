import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile),cwd=new URL('..',import.meta.url);
test('challenge tutorial, story detour, desktop/touch and local-server runtime regressions pass',{timeout:360000},async()=>{
  const base='http://127.0.0.1:43981';const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd,env:{...process.env,PORT:'43981',CHALLENGE_MOCK:'1'},stdio:'ignore'});let serverError;server.on('error',error=>{serverError=error;});
  try{let ready=false;for(let i=0;i<50;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw new Error(`test server exited ${server.exitCode}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'challenge test server must start');
    const {stdout,stderr}=await exec(process.execPath,['scripts/check-sling-challenge.mjs'],{cwd,env:{...process.env,BASE_URL:base},timeout:300000,maxBuffer:8*1024*1024});console.log(stdout);if(stderr)console.error(stderr);const line=stdout.split('\n').find(row=>row.startsWith('SLING_CHALLENGE_RESULT '));assert.ok(line,'missing challenge runtime result');const result=JSON.parse(line.slice('SLING_CHALLENGE_RESULT '.length));assert.equal(result.passed,14);assert.equal(result.results.length,14);assert.ok(result.results.every(check=>check.pass===true));assert.deepEqual(result.errors,[]);
  }catch(error){assert.fail(`challenge runtime failed\nSTDOUT:\n${error.stdout||''}\nSTDERR:\n${error.stderr||''}\n${error.message}`);}finally{server.kill('SIGTERM');}
});
