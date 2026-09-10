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

test('prototype-04 preserves the one-download evidence contract and fails closed', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-04');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '__8WjGF3hhw');
  assert.equal(candidate.source.playlistIndex, 4);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.ok(candidate.exclusions.length > 0);
  assert.equal(manifest.videoId, '__8WjGF3hhw');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.equal(manifest.commands.filter((command) => command.cmd.includes('download')).length, 1);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-04\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-04\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.ok(Math.abs(candidate.segments[index].start - raw.segments[index].start) < 0.01);
    assert.ok(Math.abs(candidate.segments[index].end - raw.segments[index].end) < 0.01);
  }
});

test('prototype-05 preserves ASR evidence, cleanup, and unresolved attribution', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-05');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'Ijg4E9LhOdw');
  assert.equal(candidate.source.playlistIndex, 5);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(manifest.videoId, 'Ijg4E9LhOdw');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.equal(manifest.commands.filter((command) => command.cmd.includes('download')).length, 1);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-05\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-05\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-06 preserves ASR evidence even when the review writer is rate-limited', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-06');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'N0T2AfsrbaE');
  assert.equal(candidate.source.playlistIndex, 6);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(manifest.videoId, 'N0T2AfsrbaE');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.equal(manifest.commands.filter((command) => command.cmd.includes('yt-dlp -f 18')).length, 1);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-06\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-06\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-07 preserves sentence ASR evidence and fails closed without word timestamps', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-07');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'V_1vh1memNo');
  assert.equal(candidate.source.playlistIndex, 7);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(manifest.videoId, 'V_1vh1memNo');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.totalWordTokens, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-07\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-07\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-08 preserves sentence ASR evidence and fails closed without word timestamps', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-08');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '1dWaAT2cHuk');
  assert.equal(candidate.source.playlistIndex, 8);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, '1dWaAT2cHuk');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.totalWordTokens, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-08\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-08\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-09 preserves sentence ASR evidence and fails closed without word timestamps', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-09');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'WjcwStayz2Q');
  assert.equal(candidate.source.playlistIndex, 9);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'WjcwStayz2Q');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.totalWordTokens, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-09\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-09\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-10 preserves sentence ASR evidence and fails closed without word timestamps', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-10');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'VbOU16xYVPY');
  assert.equal(candidate.source.playlistIndex, 10);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'VbOU16xYVPY');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.totalWordTokens, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-10\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-10\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-11 preserves sentence ASR evidence and fails closed without word timestamps', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-11');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '7iJMqkgBi8g');
  assert.equal(candidate.source.playlistIndex, 11);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.exclusions[0].reason, 'speaker role is not proven');
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, '7iJMqkgBi8g');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.totalWordTokens, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-11\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-11\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-12 keeps the guarded rerun and records the hallucination failure', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-12');
  const failed = path.join(evidence, 'failed-attempt-01');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  const failedRaw = JSON.parse(fs.readFileSync(path.join(failed, 'raw_asr.json'), 'utf8'));
  const failedManifest = JSON.parse(fs.readFileSync(path.join(failed, 'run_manifest.json'), 'utf8'));
  assert.equal(candidate.source.videoId, '9ew8eXJc2Nk');
  assert.equal(candidate.source.playlistIndex, 12);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.status, 'ASR_OK');
  const repeatedCharacterSegments = raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text));
  assert.equal(repeatedCharacterSegments.length, 0);
  assert.equal(manifest.checks.repeatedCharacterSegments, repeatedCharacterSegments.length);
  assert.equal(raw.segments.length, 4144);
  assert.equal(manifest.checks.audioCoveragePct, 98.375);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.equal(manifest.asr.condition_on_previous_text, false);
  assert.equal(manifest.asr.repetition_penalty, 1.15);
  assert.equal(manifest.asr.compression_ratio_threshold, 1.8);
  assert.equal(manifest.asr.no_speech_threshold, 0.5);
  assert.match(review, /lower measured[\s\S]*BLOCKED/);
  assert.equal(failedRaw.segments.length, 896);
  assert.equal(failedManifest.checks.repeatedCharacterSegments, 231);
  assert.match(fs.readFileSync(path.join(failed, 'review.md'), 'utf8'), /negative[\s\S]*evidence/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-13 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-13');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'dT_f_FGivnU');
  assert.equal(candidate.source.playlistIndex, 13);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'dT_f_FGivnU');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-13\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-13\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-14 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-14');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'ZLllHpFN-8M');
  assert.equal(candidate.source.playlistIndex, 14);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'ZLllHpFN-8M');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-14\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-14\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-15 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-15');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'Yj-phMhCeGA');
  assert.equal(candidate.source.playlistIndex, 15);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'Yj-phMhCeGA');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-15\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-15\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-16 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-16');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'iFRIilKgCWc');
  assert.equal(candidate.source.playlistIndex, 16);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'iFRIilKgCWc');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-16\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-16\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-17 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-17');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '8_HnlssRYbs');
  assert.equal(candidate.source.playlistIndex, 17);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, '8_HnlssRYbs');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-17\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-17\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-18 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-18');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '79fYtB0wPlY');
  assert.equal(candidate.source.playlistIndex, 18);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, '79fYtB0wPlY');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-18\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-18\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-19 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-19');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, '2lTBsCdafpc');
  assert.equal(candidate.source.playlistIndex, 19);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, '2lTBsCdafpc');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-19\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-19\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-20 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-20');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'kngthKXpN6M');
  assert.equal(candidate.source.playlistIndex, 20);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'kngthKXpN6M');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-20\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-20\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-21 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-21');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'eTGhBkPOgxA');
  assert.equal(candidate.source.playlistIndex, 21);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'eTGhBkPOgxA');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-21\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-21\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-22 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-22');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'ZmTWgK8MFfM');
  assert.equal(candidate.source.playlistIndex, 22);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'ZmTWgK8MFfM');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-22\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-22\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-23 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-23');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'nainRhshJEI');
  assert.equal(candidate.source.playlistIndex, 23);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'nainRhshJEI');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-23\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-23\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-24 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-24');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'M6gOg7dr6io');
  assert.equal(candidate.source.playlistIndex, 24);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'M6gOg7dr6io');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-24\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-24\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-25 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-25');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 's0NCb1KDwV0');
  assert.equal(candidate.source.playlistIndex, 25);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 's0NCb1KDwV0');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-25\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-25\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-26 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-26');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'uFmVc19pIqs');
  assert.equal(candidate.source.playlistIndex, 26);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'uFmVc19pIqs');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-26\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-26\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-27 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-27');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'L8AzPxI0YCY');
  assert.equal(candidate.source.playlistIndex, 27);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'L8AzPxI0YCY');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-27\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-27\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-28 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-28');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'wXKaQ9ygdd4');
  assert.equal(candidate.source.playlistIndex, 28);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'wXKaQ9ygdd4');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-28\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-28\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-29 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-29');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'D1-MRY1j844');
  assert.equal(candidate.source.playlistIndex, 29);
  assert.equal(candidate.segments.length, 4262);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'D1-MRY1j844');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.audioCoveragePct, 99.0228);
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-29\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-29\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-30 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-30');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'j88bbDgFvy8');
  assert.equal(candidate.source.playlistIndex, 30);
  assert.equal(candidate.segments.length, 4142);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'j88bbDgFvy8');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.audioCoveragePct, 99.2265);
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-30\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-30\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-31 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-31');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'XoiGo0I6cCk');
  assert.equal(candidate.source.playlistIndex, 31);
  assert.equal(candidate.segments.length, 4436);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'XoiGo0I6cCk');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.audioCoveragePct, 99.1737);
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-31\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-31\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});

