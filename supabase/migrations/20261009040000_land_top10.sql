-- APPROVAL REQUIRED: additive, isolated Land of David online Top 10. No legacy score backfill.
BEGIN;
CREATE SCHEMA land_challenge;
REVOKE ALL ON SCHEMA land_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA land_challenge TO service_role;

CREATE TABLE land_challenge.attempts (
  id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{48}$'),
  client_key text NOT NULL CHECK(client_key ~ '^[a-f0-9]{64}$' AND client_key<>repeat('0',64)),
  version text NOT NULL CHECK(version='land-top10-v1'),
  act text NOT NULL CHECK(act IN ('adullam','herut','ziklag','hebron','temple')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  invalid boolean NOT NULL DEFAULT false,
  transcript_hash text CHECK(transcript_hash ~ '^[a-f0-9]{64}$'),
  verified_result jsonb,
  finish_response jsonb,
  submission_hash text CHECK(submission_hash ~ '^[a-f0-9]{64}$'),
  submitted_response jsonb
);
CREATE INDEX land_attempt_expiry ON land_challenge.attempts(expires_at);
CREATE INDEX land_attempt_client ON land_challenge.attempts(client_key,expires_at);

CREATE TABLE land_challenge.rate_buckets (
  action text NOT NULL,
  client_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK(requests>0),
  PRIMARY KEY(action,client_key)
);
CREATE INDEX land_rate_expiry ON land_challenge.rate_buckets(expires_at);

CREATE TABLE land_challenge.ranking_entries (
  entry_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  act text NOT NULL CHECK(act IN ('adullam','herut','ziklag','hebron','temple')),
  recorded_at timestamptz NOT NULL,
  initials text NOT NULL CHECK(initials ~ '^[A-Z]{3}$'),
  score integer NOT NULL CHECK(score BETWEEN 1 AND CASE WHEN act='hebron' THEN 18000 WHEN act='temple' THEN 100 ELSE 10000 END),
  consent_version text NOT NULL CHECK(consent_version='land-top10-v1')
);
CREATE INDEX land_ranking_order ON land_challenge.ranking_entries(act,(CASE WHEN act='hebron' THEN score ELSE -score END),recorded_at ASC,entry_order ASC);

ALTER TABLE land_challenge.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_challenge.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_challenge.ranking_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA land_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON land_challenge.attempts,land_challenge.rate_buckets TO service_role;
GRANT SELECT,INSERT,DELETE ON land_challenge.ranking_entries TO service_role;
REVOKE ALL ON SEQUENCE land_challenge.ranking_entries_entry_order_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE land_challenge.ranking_entries_entry_order_seq TO service_role;

CREATE FUNCTION land_challenge.error(code text,status integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$SELECT jsonb_build_object('error',jsonb_build_object('code',code),'status',status)$$;
REVOKE ALL ON FUNCTION land_challenge.error(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION land_challenge.error(text,integer) TO service_role;

CREATE FUNCTION public.land_challenge_rpc(p_action text,p_input jsonb,p_client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,land_challenge
SET lock_timeout='2s'
AS $$
DECLARE
  t timestamptz;
  selected_act text;
  a land_challenge.attempts%ROWTYPE;
  b land_challenge.rate_buckets%ROWTYPE;
  response jsonb;
  entries jsonb;
  result jsonb;
  quota integer;
  seconds integer;
  elapsed_ms bigint;
  inserted_order bigint;
  retained boolean;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read','issue','inspect','finalize','submit','invalidate') OR
     p_client_key IS NULL OR p_client_key !~ '^[a-f0-9]{64}$' OR p_client_key=repeat('0',64) OR
     jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>4096 THEN
    RETURN land_challenge.error('invalid_request',400);
  END IF;
  IF p_input->>'version' IS DISTINCT FROM 'land-top10-v1' THEN
    RETURN land_challenge.error('unsupported_version',409);
  END IF;

  selected_act:=p_input->>'act';
  IF selected_act IS NULL OR selected_act NOT IN ('adullam','herut','ziklag','hebron','temple') THEN
    RETURN land_challenge.error('invalid_request',400);
  END IF;
  PERFORM pg_advisory_xact_lock(1397508423,5);
  t:=clock_timestamp();
  DELETE FROM land_challenge.attempts WHERE id IN(
    SELECT id FROM land_challenge.attempts
    WHERE expires_at<=t AND id<>coalesce(p_input->>'id','') ORDER BY expires_at LIMIT 64);
  DELETE FROM land_challenge.rate_buckets WHERE(action,client_key) IN(
    SELECT action,client_key FROM land_challenge.rate_buckets WHERE expires_at<=t ORDER BY expires_at LIMIT 128);

  FOR quota,seconds IN
    SELECT 20000,86400
    UNION ALL
    SELECT CASE p_action WHEN 'read' THEN 120 WHEN 'issue' THEN 8 WHEN 'submit' THEN 20 ELSE 30 END,
           CASE WHEN p_action='issue' THEN 600 ELSE 60 END
  LOOP
    SELECT * INTO b FROM land_challenge.rate_buckets
      WHERE action=CASE WHEN seconds=86400 THEN 'global' ELSE p_action END
        AND client_key=CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END;
    IF FOUND AND b.expires_at>t AND b.requests>=quota THEN
      RETURN land_challenge.error('rate_limited',429);
    END IF;
    IF NOT FOUND THEN
      IF(SELECT count(*) FROM land_challenge.rate_buckets)>=4096 THEN RETURN land_challenge.error('server_busy',503); END IF;
      INSERT INTO land_challenge.rate_buckets(action,client_key,expires_at,requests)
      VALUES(CASE WHEN seconds=86400 THEN 'global' ELSE p_action END,
             CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END,
             t+make_interval(secs=>seconds),1);
    ELSE
      UPDATE land_challenge.rate_buckets
      SET requests=CASE WHEN expires_at>t THEN requests+1 ELSE 1 END,
          expires_at=CASE WHEN expires_at>t THEN expires_at ELSE t+make_interval(secs=>seconds) END
      WHERE action=b.action AND client_key=b.client_key;
    END IF;
  END LOOP;

  response:=jsonb_build_object('mode','land','version','land-top10-v1','act',selected_act);
  IF p_action='read' THEN
    IF p_input<>jsonb_build_object('version','land-top10-v1','act',selected_act) THEN RETURN land_challenge.error('invalid_request',400); END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('rank',place,'initials',initials,'score',score)
      ORDER BY CASE WHEN selected_act='hebron' THEN score ELSE -score END,recorded_at ASC,entry_order ASC),'[]'::jsonb) INTO entries
    FROM(SELECT initials,score,recorded_at,entry_order,rank() OVER(ORDER BY CASE WHEN selected_act='hebron' THEN score ELSE -score END) AS place
         FROM land_challenge.ranking_entries WHERE act=selected_act) ranked;
    RETURN response||jsonb_build_object('entries',entries);
  END IF;

  IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR p_input->>'id' !~ '^[a-f0-9]{48}$' THEN
    RETURN land_challenge.error('attempt_not_found',404);
  END IF;
  IF p_action='issue' THEN
    IF p_input-ARRAY['id','version','act']<>'{}'::jsonb THEN RETURN land_challenge.error('invalid_request',400); END IF;
    IF(SELECT count(*) FROM land_challenge.attempts)>=2048 THEN RETURN land_challenge.error('server_busy',503); END IF;
    IF(SELECT count(*) FROM land_challenge.attempts WHERE client_key=p_client_key AND expires_at>t AND NOT invalid AND submitted_response IS NULL)>=4 THEN
      RETURN land_challenge.error('rate_limited',429);
    END IF;
    INSERT INTO land_challenge.attempts(id,client_key,version,act,issued_at,expires_at)
    VALUES(p_input->>'id',p_client_key,'land-top10-v1',selected_act,t,t+interval '2 hours')
    ON CONFLICT DO NOTHING RETURNING * INTO a;
    IF NOT FOUND THEN RETURN land_challenge.error('attempt_conflict',409); END IF;
    RETURN response||jsonb_build_object('id',a.id);
  END IF;

  SELECT * INTO a FROM land_challenge.attempts WHERE id=p_input->>'id' FOR UPDATE;
  IF NOT FOUND OR a.client_key<>p_client_key OR a.act<>selected_act THEN RETURN land_challenge.error('attempt_not_found',404); END IF;
  IF a.expires_at<=t THEN RETURN land_challenge.error('attempt_expired',410); END IF;
  IF a.version<>'land-top10-v1' THEN RETURN land_challenge.error('unsupported_version',409); END IF;

  IF p_action='invalidate' THEN
    IF p_input-ARRAY['id','version','act']<>'{}'::jsonb THEN RETURN land_challenge.error('invalid_request',400); END IF;
    IF a.submission_hash IS NULL THEN UPDATE land_challenge.attempts SET invalid=true WHERE id=a.id; END IF;
    RETURN response;
  END IF;
  IF a.invalid THEN RETURN land_challenge.error('attempt_invalid',409); END IF;
  IF p_action='inspect' THEN
    IF p_input-ARRAY['id','version','act']<>'{}'::jsonb THEN RETURN land_challenge.error('invalid_request',400); END IF;
    RETURN response;
  END IF;

  IF p_action='finalize' THEN
    result:=p_input->'result';
    IF p_input-ARRAY['id','version','act','result','transcriptHash']<>'{}'::jsonb OR
       jsonb_typeof(p_input->'transcriptHash') IS DISTINCT FROM 'string' OR p_input->>'transcriptHash' !~ '^[a-f0-9]{64}$' OR
       jsonb_typeof(result) IS DISTINCT FROM 'object' OR
       result-ARRAY['score','activeMs']<>'{}'::jsonb OR
       EXISTS(SELECT 1 FROM unnest(ARRAY['score','activeMs']) AS k
         WHERE jsonb_typeof(result->k) IS DISTINCT FROM 'number' OR result->>k !~ '^[0-9]{1,8}$') THEN
      RETURN land_challenge.error('invalid_result',400);
    END IF;
    IF (result->>'score')::integer NOT BETWEEN 0 AND (CASE WHEN selected_act='hebron' THEN 18000 WHEN selected_act='temple' THEN 100 ELSE 10000 END) OR
       (result->>'activeMs')::integer NOT BETWEEN 0 AND 1800000 OR
       (selected_act='hebron' AND ((result->>'score')::integer<1 OR (result->>'score')::integer*100>(result->>'activeMs')::integer+100)) THEN
      RETURN land_challenge.error('invalid_result',400);
    END IF;
    IF a.transcript_hash IS NOT NULL THEN
      IF a.transcript_hash<>p_input->>'transcriptHash' OR a.verified_result<>result THEN
        RETURN land_challenge.error('attempt_conflict',409);
      END IF;
      RETURN a.finish_response;
    END IF;
    elapsed_ms:=floor(extract(epoch FROM t-a.issued_at)*1000);
    IF elapsed_ms<0 OR (result->>'activeMs')::integer>elapsed_ms+1000 THEN RETURN land_challenge.error('future_timing',400); END IF;
    response:=response||jsonb_build_object('verified',true);
    UPDATE land_challenge.attempts SET transcript_hash=p_input->>'transcriptHash',verified_result=result,finish_response=response WHERE id=a.id;
    RETURN response;
  END IF;

  IF p_input-ARRAY['id','version','act','initials','publicConsent','rankingConsent','submissionHash']<>'{}'::jsonb OR
     jsonb_typeof(p_input->'submissionHash') IS DISTINCT FROM 'string' OR p_input->>'submissionHash' !~ '^[a-f0-9]{64}$' THEN
    RETURN land_challenge.error('invalid_request',400);
  END IF;
  IF p_input->'publicConsent' IS DISTINCT FROM 'true'::jsonb OR p_input->>'rankingConsent' IS DISTINCT FROM 'land-top10-v1' THEN
    RETURN land_challenge.error('public_consent_required',400);
  END IF;
  IF jsonb_typeof(p_input->'initials') IS DISTINCT FROM 'string' OR p_input->>'initials' !~ '^[A-Z]{3}$' THEN
    RETURN land_challenge.error('invalid_initials',400);
  END IF;
  IF p_input->>'initials'=ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN
    RETURN land_challenge.error('blocked_initials',400);
  END IF;
  IF a.submission_hash IS NOT NULL THEN
    IF a.submission_hash<>p_input->>'submissionHash' THEN RETURN land_challenge.error('attempt_conflict',409); END IF;
    RETURN a.submitted_response;
  END IF;
  IF a.verified_result IS NULL THEN RETURN land_challenge.error('attempt_unverified',409); END IF;
  IF (a.verified_result->>'score')::integer<=0 THEN RETURN land_challenge.error('not_qualified',409); END IF;

  INSERT INTO land_challenge.ranking_entries(act,recorded_at,initials,score,consent_version)
  VALUES(selected_act,t,p_input->>'initials',(a.verified_result->>'score')::integer,'land-top10-v1') RETURNING entry_order INTO inserted_order;
  DELETE FROM land_challenge.ranking_entries WHERE entry_order IN(
    SELECT entry_order FROM land_challenge.ranking_entries WHERE act=selected_act ORDER BY CASE WHEN selected_act='hebron' THEN score ELSE -score END,recorded_at ASC,entry_order ASC OFFSET 10);
  SELECT EXISTS(SELECT 1 FROM land_challenge.ranking_entries WHERE entry_order=inserted_order) INTO retained;
  response:=response||jsonb_build_object('ranked',retained);
  UPDATE land_challenge.attempts SET submission_hash=p_input->>'submissionHash',submitted_response=response WHERE id=a.id;
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.land_challenge_rpc(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.land_challenge_rpc(text,jsonb,text) TO service_role;
COMMIT;
