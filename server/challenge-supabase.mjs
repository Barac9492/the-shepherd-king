/** Server-only Supabase adapter. No key, endpoint or RPC response is logged. */
import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED, ChallengeInputError, replayChallenge } from '../src/sling-challenge-core.js';
import { ChallengeServiceError, validateInitials } from './challenge-service.mjs';

export const CHALLENGE_SUPABASE_PROJECT_REF = 'jdsjvrynmnzoztfinlzi';
const metadata = Object.freeze({ mode: 'online', onlineEligible: true, recordScope: 'global', ruleVersion: CHALLENGE_RULES.version });
const messages = Object.freeze({
  invalid_request: 'This request is not valid', invalid_result: 'This attempt could not be verified',
  attempt_not_found: 'This attempt is unavailable; start a new one', attempt_expired: 'This attempt expired; start a new one',
  attempt_conflict: 'This attempt has already been finalized with different data',
  unsupported_version: 'The challenge rules changed; start a new attempt',
  future_timing: 'The attempt is faster than the elapsed server time',
  attempt_unverified: 'Finish and verify this attempt first', not_qualified: 'This attempt did not beat the record',
  public_consent_required: 'Confirm that your initials and score may be displayed publicly',
  invalid_initials: 'Enter exactly three uppercase English letters', blocked_initials: 'Please choose different initials',
  rate_limited: 'Too many requests; please wait before retrying', server_busy: 'The record service is busy; try again later',
  server_unavailable: 'The record service is temporarily unavailable',
});
const fail = (code, status = 400, details = {}) => { throw new ChallengeServiceError(code, messages[code] ?? 'This request could not be verified', status, details); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(key => Object.hasOwn(x, key));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = id => typeof id === 'string' && /^[a-f0-9]{48}$/.test(id);
const validSeed = seed => seed === CHALLENGE_COURSE_SEED;
const unavailable = () => fail('server_unavailable', 503);

export function validateSupabaseChallengeConfig({ url, secretKey } = {}) {
  // Exact canonical project origin; no URL userinfo, paths, query, alternate host or redirects.
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url))
    throw new TypeError('CHALLENGE_SUPABASE_URL must be the exact HTTPS Supabase project origin');
  if (url !== `https://${CHALLENGE_SUPABASE_PROJECT_REF}.supabase.co`)
    throw new TypeError('CHALLENGE_SUPABASE_URL must point to the dedicated game project');
  if (typeof secretKey !== 'string' || !/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(secretKey))
    throw new TypeError('CHALLENGE_SUPABASE_SECRET_KEY must be a modern server-only secret key');
  return { url, secretKey };
}
function recordProjection(record) {
  if (record === null) return null;
  if (!object(record) || typeof record.initials !== 'string' || !/^[A-Z]{3}$/.test(record.initials) ||
      !Number.isSafeInteger(record.score) || record.score < 1 || record.score > CHALLENGE_RULES.maxScore ||
      !Number.isSafeInteger(record.hits) || record.hits < 0 || record.hits > 60 ||
      !Number.isSafeInteger(record.round) || record.round < 1 || record.round > 60 ||
      !Number.isSafeInteger(record.activeMs) || record.activeMs < 0 || record.activeMs > CHALLENGE_RULES.maxActiveMs ||
      typeof record.recordedAt !== 'string' || !Number.isFinite(Date.parse(record.recordedAt))) unavailable();
  return { initials: record.initials, score: record.score, hits: record.hits, round: record.round,
    activeMs: record.activeMs, recordedAt: record.recordedAt };
}
function rankingProjection(data) {
  if (data.rankingVersion === undefined && data.entries === undefined) return {};
  if (data.rankingVersion !== 'top10-v1' || !Array.isArray(data.entries) || data.entries.length > 10) unavailable();
  let previous = Infinity;
  const entries = data.entries.map(entry => {
    if (!object(entry) || typeof entry.initials !== 'string' || !/^[A-Z]{3}$/.test(entry.initials) || !Number.isSafeInteger(entry.score) ||
        entry.score < 1 || entry.score > CHALLENGE_RULES.maxScore || entry.score > previous) unavailable();
    previous = entry.score;
    return { initials: entry.initials, score: entry.score };
  });
  return { rankingVersion: 'top10-v1', entries };
}
function attemptProjection(attempt, withTime) {
  if (!object(attempt) || !validId(attempt.id) || !validSeed(attempt.seed) || attempt.version !== CHALLENGE_RULES.version) unavailable();
  const clean = { id: attempt.id, seed: attempt.seed, version: attempt.version };
  if (withTime) {
    if (!Number.isSafeInteger(attempt.issuedAtMs) || !Number.isSafeInteger(attempt.expiresAtMs) ||
        attempt.expiresAtMs - attempt.issuedAtMs !== 1800000 ||
        typeof attempt.issuedAt !== 'string' || typeof attempt.expiresAt !== 'string' ||
        Date.parse(attempt.issuedAt) !== attempt.issuedAtMs || Date.parse(attempt.expiresAt) !== attempt.expiresAtMs) unavailable();
    Object.assign(clean, { issuedAt: attempt.issuedAt, expiresAt: attempt.expiresAt,
      issuedAtMs: attempt.issuedAtMs, expiresAtMs: attempt.expiresAtMs });
  }
  return clean;
}

