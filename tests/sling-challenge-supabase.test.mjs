import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSupabaseChallengeService, validateSupabaseChallengeConfig } from '../server/challenge-supabase.mjs';
import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED, createChallengeState, challengeTarget, fireChallengeShot } from '../src/sling-challenge-core.js';

const URL = 'https://jdsjvrynmnzoztfinlzi.supabase.co';
// Explicit dummy test-only value; this is not a credential and never leaves fake fetch.
const SECRET = 'sb_secret_' + 'testonly'.repeat(4), CLIENT = 'a'.repeat(64);
const config = { url: URL, secretKey: SECRET };
const code = expected => error => error.code === expected;
const response = data => Response.json({version:CHALLENGE_RULES.version,...data});
function play(seed, hits = 1) {
  const state = createChallengeState({ seed }), shots = [];
  for (let i=0; i<hits+3; i++) {
    const atMs=200+i*300;
    let direction=[0,1,0];
    if (i<hits) { const v=challengeTarget(state,atMs).position.map((n,j)=>n-CHALLENGE_RULES.cameraOrigin[j]); direction=v.map(n=>n/Math.hypot(...v)); }
    const shot={atMs,heldMs:200,direction};shots.push(shot);fireChallengeShot(state,shot);
  }
  return { shots, endedAtMs:state.activeMs };
}

test('strict modern secret configuration cannot redirect credentials to another origin', () => {
  assert.deepEqual(validateSupabaseChallengeConfig(config),config);
  for(const url of [URL+'/',URL+'/rest/v1',URL+'?x=y',URL+'#x',URL+':443','http://jdsjvrynmnzoztfinlzi.supabase.co',
    'https://evil.test','https://aaaaaaaaaaaaaaaaaaaa.supabase.co','https://jdsjvrynmnzoztfinlzi.supabase.co.evil.test','https://user@jdsjvrynmnzoztfinlzi.supabase.co'])
    assert.throws(()=>validateSupabaseChallengeConfig({...config,url}));
  for(const secretKey of ['',SECRET+'\n','sb_publishable_abc','eyJlegacy','not a key'])
    assert.throws(()=>validateSupabaseChallengeConfig({...config,secretKey}));
});
test('adapter sends apikey only to exact RPC, rejects invalid clients, projects only public record fields', async () => {
  let calls=0;
  const service=createSupabaseChallengeService({...config,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,URL+'/rest/v1/rpc/sling_challenge_rpc');assert.equal(options.headers.apikey,SECRET);
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    assert.deepEqual(JSON.parse(options.body),{p_action:'read',p_input:{version:CHALLENGE_RULES.version},p_client_key:CLIENT});
    return response({record:{initials:'ABC',score:123,hits:1,round:2,activeMs:1100,recordedAt:'2026-10-02T00:00:00Z',seed:'private',id:'private',transcript:'private'}});
  }});
  for(const clientKey of [undefined,'raw.ip',CLIENT.toUpperCase(),'0'.repeat(64)])
    await assert.rejects(service.getRecord({clientKey}),code('invalid_request'));
  assert.equal(calls,0);
  const result=await service.getRecord({clientKey:CLIENT});assert.equal(result.mode,'online');assert.equal(result.recordScope,'global');assert.equal(result.onlineEligible,true);
  assert.equal(result.record.seed,undefined);assert.equal(result.record.id,undefined);assert.equal(result.record.transcript,undefined);
});
test('network, HTTP, parsing, oversized and unexpected upstream errors never expose private detail', async () => {
  for(const fetchImpl of [async()=>{throw new Error(SECRET)},async()=>new Response(SECRET,{status:403}),
    async()=>new Response('not JSON '+SECRET),async()=>response({error:{code:'private_database_name',message:SECRET},status:400}),
    async()=>response({record:{seed:SECRET}}),async()=>new Response('x'.repeat(16385)),
    async()=>Response.json({record:null},{headers:{'Content-Length':'20000'}})]) {
    const service=createSupabaseChallengeService({...config,fetchImpl});
    await assert.rejects(service.getRecord({clientKey:CLIENT}),error=>
      error.code==='server_unavailable'&&!error.message.includes(SECRET));
  }
  const service=createSupabaseChallengeService({...config,fetchImpl:async()=>response({status:429,error:{code:'rate_limited',retryAfterMs:2000,message:SECRET}})});
  await assert.rejects(service.getRecord({clientKey:CLIENT}),error=>error.code==='rate_limited'&&error.details.retryAfterMs===2000&&!error.message.includes(SECRET));
});
test('adapter rejects v1 or unversioned RPC success responses before public projection',async()=>{
  for(const data of [{version:'sling-challenge-v1',record:null},{record:null}]) {
    const service=createSupabaseChallengeService({...config,fetchImpl:async()=>Response.json(data)});
    await assert.rejects(service.getRecord({clientKey:CLIENT}),code('unsupported_version'));
  }
});
test('timeout aborts transport and surfaces safe retryable error without automatic retry', async () => {
  let calls=0;
  const service=createSupabaseChallengeService({...config,timeoutMs:15,fetchImpl:async(url,{signal})=>{
    calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error(SECRET)),{once:true});});
  }});
  // Keep the event loop alive; production HTTP sockets also keep it alive.
  const hold=setTimeout(()=>{},100);
  try{await assert.rejects(service.getRecord({clientKey:CLIENT}),code('server_unavailable'));assert.equal(calls,1);}finally{clearTimeout(hold);}
});

