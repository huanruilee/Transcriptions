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
  const intentionallyUnbound = new Set(['34', '27B', '43', '44', '45', '46']);

  assert.equal(course.sessions.length, 50);
  for (const entry of course.sessions) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions', `session_${entry.sessionId}.json`), 'utf8'));
    assert.ok(session.audioUrl || session.youtubeVideoId, `missing media ${entry.sessionId}`);
    const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
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

// 契約變更（2026-11-28，t_1c724626 重切 session_27B 段界）：原本釘死
// p_007／p_008／p_029／p_030 四個 magic id，要求「續句尾端不得出現句末標點」。
// 段界重切後那幾個續句已落在段中、magic id 也不再保證存在（p_008／p_029 已被併段），
// 所以改釘真正的規則，而不是刪測試或放寬：
// 1. 段末句沒有句末標點時，下一段必須是同一位講者 —— 那是發言中的續行，工具選擇留白
//    而不是偽造句號；換講者（發言結束）處必定收尾。
// 2. 原本被釘的續行點（疑惑／同學／蘊體）在正文裡仍不得被句末標點截斷；
//    真正的問句（第三種可能性嗎？）仍保留問號。
test('27B does not fabricate sentence-final punctuation on a continued utterance', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_27B.json'), 'utf8'));
  const paragraphs = session.paragraphs;
  const END_PUNCT = /[。！？…」』）]\s*$/u;

  for (let i = 0; i < paragraphs.length - 1; i += 1) {
    const last = paragraphs[i].sentences.at(-1).text.trim();
    if (!END_PUNCT.test(last)) {
      assert.equal(
        paragraphs[i].speaker,
        paragraphs[i + 1].speaker,
        `${paragraphs[i].id} 段末未收尾，下一段卻換講者：發言結束處漏了句末標點`,
      );
    }
  }

  const body = paragraphs.flatMap((paragraph) => paragraph.sentences).map((sentence) => sentence.text).join('');
  for (const continuation of ['就產生了疑惑', '跟八號的同學', '如果它與蘊體']) {
    const at = body.indexOf(continuation);
    assert.ok(at >= 0, `正文找不到續行片段「${continuation}」`);
    const next = body.slice(at + continuation.length, at + continuation.length + 1);
    assert.equal(
      /[。！？]/u.test(next),
      false,
      `續行片段「${continuation}」被偽造的句末標點截斷：「${body.slice(at, at + continuation.length + 6)}」`,
    );
  }
  assert.ok(body.includes('第三種可能性嗎？'), '真正的問句「第三種可能性嗎？」不得丟失問號');
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

test('playlist 44 (28上) and 27B (C0yhUazs0CU) are published in course.json', () => {
  const course = JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8'));
  assert.equal(course.sessions.some((session) => session.sessionId === '44'), true);
  assert.equal(course.sessions.some((session) => session.sessionId === '27B' && session.youtubeVideoId === 'C0yhUazs0CU'), true);
});

test('all source outlines use string arrays for courseOutline and discussionOutline', () => {
  const outlinesDir = path.join(COURSE_DIR, 'source_outlines');
  const files = fs.readdirSync(outlinesDir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 22);
  for (const name of files) {
    const outline = JSON.parse(fs.readFileSync(path.join(outlinesDir, name), 'utf8'));
    assert.ok(Array.isArray(outline.courseOutline), `missing courseOutline in ${name}`);
    assert.ok(Array.isArray(outline.discussionOutline), `missing discussionOutline in ${name}`);
    for (const item of outline.courseOutline) {
      assert.equal(typeof item, 'string', `non-string courseOutline item in ${name}`);
    }
    for (const item of outline.discussionOutline) {
      assert.equal(typeof item, 'string', `non-string discussionOutline item in ${name}`);
    }
  }
});

test('all study-group sessions include speaker attribution and transcribed HTML study guides include verbatim drawers', () => {
  const course = JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8'));
  for (const entry of course.sessions) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions', `session_${entry.sessionId}.json`), 'utf8'));
    assert.ok(session.paragraphs.every((p) => typeof p.speaker === 'string' && p.speaker.length > 0), `missing paragraph speaker in ${entry.sessionId}`);
    assert.ok(session.paragraphs.flatMap((p) => p.sentences).every((s) => typeof s.speaker === 'string' && s.speaker.length > 0), `missing sentence speaker in ${entry.sessionId}`);
  }
  for (const code of ['01A', '01B', '02A', '02B', '26A', '26B', '27B']) {
    const html = fs.readFileSync(path.join(COURSE_DIR, 'publications', `lecture_${code}_study_guide.html`), 'utf8');
    assert.match(html, /對照課堂原話/, `missing verbatim drawer in lecture_${code}_study_guide.html`);
  }
});
