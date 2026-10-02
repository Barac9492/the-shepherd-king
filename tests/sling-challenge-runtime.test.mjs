import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile),cwd=new URL('..',import.meta.url);
test('challenge desktop/touch and local-server runtime regressions pass',{timeout:360000},async()=>{
  const base='http://127.0.0.1:43981';const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd,env:{...process.env,PORT:'43981',CHALLENGE_MOCK:'1'},stdio:'ignore'});let serverError;server.on('error',error=>{serverError=error;});
  try{let ready=false;for(let i=0;i<50;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw new Error(`test server exited ${server.exitCode}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'challenge test server must start');
    const {stdout,stderr}=await exec(process.execPath,['scripts/check-sling-challenge.mjs'],{cwd,env:{...process.env,BASE_URL:base},timeout:300000,maxBuffer:8*1024*1024});console.log(stdout);if(stderr)console.error(stderr);assert.match(stdout,/SLING_CHALLENGE_RESULT.*"passed":8/);
  }finally{server.kill('SIGTERM');}
});
