-- REVIEWED MIGRATION SQL DRAFT: local tests only; not applied to Supabase.
-- Intended isolated game project: jdsjvrynmnzoztfinlzi. No global defaults changed.
-- Generate a real migration with the Supabase CLI only after explicit authorization.
BEGIN;
CREATE SCHEMA sling_challenge;
REVOKE ALL ON SCHEMA sling_challenge FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA sling_challenge, public TO service_role;

CREATE TABLE sling_challenge.attempts (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{48}$'),
  seed text NOT NULL CHECK (seed ~ '^[a-f0-9]{32}$'),
  rule_version text NOT NULL CHECK (rule_version = 'sling-challenge-v1'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  transcript_hash text CHECK (transcript_hash ~ '^[a-f0-9]{64}$'),
  verified_result jsonb,
  finish_response jsonb,
  submission_hash text CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  submission_response jsonb,
  submission_initials text CHECK (submission_initials ~ '^[A-Z]{3}$'),
  CHECK ((transcript_hash IS NULL) = (verified_result IS NULL)),
  CHECK ((transcript_hash IS NULL) = (finish_response IS NULL)),
  CHECK ((submission_hash IS NULL) = (submission_response IS NULL)),
  CHECK ((submission_hash IS NULL) = (submission_initials IS NULL)),
  CHECK (submission_hash IS NULL OR transcript_hash IS NOT NULL)
);
CREATE INDEX sling_attempts_expiry ON sling_challenge.attempts(expires_at);
CREATE TABLE sling_challenge.highest_records (
  rule_version text PRIMARY KEY CHECK (rule_version = 'sling-challenge-v1'),
  initials text CHECK (initials ~ '^[A-Z]{3}$'),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100000),
  hits integer CHECK (hits BETWEEN 0 AND 60),
  round integer CHECK (round BETWEEN 1 AND 60),
  active_ms integer CHECK (active_ms BETWEEN 0 AND 600000),
  recorded_at timestamptz,
  CHECK ((score = 0 AND initials IS NULL) OR (score > 0 AND initials IS NOT NULL))
);
INSERT INTO sling_challenge.highest_records(rule_version) VALUES ('sling-challenge-v1');
CREATE TABLE sling_challenge.rate_buckets (
  action text NOT NULL CHECK (action IN ('read','issue','inspect','finalize','submit','global')),
  client_key text NOT NULL CHECK (client_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 0 AND 20000),
  PRIMARY KEY (action, client_key),
  CHECK (window_ends_at > window_started_at)
);
CREATE INDEX sling_rates_expiry ON sling_challenge.rate_buckets(window_ends_at);
ALTER TABLE sling_challenge.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sling_challenge.highest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sling_challenge.rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sling_challenge.attempts, sling_challenge.highest_records, sling_challenge.rate_buckets FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sling_challenge.attempts, sling_challenge.rate_buckets TO service_role;
GRANT SELECT, UPDATE ON sling_challenge.highest_records TO service_role;
-- No anonymous policies. service_role bypasses RLS but still needs these grants.

