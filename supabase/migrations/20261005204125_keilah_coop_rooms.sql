-- APPROVAL REQUIRED. Additive Keilah-only schema. No old ranking changes or local-score backfill.
BEGIN;
CREATE SCHEMA keilah_coop;
REVOKE ALL ON SCHEMA keilah_coop FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA keilah_coop TO service_role;
CREATE TABLE keilah_coop.rooms(
 code text PRIMARY KEY CHECK(code ~ '^[A-F0-9]{8}$'),
 create_key text UNIQUE NOT NULL CHECK(create_key ~ '^[a-f0-9]{64}$'),
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<24000),
 expires_at timestamptz NOT NULL
);
CREATE INDEX ON keilah_coop.rooms(expires_at);
CREATE TABLE keilah_coop.rankings(
 room_code text NOT NULL, team text NOT NULL CHECK(team ~ '^T-[A-F0-9]{6}$'), run integer NOT NULL, map text NOT NULL CHECK(map='keilah-1'),
 time_ms integer NOT NULL CHECK(time_ms BETWEEN 1 AND 600000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_code,run)
);
CREATE INDEX ON keilah_coop.rankings(time_ms,recorded_at,room_code,run);
CREATE TABLE keilah_coop.rate_buckets(
 action text NOT NULL,client_key text NOT NULL,requests integer NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(action,client_key)
);
CREATE INDEX ON keilah_coop.rate_buckets(expires_at);
ALTER TABLE keilah_coop.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE keilah_coop.rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE keilah_coop.rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA keilah_coop FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA keilah_coop TO service_role;

CREATE FUNCTION keilah_coop.error(code text,status integer DEFAULT 400) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$SELECT jsonb_build_object('error',jsonb_build_object('code',code),'status',status)$$;

CREATE FUNCTION keilah_coop.course() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT '{"nodes":[{"id":"exit","x":300,"y":570,"name":"남문 · 탈출"},{"id":"square","x":300,"y":460,"name":"성 안 광장"},{"id":"west","x":150,"y":365,"name":"서쪽 손잡이","holds":"east"},{"id":"east","x":450,"y":365,"name":"동쪽 손잡이","holds":"west"},{"id":"wgate","x":65,"y":265,"name":"서쪽 통로"},{"id":"egate","x":535,"y":265,"name":"동쪽 통로"},{"id":"w1","x":90,"y":155,"name":"곡식 마당","family":"곡식 마당 가족"},{"id":"w2","x":205,"y":65,"name":"서쪽 지붕","family":"서쪽 지붕 가족"},{"id":"e1","x":510,"y":155,"name":"우물가","family":"우물가 가족"},{"id":"e2","x":395,"y":65,"name":"동쪽 지붕","family":"동쪽 지붕 가족"}],"edges":[["exit","square",8000],["square","west",6000],["square","east",6000],["west","east",8000],["west","wgate",10000,"west"],["east","egate",10000,"east"],["wgate","w1",8000],["w1","w2",8000],["wgate","w2",15000,null,true],["egate","e1",8000],["e1","e2",8000],["egate","e2",15000,null,true]]}'::jsonb$$;

