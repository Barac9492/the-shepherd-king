-- DESIGN REFERENCE ONLY. NOT EXECUTED. NOT A DEPLOYMENT OR MIGRATION.
-- A future authorized server owns replay verification and all writes.
-- Never expose these tables or the function as an anonymous browser-write API.
BEGIN;
CREATE SCHEMA challenge_reference;
REVOKE ALL ON SCHEMA challenge_reference FROM PUBLIC;

CREATE TABLE challenge_reference.attempts (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{48}$'),
  seed text NOT NULL CHECK (seed ~ '^[a-f0-9]{32}$'),
  rule_version text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  transcript_hash text CHECK (transcript_hash ~ '^[a-f0-9]{64}$'),
  verified_result jsonb,
  qualified_at_finish boolean,
  finish_response jsonb,
  submission_hash text CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  submission_response jsonb,
  CHECK (expires_at > issued_at),
  CHECK ((transcript_hash IS NULL) = (verified_result IS NULL)),
  CHECK ((transcript_hash IS NULL) = (finish_response IS NULL)),
  CHECK ((transcript_hash IS NULL) = (qualified_at_finish IS NULL)),
  CHECK ((submission_hash IS NULL) = (submission_response IS NULL))
);
CREATE INDEX attempts_expiry ON challenge_reference.attempts (expires_at);
CREATE TABLE challenge_reference.highest_record (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  initials text CHECK (initials ~ '^[A-Z]{3}$'),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  hits integer CHECK (hits BETWEEN 0 AND 60),
  round integer CHECK (round BETWEEN 1 AND 60),
  active_ms integer CHECK (active_ms BETWEEN 0 AND 600000),
  recorded_at timestamptz,
  CHECK ((score = 0 AND initials IS NULL) OR (score > 0 AND initials IS NOT NULL))
);
INSERT INTO challenge_reference.highest_record(singleton) VALUES(true);
REVOKE ALL ON ALL TABLES IN SCHEMA challenge_reference FROM PUBLIC;

-- Before this transaction, trusted server replay has finalized exactly once
-- under SELECT ... FOR UPDATE on the attempt. No client-supplied score is used.
-- Lock ordering for every submission: attempt first, then singleton record.
-- Concurrent first-winner and higher-winner submissions serialize on the row.
CREATE FUNCTION challenge_reference.submit_record(
  p_attempt_id text, p_initials text, p_public_consent boolean, p_submission_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, challenge_reference AS $$
DECLARE
  a challenge_reference.attempts%ROWTYPE;
  r challenge_reference.highest_record%ROWTYPE;
  outcome jsonb;
  did_win boolean := false;
BEGIN
  IF p_public_consent IS DISTINCT FROM true OR p_initials IS NULL OR
     p_initials !~ '^[A-Z]{3}$' OR p_submission_hash IS NULL OR
     p_submission_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid submission';
  END IF;
  IF p_initials = ANY(ARRAY['ASS','CUM','FAG','FCK','FUK','KKK','NIG','SEX','SHT','TIT','WTF']) THEN
    RAISE EXCEPTION 'blocked initials';
  END IF;
  SELECT * INTO a FROM challenge_reference.attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR a.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'attempt expired or absent'; END IF;
  IF a.submission_hash IS NOT NULL THEN
    IF a.submission_hash <> p_submission_hash THEN RAISE EXCEPTION 'attempt conflict'; END IF;
    RETURN a.submission_response;
  END IF;
  IF a.qualified_at_finish IS DISTINCT FROM true OR a.verified_result IS NULL THEN
    RAISE EXCEPTION 'attempt unverified or not qualified';
  END IF;
  SELECT * INTO r FROM challenge_reference.highest_record WHERE singleton FOR UPDATE;
  IF (a.verified_result->>'score')::integer > r.score THEN
    UPDATE challenge_reference.highest_record SET
      initials = p_initials,
      score = (a.verified_result->>'score')::integer,
      hits = (a.verified_result->>'hits')::integer,
      round = (a.verified_result->>'round')::integer,
      active_ms = (a.verified_result->>'activeMs')::integer,
      recorded_at = clock_timestamp()
    WHERE singleton RETURNING * INTO r;
    did_win := true;
  END IF;
  outcome := jsonb_build_object('accepted', did_win,
    'reason', CASE WHEN did_win THEN 'recorded' ELSE 'record_changed' END,
    'record', jsonb_build_object('initials', r.initials, 'score', r.score,
      'hits', r.hits, 'round', r.round, 'activeMs', r.active_ms, 'recordedAt', r.recorded_at));
  UPDATE challenge_reference.attempts SET submission_hash = p_submission_hash, submission_response = outcome
    WHERE id = p_attempt_id;
  RETURN outcome;
END;
$$;
REVOKE ALL ON FUNCTION challenge_reference.submit_record(text, text, boolean, text) FROM PUBLIC;
-- No GRANTs are supplied: service identity and policies require future review.
ROLLBACK; -- This reference deliberately leaves no objects if accidentally executed.
