import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const courseDir = path.join(repoRoot, 'courses', '三主要道');
const sessionPath = path.join(courseDir, 'sessions', 'session_01.json');
const coursePath = path.join(courseDir, 'course.json');
const tocPath = path.join(courseDir, 'toc.json');
const evidenceDir = path.join(repoRoot, 'reviews', 'evidence', 'sanzhuyaodao', 'playlist-01');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('三主要道 course.json registers the series with the verified instructor', () => {
  const course = readJson(coursePath);

  assert.equal(course.courseId, 'san-zhu-yao-dao');
  assert.equal(course.title, '三主要道');
  assert.equal(course.master, '如性法師');
  assert.equal(course.totalSessions, 21);
  assert.equal(course.publicationState, 'published');
  assert.match(course.sourcePlaylist, /PLMngxNMnjFcM41At4494GCubGnQ5OqZC1/);
});

test('toc.json lists all 21 lectures with video ids and durations', () => {
  const toc = readJson(tocPath);

  assert.equal(toc.sections.length, 21);
  assert.equal(toc.lecturer, '如性法師');
  assert.equal(new Set(toc.sections.map((section) => section.videoId)).size, 21);
  for (const section of toc.sections) {
    assert.match(section.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(section.durationSec > 600, `${section.id} duration too short`);
  }
  assert.equal(toc.sections[0].videoId, 'eergIaUzRQg');
  assert.equal(toc.sections[0].available, true);
});

test('session_01.json follows the canonical transcript contract', () => {
  const session = readJson(sessionPath);

  assert.equal(session.sessionId, 'session_01');
  assert.equal(session.youtubeVideoId, 'eergIaUzRQg');
  assert.equal(session.mediaType, 'video/youtube');
  assert.equal(session._meta.noBaseText, true);
  assert.ok(session.paragraphs.length >= 6);
  assert.equal(session._meta.total_paragraphs, session.paragraphs.length);

  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
  assert.equal(session._meta.total_sentences, sentences.length);

  for (const sentence of sentences) {
    assert.ok(sentence.text.length > 0);
    assert.ok(sentence.start >= 0);
    assert.ok(sentence.end >= sentence.start);
    assert.equal(typeof sentence.reviewNeeded, 'boolean');
  }
});

test('paragraph headings come from the official playlist outline', () => {
  const session = readJson(sessionPath);
  const expected = [
    '介紹課程架構',
    '為何要調整動機',
    '需要調整何種動機',
    '設定明確可行的目標至關重要',
    '調整動機後應呈現何種狀態',
    '何種人需要調整動機',
    '反思自己的目標是否設定錯誤',
  ];

  assert.deepEqual(session.paragraphs.map((paragraph) => paragraph.heading), expected);
});

test('paragraph timestamps increase monotonically and stay within the recording', () => {
  const session = readJson(sessionPath);
  const duration = 3710.4;
  let previousStart = -1;

  for (const paragraph of session.paragraphs) {
    assert.ok(paragraph.start > previousStart, 'paragraph start must increase');
    assert.ok(paragraph.end >= paragraph.start);
    assert.ok(paragraph.end <= duration, 'paragraph must stay inside the recording');
    previousStart = paragraph.start;
  }
});

test('sentence boundaries are individual ASR segments, never merged-unit ranges', () => {
  const session = readJson(sessionPath);
  const raw = readJson(path.join(evidenceDir, 'raw_asr.json'));
  const rawById = new Map(raw.segments.map((segment) => [segment.id, segment]));
  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);

  // 每句都必須回溯到一個個別的 ASR 片段邊界。
  // 少數被切成單字／數字的碎片（「第」「123」「頁」等）會共用同一片段，
  // 此時允許時間在片段範圍內被等分推移，但不得越出該片段。
  let exact = 0;
  let subdivided = 0;

  for (const sentence of sentences) {
    assert.ok(sentence.rawAsrSegmentId, `${sentence.id} lost its raw ASR segment link`);
    const segment = rawById.get(sentence.rawAsrSegmentId);
    assert.ok(segment, `${sentence.id} points at unknown raw segment ${sentence.rawAsrSegmentId}`);
    assert.ok(sentence.start >= segment.start - 0.05,
      `${sentence.id} starts before its ASR segment`);
    assert.ok(sentence.end <= segment.end + 0.05,
      `${sentence.id} ends after its ASR segment`);
    if (sentence.start === segment.start && sentence.end === segment.end) exact += 1;
    else subdivided += 1;
  }

  assert.equal(exact + subdivided, sentences.length);
  assert.ok(exact / sentences.length > 0.98,
    'almost every sentence must reproduce its ASR segment boundary exactly');
  assert.ok(subdivided <= 20, `too many subdivided sentences: ${subdivided}`);
});

