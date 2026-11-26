import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SESSION_PATH = 'courses/2025釋量論第二品大組共學/sessions/session_01.json';
const OUTLINE_PATH = 'courses/2025釋量論第二品大組共學/source_outlines/32-01.json';

const session = JSON.parse(fs.readFileSync(path.join(ROOT, SESSION_PATH), 'utf8'));
const outline = JSON.parse(fs.readFileSync(path.join(ROOT, OUTLINE_PATH), 'utf8'));

function toSeconds(ts) {
  return String(ts).split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

test('每個討論問題都有法師開示深連結，且連結指向本講影片', () => {
  const questions = session.discussionQuestions || [];
  assert.ok(questions.length >= 3, '討論問題數量應符合規範');
  for (const question of questions) {
    const links = question.disclosureLinks || [];
    assert.ok(links.length > 0, `${question.id} 缺少 disclosureLinks`);
    for (const link of links) {
      assert.equal(
        link.url,
        `https://www.youtube.com/watch?v=${session.youtubeVideoId}&t=${link.seconds}s`,
        `${question.id} 的連結必須指向本講影片的正確秒數`,
      );
      assert.ok(Number.isInteger(link.seconds) && link.seconds >= 0);
      assert.ok(link.label && link.title);
    }
  }
});

test('同一題目內的開示秒數不重複', () => {
  for (const question of session.discussionQuestions || []) {
    const seconds = (question.disclosureLinks || []).map((link) => link.seconds);
    assert.equal(new Set(seconds).size, seconds.length, `${question.id} 有重複的開示秒數`);
  }
});

test('摘要時間錨與 teacherSummary 一一對應，無遺漏無多餘', () => {
  for (const question of session.discussionQuestions || []) {
    const items = question.teacherSummary?.items || [];
    const expected = items.map((item) => {
      const match = String(item).match(/^\[\s*▶\s*([\d:]{4,8})\s*\]/);
      assert.ok(match, `摘要條目缺少時間錨：${item}`);
      return toSeconds(match[1]);
    });
    const anchors = (question.disclosureLinks || [])
      .filter((link) => link.kind === 'summary-anchor')
      .map((link) => link.seconds);
    assert.deepEqual(anchors, expected, `${question.id} 的摘要錨與摘要條目不一致`);
  }
});

test('開示區間的起訖秒數合法，且秒數可回推時間碼', () => {
  for (const question of session.discussionQuestions || []) {
    for (const link of question.disclosureLinks || []) {
      if (link.kind !== 'segment') continue;
      assert.ok(link.endSeconds > link.seconds, `${question.id} 開示區間起訖顛倒`);
      const parts = String(link['mm:ss']).split(':').map(Number);
      assert.equal(toSeconds(link['mm:ss']), link.seconds);
      assert.ok(parts.every((n) => Number.isFinite(n)));
    }
  }
});

test('開示區間來自原典大綱的證據欄，可追溯回 source_outlines', () => {
  const evidence = (outline.mappings || [])
    .map((mapping) => String(mapping.evidence || ''))
    .join('\n');
  const segments = (session.discussionQuestions || [])
    .flatMap((question) => (question.disclosureLinks || []).filter((link) => link.kind === 'segment'));
  assert.ok(segments.length > 0, 'session_01 應有來自原典大綱的開示區間');
  for (const segment of segments) {
    assert.ok(
      evidence.includes(`&t=${segment.seconds}s`),
      `開示區間 ${segment.label} 應可回溯到大綱證據欄`,
    );
    assert.ok(segment.source && segment.source.includes('#'));
  }
});
