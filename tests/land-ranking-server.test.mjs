import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createLandService,LAND_VERSION as VERSION,LAND_ACTS as ACTS} from '../server/land-ranking-service.mjs';
import {createLandHandler} from '../server/land-ranking-http.mjs';
const migration=await readFile(new URL('../supabase/migrations/20261009040000_land_top10.sql',import.meta.url),'utf8');
const URL_BASE='https://jdsjvrynmnzoztfinlzi.supabase.co',SECRET='sb_secret_'+'testonly'.repeat(4),KEY='a'.repeat(64);
const env={VERCEL:'1',LAND_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:'https://game.example',CHALLENGE_SUPABASE_URL:URL_BASE,CHALLENGE_SUPABASE_SECRET_KEY:SECRET};
const id=n=>n.toString(16).padStart(48,'0'),client=n=>n.toString(16).padStart(64,'a'),hash=n=>n.toString(16).padStart(64,'b');
const code=expected=>error=>error.code===expected;
const result=(score=100,activeMs=1000)=>({score,activeMs});
async function setup(t){const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');await db.exec(migration);return db;}
async function rpc(db,action,input={},key=KEY,act='adullam'){
  await db.exec('SET ROLE service_role');
  try{return(await db.query('SELECT public.land_challenge_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({version:VERSION,act,...input}),key])).rows[0].result;}finally{await db.exec('RESET ROLE');}
}
async function verify(db,n,score=100,act='adullam'){
  const attempt=id(n),key=client(n);assert.equal((await rpc(db,'issue',{id:attempt},key,act)).id,attempt);
  await db.query("UPDATE land_challenge.attempts SET issued_at=issued_at-interval '30 minutes' WHERE id=$1",[attempt]);
  const verified=result(score,act==='hebron'?score*100:1000);
  assert.equal((await rpc(db,'finalize',{id:attempt,result:verified,transcriptHash:hash(n)},key,act)).verified,true);
  return{attempt,key,verified};
}
const publish=(attempt,n,initials='ABC')=>({id:attempt,initials,publicConsent:true,rankingConsent:VERSION,submissionHash:hash(n)});

test('migration is isolated, RLS enabled, and public roles denied all table/RPC access',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  const legacy=await readFile(new URL('../supabase/migrations/20261006213000_downfall_top10.sql',import.meta.url),'utf8');await db.exec(legacy);
  await db.exec("INSERT INTO downfall_challenge.ranking_entries(recorded_at,initials,score,consent_version) VALUES(clock_timestamp(),'OLD',100,'downfall-top10-v1')");
  const before=(await db.query("SELECT pg_get_functiondef('public.downfall_challenge_rpc(text,jsonb,text)'::regprocedure) AS body")).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT pg_get_functiondef('public.downfall_challenge_rpc(text,jsonb,text)'::regprocedure) AS body")).rows,before);
  assert.equal((await db.query('SELECT initials FROM downfall_challenge.ranking_entries')).rows[0].initials,'OLD');
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT public.land_challenge_rpc($1,$2::jsonb,$3)',['read',JSON.stringify({act:'adullam',version:VERSION}),KEY]),/permission denied/);
    for(const table of ['attempts','ranking_entries','rate_buckets']){
      for(const sql of [`SELECT * FROM land_challenge.${table}`,`DELETE FROM land_challenge.${table}`,`INSERT INTO land_challenge.${table} DEFAULT VALUES`])await assert.rejects(db.query(sql),/permission denied/);
    }
    await assert.rejects(db.query('UPDATE land_challenge.attempts SET invalid=true'),/permission denied/);
    await assert.rejects(db.query('UPDATE land_challenge.ranking_entries SET score=1'),/permission denied/);
    await assert.rejects(db.query('UPDATE land_challenge.rate_buckets SET requests=1'),/permission denied/);
    await db.exec('RESET ROLE');
  }
  const rows=(await db.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='land_challenge' AND c.relkind='r'")).rows;
  assert.equal(rows.length,3);assert.ok(rows.every(row=>row.relrowsecurity));
});

test('five independent Top10s use descending score except ascending Hebron, shared ranks and earliest cutoff ties',async t=>{
  const db=await setup(t);
  for(let a=0;a<ACTS.length;a++){
    const act=ACTS[a];
    for(let n=0;n<12;n++){
      const score=act==='hebron'?(n<3?10:20):(n<3?100:90),serial=100+a*20+n;
      const v=await verify(db,serial,score,act);
      const response=await rpc(db,'submit',publish(v.attempt,serial,'AA'+String.fromCharCode(65+n)),v.key,act);
      assert.equal(response.ranked,n<10);
    }
    const read=await rpc(db,'read',{},KEY,act);
    assert.equal(read.act,act);assert.equal(read.entries.length,10);assert.deepEqual(read.entries.map(e=>e.rank),[1,1,1,4,4,4,4,4,4,4]);
    assert.equal(read.entries[0].score,act==='hebron'?10:100);assert.equal(read.entries.at(-1).initials,'AAJ');
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM land_challenge.ranking_entries')).rows[0].n,50);
});

test('client/act binding, expiry, invalidation, consent and immutable idempotent finish/submit',async t=>{
  const db=await setup(t),v=await verify(db,1,100);
  const finish={id:v.attempt,result:v.verified,transcriptHash:hash(1)};
  assert.equal((await rpc(db,'finalize',finish,v.key)).verified,true);
  assert.equal((await rpc(db,'finalize',{...finish,result:result(90)},v.key)).error.code,'attempt_conflict');
  for(const action of ['inspect','invalidate','finalize','submit'])assert.equal((await rpc(db,action,{...finish,...(action==='submit'?publish(v.attempt,1):{})},v.key,'temple')).error.code,'attempt_not_found');
  assert.equal((await rpc(db,'inspect',{id:v.attempt},client(2))).error.code,'attempt_not_found');
  for(const consent of [{publicConsent:false},{rankingConsent:'old'},{publicConsent:'true'}])assert.equal((await rpc(db,'submit',{...publish(v.attempt,1),...consent},v.key)).error.code,'public_consent_required');
  assert.equal((await rpc(db,'submit',publish(v.attempt,1,'ASS'),v.key)).error.code,'blocked_initials');
  const first=await rpc(db,'submit',publish(v.attempt,1),v.key);assert.equal(first.ranked,true);assert.deepEqual(await rpc(db,'submit',publish(v.attempt,1),v.key),first);
  assert.equal((await rpc(db,'submit',publish(v.attempt,2),v.key)).error.code,'attempt_conflict');
  const second=await verify(db,2);await rpc(db,'invalidate',{id:second.attempt},second.key);
  assert.equal((await rpc(db,'inspect',{id:second.attempt},second.key)).error.code,'attempt_invalid');
  await db.query("UPDATE land_challenge.attempts SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[v.attempt]);
  assert.equal((await rpc(db,'inspect',{id:v.attempt},v.key)).error.code,'attempt_expired');
});

test('database rejects malformed/per-act bounds, forged future clocks, unverified and zero scores',async t=>{
  const db=await setup(t);
  for(let n=0;n<ACTS.length;n++){
    const act=ACTS[n],attempt=id(10+n),key=client(10+n);await rpc(db,'issue',{id:attempt},key,act);
    const cap=act==='temple'?100:act==='hebron'?18000:10000;
    for(const candidate of [result(cap+1),result(-1),result(1,1800001),result(1,-1),result(1.5),{...result(),extra:1},{score:1},result('1')]){
      assert.equal((await rpc(db,'finalize',{id:attempt,result:candidate,transcriptHash:hash(n)},key,act)).error.code,'invalid_result');
    }
    assert.equal((await rpc(db,'finalize',{id:attempt,result:result(100,100000),transcriptHash:hash(n)},key,act)).error.code,'future_timing');
    assert.equal((await rpc(db,'submit',publish(attempt,n),key,act)).error.code,'attempt_unverified');
  }
  const zero=await verify(db,30,0);assert.equal((await rpc(db,'submit',publish(zero.attempt,30),zero.key)).error.code,'not_qualified');
  const badHebron=await rpc(db,'finalize',{id:id(13),result:result(100,1),transcriptHash:hash(1)},client(13),'hebron');assert.equal(badHebron.error.code,'invalid_result');
  assert.equal((await rpc(db,'read',{},KEY,'unknown')).error.code,'invalid_request');
  assert.equal((await rpc(db,'read',{version:'old'})).error.code,'unsupported_version');
});

test('serialized duplicate retries produce one row; quota, pending and table caps fail closed',async t=>{
  const db=await setup(t),v=await verify(db,50);
  await db.exec('SET ROLE service_role');
  const direct=(action,input)=>db.query('SELECT public.land_challenge_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({version:VERSION,act:'adullam',...input}),v.key]).then(r=>r.rows[0].result);
  const finish={id:v.attempt,result:v.verified,transcriptHash:hash(50)};
  const finishes=await Promise.all([direct('finalize',finish),direct('finalize',finish)]);assert.deepEqual(...finishes);
  const submits=await Promise.all([direct('submit',publish(v.attempt,50)),direct('submit',publish(v.attempt,50))]);assert.deepEqual(...submits);
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM land_challenge.ranking_entries')).rows[0].n,1);
  for(let n=60;n<64;n++)assert.equal((await rpc(db,'issue',{id:id(n)},KEY,ACTS[n-60])).id,id(n));
  assert.equal((await rpc(db,'issue',{id:id(64)},KEY,'temple')).error.code,'rate_limited');
  await db.query("INSERT INTO land_challenge.rate_buckets VALUES('read',$1,clock_timestamp()+interval '1 minute',120)",[KEY]);
  assert.equal((await rpc(db,'read')).error.code,'rate_limited');
  await db.exec("UPDATE land_challenge.rate_buckets SET requests=20000 WHERE action='global'");
  assert.equal((await rpc(db,'read',{},client(123),'temple')).error.code,'rate_limited');
  await db.exec("UPDATE land_challenge.rate_buckets SET requests=1 WHERE action='global'; INSERT INTO land_challenge.attempts(id,client_key,version,act,issued_at,expires_at) SELECT 'f'||lpad(to_hex(n),47,'0'),repeat('e',64),'land-top10-v1','adullam',clock_timestamp(),clock_timestamp()+interval '1 hour' FROM generate_series(1,2048) n");
  assert.equal((await rpc(db,'issue',{id:id(9999)},client(9999))).error.code,'server_busy');
  await db.exec("INSERT INTO land_challenge.rate_buckets SELECT 'fixture','e'||lpad(to_hex(n),63,'0'),clock_timestamp()+interval '1 hour',1 FROM generate_series(1,4096) n");
  assert.equal((await rpc(db,'read',{},client(8888))).error.code,'server_busy');
});

function request(action,body,headers={},suffix=action==='record'?'?act=adullam':''){
  return new Request(env.CHALLENGE_ALLOWED_ORIGIN+'/api/land-ranking/'+action+suffix,{method:body===undefined?'GET':'POST',headers:{'x-vercel-forwarded-for':'203.0.113.20',...(body===undefined?{}:{origin:env.CHALLENGE_ALLOWED_ORIGIN,'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
const metadata=act=>({mode:'land',version:VERSION,act});
test('HTTP strict query/schema/origin/flag/body, daily HMAC and no leaked errors',async()=>{
  const calls=[],factory=()=>Object.fromEntries(['read','issue','finish','submit','invalidate'].map(action=>[action,async(...args)=>{calls.push([action,...args]);return{...metadata(args[0]),entries:[],attemptId:id(1),seed:7};}]));
  const handler=(action,customEnv=env,now=()=>Date.UTC(2026,9,9))=>createLandHandler(action,{env:customEnv,serviceFactory:factory,now});
  assert.equal((await handler('record',{})(request('record'))).status,503);
  assert.equal((await handler('record')(request('record',{}))).status,405);
  for(const suffix of ['', '?act=bad','?act=adullam&act=temple','?act=adullam&x=1','?act=%61dullam','?act=adullam&'])assert.equal((await handler('record')(request('record',undefined,{},suffix))).status,400);
  for(const headers of [{origin:'https://evil.example'},{origin:''},{'sec-fetch-site':'cross-site'}])assert.equal((await handler('attempts')(request('attempts',{act:'adullam'},headers))).status,403);
  assert.equal((await handler('attempts')(request('attempts',{act:'adullam'},{'x-vercel-forwarded-for':'bad'}))).status,503);
  assert.equal((await handler('attempts')(request('attempts',{act:'adullam'},{},'?x=1'))).status,403);
  for(const body of [{},{act:'bad'},{act:'adullam',seed:7}])assert.equal((await handler('attempts')(request('attempts',body))).status,400);
  assert.equal((await handler('attempts')(request('attempts',{act:'adullam'},{'content-length':String(4*1024*1024+1)}))).status,413);
  assert.equal((await handler('attempts')(request('attempts',{act:'adullam'},{'content-type':'text/plain'}))).status,415);
  assert.equal((await handler('finish')(request('finish',{act:'adullam',attemptId:id(1),version:VERSION,events:[],score:999}))).status,400);
  assert.equal((await handler('finish')(request('finish',{act:'adullam',attemptId:id(1),version:VERSION,events:[]}))).status,200);
  const c=calls.find(c=>c[0]==='finish');assert.deepEqual(c.slice(1,4),['adullam',id(1),{version:VERSION,events:[]}]);assert.match(c[4],/^[a-f0-9]{64}$/);
  await handler('record')(request('record'));await handler('record')(request('record'));await handler('record',env,()=>Date.UTC(2026,9,10))(request('record'));
  const keys=calls.filter(c=>c[0]==='read').map(c=>c[2]);assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);
  const leaked=await createLandHandler('record',{env,serviceFactory:()=>({read:()=>{throw new Error(SECRET);}})})(request('record'));assert.deepEqual(await leaked.json(),{error:{code:'service_unavailable'}});
});

test('service validates replay and upstream projection; full HTTP/service/PGlite flow persists server-derived score only',async t=>{
  const db=await setup(t),calls=[];
  const factory=config=>createLandService({...config,replayImpl:(act,input)=>{assert.equal(act,'adullam');if(input.events[0]==='bad')throw new Error('private');return result(123,1000);},fetchImpl:async(url,options)=>{
    assert.equal(url,URL_BASE+'/rest/v1/rpc/land_challenge_rpc');assert.equal(options.headers.apikey,SECRET);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    const p=JSON.parse(options.body);calls.push(p);return Response.json(await rpc(db,p.p_action,p.p_input,p.p_client_key,p.p_input.act));
  }});
  const call=async(action,body)=>{const res=await createLandHandler(action,{env,serviceFactory:factory})(request(action,body));return{status:res.status,data:await res.json()};};
  const issue=await call('attempts',{act:'adullam'});assert.equal(issue.status,201);assert.equal(issue.data.seed,7);assert.equal(issue.data.act,'adullam');const attemptId=issue.data.attemptId;
  await db.query("UPDATE land_challenge.attempts SET issued_at=issued_at-interval '10 seconds' WHERE id=$1",[attemptId]);
  assert.equal((await call('finish',{act:'adullam',attemptId,version:VERSION,events:['bad']})).status,400);
  const finished=await call('finish',{act:'adullam',attemptId,version:VERSION,events:[]});assert.equal(finished.status,200);assert.deepEqual(finished.data.result,result(123,1000));
  const input={act:'adullam',attemptId,initials:'WIN',publicConsent:true,rankingConsent:VERSION};
  const submitted=await call('submit',input);assert.equal(submitted.data.ranked,true);assert.deepEqual(await call('submit',input),submitted);
  assert.deepEqual((await call('record')).data,{...metadata('adullam'),entries:[{rank:1,initials:'WIN',score:123}]});
  assert.ok(!JSON.stringify(calls).includes('events'));assert.ok(calls.find(c=>c.p_action==='finalize').p_input.result.score===123);
  const service=factory({url:URL_BASE,secretKey:SECRET});await assert.rejects(service.read('bad',KEY),code('invalid_request'));await assert.rejects(service.read('adullam','raw-ip'),code('invalid_request'));
  await assert.rejects(service.finish('adullam',attemptId,{version:'old',events:[]},KEY),code('unsupported_version'));
  for(const upstream of [{...metadata('temple'),entries:[]},{...metadata('adullam'),entries:[{rank:2,initials:'ABC',score:1}]},{...metadata('hebron'),entries:[{rank:1,initials:'ABC',score:20},{rank:2,initials:'DEF',score:10}]}]){
    const invalid=createLandService({url:URL_BASE,secretKey:SECRET,fetchImpl:async()=>Response.json(upstream)});
    await assert.rejects(invalid.read(upstream.act==='hebron'?'hebron':'adullam',KEY),code('service_unavailable'));
  }
});
