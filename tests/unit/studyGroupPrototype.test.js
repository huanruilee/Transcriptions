import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-01');
const CANDIDATE = path.join(EVIDENCE, 'candidate.json');
const RAW_ASR = path.join(EVIDENCE, 'raw_asr.json');
const PROTOTYPE_02 = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-02');

test('study-group prototype has source-grounded candidate structure', () => {
  assert.equal(fs.existsSync(CANDIDATE), true, 'prototype candidate is required');
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8'));
  assert.equal(candidate.schema, 'study-group-transcript-candidate/v1');
  assert.equal(candidate.source.playlistIndex, 1);
  assert.equal(candidate.source.videoId, '7QA1k4uxxV0');
  assert.equal(candidate.source.playable, true);
  assert.equal(candidate.provenance.rawAsrPath, 'raw_asr.json');
  assert.ok(Array.isArray(candidate.segments) && candidate.segments.length > 0);
  let previousEnd = -1;
  for (const segment of candidate.segments) {
    assert.match(segment.id, /^seg-\d+$/);
    assert.equal(typeof segment.start, 'number');
    assert.equal(typeof segment.end, 'number');
    assert.ok(segment.start >= previousEnd);
    assert.ok(segment.end > segment.start);
    assert.ok(segment.text.trim().length > 0);
    previousEnd = segment.end;
  }
  assert.ok(Array.isArray(candidate.questionIndex));
  assert.ok(Array.isArray(candidate.teacherSummaries));
  const questionIds = new Set(candidate.questionIndex.map((question) => question.id));
  const summaryIds = new Set(candidate.teacherSummaries.map((summary) => summary.questionId));
  assert.deepEqual(summaryIds, questionIds, 'every spoken question needs a teacher summary');
  const segmentsById = new Map(candidate.segments.map((segment) => [segment.id, segment.text]));
  for (const summary of candidate.teacherSummaries) {
    assert.ok(summary.bullets.length > 0, `${summary.questionId} needs non-empty guidance`);
    assert.ok(summary.sourceSegmentIds.length > 0, `${summary.questionId} needs source segments`);
    const sourceText = summary.sourceSegmentIds.map((id) => segmentsById.get(id) || '').join('');
    for (const bullet of summary.bullets) {
      assert.ok(
        sourceText.includes(bullet),
        `${summary.questionId} guidance must be recoverable from cited source segments`,
      );
    }
  }
});

test('study-group prototype keeps raw ASR and review evidence beside the candidate', () => {
  assert.equal(fs.existsSync(path.join(EVIDENCE, 'raw_asr.json')), true);
  assert.equal(fs.existsSync(path.join(EVIDENCE, 'review.md')), true);
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8'));
  assert.match(candidate.provenance.sourceUrl, /^https:\/\/www\.youtube\.com\/watch\?v=7QA1k4uxxV0$/);
  assert.match(candidate.provenance.audioSha256, /^[a-f0-9]{64}$/);
  assert.ok(candidate.qualityGates && candidate.qualityGates.rawAsrPresent);
});

test('candidate timing remains aligned with the immutable raw ASR segments', () => {
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(RAW_ASR, 'utf8'));
  assert.equal(candidate.segments.length, raw.segments.length);
  for (let index = 0; index < raw.segments.length; index += 1) {
    const expected = raw.segments[index];
    const actual = candidate.segments[index];
    assert.equal(actual.id, `seg-${String(index + 1).padStart(4, '0')}`);
    assert.ok(Math.abs(actual.start - expected.start) < 0.01);
    assert.ok(Math.abs(actual.end - expected.end) < 0.01);
  }
});

test('prototype-02 preserves ASR evidence while failing closed before speaker attribution', () => {
  const candidatePath = path.join(PROTOTYPE_02, 'candidate.json');
  const rawPath = path.join(PROTOTYPE_02, 'raw_asr.json');
  const manifestPath = path.join(PROTOTYPE_02, 'run_manifest.json');
  const reviewPath = path.join(PROTOTYPE_02, 'review.md');
  for (const filePath of [candidatePath, rawPath, manifestPath, reviewPath]) {
    assert.equal(fs.existsSync(filePath), true, `prototype-02 evidence is required: ${filePath}`);
  }

  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(candidate.source.videoId, 'bO2f8SL6czc');
  assert.equal(candidate.source.playlistIndex, 2);
  assert.equal(candidate.provenance.rawAsrPath, 'raw_asr.json');
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.ok(candidate.exclusions.length > 0, 'blocked attribution must be recorded');
  assert.equal(manifest.videoId, 'bO2f8SL6czc');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-02\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-02\//);
  assert.equal(manifest.artifacts.rawAsrPath.includes('/home/'), false);
  assert.equal(manifest.artifacts.candidatePath.includes('/home/'), false);
  assert.match(fs.readFileSync(reviewPath, 'utf8'), /Status:\s+\*\*BLOCKED\*\*/);

  for (let index = 0; index < raw.segments.length; index += 1) {
    const expected = raw.segments[index];
    const actual = candidate.segments[index];
    assert.equal(actual.id, expected.id);
    assert.ok(Math.abs(actual.start - expected.start) < 0.01);
    assert.ok(Math.abs(actual.end - expected.end) < 0.01);
  }
});

test('prototype-02 question candidates remain explicitly unresolved for human audio review', () => {
  const questionPath = path.join(PROTOTYPE_02, 'question_candidates.json');
  const questionReviewPath = path.join(PROTOTYPE_02, 'question_candidates_review.md');
  const candidate = JSON.parse(fs.readFileSync(path.join(PROTOTYPE_02, 'candidate.json'), 'utf8'));
  const questions = JSON.parse(fs.readFileSync(questionPath, 'utf8'));
  assert.equal(fs.existsSync(questionReviewPath), true);
  assert.equal(questions.videoId, 'bO2f8SL6czc');
  assert.equal(questions.status, 'BLOCKED');
  assert.equal(questions.candidates.length, questions.summary.totalCandidates);
  assert.equal(questions.excluded.length, 44);
  const segmentIds = new Set(candidate.segments.map((segment) => segment.id));
  const ids = new Set();
  for (const question of questions.candidates) {
    assert.match(question.candidateId, /^qc-\d{4}$/);
    assert.equal(ids.has(question.candidateId), false, 'candidate IDs must be unique');
    ids.add(question.candidateId);
    assert.ok(question.segmentIds.length > 0);
    assert.ok(question.segmentIds.every((id) => segmentIds.has(id)));
    assert.equal(question.speakerRole, 'unresolved');
    assert.equal(question.reviewStatus, 'human_audio_review_required');
    assert.ok(['low', 'medium'].includes(question.confidence));
    assert.ok(question.end >= question.start);
  }
  assert.match(fs.readFileSync(questionReviewPath, 'utf8'), /Status:\s+\*\*BLOCKED\*\*/);
});

test('prototype-03 keeps ASR evidence portable and fails closed before attribution', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-03');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '_mEd_2G8glg');
  assert.equal(candidate.source.playlistIndex, 3);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.ok(candidate.exclusions.length > 0);
  assert.equal(manifest.videoId, '_mEd_2G8glg');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-03\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-03\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.ok(Math.abs(candidate.segments[index].start - raw.segments[index].start) < 0.01);
    assert.ok(Math.abs(candidate.segments[index].end - raw.segments[index].end) < 0.01);
  }
});
