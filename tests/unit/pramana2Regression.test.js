/**
 * tests/unit/pramana2Regression.test.js
 * RED → GREEN regression tests for 《釋量論第二品》(shi-liang-lun-er) course pipeline.
 *
 * Source: YouTube playlist PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI — 32 lectures
 * (32-1 調整學法的動機 … 32-32 課程總結與期勉), 如性法師, 46.2h total.
 * Reference text (ground truth for proofreading):
 *   gdrive/KnowledgeSources/如性法師教法/《釋量論·成量品》（全）.md (32 講, 一一對應)
 *
 * PASS SET (green today, must stay green):
 *   - catalog.json registers shi-liang-lun-er with valid paths
 *   - course skeleton (course.json/toc.json/audio_map.json/learned_corrections.json) exists
 * FAIL SET (RED today, GREEN only when pipeline delivers):
 *   - audio_map.json maps 32 sessions to playlist video URLs
 *   - course.json has 32 session entries with YouTube-matching titles
 *   - toc.json has 32 lecture sections
 *   - sessions/session_01..32.json exist with ASR-grounded schema
 *   - text purity: no YouTube CTA hallucination, no prompt leakage, traditional Chinese
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_ID = 'shi-liang-lun-er';
const COURSE_DIR = path.resolve('courses/釋量論第二品');
const PLAYLIST_ID = 'PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI';
const TOTAL_SESSIONS = 32;

// YouTube CTA hallucination patterns (Whisper silence-end artifacts, cf. 5sdBJ2Ro1K0 lesson)
const CTA_PATTERNS = [
  /需要您的支持/,
  /歡迎訂閱/,
  /請不吝點讚/,
  /訂閱.{0,4}轉發/,
  /按讚.{0,4}訂閱/
];

// Prompt injection / leakage patterns (same contract as asrIntegrityGate)
const PROMPT_LEAK_PATTERNS = [
  /Here is the/i,
  /```json/i,
  /```markdown/i,
  /【輸出】/,
  /【校勘說明】/,
  /校對完成/
];

// Expected lecture titles (from YouTube playlist, ground truth)
const EXPECTED_TITLES = {
  '01': '調整學法的動機',
  '02': '如何探究真相',
  '03': '略述集量論的禮讚文',
  '04': '皈依世尊前的省思',
  '05': '介紹量與量士夫',
  '06': '探究有無世間造物主',
  '07': '學法時應反觀自心',
  '08': '如何判別因果關係',
  '09': '深究遍智存在與否',
  '10': '依師前的基本觀念',
  '11': '關於祈請與依師的內省',
  '12': '修持大悲的重要性',
  '13': '分析有無前後世',
  '14': '五根與意知的關係',
  '15': '探討身心如何運作',
  '16': '介紹特殊因與近取因',
  '17': '前後世的辨析與總攝',
  '18': '悲心能否無邊增長',
  '19': '有心修行必能成就',
  '20': '介紹圓滿的加行',
  '21': '斷善逝的三種功德',
  '22': '介紹世尊乃救護者',
  '23': '四諦與其修持要義',
  '24': '苦諦的四種行相',
  '25': '集諦的前三種行相',
  '26': '集諦與滅諦的行相',
  '27': '空與無我的差異',
  '28': '滅諦的後三種行相',
  '29': '無我慧才是解脫道',
  '30': '我執是輪迴的根本',
  '31': '道諦的四種行相',
  '32': '課程總結與期勉'
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sessionIds() {
  return Array.from({ length: TOTAL_SESSIONS }, (_, i) => String(i + 1).padStart(2, '0'));
}

// ---------- PASS SET (scaffold contract, green today) ----------

test('Pramana2 PASS: catalog.json registers the course with valid paths', () => {
  const catalog = readJson(path.join('courses', 'catalog.json'));
  const entry = catalog.courses.find(c => c.id === COURSE_ID);
  assert.ok(entry, `catalog.json must register course ${COURSE_ID}`);
  assert.equal(entry.master, '如性法師');
  assert.ok(fs.existsSync(path.resolve(entry.path)), 'catalog path must exist');
});

test('Pramana2 PASS: course skeleton files exist', () => {
  for (const f of ['course.json', 'toc.json', 'audio_map.json', 'learned_corrections.json']) {
    assert.ok(fs.existsSync(path.join(COURSE_DIR, f)), `${f} must exist`);
  }
  assert.ok(fs.existsSync(path.join(COURSE_DIR, 'sessions')), 'sessions/ must exist');
  assert.ok(fs.existsSync(path.join(COURSE_DIR, 'source_text')), 'source_text/ must exist');
  const course = readJson(path.join(COURSE_DIR, 'course.json'));
  assert.equal(course.courseId, COURSE_ID);
  assert.match(course.playlistUrl || '', new RegExp(PLAYLIST_ID), 'course.json must record the source playlist');
});

// ---------- FAIL SET (RED today → GREEN when pipeline delivers) ----------

test('Pramana2 RED: audio_map.json maps all 32 sessions to playlist video URLs', () => {
  const audioMap = readJson(path.join(COURSE_DIR, 'audio_map.json'));
  const missing = sessionIds().filter(id => !audioMap[id] || !/^https:\/\/(www\.)?youtube\.com\//.test(audioMap[id]));
  assert.equal(missing.length, 0, `audio_map.json missing/invalid entries for: ${missing.join(',')}`);
});

test('Pramana2 RED: course.json has 32 session entries with YouTube-matching titles', () => {
  const course = readJson(path.join(COURSE_DIR, 'course.json'));
  const sessions = course.sessions || [];
  assert.equal(sessions.length, TOTAL_SESSIONS, `course.json must have ${TOTAL_SESSIONS} sessions, got ${sessions.length}`);
  const byId = Object.fromEntries(sessions.map(s => [s.sessionId, s]));
  for (const [id, title] of Object.entries(EXPECTED_TITLES)) {
    assert.ok(byId[id], `course.json must contain sessionId ${id}`);
    assert.ok(
      (byId[id].title || '').includes(title),
      `session ${id} title must contain 「${title}」, got: ${byId[id].title}`
    );
  }
});

test('Pramana2 RED: toc.json has 32 lecture sections', () => {
  const toc = readJson(path.join(COURSE_DIR, 'toc.json'));
  assert.ok(Array.isArray(toc.sections), 'toc.sections must be an array');
  assert.equal(toc.sections.length, TOTAL_SESSIONS, `toc must have ${TOTAL_SESSIONS} lecture sections, got ${toc.sections.length}`);
  for (const sec of toc.sections) {
    assert.ok(sec.title, 'each section must have a title');
    assert.ok(sec.sessionId, `section 「${sec.title}」 must carry a sessionId`);
    assert.ok(Array.isArray(sec.children) && sec.children.length > 0,
      `section 「${sec.title}」 must carry children (from 題綱 ground truth)`);
  }
});

test('Pramana2 RED: session_01..32.json exist with ASR-grounded schema', () => {
  const errors = [];
  for (const id of sessionIds()) {
    const p = path.join(COURSE_DIR, 'sessions', `session_${id}.json`);
    if (!fs.existsSync(p)) { errors.push(`session_${id}.json missing`); continue; }
    const data = readJson(p);
    if (data.sessionId !== id) errors.push(`session_${id}: sessionId mismatch (${data.sessionId})`);
    if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
      errors.push(`session_${id}: paragraphs empty/missing`);
      continue;
    }
    let prev = -1;
    for (const para of data.paragraphs) {
      if (typeof para.start !== 'number' || typeof para.end !== 'number' || para.end < para.start) {
        errors.push(`session_${id}: invalid paragraph timing ${para.start}->${para.end}`);
        break;
      }
      if (para.start < prev) { errors.push(`session_${id}: timestamps not monotonic at ${para.id}`); break; }
      prev = para.start;
      if (!Array.isArray(para.sentences) || para.sentences.length === 0) {
        errors.push(`session_${id}: paragraph ${para.id} has no sentences`);
        break;
      }
    }
  }
  assert.equal(errors.length, 0, `schema errors:\n  ${errors.join('\n  ')}`);
});

test('Pramana2 RED: text purity — no CTA hallucination, no prompt leakage, traditional Chinese', () => {
  const violations = [];
  for (const id of sessionIds()) {
    const p = path.join(COURSE_DIR, 'sessions', `session_${id}.json`);
    if (!fs.existsSync(p)) { violations.push(`session_${id}.json missing (cannot verify purity)`); continue; }
    const data = readJson(p);
    const fullText = (data.paragraphs || [])
      .flatMap(para => (para.sentences || []).map(s => s.text || ''))
      .join('');
    for (const re of CTA_PATTERNS) {
      if (re.test(fullText)) violations.push(`session_${id}: YouTube CTA hallucination 「${re.source}」`);
    }
    for (const re of PROMPT_LEAK_PATTERNS) {
      if (re.test(fullText)) violations.push(`session_${id}: prompt leakage 「${re.source}」`);
    }
    // simplified-Chinese residue check (ASR outputs simplified; conversion must be applied)
    const simplified = (fullText.match(/们|证|义|讲|师|说|觉|实|际|归|觉/g) || []);
    if (simplified.length > 0) {
      violations.push(`session_${id}: simplified-Chinese residue (${simplified.length} hits, e.g. ${simplified.slice(0, 3).join(' ')})`);
    }
  }
  assert.equal(violations.length, 0, `purity violations:\n  ${violations.join('\n  ')}`);
});
