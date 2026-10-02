/** LOCAL MOCK ONLY. This process-memory store is deliberately not a production leaderboard. */
import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { CHALLENGE_RULES, ChallengeInputError, replayChallenge } from '../src/sling-challenge-core.js';

export const CHALLENGE_SERVICE_LIMITS = Object.freeze({ attemptTtlMs: 30 * 60 * 1000,
  wallClockGraceMs: 150, maxAttempts: 2048, maxClients: 4096, maxBodyBytes: 24576 });
export const BLOCKED_INITIALS = Object.freeze(['ASS', 'CUM', 'FAG', 'FCK', 'FUK', 'KKK', 'NIG', 'SEX', 'SHT', 'TIT', 'WTF']);
const common = Object.freeze({ mode: 'local-mock', onlineEligible: false, recordScope: 'local-mock' });
const defaultRates = Object.freeze({ create: { count: 8, windowMs: 600000 },
  finish: { count: 30, windowMs: 60000 }, submit: { count: 20, windowMs: 60000 }, read: { count: 120, windowMs: 60000 } });
export class ChallengeServiceError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message); this.name = 'ChallengeServiceError'; this.code = code; this.status = status; this.details = details;
  }
}
function fail(code, message, status, details) { throw new ChallengeServiceError(code, message, status, details); }
const copy = value => structuredClone(value);
const strictObject = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(object, key));
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function transcriptFingerprint(payload) {
  return fingerprint({ endedAtMs: payload.endedAtMs,
    shots: payload.shots.map(shot => ({ atMs: shot.atMs, direction: shot.direction, heldMs: shot.heldMs })) });
}
export function validateInitials(initials) {
  if (typeof initials !== 'string' || !/^[A-Z]{3}$/.test(initials))
    fail('invalid_initials', 'Enter exactly three uppercase English letters');
  if (BLOCKED_INITIALS.includes(initials)) fail('blocked_initials', 'Please choose different initials');
  return initials;
}

