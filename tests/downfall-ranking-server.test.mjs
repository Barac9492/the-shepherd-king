import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createBattle,beginNextWave} from '../src/downfall-core.js';
import {DOWNFALL_RANKING,applyRankingFrame,createRankingRecorder,packRankingInput,replayDownfallRanking} from '../src/downfall-ranking-core.js';
import {createDownfallService} from '../server/downfall-ranking-service.mjs';
import {createDownfallHandler} from '../server/downfall-ranking-http.mjs';

const [migration,slingV1,slingV2,slingTop10,sideTop10]=await Promise.all([
  '../supabase/migrations/20261006213000_downfall_top10.sql','../docs/sling-challenge-supabase-setup.draft.sql',
  '../docs/sling-challenge-supabase-v2-upgrade.draft.sql','../supabase/migrations/20261005022356_sling_challenge_top10.sql',
  '../supabase/migrations/20261005074002_dance_engedi_top10.sql',
].map(file=>readFile(new globalThis.URL(file,import.meta.url),'utf8')));
const SUPABASE_URL='https://jdsjvrynmnzoztfinlzi.supabase.co';
const SECRET='sb_secret_'+'testonly'.repeat(4),KEY='a'.repeat(64),VERSION=DOWNFALL_RANKING.version;
const env={VERCEL:'1',DOWNFALL_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:'https://game.example',CHALLENGE_SUPABASE_URL:SUPABASE_URL,CHALLENGE_SUPABASE_SECRET_KEY:SECRET};
const code=expected=>error=>error.code===expected;

