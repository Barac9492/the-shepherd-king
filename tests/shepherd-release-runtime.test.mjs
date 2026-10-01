import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cwd = new URL('..', import.meta.url);

test('browser and My Shepherd runtime release regressions pass', { timeout: 660_000 }, async () => {
  // Separate server from the ten-chapter test, which node:test runs concurrently.
  const base = 'http://127.0.0.1:43973';
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd, env: { ...process.env, PORT: '43973' }, stdio: 'ignore',
  });
  let serverError;
  server.on('error', error => { serverError = error; });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`test server exited ${server.exitCode}`);
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'isolated release-test server must start');
    for (const script of ['scripts/browser-check.mjs', 'scripts/check-my-shepherd.mjs']) {
      try {
        const { stdout, stderr } = await exec(process.execPath, [script], {
          cwd, env: { ...process.env, BASE_URL: base }, timeout: 300_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        console.log(stdout);
        if (stderr) console.error(stderr);
        if (script.endsWith('check-my-shepherd.mjs')) {
          const line = stdout.split('\n').find(row => row.startsWith('MY_SHEPHERD_RESULT '));
          assert.ok(line, 'missing finale runtime result');
          const result = JSON.parse(line.slice('MY_SHEPHERD_RESULT '.length));
          assert.equal(result.passed, 3);
          assert.ok(result.results.every(row => row.pass));
        } else {
          assert.match(stdout, /"passed": 8/);
          assert.match(stdout, /"errors": \[\]/);
        }
      } catch (error) {
        assert.fail(`${script} failed\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`);
      }
    }
  } finally {
    server.kill('SIGTERM');
  }
});
