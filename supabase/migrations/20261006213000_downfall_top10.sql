-- APPROVAL REQUIRED: additive, isolated Downfall online Top 10. No legacy score backfill.
BEGIN;
CREATE SCHEMA downfall_challenge;
REVOKE ALL ON SCHEMA downfall_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA downfall_challenge TO service_role;

CREATE TABLE downfall_challenge.attempts (
  id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{48}$'),
  client_key text NOT NULL CHECK(client_key ~ '^[a-f0-9]{64}$' AND client_key<>repeat('0',64)),
  version text NOT NULL CHECK(version='downfall-top10-v1'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  invalid boolean NOT NULL DEFAULT false,
  transcript_hash text CHECK(transcript_hash ~ '^[a-f0-9]{64}$'),
  verified_result jsonb,
  finish_response jsonb,
  submission_hash text CHECK(submission_hash ~ '^[a-f0-9]{64}$'),
  submitted_response jsonb
);
CREATE INDEX downfall_attempt_expiry ON downfall_challenge.attempts(expires_at);
CREATE INDEX downfall_attempt_client ON downfall_challenge.attempts(client_key,expires_at);

CREATE TABLE downfall_challenge.rate_buckets (
  action text NOT NULL,
  client_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK(requests>0),
  PRIMARY KEY(action,client_key)
);
CREATE INDEX downfall_rate_expiry ON downfall_challenge.rate_buckets(expires_at);

CREATE TABLE downfall_challenge.ranking_entries (
  entry_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL,
  initials text NOT NULL CHECK(initials ~ '^[A-Z]{3}$'),
  score integer NOT NULL CHECK(score BETWEEN 1 AND 32400000),
  consent_version text NOT NULL CHECK(consent_version='downfall-top10-v1')
);
CREATE INDEX downfall_ranking_order ON downfall_challenge.ranking_entries(score DESC,recorded_at ASC,entry_order ASC);

ALTER TABLE downfall_challenge.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE downfall_challenge.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE downfall_challenge.ranking_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA downfall_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON downfall_challenge.attempts,downfall_challenge.rate_buckets TO service_role;
GRANT SELECT,INSERT,DELETE ON downfall_challenge.ranking_entries TO service_role;
REVOKE ALL ON SEQUENCE downfall_challenge.ranking_entries_entry_order_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE downfall_challenge.ranking_entries_entry_order_seq TO service_role;

CREATE FUNCTION downfall_challenge.error(code text,status integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$SELECT jsonb_build_object('error',jsonb_build_object('code',code),'status',status)$$;
REVOKE ALL ON FUNCTION downfall_challenge.error(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION downfall_challenge.error(text,integer) TO service_role;

CREATE FUNCTION public.downfall_challenge_rpc(p_action text,p_input jsonb,p_client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,downfall_challenge
SET lock_timeout='2s'
AS $$
DECLARE
  t timestamptz;
  a downfall_challenge.attempts%ROWTYPE;
  b downfall_challenge.rate_buckets%ROWTYPE;
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
    RETURN downfall_challenge.error('invalid_request',400);
  END IF;
  IF p_input->>'version' IS DISTINCT FROM 'downfall-top10-v1' THEN
    RETURN downfall_challenge.error('unsupported_version',409);
  END IF;

  PERFORM pg_advisory_xact_lock(1397508423,4);
  t:=clock_timestamp();
  DELETE FROM downfall_challenge.attempts WHERE id IN(
    SELECT id FROM downfall_challenge.attempts
    WHERE expires_at<=t AND id<>coalesce(p_input->>'id','') ORDER BY expires_at LIMIT 64);
  DELETE FROM downfall_challenge.rate_buckets WHERE(action,client_key) IN(
    SELECT action,client_key FROM downfall_challenge.rate_buckets WHERE expires_at<=t ORDER BY expires_at LIMIT 128);

  FOR quota,seconds IN
    SELECT 20000,86400
    UNION ALL
    SELECT CASE p_action WHEN 'read' THEN 120 WHEN 'issue' THEN 8 WHEN 'submit' THEN 20 ELSE 30 END,
           CASE WHEN p_action='issue' THEN 600 ELSE 60 END
  LOOP
    SELECT * INTO b FROM downfall_challenge.rate_buckets
      WHERE action=CASE WHEN seconds=86400 THEN 'global' ELSE p_action END
        AND client_key=CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END;
    IF FOUND AND b.expires_at>t AND b.requests>=quota THEN
      RETURN downfall_challenge.error('rate_limited',429);
    END IF;
    IF NOT FOUND THEN
      IF(SELECT count(*) FROM downfall_challenge.rate_buckets)>=4096 THEN RETURN downfall_challenge.error('server_busy',503); END IF;
      INSERT INTO downfall_challenge.rate_buckets(action,client_key,expires_at,requests)
      VALUES(CASE WHEN seconds=86400 THEN 'global' ELSE p_action END,
             CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END,
             t+make_interval(secs=>seconds),1);
    ELSE
      UPDATE downfall_challenge.rate_buckets
      SET requests=CASE WHEN expires_at>t THEN requests+1 ELSE 1 END,
          expires_at=CASE WHEN expires_at>t THEN expires_at ELSE t+make_interval(secs=>seconds) END
      WHERE action=b.action AND client_key=b.client_key;
    END IF;
  END LOOP;

  response:=jsonb_build_object('mode','downfall','version','downfall-top10-v1');
  IF p_action='read' THEN
    IF p_input<>jsonb_build_object('version','downfall-top10-v1') THEN RETURN downfall_challenge.error('invalid_request',400); END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('rank',place,'initials',initials,'score',score)
      ORDER BY score DESC,recorded_at ASC,entry_order ASC),'[]'::jsonb) INTO entries
    FROM(SELECT initials,score,recorded_at,entry_order,rank() OVER(ORDER BY score DESC) AS place
         FROM downfall_challenge.ranking_entries) ranked;
    RETURN response||jsonb_build_object('entries',entries);
  END IF;

  IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR p_input->>'id' !~ '^[a-f0-9]{48}$' THEN
    RETURN downfall_challenge.error('attempt_not_found',404);
  END IF;
  IF p_action='issue' THEN
    IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN downfall_challenge.error('invalid_request',400); END IF;
    IF(SELECT count(*) FROM downfall_challenge.attempts)>=2048 THEN RETURN downfall_challenge.error('server_busy',503); END IF;
    IF(SELECT count(*) FROM downfall_challenge.attempts WHERE client_key=p_client_key AND expires_at>t AND NOT invalid AND submitted_response IS NULL)>=4 THEN
      RETURN downfall_challenge.error('rate_limited',429);
    END IF;
    INSERT INTO downfall_challenge.attempts(id,client_key,version,issued_at,expires_at)
    VALUES(p_input->>'id',p_client_key,'downfall-top10-v1',t,t+interval '2 hours')
    ON CONFLICT DO NOTHING RETURNING * INTO a;
    IF NOT FOUND THEN RETURN downfall_challenge.error('attempt_conflict',409); END IF;
    RETURN response||jsonb_build_object('id',a.id);
  END IF;

  SELECT * INTO a FROM downfall_challenge.attempts WHERE id=p_input->>'id' FOR UPDATE;
  IF NOT FOUND OR a.client_key<>p_client_key THEN RETURN downfall_challenge.error('attempt_not_found',404); END IF;
  IF a.expires_at<=t THEN RETURN downfall_challenge.error('attempt_expired',410); END IF;
  IF a.version<>'downfall-top10-v1' THEN RETURN downfall_challenge.error('unsupported_version',409); END IF;

  IF p_action='invalidate' THEN
    IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN downfall_challenge.error('invalid_request',400); END IF;
    IF a.submission_hash IS NULL THEN UPDATE downfall_challenge.attempts SET invalid=true WHERE id=a.id; END IF;
    RETURN response;
  END IF;
  IF a.invalid THEN RETURN downfall_challenge.error('attempt_invalid',409); END IF;
  IF p_action='inspect' THEN
    IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN downfall_challenge.error('invalid_request',400); END IF;
    RETURN response;
  END IF;

  IF p_action='finalize' THEN
    result:=p_input->'result';
    IF p_input-ARRAY['id','version','result','transcriptHash']<>'{}'::jsonb OR
       jsonb_typeof(p_input->'transcriptHash') IS DISTINCT FROM 'string' OR p_input->>'transcriptHash' !~ '^[a-f0-9]{64}$' OR
       jsonb_typeof(result) IS DISTINCT FROM 'object' OR
       result-ARRAY['score','kills','wave','activeMs','maxCombo','shots','hits']<>'{}'::jsonb OR
       EXISTS(SELECT 1 FROM unnest(ARRAY['score','kills','wave','activeMs','maxCombo','shots','hits']) AS k
         WHERE jsonb_typeof(result->k) IS DISTINCT FROM 'number' OR result->>k !~ '^[0-9]{1,8}$') THEN
      RETURN downfall_challenge.error('invalid_result',400);
    END IF;
    IF (result->>'score')::integer NOT BETWEEN 0 AND 32400000 OR
       (result->>'kills')::integer NOT BETWEEN 0 AND 108000 OR
       (result->>'wave')::integer NOT BETWEEN 1 AND 10000 OR
       (result->>'activeMs')::integer NOT BETWEEN 0 AND 1800000 OR
       (result->>'maxCombo')::integer NOT BETWEEN 0 AND 108000 OR
       (result->>'shots')::integer NOT BETWEEN 0 AND 108000 OR
       (result->>'hits')::integer NOT BETWEEN 0 AND 216000 OR
       (result->>'maxCombo')::integer>(result->>'kills')::integer THEN
      RETURN downfall_challenge.error('invalid_result',400);
    END IF;
    IF a.transcript_hash IS NOT NULL THEN
      IF a.transcript_hash<>p_input->>'transcriptHash' OR a.verified_result<>result THEN
        RETURN downfall_challenge.error('attempt_conflict',409);
      END IF;
      RETURN a.finish_response;
    END IF;
    elapsed_ms:=floor(extract(epoch FROM t-a.issued_at)*1000);
    IF elapsed_ms<0 OR (result->>'activeMs')::integer>elapsed_ms+1000 THEN RETURN downfall_challenge.error('future_timing',400); END IF;
    response:=response||jsonb_build_object('verified',true);
    UPDATE downfall_challenge.attempts SET transcript_hash=p_input->>'transcriptHash',verified_result=result,finish_response=response WHERE id=a.id;
    RETURN response;
  END IF;

  IF p_input-ARRAY['id','version','initials','publicConsent','rankingConsent','submissionHash']<>'{}'::jsonb OR
     jsonb_typeof(p_input->'submissionHash') IS DISTINCT FROM 'string' OR p_input->>'submissionHash' !~ '^[a-f0-9]{64}$' THEN
    RETURN downfall_challenge.error('invalid_request',400);
  END IF;
  IF p_input->'publicConsent' IS DISTINCT FROM 'true'::jsonb OR p_input->>'rankingConsent' IS DISTINCT FROM 'downfall-top10-v1' THEN
    RETURN downfall_challenge.error('public_consent_required',400);
  END IF;
  IF jsonb_typeof(p_input->'initials') IS DISTINCT FROM 'string' OR p_input->>'initials' !~ '^[A-Z]{3}$' THEN
    RETURN downfall_challenge.error('invalid_initials',400);
  END IF;
  IF p_input->>'initials'=ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN
    RETURN downfall_challenge.error('blocked_initials',400);
  END IF;
  IF a.submission_hash IS NOT NULL THEN
    IF a.submission_hash<>p_input->>'submissionHash' THEN RETURN downfall_challenge.error('attempt_conflict',409); END IF;
    RETURN a.submitted_response;
  END IF;
  IF a.verified_result IS NULL THEN RETURN downfall_challenge.error('attempt_unverified',409); END IF;
  IF (a.verified_result->>'score')::integer<=0 THEN RETURN downfall_challenge.error('not_qualified',409); END IF;

  INSERT INTO downfall_challenge.ranking_entries(recorded_at,initials,score,consent_version)
  VALUES(t,p_input->>'initials',(a.verified_result->>'score')::integer,'downfall-top10-v1') RETURNING entry_order INTO inserted_order;
  DELETE FROM downfall_challenge.ranking_entries WHERE entry_order IN(
    SELECT entry_order FROM downfall_challenge.ranking_entries ORDER BY score DESC,recorded_at ASC,entry_order ASC OFFSET 10);
  SELECT EXISTS(SELECT 1 FROM downfall_challenge.ranking_entries WHERE entry_order=inserted_order) INTO retained;
  response:=response||jsonb_build_object('ranked',retained);
  UPDATE downfall_challenge.attempts SET submission_hash=p_input->>'submissionHash',submitted_response=response WHERE id=a.id;
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.downfall_challenge_rpc(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.downfall_challenge_rpc(text,jsonb,text) TO service_role;
COMMIT;
