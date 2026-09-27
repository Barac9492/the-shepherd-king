import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// GPU-less SwiftShader CI needs more wall time; all 12 behavioral checks remain mandatory.
const runtimeTimeout = process.env.SOFTWARE === '1' ? 600_000 : 285_000;

test('ten-chapter assisted runtime regression passes', { timeout: runtimeTimeout + 15_000 }, async () => {
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(process.execPath, ['scripts/check-ten-chapters.mjs'], {
      cwd: new URL('..', import.meta.url),
      timeout: runtimeTimeout,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, TEN_CHAPTER_FILTER: '' },
    }));
  } catch (error) {
    stdout = error.stdout || '';
    stderr = error.stderr || '';
    assert.fail(`runtime regression exited non-zero\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  const line = stdout.split('\n').find(row => row.startsWith('TEN_CHAPTER_RESULT '));
  assert.ok(line, `missing TEN_CHAPTER_RESULT\n${stdout}\n${stderr}`);
  const result = JSON.parse(line.slice('TEN_CHAPTER_RESULT '.length));
  assert.equal(result.failed, 0, JSON.stringify(result.results.filter(r => !r.pass), null, 2));
  assert.equal(result.passed, 12);
});
