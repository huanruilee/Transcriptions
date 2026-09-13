import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const COURSE_ID = 'shi-liang-lun-study-group-2025';
const COURSE_PATH = 'courses/2025釋量論第二品大組共學';
const DRIVE_FILE_ID = '1H_w9wP0Gi7zpXKO8NVO95Zvm2Iy5N6Wq';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('chunk assembler clips overlap padding and source-duration overflow', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-group-chunks-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify([
      { offset_seconds: 0, response_file: 'a.json' },
      { offset_seconds: 10, response_file: 'b.json' },
    ]));
    fs.writeFileSync(path.join(tempDir, 'a.json'), JSON.stringify({ segments: [
      { start: 8, end: 12, text: 'first' },
    ] }));
    fs.writeFileSync(path.join(tempDir, 'b.json'), JSON.stringify({ segments: [
      { start: 0, end: 4, text: 'second' },
      { start: 4, end: 8, text: 'tail' },
    ] }));
    const code = [
      'import json, sys',
      'from pathlib import Path',
      'from scripts.build_study_group_transcript import load_segments',
      'print(json.dumps(load_segments(Path(sys.argv[1]), Path(sys.argv[2]), 15)))',
    ].join('; ');
    const result = spawnSync('python3', ['-c', code, tempDir, path.join(tempDir, 'manifest.json')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      { start: 8, end: 10, text: 'first' },
      { start: 10, end: 14, text: 'second' },
      { start: 14, end: 15, text: 'tail' },
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('27下 remains addressable inside the published study-group course', () => {
  const catalog = readJson('courses/catalog.json');
  const course = catalog.courses.find((item) => item.id === COURSE_ID);

  assert.ok(course, 'study-group course must be registered');
  assert.equal(course.path, COURSE_PATH);
  assert.equal(course.mediaType, 'video/youtube');
  assert.equal(course.totalSessions, 43);

  const store = fs.readFileSync(path.join(ROOT, 'src/stores/course.ts'), 'utf8');
  assert.match(store, new RegExp(COURSE_ID), 'Vue course selector must expose the prototype');
});

test('27下 prototype uses question TOC and Tailnet audio while preserving Drive provenance', () => {
  const course = readJson(`${COURSE_PATH}/course.json`);
  const audioMap = readJson(`${COURSE_PATH}/audio_map.json`);
  const toc = readJson(`${COURSE_PATH}/toc.json`);

  assert.equal(course.courseId, COURSE_ID);
  assert.equal(course.tocMode, 'discussion-questions');
  assert.ok(course.sessions.some((item) => item.sessionId === '27B'));
  assert.equal(course.sessions.find((item) => item.sessionId === '27B').status, 'review-ready');
  assert.equal(audioMap['27B'].source, 'google-drive');
  assert.equal(audioMap['27B'].fileId, DRIVE_FILE_ID);
  assert.equal(audioMap['27B'].accessScope, 'tailnet');
  assert.equal(audioMap['27B'].proxy, 'gx10');
  assert.match(audioMap['27B'].sourceUrl, /^https:\/\/drive\.usercontent\.google\.com\//);
  assert.match(audioMap['27B'].sourceUrl, /[?&]export=open(?:&|$)/, 'Drive source must use the inline response');
  assert.match(audioMap['27B'].url, /^https:\/\/gx10-2887\.tail378c21\.ts\.net:9443\/audio\//);
  assert.ok(!audioMap['27B'].url.startsWith('/'), 'audio must not be a local asset');

  assert.equal(toc.tocMode, 'discussion-questions');
  assert.ok(Array.isArray(toc.nodes) && toc.nodes.length > 0, 'question TOC must not be empty');
  for (const node of toc.nodes.filter((item) => item.sessionId === '27B')) {
    assert.equal(node.sessionId, '27B');
    assert.match(node.title, /[？?]$/, 'TOC entries must be actual questions');
    assert.ok(Number.isFinite(node.timestamp) && node.timestamp >= 0);
  }
});

test('27下 transcript is timestamped and every question ends with an unlinked teacher summary', () => {
  const session = readJson(`${COURSE_PATH}/sessions/session_27B.json`);
  assert.equal(session.sessionId, '27B');
  assert.equal(session.transcriptStatus, 'review-ready');
  assert.equal(session.alignmentStatus, 'sampled');
  assert.equal(session._meta.sourceFileId, DRIVE_FILE_ID);
  assert.match(session.audioUrl, /^https:\/\/gx10-2887\.tail378c21\.ts\.net:9443\/audio\//);
  assert.ok(Array.isArray(session.paragraphs) && session.paragraphs.length > 0);
  assert.ok(Array.isArray(session.discussionQuestions) && session.discussionQuestions.length > 0);

  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
  assert.ok(sentences.length >= 20, 'prototype must contain a substantive transcript');
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    assert.ok(sentence.id && sentence.text.trim(), 'every sentence needs stable id and text');
    assert.ok(Number.isFinite(sentence.start) && Number.isFinite(sentence.end));
    assert.ok(sentence.end > sentence.start, 'sentence interval must be positive');
    if (index > 0) assert.ok(sentence.start >= sentences[index - 1].end, 'sentence intervals must not overlap');
    assert.ok(sentence.end <= session._meta.durationSeconds, 'sentence must not exceed source duration');
  }

  const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
  for (const question of session.discussionQuestions) {
    assert.match(question.displayQuestion, /[？?]$/);
    assert.ok(sentenceIds.has(question.sentenceId), 'question must point to spoken transcript evidence');
    assert.equal(question.status, 'candidate');
    assert.ok(question.teacherTeaching?.startSentenceId);
    assert.ok(question.teacherTeaching?.endSentenceId);
    assert.ok(sentenceIds.has(question.teacherTeaching.startSentenceId));
    assert.ok(sentenceIds.has(question.teacherTeaching.endSentenceId));
    assert.equal(question.teacherSummary?.linkedToAudio, false);
    assert.equal(question.teacherSummary?.status, 'candidate');
    assert.ok(question.teacherSummary.items.length >= 1, 'teacher teaching needs a bullet summary');
    assert.ok(question.teacherSummary.items.every((item) => typeof item === 'string' && item.trim()));
  }

  for (const paragraph of session.paragraphs.filter((item) => item.teacherSummary)) {
    assert.equal(paragraph.teacherSummary.linkedToAudio, false);
    assert.ok(paragraph.teacherSummary.items.length > 0);
  }
});

test('web reader keeps the study-group route and transcript components registered', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  const store = fs.readFileSync(path.join(ROOT, 'src/stores/course.ts'), 'utf8');
  assert.match(store, new RegExp(COURSE_ID));
  assert.match(app, /TOCAccordion/);
  assert.match(app, /courseStore\.currentCourse/);
});

test('audio click exposes a polite loading indicator until playback starts', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  const proxy = fs.readFileSync(path.join(ROOT, 'scripts/gx10_audio_proxy.py'), 'utf8');
  assert.match(app, /audio/);
  assert.match(proxy, /Range/);
  assert.match(proxy, /urlopen|requests|HTTPConnection/);
});