export function createSupabaseChallengeService({ url, secretKey, fetchImpl = globalThis.fetch,
  randomBytes = cryptoRandomBytes, timeoutMs = 6000 } = {}) {
  const config = validateSupabaseChallengeConfig({ url, secretKey });
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000)
    throw new TypeError('Invalid server transport configuration');
  async function rpc(action, input, clientKey) {
    if (typeof clientKey !== 'string' || !/^[a-f0-9]{64}$/.test(clientKey) || clientKey === '0'.repeat(64))
      fail('invalid_request');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
    try {
      const response = await fetchImpl(`${config.url}/rest/v1/rpc/sling_challenge_rpc`, {
        method: 'POST', headers: { apikey: config.secretKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ p_action: action, p_input: { ...input, version: CHALLENGE_RULES.version }, p_client_key: clientKey }),
        signal: controller.signal, redirect: 'error', cache: 'no-store',
      });
      // Suppress upstream messages/details: they may contain SQL or private request data.
      if (!response.ok) unavailable();
      const length = Number(response.headers?.get('content-length'));
      if (Number.isFinite(length) && length > 16384) unavailable();
      // The trusted RPC has a small response; read it with an actual streaming cap too.
      let text;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const chunks = []; let bytes = 0;
        try {
          for (;;) { const { done, value } = await reader.read(); if (done) break;
            bytes += value.byteLength; if (bytes > 16384) { await reader.cancel(); unavailable(); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        text = Buffer.concat(chunks).toString('utf8');
      } else text = await response.text();
      if (Buffer.byteLength(text) > 16384) unavailable();
      let data;
      try { data = JSON.parse(text); } catch { unavailable(); }
      if (!object(data)) unavailable();
      if (data.error) {
        const code = data.error.code;
        if (!Object.hasOwn(messages, code) || ![400,404,409,410,429,503].includes(data.status)) unavailable();
        const retryAfterMs = data.error.retryAfterMs;
        const details = Number.isSafeInteger(retryAfterMs) && retryAfterMs > 0 && retryAfterMs <= 86400000 ? { retryAfterMs } : {};
        fail(code, data.status, details);
      }
      if (data.version !== CHALLENGE_RULES.version) fail('unsupported_version', 409);
      return data;
    } catch (error) {
      if (error instanceof ChallengeServiceError) throw error;
      unavailable();
    } finally { clearTimeout(timer); }
  }
  function randomHex(length) {
    const value = randomBytes(length);
    if (!(value instanceof Uint8Array) || value.byteLength !== length) unavailable();
    return Buffer.from(value).toString('hex');
  }
  return {
    async getRecord({ clientKey } = {}) {
      const data = await rpc('read', {}, clientKey);
      return { ...metadata, record: recordProjection(data.record), ...rankingProjection(data) };
    },
    async createAttempt({ clientKey } = {}) {
      const id = randomHex(24), seed = CHALLENGE_COURSE_SEED;
      const data = await rpc('issue', { id, seed, version: CHALLENGE_RULES.version }, clientKey);
      const attempt = attemptProjection(data.attempt, true);
      if (attempt.id !== id || attempt.seed !== seed) unavailable();
      return { ...metadata, attempt };
    },
    async finishAttempt(id, payload, { clientKey } = {}) {
      if (!validId(id)) fail('attempt_not_found',404);
      if (!exact(payload, ['shots','endedAtMs']) || !Array.isArray(payload.shots) || payload.shots.length > CHALLENGE_RULES.maxShots)
        fail('invalid_request');
      // Inspect consumes a persistent finish quota even when replay subsequently rejects.
      const inspected = await rpc('inspect', { id }, clientKey);
      const attempt = attemptProjection(inspected.attempt, false);
      if (attempt.id !== id) unavailable();
      let result;
      try { result = replayChallenge({ seed: attempt.seed, shots: payload.shots, endedAtMs: payload.endedAtMs }); }
      catch (error) {
        if (error instanceof ChallengeInputError) throw new ChallengeServiceError(error.code, 'This attempt could not be verified', 400);
        throw error;
      }
      const transcriptHash = hash({ endedAtMs: payload.endedAtMs,
        shots: payload.shots.map(shot => ({ atMs: shot.atMs, direction: shot.direction, heldMs: shot.heldMs })) });
      const data = await rpc('finalize', { id, transcriptHash, result }, clientKey);
      if (typeof data.qualifies !== 'boolean' || !object(data.result) ||
          Object.keys(result).some(key => data.result[key] !== result[key])) unavailable();
      // Use the locally replayed public result, never arbitrary upstream additions.
      let ranking = {};
      if (data.rankingVersion !== undefined) {
        if (data.rankingVersion !== 'top10-v1' || data.rankingEligible !== (result.score > 0)) unavailable();
        ranking = { rankingVersion: 'top10-v1', rankingEligible: data.rankingEligible };
      }
      return { ...metadata, qualifies: data.qualifies, result, record: recordProjection(data.record), ...ranking };
    },
    async submitRecord(id, payload, { clientKey } = {}) {
      if (!validId(id)) fail('attempt_not_found',404);
      const ranked = object(payload) && Object.hasOwn(payload, 'rankingConsent');
      if (!exact(payload, ranked ? ['initials','publicConsent','rankingConsent'] : ['initials','publicConsent']) || payload.publicConsent !== true || (ranked && payload.rankingConsent !== 'top10-v1')) fail('public_consent_required');
      validateInitials(payload.initials);
      const submission = { initials: payload.initials, publicConsent: true, ...(ranked ? { rankingConsent: 'top10-v1' } : {}) };
      const data = await rpc('submit', { id, ...submission, submissionHash: hash(submission) }, clientKey);
      if (typeof data.accepted !== 'boolean' || data.reason !== (ranked ? (data.accepted ? 'ranked' : 'outside_top10') : (data.accepted ? 'recorded' : 'record_changed')) || (ranked && data.rankingVersion !== 'top10-v1')) unavailable();
      return { ...metadata, accepted: data.accepted, reason: data.reason, record: recordProjection(data.record), ...(ranked ? { rankingVersion: 'top10-v1' } : {}) };
    },
  };
}
