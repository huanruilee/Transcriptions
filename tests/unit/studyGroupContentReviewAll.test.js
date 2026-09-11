import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, 'reviews/evidence/study-group-2025');
const SIMPLIFIED = /[为这样个说体经论门从对么后变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵传辩净萨诸圆满刚传输认痴]/u;
const AMBIGUOUS_SPEECH = /謝謝法師|我知道了|我可不可以這麼理解|這是我的理解/u;
const BARE_ACKNOWLEDGEMENT = /^(?:對|是的|好的|好|嗯|OK)[。！!，,、 ]*$/iu;

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const playlistIndex of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
  test(`playlist-${String(playlistIndex).padStart(2, '0')} content contract`, () => {
    const dir = path.join(EVIDENCE, `playlist-${String(playlistIndex).padStart(2, '0')}`);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'raw_asr.json'), 'utf8'));
    const candidate = JSON.parse(fs.readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    const output = JSON.parse(fs.readFileSync(path.join(dir, 'content_review.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'content_review_manifest.json'), 'utf8'));
    assert.equal(output.status, 'CANDIDATE');
    assert.equal(output.schema, 'study-group-content-review/v1');
    assert.equal(manifest.status, 'BLOCKED_REVIEW_REQUIRED');
    assert.equal(output.segments.length, raw.segments.length);
    assert.equal(output.source.videoId, candidate.source.videoId);
    assert.equal(fs.existsSync(path.join(ROOT, output.provenance.rawAsrPath)), true);
    assert.equal(fs.existsSync(path.join(ROOT, output.provenance.referencePath)), true);
    assert.deepEqual(output.segments.map((s) => s.id), raw.segments.map((s) => s.id));
    for (let i = 0; i < raw.segments.length; i += 1) {
      assert.equal(output.segments[i].start, raw.segments[i].start);
      assert.equal(output.segments[i].end, raw.segments[i].end);
      assert.ok(output.segments[i].text.length > 0);
      assert.equal(SIMPLIFIED.test(output.segments[i].text), false, `simplified text at ${output.segments[i].id}`);
    }
    const byId = new Map(output.segments.map((s) => [s.id, s]));
    const number = (id) => Number(id.slice(4));
    const summaries = new Map(output.teacherSummaries.map((s) => [s.questionId, s]));
    const allQuestionRefs = new Set(output.questionIndex.flatMap((q) => q.sourceSegmentIds));
    assert.ok(output.questionIndex.length > 0, 'content review must contain at least one question');
    assert.ok(output.teacherSummaries.length > 0, 'content review must contain at least one teacher summary');
    assert.equal(output.questionIndex.length, output.teacherSummaries.length);
    assert.equal(manifest.questions, output.questionIndex.length);
    assert.equal(manifest.summaries, output.teacherSummaries.length);
    for (const question of output.questionIndex) {
      assert.equal(SIMPLIFIED.test(question.question), false, `simplified question at ${question.id}`);
      const summary = summaries.get(question.id);
      assert.ok(summary);
      assert.ok(summary.bullets.length > 0);
      summary.sourceSegmentIds.forEach((id) => assert.equal(allQuestionRefs.has(id), false, `summary overlaps a question source at ${question.id}`));
      const questionEnd = Math.max(...question.sourceSegmentIds.map(number));
      const summaryStart = Math.min(...summary.sourceSegmentIds.map(number));
      assert.ok(summaryStart > questionEnd);
      assert.ok(summaryStart - questionEnd <= 250);
      for (const id of summary.sourceSegmentIds) {
        assert.ok(byId.has(id));
        assert.equal(AMBIGUOUS_SPEECH.test(byId.get(id).text), false, `ambiguous source ${id}`);
        assert.equal(BARE_ACKNOWLEDGEMENT.test(byId.get(id).text.trim()), false, `bare acknowledgement source ${id}`);
      }
      for (const bullet of summary.bullets) {
        assert.equal(SIMPLIFIED.test(bullet), false);
        assert.equal(/^(?:法師確認：)?(?:對|是的)[。！!]?$/u.test(bullet), false);
        assert.equal(/未提供.*直接.*(開示|回答)|沒有.*法師.*回答/u.test(bullet), false);
      }
    }
    assert.equal(output.provenance.rawAsrSha256, sha256(path.join(dir, 'raw_asr.json')));
    assert.equal(output.provenance.referenceSha256.length, 64);
  });
}
