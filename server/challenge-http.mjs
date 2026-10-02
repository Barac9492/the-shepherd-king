/** Optional local HTTP adapter. Mount only with CHALLENGE_MOCK=1 on a loopback server. */
import { createHmac, randomBytes } from 'node:crypto';
import { CHALLENGE_SERVICE_LIMITS, ChallengeServiceError, createChallengeService } from './challenge-service.mjs';
const PREFIX = '/api/sling-challenge';
const loopback = address => address === '::1' || /^127\./.test(address ?? '') || /^::ffff:127\./.test(address ?? '');
function readJson(req, maxBytes) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > maxBytes) {
    req.resume(); return Promise.reject(new ChallengeServiceError('body_too_large', 'Request is too large', 413));
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, settled = false;
    const timer = setTimeout(() => finish(new ChallengeServiceError('request_timeout', 'Request timed out', 408)), 5000);
    timer.unref?.();
    function finish(error, value) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { req.resume(); reject(error); } else resolve(value);
    }
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) { chunks.length = 0; finish(new ChallengeServiceError('body_too_large', 'Request is too large', 413)); }
      else chunks.push(chunk);
    });
    req.on('error', () => finish(new ChallengeServiceError('invalid_request', 'Request could not be read')));
    req.on('aborted', () => finish(new ChallengeServiceError('invalid_request', 'Request was interrupted')));
    req.on('end', () => {
      if (settled) return;
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new ChallengeServiceError('invalid_json', 'Send a valid JSON object')); }
    });
  });
}
export function createChallengeHttpHandler({ service = createChallengeService(),
  enabled = process.env.CHALLENGE_MOCK === '1', maxBodyBytes = CHALLENGE_SERVICE_LIMITS.maxBodyBytes } = {}) {
  // Ephemeral salt: no IP address, cookie, user agent or stable identity is persisted.
  const rateSalt = randomBytes(32);
  return async function handleChallenge(req, res) {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!enabled || (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`))) return false;
    const send = (status, value, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(JSON.stringify(value));
    };
    try {
      if (!loopback(req.socket?.remoteAddress))
        throw new ChallengeServiceError('local_only', 'This mock is available only on the local preview computer', 403);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`)
        throw new ChallengeServiceError('origin_rejected', 'Use the local preview origin', 403);
      const clientKey = createHmac('sha256', rateSalt).update(req.socket.remoteAddress).digest('hex');
      if (pathname === `${PREFIX}/record` && req.method === 'GET') {
        send(200, await service.getRecord({ clientKey })); return true;
      }
      const create = pathname === `${PREFIX}/attempts`;
      const action = pathname.match(/^\/api\/sling-challenge\/attempts\/([a-f0-9]{48})\/(finish|record)$/);
      if (!create && !action) {
        if (pathname === `${PREFIX}/record`) throw new ChallengeServiceError('method_not_allowed', 'Use GET', 405);
        throw new ChallengeServiceError('not_found', 'Challenge endpoint not found', 404);
      }
      if (req.method !== 'POST') throw new ChallengeServiceError('method_not_allowed', 'Use POST', 405);
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''))
        throw new ChallengeServiceError('json_required', 'Use application/json', 415);
      const payload = await readJson(req, maxBodyBytes);
      if (create) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length)
          throw new ChallengeServiceError('invalid_request', 'Attempt creation accepts only an empty JSON object');
        send(201, await service.createAttempt({ clientKey }));
      } else if (action[2] === 'finish') send(200, await service.finishAttempt(action[1], payload, { clientKey }));
      else send(200, await service.submitRecord(action[1], payload, { clientKey }));
    } catch (error) {
      const known = error instanceof ChallengeServiceError;
      send(known ? error.status : 500, { mode: 'local-mock', onlineEligible: false,
        error: { code: known ? error.code : 'server_error', message: known ? error.message : 'Local mock could not complete this request',
          ...(known ? error.details : {}) } }, error.status === 429 ? { 'Retry-After': Math.ceil(error.details.retryAfterMs / 1000) } : {});
    }
    return true;
  };
}
