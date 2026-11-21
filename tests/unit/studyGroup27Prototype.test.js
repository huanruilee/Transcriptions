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
  assert.equal(course.totalSessions, 49);

  const store = fs.readFileSync(path.join(ROOT, 'src/stores/course.ts'), 'utf8');
  assert.match(store, new RegExp(COURSE_ID), 'Vue course selector must expose the prototype');
});

test('27下 study-group course uses question TOC and preserves 27B provenance', () => {
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
  assert.match(audioMap['27B'].sourceUrl, /[?&]export=open(?:&|$)/);
  assert.match(audioMap['27B'].url, /^https:\/\/gx10-2887\.tail378c21\.ts\.net:9443\/audio\//);
  assert.ok(!audioMap['27B'].url.startsWith('/'));

  assert.equal(toc.tocMode, 'discussion-questions');
  const questionNodes = toc.nodes.filter((node) => node.sessionId === '27B');
  assert.ok(questionNodes.length > 0, '27B question TOC must not be empty');
  for (const node of questionNodes) {
    assert.equal(node.sessionId, '27B');
    assert.match(node.title, /[？?]$/, 'TOC entries must be actual questions');
    assert.ok(Number.isFinite(node.timestamp) && node.timestamp >= 0);
  }
});

test('27下 transcript is timestamped and every question has an unlinked teacher summary', () => {
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

  const summaryOwners = new Map(session.discussionQuestions.map((question) => [
    JSON.stringify(question.teacherSummary.items),
    question.id,
  ]));
  for (const paragraph of session.paragraphs.filter((item) => item.teacherSummary)) {
    assert.equal(
      paragraph.questionId,
      summaryOwners.get(JSON.stringify(paragraph.teacherSummary.items)),
      'teacher summary must remain attached to its own question',
    );
  }
});

test('web reader renders question headings, summary provenance, and route components', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /discussionQuestions/);
  assert.match(app, /teacher-summary/);
  assert.match(app, /法師開示摘要/);
  assert.match(app, /linkedToAudio/);
  assert.match(app, /TOCAccordion/);
  assert.match(app, /courseStore\.currentCourse/);
  assert.match(app, /currentTranscriptLabel/);
  assert.match(app, /currentPublicationState/);
  assert.match(app, /activeMediaType/);
  assert.match(app, /seekToTime\(sentence\.start \?\? sentence\.start_time/);
  assert.match(app, /:disabled="isChoosingCourse"/);
  assert.doesNotMatch(app, /<span class="meta-tag status-tag">\s*✅ 已校勘核定/);
});

test('audio click exposes a polite loading indicator until playback starts', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /isAudioLoading/);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /音檔載入中/);
  assert.match(app, /seekAndPlayAudio\(audioEl, time\)\s*\.catch/);
  assert.match(app, /onNativeAudioError/);
  assert.match(app, /仍可閱讀逐字稿/);
  assert.match(app, /audio-loading-spin/);
});

test('publication builder attaches the matching 32-12 source outline to lecture 12', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/build_study_group_publication.py'), 'utf8');
  assert.match(source, /dict\.fromkeys\(\(22, 23\), "32-12"\)/);
  assert.doesNotMatch(source, /dict\.fromkeys\(\(22, 23\), "32-28"\)/);
  assert.match(source, /Playlist 22\/23 are lecture 12/);
});

