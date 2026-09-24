import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VALIDATOR = path.join(ROOT, 'scripts/validate_content_approval.mjs');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture({ includeApproval = true, mutateCandidateAfterApproval = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-approval-'));
  const courseDir = path.join(root, 'course');
  const evidenceDir = path.join(root, 'evidence');
  const session = {
    sessionId: '01',
    transcriptStatus: 'approved',
    paragraphs: [{ sentences: [{ id: 'seg-0001', start: 0, end: 1, text: '測試逐字稿。' }] }],
  };
  const candidate = {
    schema: 'study-group-content-review/v1',
    status: 'CANDIDATE',
    source: { playlistIndex: 1, videoId: 'test-video' },
    segments: [{ id: 'seg-0001', start: 0, end: 1, text: '測試逐字稿。' }],
  };
  const candidateText = `${JSON.stringify(candidate, null, 2)}\n`;
  const sessionText = `${JSON.stringify(session, null, 2)}\n`;
  const candidatePath = path.join(evidenceDir, 'playlist-01', 'content_review.json');
  const sessionPath = path.join(courseDir, 'sessions', 'session_01.json');
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(candidatePath, candidateText);
  fs.writeFileSync(sessionPath, sessionText);
  writeJson(path.join(courseDir, 'course.json'), {
    courseId: 'test-course',
    publicationState: 'candidate-review-required',
    sessions: [{ sessionId: '01', status: 'approved', reviewEvidenceId: '01' }],
  });

  if (includeApproval) {
    writeJson(path.join(evidenceDir, 'playlist-01', 'content_review_approval.json'), {
      schema: 'transcription-content-approval/v1',
      decision: 'APPROVED',
      scope: 'full-session',
      sessionId: '01',
      approvedBy: 'github:reviewer',
      approvedAt: '2026-09-24T00:00:00.000Z',
      source: {
        contentReviewPath: 'playlist-01/content_review.json',
        contentReviewSha256: sha256(candidateText),
        publishedSessionPath: 'sessions/session_01.json',
        publishedSessionSha256: sha256(sessionText),
      },
      review: {
        audioSampleRanges: [{ start: 0, end: 1, result: 'aligned' }],
        unresolvedIssueIds: [],
      },
    });
  }

  if (mutateCandidateAfterApproval) {
    fs.writeFileSync(candidatePath, `${candidateText}\n`);
  }
  return { root, courseDir, evidenceDir };
}

function validate(fixture) {
  return spawnSync(process.execPath, [VALIDATOR, '--course-dir', fixture.courseDir, '--evidence-dir', fixture.evidenceDir], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('approved transcript requires a signed, hash-bound full-session approval record', () => {
  const fixture = createFixture();
  const result = validate(fixture);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CONTENT_APPROVAL_OK session=01/);
});

test('approved transcript fails closed when the approval record is absent', () => {
  const fixture = createFixture({ includeApproval: false });
  const result = validate(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing content_review_approval\.json/);
});

test('approved transcript fails closed when a reviewed artifact changes', () => {
  const fixture = createFixture({ mutateCandidateAfterApproval: true });
  const result = validate(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contentReviewSha256 mismatch/);
});