test('Supabase SQL draft executes locally with deny-by-default grants and transactional behavior', async t => {
  // PGlite is a pinned dev dependency. PGLITE_MODULE_PATH optionally locates an already-installed package for local QA.
  const moduleName=process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite';
  const {PGlite}=await import(moduleName);
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  // Simulate permissive old-project defaults to verify explicit object-level revokes.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  const sql=await readFile(new globalThis.URL('../docs/sling-challenge-supabase-setup.draft.sql',import.meta.url),'utf8');
  await db.exec(sql);
  await db.exec('SET ROLE service_role');
  const beforeUpgrade=createSupabaseChallengeService({...config,fetchImpl:async(url,options)=>{
    const p=JSON.parse(options.body);const value=(await db.query('SELECT public.sling_challenge_rpc($1,$2::jsonb,$3) AS result',[p.p_action,JSON.stringify(p.p_input),p.p_client_key])).rows[0].result;
    return Response.json(value);
  }});
  await assert.rejects(beforeUpgrade.getRecord({clientKey:CLIENT}),code('invalid_request'));
  await assert.rejects(beforeUpgrade.createAttempt({clientKey:CLIENT}),code('invalid_request'));
  await db.exec('RESET ROLE');
  await db.exec(await readFile(new globalThis.URL('../docs/sling-challenge-supabase-v2-upgrade.draft.sql',import.meta.url),'utf8'));
  await db.exec("UPDATE sling_challenge.highest_records SET initials='HIS',score=5000,hits=4,round=5,active_ms=5000,recorded_at=clock_timestamp() WHERE rule_version='sling-challenge-v2'");
  await db.exec(await readFile(new globalThis.URL('../supabase/migrations/20261005022356_sling_challenge_top10.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM sling_challenge.ranking_entries')).rows[0].n,0);
  assert.equal((await db.query("SELECT initials FROM sling_challenge.highest_records WHERE rule_version='sling-challenge-v2'")).rows[0].initials,'HIS');
  await db.exec('SET ROLE service_role');
  const rpc=async(action,input={},client=CLIENT)=>(await db.query('SELECT public.sling_challenge_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({version:CHALLENGE_RULES.version,...input}),client])).rows[0].result;
  const admin=async(statement,params=[])=>{await db.exec('RESET ROLE');try{return await db.query(statement,params);}finally{await db.exec('SET ROLE service_role');}};
  const clean=async()=>{await admin('TRUNCATE sling_challenge.attempts,sling_challenge.rate_buckets,sling_challenge.ranking_entries');await admin('UPDATE sling_challenge.highest_records SET initials=NULL,score=0,hits=NULL,round=NULL,active_ms=NULL,recorded_at=NULL');};
  let random=0;
  const calls=[];
  const fetchImpl=async(url,options)=>{assert.equal(url,URL+'/rest/v1/rpc/sling_challenge_rpc');const p=JSON.parse(options.body);calls.push(p);return response(await rpc(p.p_action,p.p_input,p.p_client_key));};
  const service=createSupabaseChallengeService({...config,fetchImpl,randomBytes:n=>Buffer.alloc(n,++random)});
  async function ready(hits=1,client=CLIENT) {
    const {attempt}=await service.createAttempt({clientKey:client});const transcript=play(attempt.seed,hits);
    await admin("UPDATE sling_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attempt.id]);
    const finish=await service.finishAttempt(attempt.id,transcript,{clientKey:client});return{attempt,transcript,finish};
  }
  await t.test('anon and authenticated cannot execute RPC or access any private table; RLS on every table',async()=>{
    for(const role of ['anon','authenticated']) {
      const grants=await admin("SELECT has_function_privilege($1,'public.sling_challenge_rpc(text,jsonb,text)','EXECUTE') AS rpc,has_schema_privilege($1,'sling_challenge','USAGE') AS schema,has_table_privilege($1,'sling_challenge.attempts','SELECT') AS attempts",[role]);
      assert.deepEqual(grants.rows[0],{rpc:false,schema:false,attempts:false});
      await db.exec('SET ROLE '+role);await assert.rejects(rpc('read'),/permission denied/);await assert.rejects(db.query('SELECT * FROM sling_challenge.attempts'),/permission denied/);await db.exec('RESET ROLE; SET ROLE service_role');
    }
    const rows=await admin("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sling_challenge' AND c.relkind='r'");
    assert.equal(rows.rows.length,4);assert.ok(rows.rows.every(row=>row.relrowsecurity));
    const functions=await admin("SELECT p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('sling_challenge_rpc','error') AND n.nspname IN ('public','sling_challenge')");
    assert.equal(functions.rows.length,2);assert.ok(functions.rows.every(row=>!row.prosecdef&&row.proconfig.some(x=>x.startsWith('search_path='))));
    const minimum=await admin("SELECT has_table_privilege('service_role','sling_challenge.highest_records','DELETE') AS deletion,has_table_privilege('service_role','sling_challenge.highest_records','INSERT') AS insertion");
    assert.deepEqual(minimum.rows[0],{deletion:false,insertion:false});
  });
  await t.test('v1 record remains intact and never competes with v2; old version/seed requests fail closed',async()=>{
    await clean();
    await admin("UPDATE sling_challenge.highest_records SET initials='OLD',score=80000,hits=60,round=60,active_ms=60000,recorded_at=clock_timestamp() WHERE rule_version='sling-challenge-v1'");
    assert.equal((await service.getRecord({clientKey:CLIENT})).record,null);
    assert.equal((await rpc('read',{version:'sling-challenge-v1'})).error.code,'unsupported_version');
    const noVersion=(await db.query("SELECT public.sling_challenge_rpc('read','{}'::jsonb,$1) AS result",[CLIENT])).rows[0].result;
    assert.equal(noVersion.error.code,'unsupported_version');
    const wrongSeed=await rpc('issue',{id:'f'.repeat(48),seed:'a'.repeat(32)});assert.equal(wrongSeed.error.code,'invalid_request');
    await admin("INSERT INTO sling_challenge.attempts(id,seed,rule_version,issued_at,expires_at) VALUES($1,repeat('a',32),'sling-challenge-v1',clock_timestamp(),clock_timestamp()+interval '30 minutes')",['f'.repeat(48)]);
    await assert.rejects(service.finishAttempt('f'.repeat(48),{shots:[],endedAtMs:36000},{clientKey:CLIENT}),code('unsupported_version'));
    await assert.rejects(admin("INSERT INTO sling_challenge.attempts(id,seed,rule_version,issued_at,expires_at) VALUES($1,repeat('a',32),'sling-challenge-v2',clock_timestamp(),clock_timestamp()+interval '30 minutes')",['e'.repeat(48)]),/attempts_v2_shared_course_check/);
    const a=await ready(1),b=await service.createAttempt({clientKey:CLIENT});
    assert.equal(a.attempt.seed,CHALLENGE_COURSE_SEED);assert.equal(b.attempt.seed,CHALLENGE_COURSE_SEED);assert.notEqual(a.attempt.id,b.attempt.id);
    const winner=await service.submitRecord(a.attempt.id,{initials:'NEW',publicConsent:true},{clientKey:CLIENT});assert.equal(winner.accepted,true);assert.ok(winner.record.score<80000);
    const old=(await admin("SELECT initials,score FROM sling_challenge.highest_records WHERE rule_version='sling-challenge-v1'")).rows[0];assert.deepEqual(old,{initials:'OLD',score:80000});
    await assert.rejects(admin("UPDATE sling_challenge.highest_records SET score=78301 WHERE rule_version='sling-challenge-v2'"),/highest_records_v2_score_check/);
  });
  await t.test('actual adapter issues DB-timed attempt and rejects premature/future/tampered replay',async()=>{
    await clean();assert.equal((await service.getRecord({clientKey:CLIENT})).record,null);
    const {attempt}=await service.createAttempt({clientKey:CLIENT});assert.equal(attempt.expiresAtMs-attempt.issuedAtMs,1800000);
    const transcript=play(attempt.seed);
    await assert.rejects(service.finishAttempt(attempt.id,transcript,{clientKey:CLIENT}),code('future_timing'));
    await assert.rejects(service.finishAttempt(attempt.id,{...transcript,score:99999},{clientKey:CLIENT}),code('invalid_request'));
    await assert.rejects(service.finishAttempt(attempt.id,{shots:[],endedAtMs:100},{clientKey:CLIENT}),code('attempt_incomplete'));
    const invalid=structuredClone(transcript);invalid.shots[0].direction=[0,0,100];
    await assert.rejects(service.finishAttempt(attempt.id,invalid,{clientKey:CLIENT}),code('invalid_direction'));
    const rates=await admin("SELECT requests FROM sling_challenge.rate_buckets WHERE action='inspect' AND client_key=$1",[CLIENT]);assert.equal(rates.rows[0].requests,3);
  });
  await t.test('atomic finalization and publication are idempotent, changed duplicates reject, projection excludes secrets',async()=>{
    await clean();const q=await ready(2);assert.equal(q.finish.qualifies,true);
    assert.deepEqual(await service.finishAttempt(q.attempt.id,q.transcript,{clientKey:CLIENT}),q.finish);
    const changed=structuredClone(q.transcript);changed.shots[0].heldMs=199;
    await assert.rejects(service.finishAttempt(q.attempt.id,changed,{clientKey:CLIENT}),code('attempt_conflict'));
    const payload={initials:'ABC',publicConsent:true};
    const result=await service.submitRecord(q.attempt.id,payload,{clientKey:CLIENT});assert.equal(result.accepted,true);
    assert.deepEqual(await service.submitRecord(q.attempt.id,payload,{clientKey:CLIENT}),result);
    await assert.rejects(service.submitRecord(q.attempt.id,{...payload,initials:'XYZ'},{clientKey:CLIENT}),code('attempt_conflict'));
    const publicResult=await service.getRecord({clientKey:CLIENT});assert.equal(publicResult.record.score,q.finish.result.score);
    assert.equal(JSON.stringify(publicResult).includes(q.attempt.id),false);assert.equal(JSON.stringify(publicResult).includes(q.attempt.seed),false);
    const lastSubmit=calls.filter(call=>call.p_action==='submit').at(-2);
    const forged=await rpc('submit',{...lastSubmit.p_input,initials:'ZZZ'});assert.equal(forged.error.code,'attempt_conflict');
  });
  await t.test('racing qualifying submissions and tied scores preserve strict highest record',async()=>{
    await clean();const low=await ready(1),high=await ready(4),tie=await ready(4);
    const outcomes=await Promise.all([
      service.submitRecord(high.attempt.id,{initials:'TOP',publicConsent:true},{clientKey:CLIENT}),
      service.submitRecord(low.attempt.id,{initials:'LOW',publicConsent:true},{clientKey:CLIENT}),
      service.submitRecord(tie.attempt.id,{initials:'TIE',publicConsent:true},{clientKey:CLIENT}),
    ]);
    assert.deepEqual(outcomes.map(x=>x.accepted),[true,false,false]);assert.equal(outcomes[1].reason,'record_changed');
    assert.equal((await service.getRecord({clientKey:CLIENT})).record.initials,'TOP');
  });
  await t.test('concurrent changed finalization accepts exactly one immutable result',async()=>{
    await clean();const {attempt}=await service.createAttempt({clientKey:CLIENT});await admin("UPDATE sling_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attempt.id]);
    const a=play(attempt.seed,1),b=structuredClone(a);b.shots[0].heldMs=199;
    const results=await Promise.allSettled([service.finishAttempt(attempt.id,a,{clientKey:CLIENT}),service.finishAttempt(attempt.id,b,{clientKey:CLIENT})]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'attempt_conflict');
  });
  await t.test('DB validates initials/consent independently, zero scores cannot qualify, expiry is enforced',async()=>{
    await clean();const zero=await ready(0);assert.equal(zero.finish.qualifies,false);
    await assert.rejects(service.submitRecord(zero.attempt.id,{initials:'ABC',publicConsent:true},{clientKey:CLIENT}),code('not_qualified'));
    const q=await ready(1);
    for(const initials of ['abC','AB','<b>','한글명'])assert.equal((await rpc('submit',{id:q.attempt.id,initials,publicConsent:true,submissionHash:'b'.repeat(64)})).error.code,'invalid_initials');
    assert.equal((await rpc('submit',{id:q.attempt.id,initials:'ASS',publicConsent:true,submissionHash:'b'.repeat(64)})).error.code,'blocked_initials');
    assert.equal((await rpc('submit',{id:q.attempt.id,initials:'ABC',publicConsent:false,submissionHash:'b'.repeat(64)})).error.code,'public_consent_required');
    await admin("UPDATE sling_challenge.attempts SET issued_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[q.attempt.id]);
    await assert.rejects(service.submitRecord(q.attempt.id,{initials:'ABC',publicConsent:true},{clientKey:CLIENT}),code('attempt_not_found'));
  });
  await t.test('persistent per-client quotas survive service instances and reject malformed calls without rollback',async()=>{
    await clean();const other=createSupabaseChallengeService({...config,fetchImpl,randomBytes:n=>Buffer.alloc(n,++random)});
    for(let i=0;i<8;i++)await(i%2?other:service).createAttempt({clientKey:CLIENT});
    await assert.rejects(other.createAttempt({clientKey:CLIENT}),code('rate_limited'));
    await clean();for(let i=0;i<30;i++)assert.equal((await rpc('inspect',{id:'f'.repeat(48)})).error.code,'attempt_not_found');
    const blocked=await rpc('inspect',{id:'f'.repeat(48)});assert.equal(blocked.status,429);assert.ok(blocked.error.retryAfterMs>0);
  });
  await t.test('bounded TTL cleanup and database table/global-operation caps fail closed',async()=>{
    await clean();
    await admin("INSERT INTO sling_challenge.attempts(id,seed,rule_version,issued_at,expires_at) SELECT lpad(to_hex(i),48,'0'),repeat('a',32),'sling-challenge-v1',clock_timestamp()-interval '31 minutes',clock_timestamp()-interval '1 minute' FROM generate_series(1,100) i");
    await rpc('read');assert.equal((await admin('SELECT count(*)::int AS n FROM sling_challenge.attempts')).rows[0].n,36);
    await clean();await admin("INSERT INTO sling_challenge.attempts(id,seed,rule_version,issued_at,expires_at) SELECT lpad(to_hex(i),48,'0'),repeat('a',32),'sling-challenge-v1',clock_timestamp(),clock_timestamp()+interval '30 minutes' FROM generate_series(1,2048) i");
    await assert.rejects(service.createAttempt({clientKey:CLIENT}),code('server_busy'));
    await clean();await rpc('read');await admin("UPDATE sling_challenge.rate_buckets SET requests=20000 WHERE action='global'");
    assert.equal((await rpc('read')).error.code,'rate_limited');
    await clean();await admin("INSERT INTO sling_challenge.rate_buckets SELECT 'read',lpad(to_hex(i),64,'0'),clock_timestamp(),clock_timestamp()+interval '1 minute',1 FROM generate_series(1,4096) i");
    assert.equal((await rpc('read')).error.code,'server_busy');
  });
  await t.test('top 10 keeps separate submissions, ties prefer earlier acceptance, no backfill or long-lived losers',async()=>{
    await clean();const first=await ready(4);await service.submitRecord(first.attempt.id,{initials:'OLD',publicConsent:true},{clientKey:CLIENT});
    assert.deepEqual((await service.getRecord({clientKey:CLIENT})).entries,[]);
    const submitted=[];
    for(let i=1;i<=11;i++){
      const client=i.toString(16).padStart(64,'0'),q=await ready(1,client);
      assert.equal(q.finish.qualifies,false);assert.equal(q.finish.rankingEligible,true);
      const payload={initials:i<=2?'DUP':`AA${String.fromCharCode(65+i)}`,publicConsent:true,rankingConsent:'top10-v1'};
      const result=await service.submitRecord(q.attempt.id,payload,{clientKey:client});
      assert.equal(result.accepted,i<=10);assert.equal(result.reason,i<=10?'ranked':'outside_top10');
      assert.deepEqual(await service.submitRecord(q.attempt.id,payload,{clientKey:client}),result);
      submitted.push({q,payload,result,client});
    }
    const board=await service.getRecord({clientKey:CLIENT});assert.equal(board.record.initials,'OLD');assert.equal(board.entries.length,10);
    assert.deepEqual(board.entries.map(x=>x.initials),submitted.slice(0,10).map(x=>x.payload.initials));
    assert.ok(board.entries.every(x=>Object.keys(x).sort().join(',')==='initials,score'));
    const higher=await ready(2,'e'.repeat(64));await service.submitRecord(higher.attempt.id,{initials:'NEW',publicConsent:true,rankingConsent:'top10-v1'},{clientKey:'e'.repeat(64)});
    const next=await service.getRecord({clientKey:CLIENT});assert.equal(next.entries[0].initials,'NEW');assert.equal(next.entries.length,10);assert.equal(next.entries.at(-1).initials,submitted[8].payload.initials);
    assert.equal((await admin('SELECT count(*)::int AS n FROM sling_challenge.ranking_entries')).rows[0].n,10);
    // Retry of a displaced entry is acknowledged without reinserting it.
    const displaced=submitted[9];assert.deepEqual(await service.submitRecord(displaced.q.attempt.id,displaced.payload,{clientKey:displaced.client}),displaced.result);
    assert.equal((await service.getRecord({clientKey:CLIENT})).entries.length,10);
    await admin("UPDATE sling_challenge.attempts SET issued_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute'");
    await service.getRecord({clientKey:CLIENT});assert.equal((await admin('SELECT count(*)::int AS n FROM sling_challenge.attempts')).rows[0].n,0);
    assert.equal((await admin('SELECT count(*)::int AS n FROM sling_challenge.ranking_entries')).rows[0].n,10);
  });
  await t.test('ranked consent, verification, idempotency and permission boundaries fail closed',async()=>{
    await clean();const q=await ready(1),payload={initials:'ABC',publicConsent:true,rankingConsent:'top10-v1'};
    for(const rankingConsent of [null,false,'','top10-v2'])await assert.rejects(service.submitRecord(q.attempt.id,{...payload,rankingConsent},{clientKey:CLIENT}),code('public_consent_required'));
    await assert.rejects(service.submitRecord(q.attempt.id,{...payload,score:78300},{clientKey:CLIENT}),code('public_consent_required'));
    assert.equal((await rpc('submit',{id:q.attempt.id,...payload,rankingConsent:null,submissionHash:'b'.repeat(64)})).error.code,'public_consent_required');
    const concurrent=await Promise.all([service.submitRecord(q.attempt.id,payload,{clientKey:CLIENT}),service.submitRecord(q.attempt.id,payload,{clientKey:CLIENT})]);assert.deepEqual(concurrent[0],concurrent[1]);
    assert.equal((await service.getRecord({clientKey:CLIENT})).entries.length,1);
    await assert.rejects(service.submitRecord(q.attempt.id,{...payload,initials:'XYZ'},{clientKey:CLIENT}),code('attempt_conflict'));
    await assert.rejects(service.submitRecord(q.attempt.id,{initials:'ABC',publicConsent:true},{clientKey:CLIENT}),code('attempt_conflict'));
    const zero=await ready(0);assert.equal(zero.finish.rankingEligible,false);await assert.rejects(service.submitRecord(zero.attempt.id,payload,{clientKey:CLIENT}),code('not_qualified'));
    const unverified=await service.createAttempt({clientKey:CLIENT});await assert.rejects(service.submitRecord(unverified.attempt.id,payload,{clientKey:CLIENT}),code('attempt_unverified'));
    for(const role of ['anon','authenticated']){
      const rights=await admin("SELECT has_table_privilege($1,'sling_challenge.ranking_entries','SELECT') AS read,has_sequence_privilege($1,'sling_challenge.ranking_entries_entry_order_seq','USAGE') AS sequence",[role]);assert.deepEqual(rights.rows[0],{read:false,sequence:false});
    }
    const columns=(await admin("SELECT column_name FROM information_schema.columns WHERE table_schema='sling_challenge' AND table_name='ranking_entries' ORDER BY ordinal_position")).rows.map(x=>x.column_name);
    assert.deepEqual(columns,['entry_order','rule_version','initials','score','consent_version']);
  });

});

test('ranking projection rejects malformed or oversized boards and strips private fields',async()=>{
  const good={initials:'ABC',score:123};
  for(const extra of [{rankingVersion:'wrong',entries:[]},{rankingVersion:'top10-v1',entries:Array(11).fill(good)},{rankingVersion:'top10-v1',entries:[{initials:['ABC'],score:123}]},{rankingVersion:'top10-v1',entries:[good,{...good,score:124}]},{entries:[]}]){
    const service=createSupabaseChallengeService({...config,fetchImpl:async()=>response({record:null,...extra})});await assert.rejects(service.getRecord({clientKey:CLIENT}),code('server_unavailable'));
  }
  const service=createSupabaseChallengeService({...config,fetchImpl:async()=>response({record:null,rankingVersion:'top10-v1',entries:[{...good,entry_order:7,client_key:'private',attemptId:'private'}]})});
  assert.deepEqual((await service.getRecord({clientKey:CLIENT})).entries,[good]);
});
