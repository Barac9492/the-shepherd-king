import { createOnlineChallengeHandler } from '../../server/challenge-online-http.mjs';
export default { fetch: createOnlineChallengeHandler('finish') };
