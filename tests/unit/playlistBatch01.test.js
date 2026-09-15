import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COURSE_PATH = 'courses/2025釋量論第二品大組共學';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

const BATCH = [
  { sessionId: '01A', videoId: '7QA1k4uxxV0', title: '第1講 調整學法的動機（上）' },
  { sessionId: '01B', videoId: 'bO2f8SL6czc', title: '第1講 調整學法的動機（下）' },
];

test('M4 batch-01 registers session 01A and 01B in course and catalog', () => {
  const course = readJson(`${COURSE_PATH}/course.json`);
  const catalog = readJson('courses/catalog.json');
  const ids = course.sessions.map((item) => item.sessionId);
  for (const item of BATCH) {
    assert.ok(ids.includes(item.sessionId), `${item.sessionId} must be registered in course.json`);
    const entry = course.sessions.find((session) => session.sessionId === item.sessionId);
    assert.match(entry.audioUrl, new RegExp(item.videoId), 'course entry must link the YouTube source video');
    assert.equal(entry.status, 'review-ready');
  }
  const studyCourse = catalog.courses.find((course) => course.id === 'shi-liang-lun-study-group-2025');
  assert.equal(studyCourse.totalSessions, course.sessions.length, 'catalog totalSessions must match course.json');
});

test('M4 batch-01 session JSONs carry timestamped transcript and question index', () => {
  for (const item of BATCH) {
    const session = readJson(`${COURSE_PATH}/sessions/session_${item.sessionId}.json`);
    assert.equal(session.sessionId, item.sessionId);
    assert.equal(session.tocMode, 'discussion-questions');
    assert.equal(session._meta.sourceType, 'youtube');
    assert.equal(session._meta.sourceVideoId, item.videoId);
    assert.match(session._meta.sourceSha256, /^[0-9a-f]{64}$/, 'downloaded source must be hashed');
    assert.ok(Number.isFinite(session._meta.durationSeconds) && session._meta.durationSeconds > 3600);
    assert.ok(session._meta.rawAsrPreserved, 'raw ASR text must be preserved per sentence');

    const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
    assert.ok(sentences.length >= 20, 'session must contain a substantive transcript');
    for (let index = 0; index < sentences.length; index += 1) {
      const sentence = sentences[index];
      assert.ok(sentence.id && sentence.text.trim());
      assert.ok(sentence.end > sentence.start);
      if (index > 0) {
        assert.ok(sentence.start >= sentences[index - 1].end, 'sentence intervals must not overlap');
      }
      assert.ok(sentence.end <= session._meta.durationSeconds, 'sentence must not exceed source duration');
    }

    const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
    assert.ok(session.discussionQuestions.length >= 1, 'host-asked questions must be indexed');
    let previous = -1;
    for (const question of session.discussionQuestions) {
      assert.match(question.displayQuestion, /[？?]$/);
      assert.ok(sentenceIds.has(question.sentenceId), 'question must cite spoken evidence');
      assert.ok(sentenceIds.has(question.teacherTeaching.startSentenceId));
      assert.ok(sentenceIds.has(question.teacherTeaching.endSentenceId));
      assert.ok(question.teacherSummary.items.length >= 1, 'teacher teaching needs a bullet summary');
      assert.equal(question.teacherSummary.linkedToAudio, false);
      assert.ok(question.start > previous, 'question index must be ordered');
      previous = question.start;
    }
    const summaries = new Map();
    for (const question of session.discussionQuestions) {
      const key = JSON.stringify(question.teacherSummary);
      assert.ok(!summaries.has(key), 'teacher summaries must be question-owned');
      summaries.set(key, question.id);
    }
    for (const paragraph of session.paragraphs.filter((p) => p.teacherSummary)) {
      assert.equal(
        paragraph.questionId,
        summaries.get(JSON.stringify(paragraph.teacherSummary)),
        'teacher summary must remain attached to its own question',
      );
    }
  }
});

test('M4 batch-01 audio map records youtube provenance without claiming a local proxy', () => {
  const audioMap = readJson(`${COURSE_PATH}/audio_map.json`);
  for (const item of BATCH) {
    const entry = audioMap[item.sessionId];
    assert.ok(entry, `${item.sessionId} must exist in audio_map.json`);
    assert.equal(entry.source, 'youtube');
    assert.equal(entry.fileId, item.videoId);
    assert.equal(entry.url, `https://www.youtube.com/watch?v=${item.videoId}`);
    assert.match(entry.sourceUrl, new RegExp(item.videoId));
  }
});

test('M4 batch-01 toc indexes batch questions per session', () => {
  const toc = readJson(`${COURSE_PATH}/toc.json`);
  for (const item of BATCH) {
    const nodes = toc.nodes.filter((node) => node.sessionId === item.sessionId);
    assert.ok(nodes.length >= 1, `toc must index questions for ${item.sessionId}`);
    for (const node of nodes) {
      assert.match(node.title, /[？?]$/);
      assert.ok(Number.isFinite(node.timestamp) && node.timestamp >= 0);
    }
  }
  const ids = toc.nodes.map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length, 'toc node ids must be unique across sessions');
});