test('prototype-32 preserves source identity and passes the machine ASR gate', () => {
  const evidence = path.join(ROOT, 'reviews/evidence/study-group-2025/prototype-32');
  const candidate = JSON.parse(fs.readFileSync(path.join(evidence, 'candidate.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'raw_asr.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'run_manifest.json'), 'utf8'));
  const review = fs.readFileSync(path.join(evidence, 'review.md'), 'utf8');
  assert.equal(candidate.source.videoId, 'T_YckC3PK7g');
  assert.equal(candidate.source.playlistIndex, 32);
  assert.equal(candidate.segments.length, 4233);
  assert.equal(candidate.segments.length, raw.segments.length);
  assert.equal(candidate.questionIndex.length, 0);
  assert.equal(candidate.teacherSummaries.length, 0);
  assert.equal(candidate.provenance.temporaryAudioDeleted, true);
  assert.equal(manifest.videoId, 'T_YckC3PK7g');
  assert.equal(manifest.status, 'ASR_OK');
  assert.equal(manifest.checks.audioCoveragePct, 98.0795);
  assert.equal(manifest.checks.repeatedCharacterSegments, 0);
  assert.equal(raw.segments.filter((segment) => /(.)\1{9,}/u.test(segment.text)).length, 0);
  assert.equal(manifest.cleanup.temporaryAudioDeleted, true);
  assert.equal(manifest.cleanup.disposableEnvironmentDeleted, true);
  assert.match(manifest.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/prototype-32\//);
  assert.match(manifest.artifacts.candidatePath, /^reviews\/evidence\/study-group-2025\/prototype-32\//);
  assert.match(review, /Status:\s+\*\*BLOCKED\*\*/);
  for (let index = 0; index < raw.segments.length; index += 1) {
    assert.equal(candidate.segments[index].id, raw.segments[index].id);
    assert.equal(candidate.segments[index].start, raw.segments[index].start);
    assert.equal(candidate.segments[index].end, raw.segments[index].end);
    assert.equal(candidate.segments[index].text, raw.segments[index].text);
  }
});
