-- APPROVAL REQUIRED: additive private dance and En-Gedi rankings. No backfill or sling changes.
BEGIN;
CREATE SCHEMA dance_challenge;
REVOKE ALL ON SCHEMA dance_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA dance_challenge TO service_role;
CREATE TABLE dance_challenge.attempts (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{48}$'),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 invalid boolean NOT NULL DEFAULT false,
 metric integer CHECK(metric BETWEEN 300 AND 1110),
 transcript_hash text CHECK(transcript_hash ~ '^[a-f0-9]{64}$'),
 submission_hash text CHECK(submission_hash ~ '^[a-f0-9]{64}$'),
 submitted_response jsonb
);
CREATE INDEX ON dance_challenge.attempts(expires_at);
CREATE TABLE dance_challenge.rate_buckets (
 action text NOT NULL, client_key text NOT NULL, expires_at timestamptz NOT NULL, requests integer NOT NULL,
 PRIMARY KEY(action,client_key)
);
CREATE INDEX ON dance_challenge.rate_buckets(expires_at);
CREATE TABLE dance_challenge.ranking_entries (
 entry_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 initials text NOT NULL CHECK(initials ~ '^[A-Z]{3}$'),
 metric integer NOT NULL CHECK(metric BETWEEN 300 AND 1110),
 consent_version text NOT NULL CHECK(consent_version='dance-side-top10-v1')
);
CREATE INDEX ON dance_challenge.ranking_entries(metric DESC,entry_order ASC);
ALTER TABLE dance_challenge.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dance_challenge.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dance_challenge.ranking_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA dance_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON dance_challenge.attempts,dance_challenge.rate_buckets TO service_role;
GRANT SELECT,INSERT,DELETE ON dance_challenge.ranking_entries TO service_role;
REVOKE ALL ON SEQUENCE dance_challenge.ranking_entries_entry_order_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE dance_challenge.ranking_entries_entry_order_seq TO service_role;
CREATE FUNCTION dance_challenge.error(code text, status integer) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog AS $$SELECT jsonb_build_object('error',jsonb_build_object('code',code),'status',status)$$;
REVOKE ALL ON FUNCTION dance_challenge.error(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dance_challenge.error(text,integer) TO service_role;
CREATE FUNCTION public.dance_challenge_rpc(p_action text,p_input jsonb,p_client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,dance_challenge SET lock_timeout='2s' AS $$
DECLARE
 t timestamptz; a dance_challenge.attempts%ROWTYPE; b dance_challenge.rate_buckets%ROWTYPE;
 response jsonb; entries jsonb; result jsonb; quota integer; seconds integer; added bigint; retained boolean; metric_value integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','issue','inspect','finalize','submit','invalidate') OR
    p_client_key IS NULL OR p_client_key !~ '^[a-f0-9]{64}$' OR p_client_key=repeat('0',64) OR
    jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>4096 THEN RETURN dance_challenge.error('invalid_request',400); END IF;
 IF p_input->>'version' IS DISTINCT FROM 'side-top10-v1' THEN RETURN dance_challenge.error('unsupported_version',409); END IF;
 PERFORM pg_advisory_xact_lock(1397508423,2);
 t:=clock_timestamp();
 DELETE FROM dance_challenge.attempts WHERE id IN(SELECT id FROM dance_challenge.attempts WHERE expires_at<=t ORDER BY expires_at LIMIT 64);
 DELETE FROM dance_challenge.rate_buckets WHERE(action,client_key) IN(SELECT action,client_key FROM dance_challenge.rate_buckets WHERE expires_at<=t ORDER BY expires_at LIMIT 128);
 -- Quotas commit even for invalid attempts, unlike transaction-aborting exceptions.
 FOR quota,seconds IN SELECT 20000,86400 UNION ALL SELECT CASE p_action WHEN 'read' THEN 120 WHEN 'issue' THEN 8 WHEN 'submit' THEN 20 ELSE 30 END,CASE p_action WHEN 'issue' THEN 600 ELSE 60 END LOOP
  SELECT * INTO b FROM dance_challenge.rate_buckets WHERE action=CASE WHEN seconds=86400 THEN 'global' ELSE p_action END AND client_key=CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END;
  IF FOUND AND b.expires_at>t AND b.requests>=quota THEN RETURN dance_challenge.error('rate_limited',429); END IF;
  IF NOT FOUND THEN
   IF(SELECT count(*) FROM dance_challenge.rate_buckets)>=4096 THEN RETURN dance_challenge.error('server_busy',503); END IF;
   INSERT INTO dance_challenge.rate_buckets VALUES(CASE WHEN seconds=86400 THEN 'global' ELSE p_action END,CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END,t+make_interval(secs=>seconds),1);
  ELSE
   UPDATE dance_challenge.rate_buckets SET requests=CASE WHEN expires_at>t THEN requests+1 ELSE 1 END,expires_at=CASE WHEN expires_at>t THEN expires_at ELSE t+make_interval(secs=>seconds) END WHERE action=b.action AND client_key=b.client_key;
  END IF;
 END LOOP;
 response:=jsonb_build_object('mode','dance','version','side-top10-v1');
 IF p_action='read' THEN
  IF p_input<>jsonb_build_object('version','side-top10-v1') THEN RETURN dance_challenge.error('invalid_request',400); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('initials',initials,'metric',metric,'rank',place) ORDER BY metric DESC,entry_order),'[]'::jsonb) INTO entries
  FROM(SELECT initials,metric,entry_order,rank() OVER(ORDER BY metric DESC) AS place FROM dance_challenge.ranking_entries) ranked;
  RETURN response||jsonb_build_object('entries',entries);
 END IF;
 IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR p_input->>'id' !~ '^[a-f0-9]{48}$' THEN RETURN dance_challenge.error('attempt_not_found',404); END IF;
 IF p_action='issue' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN dance_challenge.error('invalid_request',400); END IF;
  IF(SELECT count(*) FROM dance_challenge.attempts)>=2048 THEN RETURN dance_challenge.error('server_busy',503); END IF;
  INSERT INTO dance_challenge.attempts(id,issued_at,expires_at) VALUES(p_input->>'id',t,t+interval '30 minutes') ON CONFLICT DO NOTHING RETURNING * INTO a;
  IF NOT FOUND THEN RETURN dance_challenge.error('attempt_conflict',409); END IF;
  RETURN response||jsonb_build_object('id',a.id);
 END IF;
 SELECT * INTO a FROM dance_challenge.attempts WHERE id=p_input->>'id' FOR UPDATE;
 IF NOT FOUND THEN RETURN dance_challenge.error('attempt_not_found',404); END IF;
 IF a.expires_at<=t THEN RETURN dance_challenge.error('attempt_expired',410); END IF;
 IF p_action='invalidate' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN dance_challenge.error('invalid_request',400); END IF;
  IF a.submission_hash IS NULL THEN UPDATE dance_challenge.attempts SET invalid=true WHERE id=a.id; END IF;
  RETURN response;
 END IF;
 IF a.invalid THEN RETURN dance_challenge.error('attempt_invalid',409); END IF;
 IF p_action='inspect' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN dance_challenge.error('invalid_request',400); END IF;
  RETURN response;
 END IF;
 IF p_action='finalize' THEN
  result:=p_input->'result';
  IF p_input-ARRAY['id','version','result','transcriptHash']<>'{}'::jsonb OR
   jsonb_typeof(p_input->'transcriptHash') IS DISTINCT FROM 'string' OR p_input->>'transcriptHash' !~ '^[a-f0-9]{64}$' OR
   jsonb_typeof(result) IS DISTINCT FROM 'object' OR result-ARRAY['metric','activeMs']<>'{}'::jsonb OR
   jsonb_typeof(result->'metric') IS DISTINCT FROM 'number' OR result->>'metric' !~ '^[0-9]{1,6}$' OR
   jsonb_typeof(result->'activeMs') IS DISTINCT FROM 'number' OR result->>'activeMs' !~ '^[0-9]{1,6}$' THEN RETURN dance_challenge.error('invalid_result',400); END IF;
  metric_value:=(result->>'metric')::integer;
  IF metric_value NOT BETWEEN 300 AND 1110 OR (result->>'activeMs')::integer<>0 THEN RETURN dance_challenge.error('invalid_result',400); END IF;
  IF (result->>'activeMs')::integer > extract(epoch FROM(t-a.issued_at))*1000+150 THEN RETURN dance_challenge.error('future_timing',400); END IF;
  IF a.transcript_hash IS NOT NULL THEN
   IF a.transcript_hash<>p_input->>'transcriptHash' OR a.metric<>metric_value THEN RETURN dance_challenge.error('attempt_conflict',409); END IF;
   RETURN response;
  END IF;
  UPDATE dance_challenge.attempts SET metric=metric_value,transcript_hash=p_input->>'transcriptHash' WHERE id=a.id;
  RETURN response;
 END IF;
 IF p_input-ARRAY['id','version','initials','publicConsent','rankingConsent','submissionHash']<>'{}'::jsonb OR
  jsonb_typeof(p_input->'submissionHash') IS DISTINCT FROM 'string' OR p_input->>'submissionHash' !~ '^[a-f0-9]{64}$' THEN RETURN dance_challenge.error('invalid_request',400); END IF;
 IF p_input->'publicConsent' IS DISTINCT FROM 'true'::jsonb OR p_input->>'rankingConsent' IS DISTINCT FROM 'dance-side-top10-v1' THEN RETURN dance_challenge.error('public_consent_required',400); END IF;
 IF jsonb_typeof(p_input->'initials') IS DISTINCT FROM 'string' OR p_input->>'initials' !~ '^[A-Z]{3}$' THEN RETURN dance_challenge.error('invalid_initials',400); END IF;
 IF p_input->>'initials'=ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN RETURN dance_challenge.error('blocked_initials',400); END IF;
 IF a.submission_hash IS NOT NULL THEN
  IF a.submission_hash<>p_input->>'submissionHash' THEN RETURN dance_challenge.error('attempt_conflict',409); END IF;
  RETURN a.submitted_response;
 END IF;
 IF a.metric IS NULL THEN RETURN dance_challenge.error('attempt_unverified',409); END IF;
 INSERT INTO dance_challenge.ranking_entries(initials,metric,consent_version) VALUES(p_input->>'initials',a.metric,'dance-side-top10-v1') RETURNING entry_order INTO added;
 DELETE FROM dance_challenge.ranking_entries WHERE entry_order NOT IN(SELECT entry_order FROM dance_challenge.ranking_entries ORDER BY metric DESC,entry_order ASC LIMIT 10);
 SELECT EXISTS(SELECT 1 FROM dance_challenge.ranking_entries WHERE entry_order=added) INTO retained;
 response:=response||jsonb_build_object('ranked',retained);
 UPDATE dance_challenge.attempts SET submission_hash=p_input->>'submissionHash',submitted_response=response WHERE id=a.id;
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.dance_challenge_rpc(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dance_challenge_rpc(text,jsonb,text) TO service_role;

CREATE SCHEMA engedi_challenge;
REVOKE ALL ON SCHEMA engedi_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA engedi_challenge TO service_role;
CREATE TABLE engedi_challenge.attempts (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{48}$'),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 invalid boolean NOT NULL DEFAULT false,
 metric integer CHECK(metric BETWEEN 1 AND 12000),
 transcript_hash text CHECK(transcript_hash ~ '^[a-f0-9]{64}$'),
 submission_hash text CHECK(submission_hash ~ '^[a-f0-9]{64}$'),
 submitted_response jsonb
);
CREATE INDEX ON engedi_challenge.attempts(expires_at);
CREATE TABLE engedi_challenge.rate_buckets (
 action text NOT NULL, client_key text NOT NULL, expires_at timestamptz NOT NULL, requests integer NOT NULL,
 PRIMARY KEY(action,client_key)
);
CREATE INDEX ON engedi_challenge.rate_buckets(expires_at);
CREATE TABLE engedi_challenge.ranking_entries (
 entry_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 initials text NOT NULL CHECK(initials ~ '^[A-Z]{3}$'),
 metric integer NOT NULL CHECK(metric BETWEEN 1 AND 12000),
 consent_version text NOT NULL CHECK(consent_version='engedi-side-top10-v1')
);
CREATE INDEX ON engedi_challenge.ranking_entries(metric ASC,entry_order ASC);
ALTER TABLE engedi_challenge.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engedi_challenge.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE engedi_challenge.ranking_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA engedi_challenge FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON engedi_challenge.attempts,engedi_challenge.rate_buckets TO service_role;
GRANT SELECT,INSERT,DELETE ON engedi_challenge.ranking_entries TO service_role;
REVOKE ALL ON SEQUENCE engedi_challenge.ranking_entries_entry_order_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE engedi_challenge.ranking_entries_entry_order_seq TO service_role;
CREATE FUNCTION engedi_challenge.error(code text, status integer) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog AS $$SELECT jsonb_build_object('error',jsonb_build_object('code',code),'status',status)$$;
REVOKE ALL ON FUNCTION engedi_challenge.error(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION engedi_challenge.error(text,integer) TO service_role;
CREATE FUNCTION public.engedi_challenge_rpc(p_action text,p_input jsonb,p_client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,engedi_challenge SET lock_timeout='2s' AS $$
DECLARE
 t timestamptz; a engedi_challenge.attempts%ROWTYPE; b engedi_challenge.rate_buckets%ROWTYPE;
 response jsonb; entries jsonb; result jsonb; quota integer; seconds integer; added bigint; retained boolean; metric_value integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','issue','inspect','finalize','submit','invalidate') OR
    p_client_key IS NULL OR p_client_key !~ '^[a-f0-9]{64}$' OR p_client_key=repeat('0',64) OR
    jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>4096 THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
 IF p_input->>'version' IS DISTINCT FROM 'side-top10-v1' THEN RETURN engedi_challenge.error('unsupported_version',409); END IF;
 PERFORM pg_advisory_xact_lock(1397508423,3);
 t:=clock_timestamp();
 DELETE FROM engedi_challenge.attempts WHERE id IN(SELECT id FROM engedi_challenge.attempts WHERE expires_at<=t ORDER BY expires_at LIMIT 64);
 DELETE FROM engedi_challenge.rate_buckets WHERE(action,client_key) IN(SELECT action,client_key FROM engedi_challenge.rate_buckets WHERE expires_at<=t ORDER BY expires_at LIMIT 128);
 -- Quotas commit even for invalid attempts, unlike transaction-aborting exceptions.
 FOR quota,seconds IN SELECT 20000,86400 UNION ALL SELECT CASE p_action WHEN 'read' THEN 120 WHEN 'issue' THEN 8 WHEN 'submit' THEN 20 ELSE 30 END,CASE p_action WHEN 'issue' THEN 600 ELSE 60 END LOOP
  SELECT * INTO b FROM engedi_challenge.rate_buckets WHERE action=CASE WHEN seconds=86400 THEN 'global' ELSE p_action END AND client_key=CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END;
  IF FOUND AND b.expires_at>t AND b.requests>=quota THEN RETURN engedi_challenge.error('rate_limited',429); END IF;
  IF NOT FOUND THEN
   IF(SELECT count(*) FROM engedi_challenge.rate_buckets)>=4096 THEN RETURN engedi_challenge.error('server_busy',503); END IF;
   INSERT INTO engedi_challenge.rate_buckets VALUES(CASE WHEN seconds=86400 THEN 'global' ELSE p_action END,CASE WHEN seconds=86400 THEN repeat('0',64) ELSE p_client_key END,t+make_interval(secs=>seconds),1);
  ELSE
   UPDATE engedi_challenge.rate_buckets SET requests=CASE WHEN expires_at>t THEN requests+1 ELSE 1 END,expires_at=CASE WHEN expires_at>t THEN expires_at ELSE t+make_interval(secs=>seconds) END WHERE action=b.action AND client_key=b.client_key;
  END IF;
 END LOOP;
 response:=jsonb_build_object('mode','engedi','version','side-top10-v1');
 IF p_action='read' THEN
  IF p_input<>jsonb_build_object('version','side-top10-v1') THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('initials',initials,'metric',metric,'rank',place) ORDER BY metric ASC,entry_order),'[]'::jsonb) INTO entries
  FROM(SELECT initials,metric,entry_order,rank() OVER(ORDER BY metric ASC) AS place FROM engedi_challenge.ranking_entries) ranked;
  RETURN response||jsonb_build_object('entries',entries);
 END IF;
 IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR p_input->>'id' !~ '^[a-f0-9]{48}$' THEN RETURN engedi_challenge.error('attempt_not_found',404); END IF;
 IF p_action='issue' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
  IF(SELECT count(*) FROM engedi_challenge.attempts)>=2048 THEN RETURN engedi_challenge.error('server_busy',503); END IF;
  INSERT INTO engedi_challenge.attempts(id,issued_at,expires_at) VALUES(p_input->>'id',t,t+interval '30 minutes') ON CONFLICT DO NOTHING RETURNING * INTO a;
  IF NOT FOUND THEN RETURN engedi_challenge.error('attempt_conflict',409); END IF;
  RETURN response||jsonb_build_object('id',a.id);
 END IF;
 SELECT * INTO a FROM engedi_challenge.attempts WHERE id=p_input->>'id' FOR UPDATE;
 IF NOT FOUND THEN RETURN engedi_challenge.error('attempt_not_found',404); END IF;
 IF a.expires_at<=t THEN RETURN engedi_challenge.error('attempt_expired',410); END IF;
 IF p_action='invalidate' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
  IF a.submission_hash IS NULL THEN UPDATE engedi_challenge.attempts SET invalid=true WHERE id=a.id; END IF;
  RETURN response;
 END IF;
 IF a.invalid THEN RETURN engedi_challenge.error('attempt_invalid',409); END IF;
 IF p_action='inspect' THEN
  IF p_input-ARRAY['id','version']<>'{}'::jsonb THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
  RETURN response;
 END IF;
 IF p_action='finalize' THEN
  result:=p_input->'result';
  IF p_input-ARRAY['id','version','result','transcriptHash']<>'{}'::jsonb OR
   jsonb_typeof(p_input->'transcriptHash') IS DISTINCT FROM 'string' OR p_input->>'transcriptHash' !~ '^[a-f0-9]{64}$' OR
   jsonb_typeof(result) IS DISTINCT FROM 'object' OR result-ARRAY['metric','activeMs']<>'{}'::jsonb OR
   jsonb_typeof(result->'metric') IS DISTINCT FROM 'number' OR result->>'metric' !~ '^[0-9]{1,6}$' OR
   jsonb_typeof(result->'activeMs') IS DISTINCT FROM 'number' OR result->>'activeMs' !~ '^[0-9]{1,6}$' THEN RETURN engedi_challenge.error('invalid_result',400); END IF;
  metric_value:=(result->>'metric')::integer;
  IF metric_value NOT BETWEEN 1 AND 12000 OR (result->>'activeMs')::integer<>metric_value*10 THEN RETURN engedi_challenge.error('invalid_result',400); END IF;
  IF (result->>'activeMs')::integer > extract(epoch FROM(t-a.issued_at))*1000+150 THEN RETURN engedi_challenge.error('future_timing',400); END IF;
  IF a.transcript_hash IS NOT NULL THEN
   IF a.transcript_hash<>p_input->>'transcriptHash' OR a.metric<>metric_value THEN RETURN engedi_challenge.error('attempt_conflict',409); END IF;
   RETURN response;
  END IF;
  UPDATE engedi_challenge.attempts SET metric=metric_value,transcript_hash=p_input->>'transcriptHash' WHERE id=a.id;
  RETURN response;
 END IF;
 IF p_input-ARRAY['id','version','initials','publicConsent','rankingConsent','submissionHash']<>'{}'::jsonb OR
  jsonb_typeof(p_input->'submissionHash') IS DISTINCT FROM 'string' OR p_input->>'submissionHash' !~ '^[a-f0-9]{64}$' THEN RETURN engedi_challenge.error('invalid_request',400); END IF;
 IF p_input->'publicConsent' IS DISTINCT FROM 'true'::jsonb OR p_input->>'rankingConsent' IS DISTINCT FROM 'engedi-side-top10-v1' THEN RETURN engedi_challenge.error('public_consent_required',400); END IF;
 IF jsonb_typeof(p_input->'initials') IS DISTINCT FROM 'string' OR p_input->>'initials' !~ '^[A-Z]{3}$' THEN RETURN engedi_challenge.error('invalid_initials',400); END IF;
 IF p_input->>'initials'=ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN RETURN engedi_challenge.error('blocked_initials',400); END IF;
 IF a.submission_hash IS NOT NULL THEN
  IF a.submission_hash<>p_input->>'submissionHash' THEN RETURN engedi_challenge.error('attempt_conflict',409); END IF;
  RETURN a.submitted_response;
 END IF;
 IF a.metric IS NULL THEN RETURN engedi_challenge.error('attempt_unverified',409); END IF;
 INSERT INTO engedi_challenge.ranking_entries(initials,metric,consent_version) VALUES(p_input->>'initials',a.metric,'engedi-side-top10-v1') RETURNING entry_order INTO added;
 DELETE FROM engedi_challenge.ranking_entries WHERE entry_order NOT IN(SELECT entry_order FROM engedi_challenge.ranking_entries ORDER BY metric ASC,entry_order ASC LIMIT 10);
 SELECT EXISTS(SELECT 1 FROM engedi_challenge.ranking_entries WHERE entry_order=added) INTO retained;
 response:=response||jsonb_build_object('ranked',retained);
 UPDATE engedi_challenge.attempts SET submission_hash=p_input->>'submissionHash',submitted_response=response WHERE id=a.id;
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.engedi_challenge_rpc(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.engedi_challenge_rpc(text,jsonb,text) TO service_role;

COMMIT;
