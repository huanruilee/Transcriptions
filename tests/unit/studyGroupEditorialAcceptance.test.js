import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_DIR = 'reviews/evidence/study-group-2025/playlist-01';
const MANIFEST_PATH = path.join(ROOT, EVIDENCE_DIR, 'acceptance-prep/input_manifest.json');
const BASELINE_COMMIT = 'b69d71fde25f52f86fafb4bd0e89a77ab4fa33f7';
const EXPECTED_ROLES = ['opening', 'middle', 'ending', 'question', 'teacher-summary'];

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

test('study-group playlist-01 acceptance input manifest invariants', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // Fixed PR baseline and identity
  assert.equal(manifest.baselineCommit, BASELINE_COMMIT);
  assert.equal(manifest.playlistIndex, 1);
  assert.equal(manifest.sessionId, '01');
  assert.equal(manifest.videoId, '7QA1k4uxxV0');

  // Frozen source files: paths, hashes, existence
  const expectedFiles = ['raw_asr.json', 'candidate.json', 'content_review.json', 'content_review_manifest.json'];
  assert.deepEqual(Object.keys(manifest.files).sort(), [...expectedFiles].sort());
  const data = {};
  for (const name of expectedFiles) {
    const entry = manifest.files[name];
    assert.ok(
      entry.repoPath.startsWith(EVIDENCE_DIR + '/'),
      `${name}: repoPath must live under ${EVIDENCE_DIR}`,
    );
    const abs = path.join(ROOT, entry.repoPath);
    assert.ok(fs.existsSync(abs), `${name}: missing file at ${entry.repoPath}`);
    assert.equal(entry.sha256, sha256File(abs), `${name}: sha256 mismatch`);
    data[name] = JSON.parse(fs.readFileSync(abs, 'utf8'));
  }

  // Identity consistency against frozen PR data
  const raw = data['raw_asr.json'];
  const candidate = data['candidate.json'];
  const contentReview = data['content_review.json'];
  const contentManifest = data['content_review_manifest.json'];
  assert.equal(manifest.sourceUrl, candidate.source.sourceUrl);
  assert.equal(manifest.videoId, candidate.source.videoId);
  assert.equal(manifest.sourceUrl, raw.source.sourceUrl);

  // Sentence/segment count consistency
  assert.equal(manifest.segmentCount, raw.segments.length);
  assert.equal(manifest.segmentCount, candidate.segments.length);
  assert.equal(manifest.segmentCount, contentManifest.segments);

  // Valid duration
  const lastEnd = raw.segments[raw.segments.length - 1].end;
  assert.ok(Number.isFinite(manifest.durationSeconds) && manifest.durationSeconds > 0);
  assert.equal(manifest.durationSeconds, candidate.provenance.asrDurationSeconds);
  assert.ok(manifest.durationSeconds >= lastEnd, 'duration must cover final segment end');

  // Exactly five anchors with the required roles
  assert.equal(Array.isArray(manifest.anchors), true);
  assert.equal(manifest.anchors.length, 5);
  const roles = manifest.anchors.map((a) => a.role).sort();
  assert.deepEqual(roles, [...EXPECTED_ROLES].sort());

  // Anchor-level invariants against frozen raw ASR
  const rawSegments = new Map(raw.segments.map((s) => [s.id, s]));
  const questionSourceIds = new Set(contentReview.questionIndex.flatMap((q) => q.sourceSegmentIds));
  const summarySourceIds = new Set(contentReview.teacherSummaries.flatMap((t) => t.sourceSegmentIds));
  for (const anchor of manifest.anchors) {
    assert.ok(typeof anchor.evidenceRole === 'string' && anchor.evidenceRole.length > 0,
      `anchor ${anchor.role}: evidenceRole required`);
    const seg = rawSegments.get(anchor.segmentId);
    assert.ok(seg, `anchor ${anchor.role}: segment ${anchor.segmentId} not found in raw_asr.json`);
    assert.equal(anchor.start, seg.start, `anchor ${anchor.role}: start mismatch`);
    assert.equal(anchor.end, seg.end, `anchor ${anchor.role}: end mismatch`);
    assert.equal(anchor.textSha256, sha256Text(seg.text), `anchor ${anchor.role}: text SHA256 mismatch`);
    assert.equal(Object.prototype.hasOwnProperty.call(anchor, 'text'), false,
      `anchor ${anchor.role}: must not embed transcript text`);
  }
  const byRole = Object.fromEntries(manifest.anchors.map((a) => [a.role, a]));
  assert.equal(byRole.opening.segmentId, raw.segments[0].id, 'opening must be the first segment');
  assert.equal(byRole.ending.segmentId, raw.segments[raw.segments.length - 1].id,
    'ending must be the last segment');
  const mid = byRole.middle;
  const midSeg = rawSegments.get(mid.segmentId);
  assert.ok(mid.start > raw.segments[0].end && mid.end < raw.segments[raw.segments.length - 1].end,
    'middle anchor must be interior');
  assert.ok(Math.abs((midSeg.start + midSeg.end) / 2 - manifest.durationSeconds / 2) <= 120,
    'middle anchor must sit near the mid-point of the session');
  assert.ok(questionSourceIds.has(byRole.question.segmentId),
    'question anchor must reference a discussion-question source segment');
  assert.ok(summarySourceIds.has(byRole['teacher-summary'].segmentId),
    'teacher-summary anchor must reference a teacher-summary source segment');
});