/** Single-process atomic transaction queue. No disk, cross-process safety or persistence. */
export class InMemoryChallengeStore {
  constructor() { this.attempts = new Map(); this.record = null; this.rates = new Map(); this.pending = Promise.resolve(); }
  transaction(callback) {
    const operation = this.pending.then(() => callback(this));
    this.pending = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
export function createChallengeService({ store = new InMemoryChallengeStore(), clock = Date.now,
  randomBytes = cryptoRandomBytes, limits = {}, rateLimits = {} } = {}) {
  if (!(store instanceof InMemoryChallengeStore)) throw new TypeError('This reference service only accepts its local in-memory store');
  const config = { ...CHALLENGE_SERVICE_LIMITS, ...limits };
  const rates = { ...defaultRates, ...rateLimits };
  for (const value of Object.values(config)) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid service limit');
  for (const rate of Object.values(rates)) if (!Number.isSafeInteger(rate.count) || rate.count < 1 ||
    !Number.isSafeInteger(rate.windowMs) || rate.windowMs < 1) throw new TypeError('Invalid rate limit');
  const retentionMs = Math.max(...Object.values(rates).map(rate => rate.windowMs));
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Clock must return epoch milliseconds');
    return value;
  };
  function takeRate(db, action, clientKey, time) {
    if (typeof clientKey !== 'string' || clientKey.length < 1 || clientKey.length > 128)
      fail('invalid_client', 'Invalid client identifier');
    for (const [key, bucket] of db.rates) if (time - bucket.updatedAt > retentionMs) db.rates.delete(key);
    const key = `${action}:${clientKey}`;
    const rate = rates[action];
    let bucket = db.rates.get(key);
    if (!bucket) {
      if (db.rates.size >= config.maxClients) fail('server_busy', 'Local mock is busy; try again later', 503);
      bucket = { entries: [], updatedAt: time }; db.rates.set(key, bucket);
    }
    bucket.entries = bucket.entries.filter(entry => entry > time - rate.windowMs);
    if (bucket.entries.length >= rate.count) fail('rate_limited', 'Too many requests; please wait before retrying', 429,
      { retryAfterMs: Math.max(1, bucket.entries[0] + rate.windowMs - time) });
    bucket.entries.push(time); bucket.updatedAt = time;
  }
  function getAttempt(db, id, time) {
    if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) fail('attempt_not_found', 'This attempt was not found', 404);
    const attempt = db.attempts.get(id);
    if (!attempt) fail('attempt_not_found', 'This attempt was not found', 404);
    if (time >= attempt.expiresAtMs) { db.attempts.delete(id); fail('attempt_expired', 'This attempt expired; start a new one', 410); }
    if (time < attempt.issuedAtMs) fail('clock_error', 'The local server clock changed; start again', 503);
    return attempt;
  }
  function randomHex(bytes) {
    const value = randomBytes(bytes);
    if (!(value instanceof Uint8Array) || value.byteLength !== bytes) throw new Error('Random source returned invalid bytes');
    return Buffer.from(value).toString('hex');
  }
  return {
    async getRecord({ clientKey = 'local' } = {}) {
      return store.transaction(db => { takeRate(db, 'read', clientKey, now()); return { ...common, record: copy(db.record) }; });
    },
    async createAttempt({ clientKey = 'local' } = {}) {
      return store.transaction(db => {
        const time = now(); takeRate(db, 'create', clientKey, time);
        for (const [id, attempt] of db.attempts) if (time >= attempt.expiresAtMs) db.attempts.delete(id);
        if (db.attempts.size >= config.maxAttempts) fail('server_busy', 'Local mock is busy; try again later', 503);
        let id;
        for (let i = 0; i < 3; i++) { id = randomHex(24); if (!db.attempts.has(id)) break; }
        if (db.attempts.has(id)) fail('server_busy', 'Could not create an attempt', 503);
        const attempt = { id, seed: randomHex(16), issuedAtMs: time, expiresAtMs: time + config.attemptTtlMs,
          version: CHALLENGE_RULES.version, finish: null, submission: null };
        db.attempts.set(id, attempt);
        return { ...common, attempt: { id, seed: attempt.seed, version: attempt.version,
          issuedAt: new Date(time).toISOString(), expiresAt: new Date(attempt.expiresAtMs).toISOString(),
          issuedAtMs: time, expiresAtMs: attempt.expiresAtMs } };
      });
    },
    async finishAttempt(id, payload, { clientKey = 'local' } = {}) {
      return store.transaction(db => {
        const time = now(); takeRate(db, 'finish', clientKey, time);
        const attempt = getAttempt(db, id, time);
        if (!strictObject(payload, ['shots', 'endedAtMs']) || !Array.isArray(payload.shots) ||
            payload.shots.length > CHALLENGE_RULES.maxShots) fail('invalid_transcript', 'Send only shots and terminal active time');
        let result;
        try { result = replayChallenge({ seed: attempt.seed, shots: payload.shots, endedAtMs: payload.endedAtMs }); }
        catch (error) {
          if (error instanceof ChallengeInputError) fail(error.code, error.message);
          throw error;
        }
        const digest = transcriptFingerprint(payload);
        if (attempt.finish) {
          if (attempt.finish.digest !== digest) fail('attempt_conflict', 'An attempt cannot be changed after verification', 409);
          return copy(attempt.finish.response);
        }
        if (payload.endedAtMs > time - attempt.issuedAtMs + config.wallClockGraceMs)
          fail('future_timing', 'The attempt is faster than the elapsed server time');
        const qualifies = result.score > 0 && result.score > (db.record?.score ?? 0);
        const response = { ...common, qualifies, result, record: copy(db.record) };
        attempt.finish = { digest, result, response };
        return copy(response);
      });
    },
    async submitRecord(id, payload, { clientKey = 'local' } = {}) {
      return store.transaction(db => {
        const time = now(); takeRate(db, 'submit', clientKey, time);
        const attempt = getAttempt(db, id, time);
        if (!strictObject(payload, ['initials', 'publicConsent']) || payload.publicConsent !== true)
          fail('public_consent_required', 'Confirm that your initials and score may be displayed publicly');
        validateInitials(payload.initials);
        const digest = fingerprint({ initials: payload.initials, publicConsent: true });
        if (attempt.submission) {
          if (attempt.submission.digest !== digest) fail('attempt_conflict', 'A submitted attempt cannot be changed', 409);
          return copy(attempt.submission.response);
        }
        if (!attempt.finish) fail('attempt_unverified', 'Finish and verify this attempt first', 409);
        if (!attempt.finish.response.qualifies) fail('not_qualified', 'This attempt did not beat the record', 409);
        const result = attempt.finish.result;
        let accepted = false;
        if (result.score > (db.record?.score ?? 0)) {
          db.record = { initials: payload.initials, score: result.score, hits: result.hits, round: result.round,
            activeMs: result.activeMs, recordedAt: new Date(time).toISOString() };
          accepted = true;
        }
        const response = { ...common, accepted, reason: accepted ? 'recorded' : 'record_changed', record: copy(db.record) };
        attempt.submission = { digest, response };
        return copy(response);
      });
    },
  };
}
