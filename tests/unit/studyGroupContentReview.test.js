import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, 'reviews/evidence/study-group-2025/playlist-01');
const SIMPLIFIED = /[为这样个说体经论门从对么后变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵传辩净萨诸圆满刚传输认痴]/u;
const AMBIGUOUS_SPEECH = /謝謝法師|我知道了|我可不可以這麼理解|這是我的理解/u;

test('playlist-01 content review preserves timing and grounds questions and summaries', () => {
  const outputPath = path.join(EVIDENCE, 'content_review.json');
  assert.equal(fs.existsSync(outputPath), true, 'content review output is required');
  const raw = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'raw_asr.json'), 'utf8'));
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'content_review_manifest.json'), 'utf8'));
  assert.equal(output.schema, 'study-group-content-review/v1');
  assert.equal(output.status, 'CANDIDATE');
  assert.equal(output.source.videoId, '7QA1k4uxxV0');
  assert.equal(manifest.status, 'BLOCKED_REVIEW_REQUIRED');
  assert.deepEqual(output.segments.map((s) => s.id), raw.segments.map((s) => s.id));
  for (let i = 0; i < raw.segments.length; i += 1) {
    assert.equal(output.segments[i].start, raw.segments[i].start);
    assert.equal(output.segments[i].end, raw.segments[i].end);
    assert.equal(typeof output.segments[i].text, 'string');
    assert.ok(output.segments[i].text.length > 0);
    assert.equal(SIMPLIFIED.test(output.segments[i].text), false, `simplified text at ${output.segments[i].id}`);
  }
  assert.ok(output.questionIndex.length > 0);
  const segmentIds = new Set(output.segments.map((s) => s.id));
  const segmentNumber = (id) => Number(id.slice(4));
  const summaries = new Map(output.teacherSummaries.map((s) => [s.questionId, s]));
  assert.equal(summaries.size, output.teacherSummaries.length);
  for (const question of output.questionIndex) {
    assert.ok(question.question.trim().length > 0);
    assert.equal(SIMPLIFIED.test(question.question), false, `simplified question at ${question.id}`);
    assert.ok(question.sourceSegmentIds.length > 0);
    question.sourceSegmentIds.forEach((id) => assert.equal(segmentIds.has(id), true));
    const summary = summaries.get(question.id);
    assert.ok(summary, `missing teacher summary for ${question.id}`);
    assert.ok(summary.bullets.length > 0);
    summary.sourceSegmentIds.forEach((id) => assert.equal(segmentIds.has(id), true));
    const questionEnd = Math.max(...question.sourceSegmentIds.map(segmentNumber));
    const summaryStart = Math.min(...summary.sourceSegmentIds.map(segmentNumber));
    assert.ok(summaryStart > questionEnd, `${question.id} summary must follow its question`);
    assert.ok(summaryStart - questionEnd <= 250, `${question.id} summary is too far from its question`);
    summary.bullets.forEach((bullet) => {
      assert.equal(SIMPLIFIED.test(bullet), false);
      assert.equal(/未提供.*直接.*(開示|回答)|沒有.*法師.*回答/u.test(bullet), false, `ungrounded teacher summary at ${question.id}`);
      assert.equal(/^(?:法師確認：)?(?:對|是的)[。！!]?$/u.test(bullet), false, `weak teacher summary at ${question.id}`);
    });
    summary.sourceSegmentIds.forEach((id) => assert.equal(AMBIGUOUS_SPEECH.test(output.segments.find((s) => s.id === id).text), false, `ambiguous speaker source at ${question.id}`));
  }
  assert.equal(output.questionIndex.length, output.teacherSummaries.length);
  assert.equal(output.provenance.rawAsrSha256, '6b7eb1ae7faf9c3c10d9dff3e68b2a66104eb1a14710a6cbae949a39958f5d29');
  assert.equal(output.provenance.referenceSha256, '91d6028aa7139b135306d058754dbf630db2bdb9409975c6e77a9e1405a95d57');
});
