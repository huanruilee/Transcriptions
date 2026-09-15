import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE_DIR = path.join(ROOT, 'courses/2025釋量論第二品大組共學');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');

test('all study-group sessions satisfy structural transcript contracts', () => {
  const course = JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8'));
  const intentionallyUnbound = new Set(['34', '27B']);

  assert.equal(course.sessions.length, 43);
  for (const entry of course.sessions) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions', `session_${entry.sessionId}.json`), 'utf8'));
    const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
    assert.ok(session.audioUrl || session.youtubeVideoId, `missing media ${entry.sessionId}`);
    assert.ok(sentences.length > 0, `empty transcript ${entry.sessionId}`);
    for (const sentence of sentences) {
      assert.equal(typeof sentence.start, 'number', `missing start ${entry.sessionId}/${sentence.id}`);
      assert.equal(typeof sentence.end, 'number', `missing end ${entry.sessionId}/${sentence.id}`);
      assert.ok(sentence.end > sentence.start, `invalid range ${entry.sessionId}/${sentence.id}`);
    }
    assert.ok(session.discussionQuestions.length > 0, `missing questions ${entry.sessionId}`);
    assert.ok(session.paragraphs.some((paragraph) => paragraph.teacherSummary), `missing teacher summary ${entry.sessionId}`);
    const finalText = sentences.at(-1).text;
    if (sentences.some((sentence) => /願.{0,18}(?:成|善).{0,18}(?:因|義|受|持|應|壽|陰|悟)/u.test(sentence.text))) {
      assert.equal(/^(?:謝謝|感謝|好謝謝|謝謝大家|大家晚安)[。！!，,、 ]*$/u.test(finalText), false);
    }
    const sourceOutlineId = session.sourceOutlineId ?? null;
    if (sourceOutlineId === null) {
      assert.equal(intentionallyUnbound.has(entry.sessionId), true, `unexpected unbound source ${entry.sessionId}`);
    } else {
      assert.equal(typeof sourceOutlineId, 'string');
    }
  }
});

test('question and teacher-summary counts are not treated as the same data layer', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_24.json'), 'utf8'));
  const summaryCount = session.paragraphs.filter((paragraph) => paragraph.teacherSummary).length;
  assert.notEqual(session.discussionQuestions.length, summaryCount);
  assert.ok(summaryCount > 0);
});

test('published 27B text is traditional Chinese while raw ASR remains untouched', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_27B.json'), 'utf8'));
  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
  assert.equal(sentences.some((sentence) => /能够|有关聯/u.test(sentence.text)), false);
  assert.equal(sentences.some((sentence) => /能够|有关聯/u.test(sentence.rawText)), true);
});

test('27B only closes the paragraph whose final sentence is complete', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_27B.json'), 'utf8'));
  const finalText = (id) => session.paragraphs.find((paragraph) => paragraph.id === id).sentences.at(-1).text;
  assert.equal(finalText('p_007').endsWith('疑惑。'), false);
  assert.equal(finalText('p_008').endsWith('同學。'), false);
  assert.equal(finalText('p_029').endsWith('蘊體。'), false);
  assert.equal(finalText('p_030').endsWith('嗎？'), true);
});

test('study-group publication ends inside a combined closing segment after the dedication', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_27B.json'), 'utf8'));
  const finalText = session.paragraphs.at(-1).sentences.at(-1).text;
  assert.equal(finalText.endsWith('色受陰。'), true);
  assert.equal(finalText.includes('我們下期見'), false);
});

test('audio-confirmed dedication is not dropped after the hand-clasp cue', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_33.json'), 'utf8'));
  const finalSentences = session.paragraphs.at(-1).sentences.map((sentence) => sentence.text);
  assert.deepEqual(finalSentences.slice(-4), [
    '遇此無上大師教',
    '皆由上師生恩故',
    '此善迴向諸眾生',
    '願成善士攝受因。',
  ]);
});

test('session 44 keeps a dedication split across adjacent ASR segments', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_44.json'), 'utf8'));
  const finalText = session.paragraphs.at(-1).sentences.map((sentence) => sentence.text);
  assert.deepEqual(finalText.slice(-4), [
    '遇此無上大師教',
    '皆由上師生恩故',
    '此善迴向諸眾生',
    '願成善士攝受因。',
  ]);
});
