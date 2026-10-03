import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), cwd = new URL('..', import.meta.url);
test('David exploration, story handoff, input and cleanup regressions pass', { timeout: 540000 }, async () => {
  const base = 'http://127.0.0.1:43986';
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd, env: { ...process.env, PORT: '43986', CHALLENGE_MOCK: '1' }, stdio: 'ignore' });
  let serverError; server.on('error', error => { serverError = error; });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`exploration fixture server exited ${server.exitCode}`);
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'isolated exploration server must start');
    const { stdout, stderr } = await exec(process.execPath, ['scripts/check-david-exploration.mjs'], { cwd, env: { ...process.env, BASE_URL: base }, timeout: 480000, maxBuffer: 8 * 1024 * 1024 });
    console.log(stdout); if (stderr) console.error(stderr);
    const line = stdout.split('\n').find(row => row.startsWith('DAVID_EXPLORATION_RESULT '));
    assert.ok(line, 'missing exploration runtime result');
    const result = JSON.parse(line.slice('DAVID_EXPLORATION_RESULT '.length));
    assert.equal(result.passed, 13); assert.equal(result.results.length, 13);
    assert.ok(result.results.every(row => row.pass)); assert.deepEqual(result.errors, []);
  } catch (error) {
    assert.fail(`exploration runtime failed\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`);
  } finally { server.kill('SIGTERM'); }
});
