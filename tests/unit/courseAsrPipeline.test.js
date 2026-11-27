import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/course_asr_pipeline.py');

test('course_asr_pipeline --help exits 0 and documents required flags', () => {
  const res = spawnSync('python3', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  for (const flag of ['--course', '--audio-dir', '--sha-file', '--write-sha', '--dry-run']) {
    assert.ok(res.stdout.includes(flag), `Missing flag ${flag}`);
  }
});

test('course_asr_pipeline --dry-run discovers audio naturally and enforces SHA-256', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'course-asr-test-'));
  try {
    const audioDir = path.join(tmp, 'audio');
    fs.mkdirSync(audioDir);
    fs.writeFileSync(path.join(audioDir, 'L10.mp3'), 'audio-10');
    fs.writeFileSync(path.join(audioDir, 'L2.mp3'), 'audio-2');
    fs.writeFileSync(path.join(audioDir, 'L1.mp3'), 'audio-1');
    const shaFile = path.join(tmp, 'sha256.txt');

    const res = spawnSync(
      'python3',
      [
        SCRIPT,
        '--course', '測試課程',
        '--audio-dir', audioDir,
        '--sha-file', shaFile,
        '--write-sha',
        '--dry-run',
        '--json',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.length, 3);
    assert.deepEqual(
      parsed.map((item) => [item.sessionId, item.audioName]),
      [
        ['01', 'L1.mp3'],
        ['02', 'L2.mp3'],
        ['03', 'L10.mp3'],
      ]
    );

    // Corrupt shaFile and verify fail-closed exit
    fs.writeFileSync(shaFile, `${'0'.repeat(64)}  L2.mp3\n`);
    const bad = spawnSync(
      'python3',
      [
        SCRIPT,
        '--course', '測試課程',
        '--audio-dir', audioDir,
        '--sha-file', shaFile,
        '--dry-run',
      ],
      { encoding: 'utf8' }
    );
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /sha256.*不符/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('verify_chunk_timing enforces 0.5s chunk delta and 2.0s total delta', () => {
  const probe = `
from pathlib import Path
from scripts.course_asr_pipeline import verify_chunk_timing

chunks = [
  {"file": "chunk_000.mp3", "start": 0.0, "end": 600.0},
  {"file": "chunk_001.mp3", "start": 600.0, "end": 850.0},
]
offsets, total = verify_chunk_timing(chunks, Path("/tmp"), 850.0, probe_fn=lambda p: 600.0 if "000" in p.name else 250.0)
assert total == 850.0 and len(offsets) == 2

try:
  verify_chunk_timing(chunks, Path("/tmp"), 855.0, probe_fn=lambda p: 600.0 if "000" in p.name else 250.0)
  raise AssertionError("Should fail when total delta > 2.0s")
except SystemExit as e:
  assert "時間驗證失敗" in str(e)
`;
  const res = spawnSync('python3', ['-c', probe], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
