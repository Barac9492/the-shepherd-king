import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), cwd = new URL('..', import.meta.url);

test('Psalm Trail typing, recall, IME guard and responsive browser checks pass', { timeout: 240000 }, async () => {
  const base = 'http://127.0.0.1:44963';
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd, env: { ...process.env, PORT: '44963', CHALLENGE_MOCK: '0' }, stdio: 'ignore' });
  let serverError; server.on('error', error => { serverError = error; });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`Psalm Trail fixture server exited ${server.exitCode}`);
      try { if ((await fetch(base + '/psalm-trail.html', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'isolated Psalm Trail server must start');
    const { stdout, stderr } = await exec(process.execPath, ['scripts/check-psalm-trail.mjs'], { cwd, env: { ...process.env, BASE_URL: base }, timeout: 200000, maxBuffer: 4 * 1024 * 1024 });
    console.log(stdout); if (stderr) console.error(stderr);
    const line = stdout.split('\n').find(row => row.startsWith('PSALM_TRAIL_RESULT '));
    assert.ok(line, 'missing Psalm Trail browser result');
    const result = JSON.parse(line.slice('PSALM_TRAIL_RESULT '.length));
    assert.equal(result.checks.length, 9);
    assert.deepEqual(result.errors, []);
  } catch (error) {
    assert.fail(`Psalm Trail runtime failed\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`);
  } finally { server.kill('SIGTERM'); }
});
