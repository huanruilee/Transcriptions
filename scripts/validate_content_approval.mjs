#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

function fail(message) {
  process.stderr.write(`CONTENT_APPROVAL_ERROR ${message}\n`);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasAudioReviewSample(review) {
  return Array.isArray(review?.audioSampleRanges)
    && review.audioSampleRanges.some((sample) => (
      typeof sample?.start === 'number'
      && typeof sample?.end === 'number'
      && sample.end > sample.start
      && sample.result === 'aligned'
    ));
}

function validateApprovedSession(session, courseDir, evidenceDir) {
  const sessionId = String(session.sessionId ?? '');
  const evidenceId = String(session.reviewEvidenceId ?? sessionId);
  const sessionFile = path.join(courseDir, 'sessions', `session_${sessionId}.json`);
  const reviewDir = path.join(evidenceDir, `playlist-${evidenceId}`);
  const candidateFile = path.join(reviewDir, 'content_review.json');
  const approvalFile = path.join(reviewDir, 'content_review_approval.json');

  if (!fs.existsSync(sessionFile)) return `session=${sessionId} missing session JSON`;
  if (!fs.existsSync(candidateFile)) return `session=${sessionId} missing content_review.json`;
  if (!fs.existsSync(approvalFile)) return `session=${sessionId} missing content_review_approval.json`;

  const payload = readJson(sessionFile);
  if (!['approved', 'published'].includes(payload.transcriptStatus)) {
    return `session=${sessionId} session JSON transcriptStatus must be approved or published`;
  }

  const approval = readJson(approvalFile);
  if (approval.schema !== 'transcription-content-approval/v1') {
    return `session=${sessionId} invalid approval schema`;
  }
  if (approval.decision !== 'APPROVED' || approval.scope !== 'full-session') {
    return `session=${sessionId} approval must be APPROVED for full-session scope`;
  }
  if (approval.sessionId !== sessionId) return `session=${sessionId} approval sessionId mismatch`;
  if (typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) {
    return `session=${sessionId} approval missing approvedBy`;
  }
  if (!isIsoDate(approval.approvedAt)) return `session=${sessionId} approval missing valid approvedAt`;
  if (!hasAudioReviewSample(approval.review)) return `session=${sessionId} approval lacks aligned audio sample`;
  if (!Array.isArray(approval.review?.unresolvedIssueIds) || approval.review.unresolvedIssueIds.length > 0) {
    return `session=${sessionId} approval has unresolved issues`;
  }

  const source = approval.source ?? {};
  if (source.contentReviewPath !== path.posix.join(`playlist-${evidenceId}`, 'content_review.json')) {
    return `session=${sessionId} contentReviewPath mismatch`;
  }
  if (source.publishedSessionPath !== path.posix.join('sessions', `session_${sessionId}.json`)) {
    return `session=${sessionId} publishedSessionPath mismatch`;
  }
  if (source.contentReviewSha256 !== sha256(candidateFile)) {
    return `session=${sessionId} contentReviewSha256 mismatch`;
  }
  if (source.publishedSessionSha256 !== sha256(sessionFile)) {
    return `session=${sessionId} publishedSessionSha256 mismatch`;
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));
if (!args['course-dir'] || !args['evidence-dir']) {
  fail('usage: validate_content_approval.mjs --course-dir <path> --evidence-dir <path>');
} else {
  const courseDir = path.resolve(args['course-dir']);
  const evidenceDir = path.resolve(args['evidence-dir']);
  const courseFile = path.join(courseDir, 'course.json');
  if (!fs.existsSync(courseFile)) {
    fail(`missing course.json at ${courseFile}`);
  } else {
    const course = readJson(courseFile);
    const approved = (course.sessions ?? []).filter((session) => ['approved', 'published'].includes(session.status));
    const errors = approved.map((session) => validateApprovedSession(session, courseDir, evidenceDir)).filter(Boolean);
    if (errors.length > 0) {
      errors.forEach(fail);
    } else if (approved.length === 0) {
      process.stdout.write('CONTENT_APPROVAL_OK no approved sessions\n');
    } else {
      approved.forEach((session) => process.stdout.write(`CONTENT_APPROVAL_OK session=${session.sessionId}\n`));
    }
  }
}
