import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createOnlineChallengeHandler } from '../server/challenge-online-http.mjs';
import { createSupabaseChallengeService } from '../server/challenge-supabase.mjs';
import { CHALLENGE_RULES, createChallengeState, challengeTarget, fireChallengeShot } from '../src/sling-challenge-core.js';

test('full HTTP to adapter to local SQL flow publishes only verified initials and score',async t=>{
  const moduleName=process.env.PGLITE_MODULE_PATH?pathToFileURL(process.env.PGLITE_MODULE_PATH).href:'@electric-sql/pglite';
  const {PGlite}=await import(moduleName),db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(await readFile(new URL('../docs/sling-challenge-supabase-setup.draft.sql',import.meta.url),'utf8'));
  const origin='https://game.example';
  // Inert test string: no live key or network request is used.
  const env={VERCEL:'1',CHALLENGE_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:origin,CHALLENGE_SUPABASE_URL:'https://jdsjvrynmnzoztfinlzi.supabase.co',CHALLENGE_SUPABASE_SECRET_KEY:'sb_secret_'+'testonly'.repeat(4)};
  const serviceFactory=config=>createSupabaseChallengeService({...config,fetchImpl:async(url,options)=>{const p=JSON.parse(options.body);await db.exec('SET ROLE service_role');const value=(await db.query('SELECT public.sling_challenge_rpc($1,$2::jsonb,$3) AS result',[p.p_action,JSON.stringify(p.p_input),p.p_client_key])).rows[0].result;return Response.json(value);}});
  async function call(action,body){const request=new Request(origin+'/api/sling-challenge/'+action,{method:body===undefined?'GET':'POST',headers:{'x-vercel-forwarded-for':'203.0.113.20',...(body===undefined?{}:{origin,'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const r=await createOnlineChallengeHandler(action,{env,serviceFactory})(request);return{status:r.status,data:await r.json()};}
  const issued=await call('attempts',{});assert.equal(issued.status,201);assert.equal(issued.data.mode,'online');const attempt=issued.data.attempt;
  const state=createChallengeState({seed:attempt.seed}),shots=[];
  for(let i=0;i<4;i++){const atMs=200+i*350;let direction=[0,1,0];if(i===0){const delta=challengeTarget(state,atMs).position.map((n,j)=>n-CHALLENGE_RULES.cameraOrigin[j]);direction=delta.map(n=>n/Math.hypot(...delta));}const shot={atMs,heldMs:200,direction};fireChallengeShot(state,shot);shots.push(shot);}
  await db.exec('RESET ROLE');await db.query("UPDATE sling_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attempt.id]);
  const finished=await call('finish',{attemptId:attempt.id,shots,endedAtMs:state.activeMs});assert.equal(finished.status,200);assert.equal(finished.data.qualifies,true);assert.equal(finished.data.result.score,state.score);
  const submitted=await call('submit',{attemptId:attempt.id,initials:'ABC',publicConsent:true});assert.equal(submitted.status,200);assert.equal(submitted.data.accepted,true);
  const record=await call('record');assert.equal(record.status,200);assert.equal(record.data.record.initials,'ABC');assert.equal(record.data.record.score,state.score);assert.ok(!JSON.stringify(record.data).includes(attempt.id));assert.ok(!JSON.stringify(record.data).includes(attempt.seed));
  const retry=await call('submit',{attemptId:attempt.id,initials:'ABC',publicConsent:true});assert.deepEqual(retry,submitted);
});
