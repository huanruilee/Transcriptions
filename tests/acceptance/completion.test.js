import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const TOC_PATH = path.join(COURSE_DIR, 'toc.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const REQUIRE_AUDIO_FILES = process.env.TRANSCRIPTIONS_REQUIRE_AUDIO_FILES === '1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenSentences(session) {
  return session.paragraphs.flatMap(paragraph => paragraph.sentences);
}

test('completion acceptance: course index references complete session JSON and publishable audio URLs', () => {
  const course = readJson(COURSE_PATH);
  const seenIds = new Set();

  // Full 199 sessions published (01~110B, including 99B recovered).
  assert.equal(course.sessions.length, 199, 'course.json should list all 199 published sessions');

  for (const entry of course.sessions) {
    assert.equal(typeof entry.sessionId, 'string', 'sessionId should be present');
    assert.equal(seenIds.has(entry.sessionId), false, `duplicate sessionId: ${entry.sessionId}`);
    seenIds.add(entry.sessionId);

    assert.equal(typeof entry.jsonUrl, 'string', `${entry.sessionId} should provide jsonUrl`);
    const sessionPath = path.join(process.cwd(), entry.jsonUrl);
    assert.equal(fs.existsSync(sessionPath), true, `${entry.sessionId} jsonUrl should exist: ${entry.jsonUrl}`);

    const session = readJson(sessionPath);
    assert.equal(session.sessionId, entry.sessionId, `${entry.sessionId} JSON should match course index`);
    assert.equal(Array.isArray(session.paragraphs), true, `${entry.sessionId} should have paragraphs`);
    assert.ok(session.paragraphs.length > 0, `${entry.sessionId} should not be empty`);

    assert.equal(typeof session.audioUrl, 'string', `${entry.sessionId} should provide audioUrl`);
    assert.match(session.audioUrl, /^audio\/[A-Za-z0-9]+\.mp3$|^https?:\/\/.+\.mp3$/i, `${entry.sessionId} audioUrl should point at a publishable mp3 path`);

    if (REQUIRE_AUDIO_FILES) {
      const audioPath = path.join(process.cwd(), session.audioUrl);
      assert.equal(fs.existsSync(audioPath), true, `${entry.sessionId} audio file should exist: ${session.audioUrl}`);
    }
  }
});

test('completion acceptance: every published session has monotonic usable timestamps', () => {
  const course = readJson(COURSE_PATH);

  for (const entry of course.sessions) {
    const session = readJson(path.join(process.cwd(), entry.jsonUrl));
    const sentences = flattenSentences(session);
    assert.ok(sentences.length > 0, `${entry.sessionId} should include sentence-level transcript data`);

    let previousParagraphEnd = 0;
    for (const paragraph of session.paragraphs) {
      assert.equal(typeof paragraph.id, 'string', `${entry.sessionId} paragraph should have id`);
      assert.equal(typeof paragraph.start, 'number', `${entry.sessionId} paragraph should have start`);
      assert.equal(typeof paragraph.end, 'number', `${entry.sessionId} paragraph should have end`);
      assert.ok(paragraph.start >= previousParagraphEnd - 0.02, `${entry.sessionId} paragraph timestamps should be monotonic`);
      assert.ok(paragraph.end >= paragraph.start, `${entry.sessionId} paragraph end should be >= start`);
      previousParagraphEnd = paragraph.end;

      let previousSentenceEnd = paragraph.start;
      for (const sentence of paragraph.sentences) {
        assert.equal(typeof sentence.start, 'number', `${entry.sessionId} sentence should have start`);
        assert.equal(typeof sentence.end, 'number', `${entry.sessionId} sentence should have end`);
        assert.equal(typeof sentence.text, 'string', `${entry.sessionId} sentence should have text`);
        assert.ok(sentence.text.trim().length > 0, `${entry.sessionId} sentence text should not be empty`);
        assert.ok(sentence.start >= paragraph.start - 0.02, `${entry.sessionId} sentence should not start before paragraph`);
        assert.ok(sentence.end <= paragraph.end + 0.02, `${entry.sessionId} sentence should not end after paragraph`);
        assert.ok(sentence.start >= previousSentenceEnd - 0.02, `${entry.sessionId} sentence timestamps should be monotonic`);
        assert.ok(sentence.end >= sentence.start, `${entry.sessionId} sentence end should be >= start`);
        previousSentenceEnd = sentence.end;
      }
    }

    const lastEnd = sentences.at(-1).end;
    assert.ok(lastEnd > 60, `${entry.sessionId} should have a realistic non-trivial duration`);
  }
});

test('completion acceptance: toc links target existing sessions and in-range timestamps', () => {
  const toc = readJson(TOC_PATH);
  const course = readJson(COURSE_PATH);
  const sessionById = new Map(course.sessions.map(entry => [
    entry.sessionId,
    readJson(path.join(process.cwd(), entry.jsonUrl))
  ]));
  let checkedLinks = 0;

  function walk(nodes) {
    for (const node of nodes) {
      if (node.sessionId != null || node.timestamp != null) {
        assert.equal(sessionById.has(node.sessionId), true, `toc target should exist: ${node.sessionId}`);
        assert.equal(typeof node.timestamp, 'number', `toc timestamp should be numeric for ${node.title}`);
        const session = sessionById.get(node.sessionId);
        const lastEnd = flattenSentences(session).at(-1).end;
        assert.ok(node.timestamp >= 0, `toc timestamp should be non-negative for ${node.title}`);
        assert.ok(node.timestamp <= lastEnd + 1, `toc timestamp should be inside ${node.sessionId}`);
        checkedLinks += 1;
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  }

  walk(toc.sections);
  assert.ok(checkedLinks > 0, 'toc should include timed navigation links');
});

test('completion acceptance: session 99B is published and accessible in course index', () => {
  const course = readJson(COURSE_PATH);
  const ids = new Set(course.sessions.map(entry => entry.sessionId));

  assert.equal(ids.has('99A'), true, '99A should be published');
  assert.equal(ids.has('99B'), true, '99B is now published with official audio and transcripts');
  assert.equal(ids.has('100A'), true, '100A should follow 99B in the accepted index');
  assert.equal(fs.existsSync(path.join(SESSIONS_DIR, 'session_99B.json')), true, 'published 99B JSON must exist');
});
