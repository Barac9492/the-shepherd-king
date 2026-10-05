import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {VERSES} from '../src/david-dance-core.js';
import {createEngediState,stepEngedi,isTightThread} from '../src/engedi-challenge-core.js';
import {replaySide,SIDE_VERSION} from '../server/side-challenge-replay.mjs';
import {createSideService} from '../server/side-challenge-service.mjs';
import {createSideHandler} from '../server/side-challenge-http.mjs';
const migration=await readFile(new URL('../supabase/migrations/20261005031738_dance_engedi_top10.sql',import.meta.url),'utf8');
const key='a'.repeat(64),version=SIDE_VERSION;
const env={VERCEL:'1',DANCE_ONLINE_ENABLED:'true',ENGEDI_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:'https://game.example',CHALLENGE_SUPABASE_URL:'https://jdsjvrynmnzoztfinlzi.supabase.co',CHALLENGE_SUPABASE_SECRET_KEY:'sb_secret_'+'testonly'.repeat(4)};
export function danceTrace(hint=false){return{actions:VERSES.flatMap((text,i)=>[...(hint?[{type:'hint'}]:[]),{type:'answer',text},...(i<5?[{type:'next'}]:[])])};}
export function engediTrace(){const state=createEngediState(),events=[];while(state.status==='playing'){const speed=state.alert>64000?0:isTightThread(state.progress)?25:100;if(events.at(-1)?.speed!==speed)events.push({tick:state.tick+1,speed});stepEngedi(state,speed);}return{events,endedTick:state.tick,interrupted:false,maxGapMs:16};}
async function setup(t){const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');await db.exec(migration);return db;}
async function rpc(db,mode,action,input={},clientKey=key){await db.exec('SET ROLE service_role');return(await db.query(`SELECT public.${mode}_challenge_rpc($1,$2::jsonb,$3) AS result`,[action,JSON.stringify({...input,version}),clientKey])).rows[0].result;}
function factory(db){return config=>createSideService({...config,fetchImpl:async(url,options)=>{assert.equal(options.redirect,'error');assert.ok(!options.headers.Authorization);const mode=url.includes('/dance_')?'dance':'engedi',p=JSON.parse(options.body);return Response.json(await rpc(db,mode,p.p_action,p.p_input,p.p_client_key));}});}
function call(db,mode,action,body,extra={}){const origin=env.CHALLENGE_ALLOWED_ORIGIN;const request=new Request(`${origin}/api/${mode}-challenge/${action}`,{method:body===undefined?'GET':'POST',headers:{'x-vercel-forwarded-for':'203.0.113.20',...(body===undefined?{}:{origin,'content-type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return createSideHandler(mode,action,{env,serviceFactory:factory(db)})(request).then(async r=>({status:r.status,data:await r.json()}));}

test('dance replay recalculates canonical text, hints, edits, streak and completion; rejects forged score/skips/duplicates',()=>{
 assert.equal(replaySide('dance',danceTrace()).metric,1110);assert.equal(replaySide('dance',danceTrace(true)).metric,720);
 const changed=danceTrace();changed.actions.unshift({type:'answer',text:'다른 말씀'});assert.ok(replaySide('dance',changed).metric<1110);
 const punctuation=danceTrace();punctuation.actions.filter(a=>a.text).forEach(a=>a.text=a.text.normalize('NFD').replaceAll(' ','，'));assert.equal(replaySide('dance',punctuation).metric,1110);
 for(const trace of [{...danceTrace(),score:99999},{actions:[]},{actions:[{type:'next'}]}, {actions:[{type:'hint'},{type:'hint'}]}, {actions:[{type:'answer',text:VERSES[0]},{type:'answer',text:VERSES[0]}]}, {actions:Array(129).fill({type:'hint'})}])assert.throws(()=>replaySide('dance',trace));
});
test('En-Gedi fixed replay rejects failure, interruption, impossible ticks, gaps, extra events and wrong mode',()=>{
 const trace=engediTrace();assert.deepEqual(replaySide('engedi',trace),{metric:trace.endedTick,activeMs:trace.endedTick*10});
 for(const input of [{...trace,interrupted:true},{...trace,maxGapMs:251},{...trace,endedTick:1},{...trace,endedTick:trace.endedTick+1},{...trace,events:[{tick:1,speed:101}]},{...trace,events:[{tick:1,speed:100}]},{...trace,events:[...trace.events,trace.events.at(-1)]},{...trace,events:[{tick:2,speed:0}]}])assert.throws(()=>replaySide('engedi',input));
 assert.throws(()=>replaySide('dance',trace));assert.throws(()=>replaySide('engedi',danceTrace()));
});
test('new migration preserves sling schema/record and denies all new anon/authenticated access',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const path of ['../docs/sling-challenge-supabase-setup.draft.sql','../docs/sling-challenge-supabase-v2-upgrade.draft.sql','../supabase/migrations/20261005022356_sling_challenge_top10.sql'])await db.exec(await readFile(new URL(path,import.meta.url),'utf8'));
 await db.exec("INSERT INTO sling_challenge.ranking_entries(rule_version,initials,score,consent_version) VALUES('sling-challenge-v2','OLD',123,'top10-v1')");
 const before=(await db.query("SELECT pg_get_functiondef('public.sling_challenge_rpc(text,jsonb,text)'::regprocedure) AS body")).rows;
 await db.exec(migration);assert.deepEqual((await db.query("SELECT pg_get_functiondef('public.sling_challenge_rpc(text,jsonb,text)'::regprocedure) AS body")).rows,before);
 assert.equal((await db.query('SELECT score FROM sling_challenge.ranking_entries')).rows[0].score,123);
 for(const role of ['anon','authenticated'])for(const mode of ['dance','engedi']){
  await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query(`SELECT public.${mode}_challenge_rpc('read','{}','${key}')`),/permission denied/);await assert.rejects(db.query(`SELECT * FROM ${mode}_challenge.ranking_entries`),/permission denied/);await db.exec('RESET ROLE');
 }
 const tables=(await db.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('dance_challenge','engedi_challenge') AND c.relkind='r'")).rows;assert.equal(tables.length,6);assert.ok(tables.every(x=>x.relrowsecurity));
 assert.equal((await rpc(db,'dance','read')).entries.length,0);assert.equal((await rpc(db,'engedi','read')).entries.length,0);
});
test('HTTP → replay → real local SQL: consent, three letters, duplicate retries, cross-mode isolation',async t=>{
 const db=await setup(t);const start=await call(db,'dance','attempts',{});assert.equal(start.status,201);const id=start.data.attemptId;
 assert.equal((await call(db,'engedi','finish',{attemptId:id,...engediTrace()})).status,404);
 assert.equal((await call(db,'dance','submit',{attemptId:id,initials:'ABC',publicConsent:true,rankingConsent:'dance-'+version})).status,409);
 assert.equal((await call(db,'dance','finish',{attemptId:id,...danceTrace()})).status,200);
 const publish={attemptId:id,initials:'ABC',publicConsent:true,rankingConsent:'dance-'+version};
 for(const change of [{publicConsent:false},{initials:'AA'},{initials:'ASS'},{rankingConsent:'engedi-'+version},{score:123}])assert.equal((await call(db,'dance','submit',{...publish,...change})).status,400);
 const first=await call(db,'dance','submit',publish);assert.equal(first.status,200);assert.equal(first.data.ranked,true);
 assert.deepEqual(await call(db,'dance','submit',publish),first);assert.equal((await call(db,'dance','submit',{...publish,initials:'DEF'})).status,409);
 assert.deepEqual((await call(db,'dance','record')).data.entries,[{initials:'ABC',metric:1110,rank:1}]);
 assert.deepEqual((await call(db,'engedi','record')).data.entries,[]);
 assert.equal((await call(db,'dance','finish',{attemptId:id,...danceTrace(true)})).status,409);
 assert.ok(!JSON.stringify((await call(db,'dance','record')).data).includes(id));
});
test('En-Gedi server clock rejects future finish; invalidated/expired runs cannot publish',async t=>{
 const db=await setup(t),trace=engediTrace();let id=(await call(db,'engedi','attempts',{})).data.attemptId;
 assert.equal((await call(db,'engedi','finish',{attemptId:id,...trace})).status,400);
 await db.exec('RESET ROLE');await db.query("UPDATE engedi_challenge.attempts SET issued_at=issued_at-interval '2 minutes' WHERE id=$1",[id]);
 assert.equal((await call(db,'engedi','finish',{attemptId:id,...trace})).status,200);
 assert.equal((await call(db,'engedi','submit',{attemptId:id,initials:'RUN',publicConsent:true,rankingConsent:'engedi-'+version})).status,200);
 assert.equal((await call(db,'engedi','record')).data.entries[0].metric,trace.endedTick);
 id=(await call(db,'engedi','attempts',{})).data.attemptId;assert.equal((await call(db,'engedi','invalidate',{attemptId:id})).status,200);
 assert.equal((await call(db,'engedi','finish',{attemptId:id,...trace})).status,409);
 await db.exec('RESET ROLE');await db.query("UPDATE engedi_challenge.attempts SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
 assert.equal((await call(db,'engedi','finish',{attemptId:id,...trace})).status,404);
});
test('bounded ten rows, competition ties, deterministic cutoff, immutable duplicate submit; modes sort independently',async t=>{
 const db=await setup(t);
 for(const mode of ['dance','engedi']){
  for(let i=0;i<12;i++){
   const id=i.toString(16).padStart(48,'0'),client=i.toString(16).padStart(64,'a'),metric=mode==='dance'?(i<3?1110:900):(i<3?2200:2500);
   await rpc(db,mode,'issue',{id},client);await db.exec('RESET ROLE');await db.query(`UPDATE ${mode}_challenge.attempts SET issued_at=issued_at-interval '2 minutes' WHERE id=$1`,[id]);
   const done=await rpc(db,mode,'finalize',{id,result:{metric,activeMs:mode==='dance'?0:metric*10},transcriptHash:'f'.repeat(64)},client);assert.ok(!done.error);
   const record=await rpc(db,mode,'submit',{id,initials:'AA'+String.fromCharCode(65+i),publicConsent:true,rankingConsent:mode+'-'+version,submissionHash:'e'.repeat(64)},client);assert.equal(record.ranked,i<10);
  }
  const list=(await rpc(db,mode,'read')).entries;assert.equal(list.length,10);assert.deepEqual(list.map(x=>x.rank),[1,1,1,4,4,4,4,4,4,4]);assert.equal(list.at(-1).initials,'AAJ');
 }
});
test('persistent quotas, invalid requests, expiry cleanup, transport and origin boundaries',async t=>{
 const db=await setup(t);
 for(let i=0;i<8;i++)assert.ok(!(await rpc(db,'dance','issue',{id:i.toString().padStart(48,'0')})).error);
 assert.equal((await rpc(db,'dance','issue',{id:'f'.repeat(48)})).error.code,'rate_limited');
 assert.equal((await call(db,'dance','attempts',{mode:'engedi'})).status,400);
 assert.equal((await call(db,'dance','attempts',{}, {origin:'https://evil.example'})).status,403);
 assert.equal((await call(db,'dance','attempts',{}, {'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await call(db,'dance','attempts',{}, {'x-vercel-forwarded-for':'invalid'})).status,503);
 const disabled=createSideHandler('dance','record',{env:{}});assert.equal((await disabled(new Request('https://game.example/'))).status,503);
 const r=await call(db,'dance','finish',{attemptId:'a'.repeat(48),actions:['x'.repeat(65536)]});assert.equal(r.status,413);
 await db.exec('RESET ROLE');await db.exec("UPDATE dance_challenge.attempts SET expires_at=clock_timestamp()-interval '1 second'");await rpc(db,'dance','read');assert.equal((await db.query('SELECT count(*)::int AS n FROM dance_challenge.attempts')).rows[0].n,0);
});
test('DB enforces hard capacities and malformed verified metrics even with trusted-server calls',async t=>{
 const db=await setup(t);
 await db.exec('RESET ROLE');
 await db.exec("INSERT INTO dance_challenge.attempts(id,issued_at,expires_at) SELECT lpad(to_hex(n),48,'0'),clock_timestamp(),clock_timestamp()+interval '30 minutes' FROM generate_series(1,2048)n");
 assert.equal((await rpc(db,'dance','issue',{id:'f'.repeat(48)})).error.code,'server_busy');
 const id='b'.repeat(48);await rpc(db,'engedi','issue',{id});
 for(const result of [{metric:-1,activeMs:0},{metric:2200,activeMs:1},{metric:2200.5,activeMs:22005},{metric:12001,activeMs:120010},{metric:'2200',activeMs:22000},{metric:2200,activeMs:22000,extra:true}]){
  assert.equal((await rpc(db,'engedi','finalize',{id,result,transcriptHash:'a'.repeat(64)})).error.code,'invalid_result');
 }
 await db.exec('RESET ROLE');await db.exec("INSERT INTO dance_challenge.rate_buckets(action,client_key,expires_at,requests) SELECT 'fixture',lpad(to_hex(n),64,'0'),clock_timestamp()+interval '1 hour',1 FROM generate_series(1,4094)n");
 assert.equal((await rpc(db,'dance','read',{},'b'.repeat(64))).error.code,'server_busy');
 await db.exec('RESET ROLE');await db.exec("UPDATE engedi_challenge.rate_buckets SET requests=20000 WHERE action='global'");
 assert.equal((await rpc(db,'engedi','read')).error.code,'rate_limited');
});
test('server transport accepts only dedicated origin and projects no upstream secrets or extra leaderboard fields',async()=>{
 assert.throws(()=>createSideService({mode:'dance',url:'https://wrong.supabase.co',secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY}));
 const config={mode:'dance',url:env.CHALLENGE_SUPABASE_URL,secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY};
 for(const response of [new Response('SECRET upstream detail',{status:500}),Response.json({version,mode:'engedi',entries:[]}),Response.json({version,mode:'dance',entries:[{initials:'ABC',metric:1110,rank:8}]}),Response.json({version,mode:'dance',entries:[],padding:'x'.repeat(17000)})]){
  await assert.rejects(createSideService({...config,fetchImpl:async()=>response}).read(key),e=>!e.message.includes('SECRET'));
 }
 const publicData=await createSideService({...config,fetchImpl:async()=>Response.json({version,mode:'dance',entries:[{initials:'ABC',metric:1110,rank:1,secret:'private'}],internal:'private'})}).read(key);
 assert.deepEqual(publicData,{version,mode:'dance',entries:[{initials:'ABC',metric:1110,rank:1}]});
});
