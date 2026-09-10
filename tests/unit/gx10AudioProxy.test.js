import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

test('GX10 audio proxy passes its built-in Range and allowlist contract', () => {
  const result = spawnSync('python3', ['scripts/gx10_audio_proxy.py', '--self-test'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SELF_TEST=PASS/);
});

test('GX10 audio proxy remains loopback-only and never caches source audio', () => {
  const source = fs.readFileSync('scripts/gx10_audio_proxy.py', 'utf8');
  assert.match(source, /ThreadingHTTPServer\(\("127\.0\.0\.1"/);
  assert.match(source, /Cache-Control", "no-store"/);
  assert.doesNotMatch(source, /open\([^\n]+["']wb["']/);
});