async function setup(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  await db.exec(migration);return db;
}
async function rpc(db,action,input={},key=KEY){
  await db.exec('SET ROLE service_role');
  const value=(await db.query('SELECT public.downfall_challenge_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({...input,version:VERSION}),key])).rows[0].result;
  await db.exec('RESET ROLE');return value;
}
const id=n=>n.toString(16).padStart(48,'0');
const client=n=>n.toString(16).padStart(64,'a');
const result=(score=1000,activeMs=1000)=>({score,kills:Math.min(10,score?1:0),wave:1,activeMs,maxCombo:Math.min(1,score?1:0),shots:score?1:0,hits:score?1:0});
async function verify(db,n,score=1000,key=client(n)){
  const attempt=id(n);assert.equal((await rpc(db,'issue',{id:attempt},key)).id,attempt);
  await db.query("UPDATE downfall_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attempt]);
  const done=await rpc(db,'finalize',{id:attempt,result:result(score),transcriptHash:n.toString(16).padStart(64,'b')},key);
  assert.equal(done.verified,true);return{attempt,key};
}
function makeTrace({positive=false}={}){
  const state=createBattle(DOWNFALL_RANKING.seed),recorder=createRankingRecorder();
  while(state.phase!=='grace'&&!recorder.limited){
    if(state.phase==='intermission'){assert.equal(recorder.nextWave(),true);assert.equal(beginNextWave(state),true);continue;}
    const p=state.player,target=positive?[...state.enemies].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]:null;
    const angle=state.time*.43,input=positive?{moveX:Math.cos(angle)*10-p.x,moveZ:Math.sin(angle)*10-p.z,aimX:(target?.x??0)-p.x,aimZ:(target?.z??0)-p.z,firing:!!target}:{};
    const packed=packRankingInput(input,false);assert.equal(recorder.record(packed),true);applyRankingFrame(state,packed);
  }
  assert.equal(state.phase,'grace');return recorder.transcript();
}

let cachedPositive;
const positiveTrace=()=>cachedPositive??=(makeTrace({positive:true}));

test('additive migration preserves actual Sling, Dance and En-Gedi schemas/functions/rows and denies public access',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  for(const sql of [slingV1,slingV2,slingTop10,sideTop10])await db.exec(sql);
  await db.exec("INSERT INTO sling_challenge.ranking_entries(rule_version,initials,score,consent_version) VALUES('sling-challenge-v2','OLD',123,'top10-v1');INSERT INTO dance_challenge.ranking_entries(initials,metric,consent_version) VALUES('DAN',900,'dance-side-top10-v1');INSERT INTO engedi_challenge.ranking_entries(initials,metric,consent_version) VALUES('ENG',2500,'engedi-side-top10-v1');");
  const beforeFunctions=(await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('sling_challenge_rpc','dance_challenge_rpc','engedi_challenge_rpc') ORDER BY p.proname")).rows;
  const beforeRows={sling:(await db.query('SELECT rule_version,initials,score,consent_version FROM sling_challenge.ranking_entries')).rows,dance:(await db.query('SELECT initials,metric,consent_version FROM dance_challenge.ranking_entries')).rows,engedi:(await db.query('SELECT initials,metric,consent_version FROM engedi_challenge.ranking_entries')).rows};
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('sling_challenge_rpc','dance_challenge_rpc','engedi_challenge_rpc') ORDER BY p.proname")).rows,beforeFunctions);
  assert.deepEqual((await db.query('SELECT rule_version,initials,score,consent_version FROM sling_challenge.ranking_entries')).rows,beforeRows.sling);
  assert.deepEqual((await db.query('SELECT initials,metric,consent_version FROM dance_challenge.ranking_entries')).rows,beforeRows.dance);
  assert.deepEqual((await db.query('SELECT initials,metric,consent_version FROM engedi_challenge.ranking_entries')).rows,beforeRows.engedi);
  const deniedDml={
    attempts:{insert:`INSERT INTO downfall_challenge.attempts(id,client_key,version,issued_at,expires_at) VALUES('${'f'.repeat(48)}','${'f'.repeat(64)}','${VERSION}',clock_timestamp(),clock_timestamp()+interval '1 hour')`,update:'UPDATE downfall_challenge.attempts SET invalid=true',delete:'DELETE FROM downfall_challenge.attempts'},
    rate_buckets:{insert:`INSERT INTO downfall_challenge.rate_buckets VALUES('read','${'f'.repeat(64)}',clock_timestamp()+interval '1 minute',1)`,update:'UPDATE downfall_challenge.rate_buckets SET requests=requests+1',delete:'DELETE FROM downfall_challenge.rate_buckets'},
    ranking_entries:{insert:`INSERT INTO downfall_challenge.ranking_entries(recorded_at,initials,score,consent_version) VALUES(clock_timestamp(),'DEN',1,'${VERSION}')`,update:'UPDATE downfall_challenge.ranking_entries SET score=score+1',delete:'DELETE FROM downfall_challenge.ranking_entries'},
  };
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query(`SELECT public.downfall_challenge_rpc('read','{"version":"${VERSION}"}'::jsonb,'${KEY}')`),/permission denied/);
    for(const table of Object.keys(deniedDml)){
      await assert.rejects(db.query(`SELECT * FROM downfall_challenge.${table}`),/permission denied/);
      for(const statement of Object.values(deniedDml[table]))await assert.rejects(db.query(statement),/permission denied/);
    }
    await db.exec('RESET ROLE');
  }
  const rows=(await db.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='downfall_challenge' AND c.relkind='r'")).rows;
  assert.equal(rows.length,3);assert.ok(rows.every(row=>row.relrowsecurity));
});

test('SQL binds attempts to client/version/expiry, supports invalidation, and permits idempotent finalize/submit only',async t=>{
  const db=await setup(t),{attempt,key}=await verify(db,1,1200);
  const finish={id:attempt,result:result(1200),transcriptHash:'1'.padStart(64,'b')};
  assert.equal((await rpc(db,'finalize',finish,key)).verified,true);
  assert.equal((await rpc(db,'finalize',{...finish,transcriptHash:'f'.repeat(64)},key)).error.code,'attempt_conflict');
  const publish={id:attempt,initials:'ABC',publicConsent:true,rankingConsent:VERSION,submissionHash:'e'.repeat(64)};
  const first=await rpc(db,'submit',publish,key);assert.equal(first.ranked,true);assert.deepEqual(await rpc(db,'submit',publish,key),first);
  assert.equal((await rpc(db,'submit',{...publish,submissionHash:'d'.repeat(64)},key)).error.code,'attempt_conflict');
  assert.equal((await rpc(db,'inspect',{id:attempt},'c'.repeat(64))).error.code,'attempt_not_found');
  const fresh=await verify(db,2,900);assert.equal((await rpc(db,'invalidate',{id:fresh.attempt},fresh.key)).mode,'downfall');
  assert.equal((await rpc(db,'finalize',{id:fresh.attempt,result:result(900),transcriptHash:'2'.repeat(64)},fresh.key)).error.code,'attempt_invalid');
  const expired=id(3);await rpc(db,'issue',{id:expired},client(3));await db.query("UPDATE downfall_challenge.attempts SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired]);
  assert.equal((await rpc(db,'inspect',{id:expired},client(3))).error.code,'attempt_expired');
});

test('atomic duplicate finalize/publish retries on one PGlite connection produce one immutable ranking row',async t=>{
  const db=await setup(t),attempt=id(9),key=client(9);await rpc(db,'issue',{id:attempt},key);
  await db.query("UPDATE downfall_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attempt]);
  await db.exec('SET ROLE service_role');
  const direct=(action,input)=>db.query('SELECT public.downfall_challenge_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({...input,version:VERSION}),key]).then(value=>value.rows[0].result);
  const finish={id:attempt,result:result(1400),transcriptHash:'9'.repeat(64)};
  const finishes=await Promise.all([direct('finalize',finish),direct('finalize',finish)]);assert.deepEqual(finishes[0],finishes[1]);
  const publish={id:attempt,initials:'ONE',publicConsent:true,rankingConsent:VERSION,submissionHash:'8'.repeat(64)};
  const submits=await Promise.all([direct('submit',publish),direct('submit',publish)]);assert.deepEqual(submits[0],submits[1]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM downfall_challenge.ranking_entries')).rows[0].n,1);
  assert.deepEqual((await rpc(db,'read')).entries,[{rank:1,initials:'ONE',score:1400}]);
});

test('zero is verified but unranked; limits reject malformed results and persistent quotas/pending attempts',async t=>{
  const db=await setup(t),zero=await verify(db,10,0);
  assert.equal((await rpc(db,'submit',{id:zero.attempt,initials:'ZER',publicConsent:true,rankingConsent:VERSION,submissionHash:'0'.repeat(64)},zero.key)).error.code,'not_qualified');
  const bad=id(11),badKey=client(11);await rpc(db,'issue',{id:bad},badKey);await db.query("UPDATE downfall_challenge.attempts SET issued_at=issued_at-interval '1 hour' WHERE id=$1",[bad]);
  for(const candidate of [{...result(),score:32400001},{...result(),hits:216001},{...result(),wave:10001},{...result(),extra:1}])
    assert.equal((await rpc(db,'finalize',{id:bad,result:candidate,transcriptHash:'a'.repeat(64)},badKey)).error.code,'invalid_result');
  const pendingKey='c'.repeat(64);for(let n=20;n<24;n++)assert.equal((await rpc(db,'issue',{id:id(n)},pendingKey)).id,id(n));
  assert.equal((await rpc(db,'issue',{id:id(24)},pendingKey)).error.code,'rate_limited');
  await db.exec(`UPDATE downfall_challenge.rate_buckets SET requests=120 WHERE action='read' AND client_key='${KEY}'`);
  if(!(await db.query(`SELECT count(*)::int AS n FROM downfall_challenge.rate_buckets WHERE action='read' AND client_key='${KEY}'`)).rows[0].n)
    await db.exec(`INSERT INTO downfall_challenge.rate_buckets VALUES('read','${KEY}',clock_timestamp()+interval '1 minute',120)`);
  assert.equal((await rpc(db,'read')).error.code,'rate_limited');
});

test('Top 10 is score-descending, first timestamp wins cutoff ties, and ranks are competition ranks',async t=>{
  const db=await setup(t);
  for(let n=100;n<112;n++){
    const score=n<103?1000:900,{attempt,key}=await verify(db,n,score);
    const submitted=await rpc(db,'submit',{id:attempt,initials:'A'+String.fromCharCode(65+Math.floor((n-100)/26))+String.fromCharCode(65+(n-100)%26),publicConsent:true,rankingConsent:VERSION,submissionHash:n.toString(16).padStart(64,'e')},key);
    assert.equal(submitted.ranked,n<110);
  }
  const entries=(await rpc(db,'read')).entries;
  assert.equal(entries.length,10);assert.deepEqual(entries.map(entry=>entry.rank),[1,1,1,4,4,4,4,4,4,4]);
  assert.deepEqual(entries.map(entry=>entry.score),[1000,1000,1000,900,900,900,900,900,900,900]);
  assert.equal(entries.at(-1).initials,'AAJ');
});

test('service uses exact server-only RPC transport, replays instead of accepting score, and projects public fields only',async()=>{
  const calls=[];
  const service=createDownfallService({url:SUPABASE_URL,secretKey:SECRET,fetchImpl:async(url,options)=>{
    assert.equal(url,SUPABASE_URL+'/rest/v1/rpc/downfall_challenge_rpc');assert.equal(options.headers.apikey,SECRET);assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    const p=JSON.parse(options.body);calls.push(p);
    if(p.p_action==='read')return Response.json({mode:'downfall',version:VERSION,entries:[{rank:1,initials:'ABC',score:1200,attemptId:'private'}],private:'hidden'});
    if(p.p_action==='issue')return Response.json({mode:'downfall',version:VERSION,id:p.p_input.id,expiresAt:'private'});
    return Response.json({mode:'downfall',version:VERSION,verified:true,ranked:true,private:'hidden'});
  }});
  assert.deepEqual(await service.read(KEY),{mode:'downfall',version:VERSION,entries:[{rank:1,initials:'ABC',score:1200}]});
  const issued=await service.issue(KEY);assert.match(issued.attemptId,/^[a-f0-9]{48}$/);assert.equal(issued.seed,123);
  const trace=makeTrace();const finished=await service.finish(issued.attemptId,trace,KEY);assert.equal(finished.result.score,0);
  await assert.rejects(service.finish(issued.attemptId,{...trace,score:999999},KEY),code('invalid_result'));
  assert.deepEqual(await service.submit(issued.attemptId,{initials:'ABC',publicConsent:true,rankingConsent:VERSION},KEY),{mode:'downfall',version:VERSION,accepted:true,ranked:true});
  assert.deepEqual(await service.invalidate(issued.attemptId,KEY),{mode:'downfall',version:VERSION,invalidated:true});
  assert.ok(calls.every(call=>call.p_client_key===KEY&&!JSON.stringify(call).includes('private')));
});

test('service rejects wrong project, invalid upstream projections, oversized/private errors, and bad client keys without leakage',async()=>{
  assert.throws(()=>createDownfallService({url:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',secretKey:SECRET}));
  for(const response of [Response.json({mode:'downfall',version:VERSION,entries:[{rank:2,initials:'ABC',score:10}]}),new Response(SECRET,{status:500}),new Response('x'.repeat(16385),{headers:{'content-type':'application/json'}})]){
    const service=createDownfallService({url:SUPABASE_URL,secretKey:SECRET,fetchImpl:async()=>response});
    await assert.rejects(service.read(KEY),error=>error.code==='service_unavailable'&&!error.message.includes(SECRET));
  }
  const untouched=createDownfallService({url:SUPABASE_URL,secretKey:SECRET,fetchImpl:async()=>{throw new Error('called');}});
  await assert.rejects(untouched.read('raw-ip'),code('invalid_request'));
});

function mockHttp(action,{serviceFactory,customEnv=env,now}={}){return createDownfallHandler(action,{env:customEnv,serviceFactory,now});}
function request(action,body,headers={},url=env.CHALLENGE_ALLOWED_ORIGIN){return new Request(`${url}/api/downfall-challenge/${action}`,{method:body===undefined?'GET':'POST',headers:{'x-vercel-forwarded-for':'203.0.113.20',...(body===undefined?{}:{origin:env.CHALLENGE_ALLOWED_ORIGIN,'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}

test('HTTP guards flag, method, exact origin/IP, JSON/body cap and strips attempt capability from service input',async()=>{
  const calls=[],factory=()=>({read:async key=>(calls.push(['read',key]),{mode:'downfall',version:VERSION,entries:[]}),issue:async key=>(calls.push(['issue',key]),{mode:'downfall',version:VERSION,attemptId:id(1),seed:123}),finish:async(...args)=>(calls.push(['finish',...args]),{mode:'downfall',version:VERSION,result:result()}),submit:async(...args)=>(calls.push(['submit',...args]),{mode:'downfall',version:VERSION,accepted:true,ranked:true}),invalidate:async(...args)=>(calls.push(['invalidate',...args]),{mode:'downfall',version:VERSION,invalidated:true})});
  assert.equal((await mockHttp('record',{serviceFactory:factory,customEnv:{}})(request('record'))).status,503);
  assert.equal((await mockHttp('record',{serviceFactory:factory})(request('record',{}))).status,405);
  for(const bad of [request('attempts',{}, {origin:'https://evil.example'}),request('attempts',{}, {origin:''}),request('attempts',{}, {'sec-fetch-site':'cross-site'}),request('attempts',{}, {'x-vercel-forwarded-for':'invalid'}),request('attempts',{}, {},'https://other.example')])
    assert.ok([403,503].includes((await mockHttp('attempts',{serviceFactory:factory})(bad)).status));
  assert.equal((await mockHttp('attempts',{serviceFactory:factory})(request('attempts',{seed:123}))).status,400);
  assert.equal((await mockHttp('attempts',{serviceFactory:factory})(request('attempts',{}, {'content-length':String(2*1024*1024+1)}))).status,413);
  assert.equal((await mockHttp('attempts',{serviceFactory:factory})(request('attempts',{}, {'content-type':'text/plain'}))).status,415);
  const malformed=new Request(env.CHALLENGE_ALLOWED_ORIGIN+'/api/downfall-challenge/attempts',{method:'POST',headers:{origin:env.CHALLENGE_ALLOWED_ORIGIN,'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.20'},body:'{bad'});
  assert.equal((await mockHttp('attempts',{serviceFactory:factory})(malformed)).status,400);
  assert.equal((await mockHttp('record',{serviceFactory:factory})(new Request(env.CHALLENGE_ALLOWED_ORIGIN+'/api/downfall-challenge/record?debug=1',{headers:{'x-vercel-forwarded-for':'203.0.113.20'}}))).status,403);
  for(const action of ['attempts','finish','submit','invalidate']){
    const withQuery=new Request(`${env.CHALLENGE_ALLOWED_ORIGIN}/api/downfall-challenge/${action}?debug=1`,{method:'POST',headers:{origin:env.CHALLENGE_ALLOWED_ORIGIN,'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.20'},body:JSON.stringify(action==='attempts'?{}:{attemptId:id(7)})});
    assert.equal((await mockHttp(action,{serviceFactory:factory})(withQuery)).status,403);
  }
  const attempt=id(8),payload={attemptId:attempt,version:VERSION,segments:[[1,0,0,0,0,0]]};
  assert.equal((await mockHttp('finish',{serviceFactory:factory})(request('finish',payload))).status,200);
  const finishCall=calls.find(call=>call[0]==='finish');assert.equal(finishCall[1],attempt);assert.deepEqual(finishCall[2],{version:VERSION,segments:[[1,0,0,0,0,0]]});assert.match(finishCall[3],/^[a-f0-9]{64}$/);
  assert.equal((await mockHttp('invalidate',{serviceFactory:factory})(request('invalidate',{attemptId:attempt,extra:true}))).status,400);
});

test('HTTP errors expose only codes and stable daily HMAC keys, never backend messages or secrets',async()=>{
  let firstKey,secondKey;
  const factory=()=>({read:async key=>{if(!firstKey)firstKey=key;else secondKey=key;throw new Error(SECRET);}});
  const handler=mockHttp('record',{serviceFactory:factory,now:()=>Date.UTC(2026,9,6)});
  const one=await handler(request('record')),two=await handler(request('record'));
  assert.equal(one.status,503);assert.deepEqual(await one.json(),{error:{code:'service_unavailable'}});assert.ok(!(await two.text()).includes(SECRET));assert.equal(firstKey,secondKey);assert.match(firstKey,/^[a-f0-9]{64}$/);assert.ok(!firstKey.includes('203.0.113.20'));
});

test('full HTTP to service to PGlite persists a replay-derived positive score with consent and idempotent retry',async t=>{
  const db=await setup(t);
  const factory=config=>createDownfallService({...config,fetchImpl:async(_url,options)=>{
    const p=JSON.parse(options.body),value=await rpc(db,p.p_action,Object.fromEntries(Object.entries(p.p_input).filter(([key])=>key!=='version')),p.p_client_key);
    return Response.json(value);
  }});
  const call=async(action,body)=>{const response=await createDownfallHandler(action,{env,serviceFactory:factory})(request(action,body));return{status:response.status,data:await response.json()};};
  const issued=await call('attempts',{});assert.equal(issued.status,201);const attempt=issued.data.attemptId,trace=positiveTrace(),derived=replayDownfallRanking(trace);assert.ok(derived.score>0);
  await db.query("UPDATE downfall_challenge.attempts SET issued_at=issued_at-($2::text||' milliseconds')::interval WHERE id=$1",[attempt,derived.activeMs+2000]);
  const finished=await call('finish',{attemptId:attempt,...trace});assert.equal(finished.status,200);assert.deepEqual(finished.data.result,derived);
  const publish={attemptId:attempt,initials:'WIN',publicConsent:true,rankingConsent:VERSION};
  const submitted=await call('submit',publish);assert.equal(submitted.status,200);assert.equal(submitted.data.ranked,true);assert.deepEqual(await call('submit',publish),submitted);
  assert.deepEqual((await call('record')).data.entries,[{rank:1,initials:'WIN',score:derived.score}]);
  assert.ok(!JSON.stringify((await call('record')).data).includes(attempt));
});