test('no two adjacent sentences overlap in time', () => {
  const session = readJson(sessionPath);
  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
  let overlaps = 0;

  for (let i = 1; i < sentences.length; i += 1) {
    if (sentences[i].start < sentences[i - 1].end - 0.001) overlaps += 1;
  }
  assert.equal(overlaps, 0, 'adjacent sentences must not share overlapping time ranges');
});

test('the transcript carries the pending-human-review notice for readers and downloads', () => {
  const session = readJson(sessionPath);

  assert.equal(session.qualityReview.humanProofread, false);
  assert.match(session.qualityReview.readerNotice, /未.*人工.*聽核|尚未.*聽核/u);
});

test('course.json exposes the reader inventory and publication state', () => {
  const course = readJson(coursePath);

  assert.equal(course.transcriptPublicationState, 'candidate-review-required');
  assert.equal(course.sessions.length, 1);
  assert.equal(course.sessions[0].sessionId, '01');
  assert.equal(course.sessions[0].status, 'candidate');
  assert.equal(course.sessions[0].jsonUrl, 'courses/三主要道/sessions/session_01.json');
  assert.equal(course.sessions[0].youtubeVideoId, 'eergIaUzRQg');
  assert.equal(course.pendingSessions.length, 20);
  assert.equal(course.sessions.length + course.pendingSessions.length, 21);
  assert.match(course.qualityReview.readerNotice, /待閱校版/u);
});

test('contentOverview passes the digest and evidence contract', () => {
  const session = readJson(sessionPath);
  const overview = session.contentOverview;

  assert.equal(overview.schemaVersion, 1);
  assert.match(overview.sourceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(overview.generatedBy, 'MiniMax-M3');
  assert.ok(overview.mainPoints.length >= 2 && overview.mainPoints.length <= 4);
  assert.ok(overview.discussionTopics.length >= 1 && overview.discussionTopics.length <= 4);
  assert.ok(overview.referenceViews.length >= 1 && overview.referenceViews.length <= 4);
  const total = overview.mainPoints.length + overview.discussionTopics.length + overview.referenceViews.length;
  assert.ok(total >= 5 && total <= 8, `total bullets ${total} outside 5..8`);

  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
  const byId = new Map(sentences.map((sentence) => [sentence.id, sentence.text]));

  for (const group of ['mainPoints', 'discussionTopics', 'referenceViews']) {
    for (const item of overview[group]) {
      assert.ok(item.text.length > 0);
      assert.ok(item.evidence.length >= 1, `${group} item without evidence`);
      for (const evidence of item.evidence) {
        assert.ok(byId.has(evidence.sentenceId), `unknown sentenceId ${evidence.sentenceId}`);
        assert.equal(evidence.quote, byId.get(evidence.sentenceId),
          `quote must equal the full sentence text of ${evidence.sentenceId}`);
      }
    }
  }
});

test('no simplified Chinese survives in the published transcript', () => {
  const session = readJson(sessionPath);
  const text = session.paragraphs.flatMap((paragraph) => paragraph.sentences)
    .map((sentence) => sentence.text).join('');
  const forbidden = ['这个', '我们', '说', '对', '为', '来', '后', '时', '间', '个', '样', '会', '没', '还', '进'];
  const found = forbidden.filter((char) => text.includes(char));

  assert.deepEqual(found, [], `simplified characters found: ${found.join(' ')}`);
});

test('the evidence layer carries the full six-file set', () => {
  const expected = [
    'raw_asr.json',
    'candidate.json',
    'content_review.json',
    'run_manifest.json',
    'review.md',
    'content_review_manifest.json',
  ];

  for (const file of expected) {
    assert.ok(fs.existsSync(path.join(evidenceDir, file)), `missing ${file}`);
  }
});

test('run_manifest records the models used and the content-completeness gate', () => {
  const manifest = readJson(path.join(evidenceDir, 'run_manifest.json'));

  assert.ok(manifest.models.some((entry) => entry.role === 'asr'));
  assert.ok(manifest.models.some((entry) => entry.role === 'correction-propose'));
  assert.ok(manifest.gates.charRatioPass);
  assert.ok(manifest.gates.charRatio >= 0.6);
  assert.equal(manifest.gates.pendingHumanReview, 0);
});

test('catalog.json registers 三主要道 exactly once', () => {
  const catalog = readJson(path.join(repoRoot, 'courses', 'catalog.json'));
  const entries = catalog.courses.filter((entry) => entry.id === 'san-zhu-yao-dao');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, '三主要道');
  assert.equal(entries[0].master, '如性法師');
  assert.equal(entries[0].totalSessions, 21);
});
