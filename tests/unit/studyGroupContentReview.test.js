import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, 'reviews/evidence/study-group-2025/playlist-01');

test('playlist-01 content review preserves timing and grounds questions and summaries', () => {
  const outputPath = path.join(EVIDENCE, 'content_review.json');
  assert.equal(fs.existsSync(outputPath), true, 'content review output is required');
  const raw = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'raw_asr.json'), 'utf8'));
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(output.schema, 'study-group-content-review/v1');
  assert.equal(output.status, 'CANDIDATE');
  assert.equal(output.source.videoId, '7QA1k4uxxV0');
  assert.deepEqual(output.segments.map((s) => s.id), raw.segments.map((s) => s.id));
  for (let i = 0; i < raw.segments.length; i += 1) {
    assert.equal(output.segments[i].start, raw.segments[i].start);
    assert.equal(output.segments[i].end, raw.segments[i].end);
    assert.equal(typeof output.segments[i].text, 'string');
    assert.ok(output.segments[i].text.length > 0);
  }
  assert.ok(output.questionIndex.length > 0);
  const segmentIds = new Set(output.segments.map((s) => s.id));
  const summaries = new Map(output.teacherSummaries.map((s) => [s.questionId, s]));
  for (const question of output.questionIndex) {
    assert.ok(question.question.trim().length > 0);
    assert.ok(question.sourceSegmentIds.length > 0);
    question.sourceSegmentIds.forEach((id) => assert.equal(segmentIds.has(id), true));
    const summary = summaries.get(question.id);
    assert.ok(summary, `missing teacher summary for ${question.id}`);
    assert.ok(summary.bullets.length > 0);
    summary.sourceSegmentIds.forEach((id) => assert.equal(segmentIds.has(id), true));
  }
  assert.equal(output.questionIndex.length, output.teacherSummaries.length);
});