CREATE FUNCTION sling_challenge.error(p_code text, p_status integer, p_retry_ms integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT jsonb_build_object('status', p_status, 'error', jsonb_strip_nulls(
   jsonb_build_object('code', p_code, 'retryAfterMs', p_retry_ms)));
$$;
REVOKE ALL ON FUNCTION sling_challenge.error(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sling_challenge.error(text, integer, integer) TO service_role;

CREATE FUNCTION public.sling_challenge_rpc(p_action text, p_input jsonb, p_client_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, sling_challenge
SET lock_timeout = '2s'
AS $$
DECLARE
  t timestamptz;
  a sling_challenge.attempts%ROWTYPE;
  r sling_challenge.highest_records%ROWTYPE;
  b sling_challenge.rate_buckets%ROWTYPE;
  quota integer;
  window_seconds integer;
  public_record jsonb;
  result jsonb;
  response jsonb;
  accepted boolean := false;
  current_score integer;
  elapsed_ms bigint;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read','issue','inspect','finalize','submit') OR
     p_client_key IS NULL OR p_client_key !~ '^[a-f0-9]{64}$' OR p_client_key = repeat('0',64) OR
     jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text) > 24576 THEN
    RETURN sling_challenge.error('invalid_request',400);
  END IF;
  -- One short transaction gate bounds table capacities across server instances.
  -- There is no network I/O or replay inside this gate. Revisit for high volume.
  PERFORM pg_advisory_xact_lock(1397508423, 1);
  t := clock_timestamp();
  -- Bounded, lazy cleanup. Expiry is also checked on every individual operation.
  DELETE FROM sling_challenge.attempts WHERE id IN (
    SELECT id FROM sling_challenge.attempts WHERE expires_at <= t ORDER BY expires_at LIMIT 64);
  DELETE FROM sling_challenge.rate_buckets WHERE (action,client_key) IN (
    SELECT action,client_key FROM sling_challenge.rate_buckets WHERE window_ends_at <= t ORDER BY window_ends_at LIMIT 128);
  SELECT * INTO b FROM sling_challenge.rate_buckets WHERE action='global' AND client_key=repeat('0',64) FOR UPDATE;
  IF FOUND AND b.window_ends_at > t AND b.requests >= 20000 THEN
    RETURN sling_challenge.error('rate_limited',429,ceil(extract(epoch FROM b.window_ends_at-t)*1000)::integer);
  END IF;
  IF NOT FOUND OR b.window_ends_at <= t THEN
    IF (SELECT count(*) FROM sling_challenge.rate_buckets) >= 4096 THEN RETURN sling_challenge.error('server_busy',503); END IF;
    INSERT INTO sling_challenge.rate_buckets VALUES ('global',repeat('0',64),t,t+interval '24 hours',1)
      ON CONFLICT (action,client_key) DO UPDATE SET window_started_at=t,window_ends_at=t+interval '24 hours',requests=1;
  ELSE UPDATE sling_challenge.rate_buckets SET requests=requests+1 WHERE action='global' AND client_key=repeat('0',64);
  END IF;
  quota := CASE p_action WHEN 'read' THEN 120 WHEN 'issue' THEN 8 WHEN 'submit' THEN 20 ELSE 30 END;
  window_seconds := CASE p_action WHEN 'issue' THEN 600 ELSE 60 END;
  SELECT * INTO b FROM sling_challenge.rate_buckets WHERE action=p_action AND client_key=p_client_key FOR UPDATE;
  IF FOUND AND b.window_ends_at > t AND b.requests >= quota THEN
    RETURN sling_challenge.error('rate_limited',429,ceil(extract(epoch FROM b.window_ends_at-t)*1000)::integer);
  END IF;
  IF NOT FOUND OR b.window_ends_at <= t THEN
    IF (SELECT count(*) FROM sling_challenge.rate_buckets) >= 4096 THEN RETURN sling_challenge.error('server_busy',503); END IF;
    INSERT INTO sling_challenge.rate_buckets VALUES (p_action,p_client_key,t,t+make_interval(secs=>window_seconds),1)
      ON CONFLICT (action,client_key) DO UPDATE SET window_started_at=t,window_ends_at=t+make_interval(secs=>window_seconds),requests=1;
  ELSE UPDATE sling_challenge.rate_buckets SET requests=requests+1 WHERE action=p_action AND client_key=p_client_key;
  END IF;
  -- Domain failures RETURN instead of RAISE, so consumed rate quotas commit.
  SELECT * INTO r FROM sling_challenge.highest_records WHERE rule_version='sling-challenge-v1' FOR UPDATE;
  IF NOT FOUND THEN RETURN sling_challenge.error('server_unavailable',503); END IF;
  current_score := r.score;
  public_record := CASE WHEN r.score=0 THEN NULL ELSE jsonb_build_object('initials',r.initials,'score',r.score,
    'hits',r.hits,'round',r.round,'activeMs',r.active_ms,'recordedAt',r.recorded_at) END;
  IF p_action='read' THEN
    IF p_input <> '{}'::jsonb THEN RETURN sling_challenge.error('invalid_request',400); END IF;
    RETURN jsonb_build_object('record',public_record);
  END IF;
  IF p_action='issue' THEN
    IF p_input - ARRAY['id','seed','version'] <> '{}'::jsonb OR
       jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR (p_input->>'id') !~ '^[a-f0-9]{48}$' OR
       jsonb_typeof(p_input->'seed') IS DISTINCT FROM 'string' OR (p_input->>'seed') !~ '^[a-f0-9]{32}$' OR
       p_input->>'version' IS DISTINCT FROM 'sling-challenge-v1' THEN RETURN sling_challenge.error('invalid_request',400); END IF;
    IF (SELECT count(*) FROM sling_challenge.attempts) >= 2048 THEN RETURN sling_challenge.error('server_busy',503); END IF;
    INSERT INTO sling_challenge.attempts(id,seed,rule_version,issued_at,expires_at)
      VALUES(p_input->>'id',p_input->>'seed','sling-challenge-v1',t,t+interval '30 minutes')
      ON CONFLICT (id) DO NOTHING RETURNING * INTO a;
    IF NOT FOUND THEN RETURN sling_challenge.error('attempt_conflict',409); END IF;
    RETURN jsonb_build_object('attempt',jsonb_build_object('id',a.id,'seed',a.seed,'version',a.rule_version,
      'issuedAt',a.issued_at,'expiresAt',a.expires_at,'issuedAtMs',floor(extract(epoch FROM a.issued_at)*1000),
      'expiresAtMs',floor(extract(epoch FROM a.expires_at)*1000)));
  END IF;
  IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR (p_input->>'id') !~ '^[a-f0-9]{48}$' THEN
    RETURN sling_challenge.error('attempt_not_found',404);
  END IF;
  SELECT * INTO a FROM sling_challenge.attempts WHERE id=p_input->>'id' FOR UPDATE;
  IF NOT FOUND THEN RETURN sling_challenge.error('attempt_not_found',404); END IF;
  IF a.expires_at <= t THEN RETURN sling_challenge.error('attempt_expired',410); END IF;
  IF a.rule_version <> 'sling-challenge-v1' THEN RETURN sling_challenge.error('unsupported_version',409); END IF;
  IF p_action='inspect' THEN
    IF p_input - 'id' <> '{}'::jsonb THEN RETURN sling_challenge.error('invalid_request',400); END IF;
    -- This response is server-only and must never be forwarded as a public record.
    RETURN jsonb_build_object('attempt',jsonb_build_object('id',a.id,'seed',a.seed,'version',a.rule_version));
  END IF;
  IF p_action='finalize' THEN
    IF p_input - ARRAY['id','transcriptHash','result'] <> '{}'::jsonb OR
       jsonb_typeof(p_input->'transcriptHash') IS DISTINCT FROM 'string' OR
       (p_input->>'transcriptHash') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_input->'result') IS DISTINCT FROM 'object' THEN
      RETURN sling_challenge.error('invalid_result',400);
    END IF;
    result := p_input->'result';
    IF result - ARRAY['version','status','endReason','score','round','hits','lives','shots','activeMs'] <> '{}'::jsonb OR
       result->>'version' IS DISTINCT FROM a.rule_version OR result->>'status' IS DISTINCT FROM 'ended' OR
       result->>'endReason' IS NULL OR result->>'endReason' NOT IN ('lives','completed','time-limit') THEN
      RETURN sling_challenge.error('invalid_result',400);
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(ARRAY['score','round','hits','lives','shots','activeMs']) AS k
      WHERE jsonb_typeof(result->k) IS DISTINCT FROM 'number' OR (result->>k) !~ '^[0-9]{1,6}$') THEN
      RETURN sling_challenge.error('invalid_result',400);
    END IF;
    IF (result->>'score')::integer > 100000 OR (result->>'round')::integer NOT BETWEEN 1 AND 60 OR
       (result->>'hits')::integer > 60 OR (result->>'lives')::integer > 3 OR (result->>'shots')::integer > 62 OR
       (result->>'activeMs')::integer > 600000 OR (result->>'shots')::integer < (result->>'hits')::integer THEN
      RETURN sling_challenge.error('invalid_result',400);
    END IF;
    IF a.transcript_hash IS NOT NULL THEN
      IF a.transcript_hash <> p_input->>'transcriptHash' OR a.verified_result <> result THEN
        RETURN sling_challenge.error('attempt_conflict',409);
      END IF;
      RETURN a.finish_response;
    END IF;
    elapsed_ms := floor(extract(epoch FROM t-a.issued_at)*1000);
    IF elapsed_ms < 0 OR (result->>'activeMs')::integer > elapsed_ms + 150 THEN
      RETURN sling_challenge.error('future_timing',400);
    END IF;
    response := jsonb_build_object('qualifies',(result->>'score')::integer > current_score,
      'result',result,'record',public_record);
    UPDATE sling_challenge.attempts SET transcript_hash=p_input->>'transcriptHash',verified_result=result,
      finish_response=response WHERE id=a.id;
    RETURN response;
  END IF;
  -- Submit is the only remaining supported action. Inputs never contain a score.
  IF p_input - ARRAY['id','initials','publicConsent','submissionHash'] <> '{}'::jsonb OR
     p_input->'publicConsent' IS DISTINCT FROM 'true'::jsonb THEN RETURN sling_challenge.error('public_consent_required',400); END IF;
  IF jsonb_typeof(p_input->'initials') IS DISTINCT FROM 'string' OR (p_input->>'initials') !~ '^[A-Z]{3}$' THEN
    RETURN sling_challenge.error('invalid_initials',400);
  END IF;
  IF p_input->>'initials' = ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN
    RETURN sling_challenge.error('blocked_initials',400);
  END IF;
  IF jsonb_typeof(p_input->'submissionHash') IS DISTINCT FROM 'string' OR
     (p_input->>'submissionHash') !~ '^[a-f0-9]{64}$' THEN RETURN sling_challenge.error('invalid_request',400); END IF;
  IF a.submission_hash IS NOT NULL THEN
    IF a.submission_hash <> p_input->>'submissionHash' OR a.submission_initials <> p_input->>'initials' THEN RETURN sling_challenge.error('attempt_conflict',409); END IF;
    RETURN a.submission_response;
  END IF;
  IF a.verified_result IS NULL THEN RETURN sling_challenge.error('attempt_unverified',409); END IF;
  IF a.finish_response->'qualifies' IS DISTINCT FROM 'true'::jsonb THEN RETURN sling_challenge.error('not_qualified',409); END IF;
  IF (a.verified_result->>'score')::integer > current_score THEN
    UPDATE sling_challenge.highest_records SET initials=p_input->>'initials',score=(a.verified_result->>'score')::integer,
      hits=(a.verified_result->>'hits')::integer,round=(a.verified_result->>'round')::integer,
      active_ms=(a.verified_result->>'activeMs')::integer,recorded_at=t
      WHERE rule_version=a.rule_version RETURNING * INTO r;
    accepted := true;
    public_record := jsonb_build_object('initials',r.initials,'score',r.score,'hits',r.hits,'round',r.round,
      'activeMs',r.active_ms,'recordedAt',r.recorded_at);
  END IF;
  response := jsonb_build_object('accepted',accepted,'reason',CASE WHEN accepted THEN 'recorded' ELSE 'record_changed' END,
    'record',public_record);
  UPDATE sling_challenge.attempts SET submission_hash=p_input->>'submissionHash',submission_initials=p_input->>'initials',submission_response=response WHERE id=a.id;
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.sling_challenge_rpc(text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sling_challenge_rpc(text,jsonb,text) TO service_role;
-- No policy, table or credential lets a browser supply verified results directly.
-- No extension, cron, publication, exposed-schema or default-privilege changes.
COMMIT;