test('publication builder preserves sentence boundaries across a split dedication', () => {
  const code = [
    'from scripts.build_study_group_publication import trim_after_dedication',
    'print(trim_after_dedication([',
    " {'id': 'a', 'start': 0, 'end': 1, 'text': '願成善事'},",
    " {'id': 'b', 'start': 1, 'end': 2, 'text': '受陰。謝謝大家'},",
    "]))",
  ].join('\n');
  const result = spawnSync('python3', ['-c', code], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim();
  assert.match(output, /願成善事/);
  assert.match(output, /受陰。/);
  assert.doesNotMatch(output, /謝謝大家/);
});

test('dedication trimming supports simplified ASR and keeps the complete closing phrase', () => {
  const code = [
    'import json',
    'from scripts.build_study_group_publication import trim_after_dedication',
    "segments = [{'id': 'a', 'start': 0, 'end': 1, 'text': '愿成善事设'}, {'id': 'b', 'start': 1, 'end': 2, 'text': '受应。尾端闲聊'}]",
    'print(json.dumps(trim_after_dedication(segments), ensure_ascii=False))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', code], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const segments = JSON.parse(result.stdout);
  assert.equal(segments.length, 2);
  assert.match(segments[0].text, /愿成善事设/);
  assert.match(segments[1].text, /受应。/);
  assert.doesNotMatch(segments[1].text, /尾端闲聊/);
});

test('publication builder --help exits without running the mutating build', () => {
  const result = spawnSync('python3', ['scripts/build_study_group_publication.py', '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /usage:/i);
});

test('study-group publication keeps 27B/44 public and transcribed', () => {
  const course = readJson(`${COURSE_PATH}/course.json`);
  assert.equal(course.sessions.some((session) => session.sessionId === '44'), true);
  assert.equal(course.sessions.some((session) => session.sessionId === '27B' && session.youtubeVideoId === 'C0yhUazs0CU'), true);
});

test('publication builder uses the current prototype input, not an external main ref', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/build_study_group_publication.py'), 'utf8');
  assert.doesNotMatch(source, /git show.*main:/);
  assert.match(source, /COURSE_DIR \/ "sessions" \/ "session_27B\.json"/);
});

test('published candidate sentences retain the original ASR in rawText', () => {
  const session = readJson(`${COURSE_PATH}/sessions/session_01.json`);
  const sentence = session.paragraphs.flatMap((paragraph) => paragraph.sentences || [])
    .find((item) => item.id === 'seg-0001');
  assert.ok(sentence);
  assert.equal(sentence.rawText, '敬禮法师就会同学大家晚安');
  assert.notEqual(sentence.text, sentence.rawText);
});

test('session 23 (12下) syncs 5 discussionQuestions to toc.json, preserves App.vue speaker mapping, and cleans lecture_12B_study_guide.html', () => {
  const toc = readJson(`${COURSE_PATH}/toc.json`);
  const session23 = readJson(`${COURSE_PATH}/sessions/session_23.json`);
  const toc23 = toc.nodes.filter((node) => node.sessionId === '23');
  assert.equal(toc23.length, 5);
  assert.deepEqual(
    toc23.map((n) => ({ id: n.id, title: n.title, timestamp: n.timestamp })),
    session23.discussionQuestions.map((q) => ({ id: q.id, title: q.displayQuestion, timestamp: q.start })),
  );

  const appVue = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(appVue, /speaker:\s*p\.speaker\s*\|\|\s*null/);
  assert.match(appVue, /usedAnchorKeys/);

  const html12B = fs.readFileSync(
    path.join(ROOT, `${COURSE_PATH}/publications/lecture_12B_study_guide.html`),
    'utf8',
  );
  assert.match(html12B, /福稱大師/);
  assert.doesNotMatch(html12B, /吳稱|扶撐|扶稱|福昌/);
});

test('all 49 study-group sessions sync curated questions to toc.json and maintain clean complete study guides', () => {
  const course = readJson(`${COURSE_PATH}/course.json`);
  const toc = readJson(`${COURSE_PATH}/toc.json`);
  const validSpeakers = new Set(['如性法師', '學員', '維那/主持']);

  assert.equal(course.sessions.length, 49);

  for (const meta of course.sessions) {
    const sid = meta.sessionId;
    const rawId = String(meta.displaySessionId || sid).trim();
    const code = rawId.endsWith('上')
      ? `${rawId.slice(0, -1).padStart(2, '0')}A`
      : rawId.endsWith('下')
        ? `${rawId.slice(0, -1).padStart(2, '0')}B`
        : /^\d+$/.test(rawId)
          ? rawId.padStart(3, '0')
          : rawId;

    const session = readJson(`${COURSE_PATH}/sessions/session_${sid}.json`);
    const tocNodes = toc.nodes.filter((n) => n.sessionId === sid);
    const qs = session.discussionQuestions || [];

    if (sid === '01') {
      assert.equal(tocNodes.length, 5, 'session_01 should expose 5 curated TOC nodes');
    } else {
      assert.ok(qs.length >= 3 && qs.length <= 7, `session_${sid} should have 3-7 curated questions, got ${qs.length}`);
      assert.equal(tocNodes.length, qs.length, `session_${sid} toc node count must match discussionQuestions`);
      for (const q of qs) {
        assert.match(q.displayQuestion || '', /？$/, `session_${sid} question ${q.id} must end with ？`);
      }
    }

    for (const p of session.paragraphs || []) {
      assert.ok(validSpeakers.has(p.speaker), `session_${sid} paragraph ${p.id} has invalid speaker: ${p.speaker}`);
      for (const s of p.sentences || []) {
        assert.ok(validSpeakers.has(s.speaker), `session_${sid} sentence ${s.id} has invalid speaker: ${s.speaker}`);
      }
    }

    const md = fs.readFileSync(path.join(ROOT, `${COURSE_PATH}/publications/lecture_${code}_study_guide.md`), 'utf8');
    assert.doesNotMatch(md, /\ufffd/, `lecture_${code}_study_guide.md contains replacement char`);
    assert.doesNotMatch(md, /watch？v=/, `lecture_${code}_study_guide.md contains full-width URL question mark`);

    const heads = [...md.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
    assert.equal(new Set(heads).size, heads.length, `lecture_${code}_study_guide.md has duplicate H3 headings`);

    const allSents = (session.paragraphs || []).flatMap((p) => p.sentences || []);
    const duration = allSents.at(-1)?.end || 0;
    const timestamps = [...md.matchAll(/#t=(\d+)/g)].map((m) => Number(m[1]));
    const lastTs = timestamps.length ? Math.max(...timestamps) : 0;
    if (duration > 0) {
      assert.ok(lastTs >= duration * 0.70, `lecture_${code}_study_guide.md covers only ${lastTs}/${duration}s (<70%)`);
    }
  }
});