CREATE FUNCTION keilah_coop.player(slot integer,secret text,join_key text,t bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('slot',slot,'secret',secret,'joinKey',join_key,'lastSeen',t,'seq',0,
 'ready',false,'consent',false,'node','exit','job',null,'holding',null,'rescued',0,'opened',0,'carrying',null,'escaped',false)
$$;

CREATE FUNCTION keilah_coop.reset(s jsonb,t bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,keilah_coop AS $$
DECLARE i integer;p jsonb;
BEGIN
 s:=s||jsonb_build_object('map','keilah-1','run',coalesce((s->>'run')::integer,0)+1,'phase','lobby','started',null,'ended',null,
 'updatedMs',t,'eligible',true,'reason','','gates',jsonb_build_object('west',false,'east',false),
 'families',jsonb_build_object('w1',null,'w2',null,'e1',null,'e2',null),'delivered',jsonb_build_object('w1',false,'w2',false,'e1',false,'e2',false));
 FOR i IN 0..1 LOOP
  p:=s->'players'->i;
  IF p<>'null'::jsonb THEN
   p:=p||jsonb_build_object('ready',false,'consent',false,'node','exit','job',null,'holding',null,'rescued',0,'opened',0,'carrying',null,'escaped',false);
   s:=jsonb_set(s,ARRAY['players',i::text],p);
  END IF;
 END LOOP;
 RETURN s;
END $$;

-- Advance only from database time. No client position, clock, score or completed state is accepted.
CREATE FUNCTION keilah_coop.advance(s jsonb,t bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,keilah_coop AS $$
DECLARE i integer;p jsonb;q jsonb;j jsonb;active_until bigint;pause_ms bigint;g text;
BEGIN
 IF s->>'phase'<>'playing' THEN RETURN s||jsonb_build_object('updatedMs',t); END IF;
 IF t-(s->>'started')::bigint>600000 THEN RETURN s||jsonb_build_object('phase','ended','ended',t,'eligible',false,'reason','10분 제한 종료','updatedMs',t); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') x WHERE x='null'::jsonb OR t-(x->>'lastSeen')::bigint>60000) THEN
  RETURN s||jsonb_build_object('phase','ended','ended',t,'eligible',false,'reason','연결 복구 시간 60초 초과','updatedMs',t);
 END IF;
 SELECT least(t,min((x->>'lastSeen')::bigint+12000)) INTO active_until FROM jsonb_array_elements(s->'players') x;
 pause_ms:=greatest(0,t-greatest((s->>'updatedMs')::bigint,active_until));
 FOR i IN 0..1 LOOP
  p:=s->'players'->i;q:=s->'players'->(1-i);j:=p->'job';
  IF j<>'null'::jsonb THEN
   g:=j->>'gate';
   IF g IS NOT NULL AND NOT (s->'gates'->>g)::boolean AND q->>'holding' IS DISTINCT FROM g THEN p:=p||jsonb_build_object('job',null);
   ELSIF (j->>'end')::bigint<=active_until THEN
    IF j->>'kind'='move' THEN
     p:=p||jsonb_build_object('node',j->>'to');
     IF g IS NOT NULL AND NOT (s->'gates'->>g)::boolean THEN
      s:=jsonb_set(s,ARRAY['gates',g],'true');q:=q||jsonb_build_object('opened',(q->>'opened')::integer+1);
      s:=jsonb_set(s,ARRAY['players',(1-i)::text],q);
     END IF;
     IF p->>'node'='exit' AND p->>'carrying' IS NOT NULL THEN
      s:=jsonb_set(s,ARRAY['delivered',p->>'carrying'],'true');p:=p||jsonb_build_object('carrying',null);
     END IF;
    ELSIF j->>'kind'='rescue' AND s->'families'->(p->>'node')='null'::jsonb THEN
     s:=jsonb_set(s,ARRAY['families',p->>'node'],to_jsonb(i));p:=p||jsonb_build_object('rescued',(p->>'rescued')::integer+1,'carrying',p->>'node');
    END IF;
    p:=p||jsonb_build_object('job',null);
   ELSIF pause_ms>0 THEN
    j:=j||jsonb_build_object('start',(j->>'start')::bigint+pause_ms,'end',(j->>'end')::bigint+pause_ms);
    p:=p||jsonb_build_object('job',j);
   END IF;
  END IF;
  -- Holding is not released by a brief network outage; the shared world pauses instead.
  s:=jsonb_set(s,ARRAY['players',i::text],p);
 END LOOP;
 RETURN s||jsonb_build_object('updatedMs',t);
END $$;

CREATE FUNCTION keilah_coop.view(s jsonb,slot integer,t bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT (s-ARRAY['closedKeys','updatedMs'])||jsonb_build_object('slot',slot,'serverNow',t,
 'elapsed',CASE WHEN s->>'started' IS NULL THEN 0 ELSE coalesce((s->>'ended')::bigint,t)-(s->>'started')::bigint END,
 'paused',s->>'phase'='playing' AND EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') p WHERE p='null'::jsonb OR t-(p->>'lastSeen')::bigint>12000),
 'players',(SELECT jsonb_agg(CASE WHEN p='null'::jsonb THEN p ELSE (p-ARRAY['secret','joinKey','lastCommand','lastSeen'])||jsonb_build_object('online',t-(p->>'lastSeen')::bigint<=12000) END ORDER BY n)
 FROM jsonb_array_elements(s->'players') WITH ORDINALITY x(p,n)))
$$;

CREATE FUNCTION public.keilah_coop_rpc(p_action text,p_input jsonb,p_client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,keilah_coop SET lock_timeout='2s' AS $$
DECLARE
 tstamp timestamptz;t bigint;r keilah_coop.rooms%ROWTYPE;s jsonb;p jsonb;q jsonb;j jsonb;e jsonb;target jsonb;
 i integer;slot integer;seq integer;duration integer;phase integer;counted integer;quota integer;
 v_code text;act text;g text;payload jsonb;entries jsonb;response jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','join','read','command','ranking') OR p_client_key IS NULL OR p_client_key!~'^[a-f0-9]{64}$' OR p_client_key=repeat('0',64)
 OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>2048 THEN RETURN keilah_coop.error('invalid_request'); END IF;
 IF p_input->>'version' IS DISTINCT FROM 'keilah-1' THEN RETURN keilah_coop.error('unsupported_version',409); END IF;
 tstamp:=clock_timestamp();t:=floor(extract(epoch FROM tstamp)*1000)::bigint;
 quota:=CASE p_action WHEN 'create' THEN 10 WHEN 'join' THEN 40 WHEN 'command' THEN 600 WHEN 'ranking' THEN 60 ELSE 2400 END;
 INSERT INTO keilah_coop.rate_buckets VALUES(p_action,p_client_key,1,tstamp+interval '1 minute')
 ON CONFLICT(action,client_key) DO UPDATE SET requests=CASE WHEN keilah_coop.rate_buckets.expires_at<=tstamp THEN 1 ELSE keilah_coop.rate_buckets.requests+1 END,
 expires_at=CASE WHEN keilah_coop.rate_buckets.expires_at<=tstamp THEN excluded.expires_at ELSE keilah_coop.rate_buckets.expires_at END RETURNING requests INTO counted;
 IF counted>quota THEN RETURN keilah_coop.error('rate_limited',429); END IF;
 IF p_action IN ('create','ranking') THEN
  DELETE FROM keilah_coop.rooms WHERE code IN(SELECT rr.code FROM keilah_coop.rooms rr WHERE expires_at<=tstamp ORDER BY expires_at LIMIT 32);
  DELETE FROM keilah_coop.rate_buckets WHERE (action,client_key) IN(SELECT b.action,b.client_key FROM keilah_coop.rate_buckets b WHERE expires_at<tstamp-interval '1 hour' ORDER BY expires_at LIMIT 32);
 END IF;
 IF p_action='ranking' THEN
  IF p_input-ARRAY['version']<>'{}'::jsonb THEN RETURN keilah_coop.error('invalid_request'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('team',x.team,'run',x.run,'timeMs',x.time_ms,'map',x.map,'rank',x.rank) ORDER BY x.time_ms,x.recorded_at,x.room_code,x.run),'[]') INTO entries
  FROM(SELECT *,rank() OVER(ORDER BY time_ms) AS rank FROM keilah_coop.rankings ORDER BY time_ms,recorded_at,room_code,run LIMIT 10)x;
  RETURN jsonb_build_object('version','keilah-1','scope','persistent','entries',entries);
 END IF;
 v_code:=p_input->>'code';
 IF v_code IS NULL OR v_code!~'^[A-F0-9]{8}$' OR p_input->>'secret' IS NULL OR p_input->>'secret'!~'^[a-f0-9]{64}$' THEN RETURN keilah_coop.error('invalid_request'); END IF;
 IF p_action='create' THEN
  IF p_input-ARRAY['version','code','secret','requestKey']<>'{}'::jsonb OR p_input->>'requestKey' IS NULL OR p_input->>'requestKey'!~'^[a-f0-9]{64}$' THEN RETURN keilah_coop.error('invalid_request'); END IF;
  PERFORM pg_advisory_xact_lock(1262831948,1);
  SELECT * INTO r FROM keilah_coop.rooms rr WHERE rr.create_key=p_input->>'requestKey' FOR UPDATE;
  IF FOUND THEN
   IF r.state->'players'->0->>'secret' IS DISTINCT FROM p_input->>'secret' THEN RETURN keilah_coop.error('request_expired',409); END IF;
   RETURN keilah_coop.view(r.state,0,t);
  END IF;
  IF (SELECT count(*) FROM keilah_coop.rooms)>=200 THEN RETURN keilah_coop.error('rooms_full',429); END IF;
  IF EXISTS(SELECT 1 FROM keilah_coop.rooms rr WHERE rr.code=v_code) THEN RETURN keilah_coop.error('code_conflict',409); END IF;
  s:=keilah_coop.reset(jsonb_build_object('revision',1,'team','T-'||upper(substr(md5(p_input->>'requestKey'),1,6)),'code',v_code,'closedKeys','[]'::jsonb,'players',jsonb_build_array(keilah_coop.player(0,p_input->>'secret',p_input->>'requestKey',t),null)),t);
  INSERT INTO keilah_coop.rooms VALUES(v_code,p_input->>'requestKey',s,tstamp+interval '30 minutes');
  RETURN keilah_coop.view(s,0,t);
 END IF;
 SELECT * INTO r FROM keilah_coop.rooms rr WHERE rr.code=v_code FOR UPDATE;
 IF NOT FOUND OR r.expires_at<=tstamp THEN RETURN keilah_coop.error('room_not_found',404); END IF;
 -- Read the clock again after waiting for this room's lock.
 tstamp:=clock_timestamp();t:=greatest(floor(extract(epoch FROM tstamp)*1000)::bigint,(r.state->>'updatedMs')::bigint);s:=keilah_coop.advance(r.state,t);
 IF p_action='join' THEN
  IF p_input-ARRAY['version','code','secret','requestKey']<>'{}'::jsonb OR p_input->>'requestKey' IS NULL OR p_input->>'requestKey'!~'^[a-f0-9]{64}$' THEN RETURN keilah_coop.error('invalid_request'); END IF;
  IF s->'closedKeys' ? (p_input->>'requestKey') THEN RETURN keilah_coop.error('request_expired',409); END IF;
  slot:=NULL;
  FOR i IN 0..1 LOOP IF s->'players'->i->>'joinKey'=p_input->>'requestKey' AND s->'players'->i->>'secret'=p_input->>'secret' THEN slot:=i;END IF;END LOOP;
  IF slot IS NULL THEN
   IF s->>'phase'<>'lobby' THEN RETURN keilah_coop.error('already_started',409); END IF;
   FOR i IN 0..1 LOOP IF s->'players'->i='null'::jsonb THEN slot:=i;EXIT;END IF;END LOOP;
   IF slot IS NULL THEN RETURN keilah_coop.error('room_full',409); END IF;
   IF jsonb_array_length(s->'closedKeys')>=32 THEN RETURN keilah_coop.error('room_expired',410); END IF;
   s:=jsonb_set(s,ARRAY['players',slot::text],keilah_coop.player(slot,p_input->>'secret',p_input->>'requestKey',t));
  END IF;
 ELSE
  slot:=NULL;FOR i IN 0..1 LOOP IF s->'players'->i->>'secret'=p_input->>'secret' THEN slot:=i;END IF;END LOOP;
  IF slot IS NULL THEN RETURN keilah_coop.error('not_a_member',403); END IF;
  IF p_action='read' AND p_input-ARRAY['version','code','secret']<>'{}'::jsonb THEN RETURN keilah_coop.error('invalid_request'); END IF;
 END IF;
 p:=s->'players'->slot;p:=p||jsonb_build_object('lastSeen',t);s:=jsonb_set(s,ARRAY['players',slot::text],p);
 IF p_action='command' THEN
  payload:=p_input-ARRAY['version','code','secret'];act:=payload->>'action';
  IF act IS NULL OR act NOT IN ('ready','move','hold','release','rescue','escape','retry','leave') OR
   payload-(CASE act WHEN 'move' THEN ARRAY['action','seq','run','to'] WHEN 'ready' THEN ARRAY['action','seq','run','consent'] ELSE ARRAY['action','seq','run'] END)<>'{}'::jsonb OR
   coalesce(payload->>'seq','')!~'^[1-9][0-9]{0,8}$' OR coalesce(payload->>'run','')!~'^[1-9][0-9]{0,8}$' THEN RETURN keilah_coop.error('invalid_request'); END IF;
  IF (payload->>'run')::integer<>(s->>'run')::integer THEN RETURN keilah_coop.error('stale_run',409); END IF;
  seq:=(payload->>'seq')::integer;
  IF seq=(p->>'seq')::integer AND payload=p->'lastCommand' THEN
   s:=s||jsonb_build_object('revision',coalesce((s->>'revision')::bigint,0)+1);
   UPDATE keilah_coop.rooms SET state=s,expires_at=tstamp+interval '30 minutes' WHERE rooms.code=v_code;
   RETURN keilah_coop.view(s,slot,t);
  END IF;
  IF seq<>(p->>'seq')::integer+1 THEN RETURN keilah_coop.error('sequence_conflict',409); END IF;
  p:=p||jsonb_build_object('seq',seq,'lastCommand',payload);
  IF act='leave' THEN
   s:=s||jsonb_build_object('closedKeys',(s->'closedKeys')||jsonb_build_array(p->>'joinKey'));
   s:=jsonb_set(s,ARRAY['players',slot::text],'null');
   IF s->>'phase'='playing' THEN s:=s||jsonb_build_object('phase','ended','ended',t,'eligible',false,'reason','동료가 방에서 나갔어요');
   ELSIF s->>'phase'='lobby' THEN FOR i IN 0..1 LOOP IF s->'players'->i<>'null'::jsonb THEN s:=jsonb_set(s,ARRAY['players',i::text,'ready'],'false');END IF;END LOOP;END IF;
   s:=s||jsonb_build_object('revision',coalesce((s->>'revision')::bigint,0)+1);
   UPDATE keilah_coop.rooms SET state=s,expires_at=tstamp+interval '30 minutes' WHERE rooms.code=v_code;
   RETURN jsonb_build_object('left',true);
  ELSIF act='retry' THEN
   IF s->>'phase' NOT IN ('ended','complete') THEN RETURN keilah_coop.error('not_finished',409); END IF;
   s:=jsonb_set(s,ARRAY['players',slot::text],p);s:=keilah_coop.reset(s,t);p:=s->'players'->slot;
  ELSIF act='ready' THEN
   IF s->>'phase'<>'lobby' THEN RETURN keilah_coop.error('not_in_lobby',409); END IF;
   IF NOT (p->>'ready')::boolean AND payload->'consent' IS DISTINCT FROM 'true'::jsonb THEN RETURN keilah_coop.error('consent_required'); END IF;
   p:=p||jsonb_build_object('ready',NOT (p->>'ready')::boolean,'consent',payload->'consent');
   q:=s->'players'->(1-slot);
   IF (p->>'ready')::boolean AND q<>'null'::jsonb AND (q->>'ready')::boolean AND t-(q->>'lastSeen')::bigint<=12000 THEN s:=s||jsonb_build_object('phase','playing','started',t,'reason',''); END IF;
  ELSE
   q:=s->'players'->(1-slot);
   IF s->>'phase'<>'playing' OR q='null'::jsonb OR t-(q->>'lastSeen')::bigint>12000 THEN RETURN keilah_coop.error('not_playing',409); END IF;
   IF (p->>'escaped')::boolean THEN RETURN keilah_coop.error('already_escaped',409); END IF;
   IF act='release' THEN p:=p||jsonb_build_object('holding',null);
   ELSE
    IF p->'job'<>'null'::jsonb THEN RETURN keilah_coop.error('busy_moving',409); END IF;
    IF act='move' THEN
     SELECT x INTO e FROM jsonb_array_elements(keilah_coop.course()->'edges') x WHERE
      (x->>0=p->>'node' AND x->>1=payload->>'to') OR (x->>1=p->>'node' AND x->>0=payload->>'to');
     IF e IS NULL THEN RETURN keilah_coop.error('not_adjacent'); END IF;
     g:=e->>3;
     IF g IS NOT NULL AND NOT (s->'gates'->>g)::boolean AND q->>'holding' IS DISTINCT FROM g THEN RETURN keilah_coop.error('partner_must_hold',409); END IF;
     duration:=(e->>2)::integer;phase:=(t-(s->>'started')::bigint)%24000;
     IF coalesce((e->>4)::boolean,false) AND phase<10000 THEN duration:=duration+10000-phase; END IF;
     p:=p||jsonb_build_object('holding',null,'job',jsonb_build_object('kind','move','from',p->>'node','to',payload->>'to','start',t,'end',t+duration,'gate',g));
    ELSIF act='hold' THEN
     SELECT x INTO target FROM jsonb_array_elements(keilah_coop.course()->'nodes') x WHERE x->>'id'=p->>'node';
     IF target->>'holds' IS NULL THEN RETURN keilah_coop.error('not_a_switch'); END IF;
     p:=p||jsonb_build_object('holding',target->>'holds');
    ELSIF act='rescue' THEN
     IF p->>'carrying' IS NOT NULL THEN RETURN keilah_coop.error('escort_first',409); END IF;
     IF NOT (s->'families' ? (p->>'node')) OR s->'families'->(p->>'node')<>'null'::jsonb THEN RETURN keilah_coop.error('no_family'); END IF;
     p:=p||jsonb_build_object('holding',null,'job',jsonb_build_object('kind','rescue','start',t,'end',t+14000));
    ELSIF act='escape' THEN
     IF p->>'node'<>'exit' OR EXISTS(SELECT 1 FROM jsonb_each(s->'delivered') x WHERE x.value<>'true'::jsonb)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') x WHERE (x->>'rescued')::integer<1 OR (x->>'opened')::integer<1 OR x->'consent' IS DISTINCT FROM 'true'::jsonb)
     THEN RETURN keilah_coop.error('rescue_everyone_first',409); END IF;
     p:=p||jsonb_build_object('escaped',true);
    END IF;
   END IF;
  END IF;
  s:=jsonb_set(s,ARRAY['players',slot::text],p);
 END IF;
 IF s->>'phase'='playing' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') x WHERE x->'escaped' IS DISTINCT FROM 'true'::jsonb) THEN
  s:=s||jsonb_build_object('phase','complete','ended',t);
  PERFORM pg_advisory_xact_lock(1262831948,2);
  INSERT INTO keilah_coop.rankings(room_code,team,run,map,time_ms) VALUES(v_code,s->>'team',(s->>'run')::integer,'keilah-1',ceil((t-(s->>'started')::bigint)/100.0)::integer*100) ON CONFLICT DO NOTHING;
  DELETE FROM keilah_coop.rankings WHERE (room_code,run) NOT IN(SELECT x.room_code,x.run FROM keilah_coop.rankings x ORDER BY time_ms,recorded_at,room_code,run LIMIT 10);
 END IF;
 s:=s||jsonb_build_object('revision',coalesce((s->>'revision')::bigint,0)+1);
   UPDATE keilah_coop.rooms SET state=s,expires_at=tstamp+interval '30 minutes' WHERE rooms.code=v_code;
 RETURN keilah_coop.view(s,slot,t);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA keilah_coop FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA keilah_coop TO service_role;
REVOKE ALL ON FUNCTION public.keilah_coop_rpc(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.keilah_coop_rpc(text,jsonb,text) TO service_role;
COMMIT;
