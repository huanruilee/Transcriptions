import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const base = 'courses/入中論善顯密意疏/publications/audio_36A_review';
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = file => JSON.parse(fs.readFileSync(file));
const ids = 'p1-v1 p1-v3 p4-v4 p4-v5 p6-v5 p7-v1 p7-v2 p9-v2 p12-v2 p12-v3 p13-v5 p14-v1 p15-v2 p16-v1 p18-v3 p18-v4 p18-v5 p20-v4 p22-v4 p24-v2 p24-v3 p24-v4 p25-v4 p25-v5 p27-v4 p28-v2 p29-v1 p29-v7 p29-v10 p29-v11'.split(' ');

test('30 bounded review clips bind the independent 176-item inventory and official source', () => {
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const check = spawnSync(tool, ['-version'], { encoding: 'utf8' });
    assert.equal(check.status, 0, `${tool} is required: ${check.error?.message || check.stderr}`);
  }
  const alignmentPath = 'reviews/evidence/session36a-quality/audio-alignment.json';
  const sourcePath = 'reviews/evidence/session36a-quality/audio-source.json';
  const a = read(alignmentPath), source = read(sourcePath);
  const selected = a.items.filter(x => a.representativeSampleIds.includes(x.id) || x.status === 'listening-review-required');
  assert.equal(a.items.length, 176);
  assert.equal(a.representativeSampleIds.length, 16);
  assert.equal(a.items.filter(x => x.status === 'listening-review-required').length, 17);
  assert.deepEqual(selected.map(x => x.id), ids);
  const m = read(`${base}/manifest.json`);
  assert.equal(m.sourceSha256, source.sha256);
  assert.equal(m.sourceSha256, a.audioSha256);
  assert.equal(m.alignmentDigest, digest(fs.readFileSync(alignmentPath)));
  assert.equal(m.sourceReferenceDigest, digest(fs.readFileSync(sourcePath)));
  assert.equal(m.decodedPcmBytes, 113867130);
  assert.equal(m.sourceDuration, 3558.3478125);
  assert.deepEqual(Object.keys(m.clips), ids);
  assert.deepEqual(fs.readdirSync(base).sort(), ['manifest.json', ...ids.map(id => `${id}.mp3`)].sort());
  let total = 0;
  for (const item of selected) {
    const c = m.clips[item.id];
    assert.equal(c.filename, `${item.id}.mp3`);
    assert.equal(c.sourceSha256, source.sha256);
    assert.equal(c.sourceStart, Math.max(0, item.start - 1));
    assert.equal(c.sourceEnd, Math.min(m.sourceDuration, item.end + 1));
    assert.equal(c.entryStart, item.start);
    assert.equal(c.entryEnd, item.end);
    const bytes = fs.readFileSync(`${base}/${c.filename}`);
    total += bytes.length;
    assert.equal(c.bytes, bytes.length);
    assert.equal(c.sha256, digest(bytes));
    assert.ok(bytes.includes(Buffer.from('Info')) || bytes.includes(Buffer.from('Xing')));
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', `${base}/${c.filename}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const probe = JSON.parse(result.stdout), duration = Number(probe.format.duration);
    assert.equal(probe.streams[0].channels, 1);
    assert.equal(probe.streams[0].codec_name, 'mp3');
    assert.equal(c.clipDuration, duration);
    assert.ok(duration >= c.sourceEnd - c.sourceStart && duration < c.sourceEnd - c.sourceStart + 0.15);
    // Decode independently: ensure header duration does not conceal a truncated tail.
    const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', `${base}/${c.filename}`, '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    assert.equal(pcm.status, 0, pcm.error?.message || pcm.stderr?.toString());
    assert.ok(Math.abs(pcm.stdout.length / 32000 - (c.sourceEnd - c.sourceStart)) < 0.002);
    assert.ok(c.ffmpegCommand.includes('-write_xing') && c.ffmpegCommand.includes('1'));
  }
  assert.equal(m.totalClipBytes, total);
  assert.ok(total + fs.statSync(`${base}/manifest.json`).size < 6_000_000);
  const tail = m.clips['p29-v11'];
  assert.ok(tail.sourceEnd > 3541.668 && tail.sourceEnd >= 3558.11);
});
