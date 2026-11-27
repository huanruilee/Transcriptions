/**
 * tests/unit/sessionDateFreshness.test.js
 *
 * 讀者頁「🕒 最後校正更新」直接顯示 session JSON 的 `lastUpdated`（src/App.vue），
 * 課程列表讀 course.json 的同一欄位，校訂日期總表 correction-dates.html 也由它產生。
 * 2026-11-27 的 29上重切句就是改了正文卻沒蓋日期，頁面仍宣稱 2026-11-20；
 * TESTING.md 早已把這列為驗收 FAIL，先前卻沒有任何自動檢查。
 *
 * PR 增量檢查由 Completion Acceptance 的
 * `check_session.mjs --strict --base-ref origin/main` 負責（格式須為
 * YYYY-MM-DD HH:MM，且與 base 不同）。本檔補它看不到的三件事：
 * 1. 大組共學 course.json 條目與 session 的 lastUpdated 日期一致
 *    （讀者頁顯示 session、課程列表顯示 course.json，漂移就是對讀者說謊）。
 * 2. 已存在的 correction-dates.html 必須等於正式產生器輸出
 *    （改了日期卻忘了重生日期總表即失敗）。
 * 3. 29上（session_46）重切句後的日期已蓋到重切當日，且符合新格式。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateLastUpdatedBump } from '../../scripts/check_session.mjs';
import { buildRows, renderCorrectionDates, correctionDate } from '../../scripts/course_correction_dates.mjs';

const ROOT = process.cwd();
/** lastUpdated 可能帶時分（YYYY-MM-DD HH:MM），比較只取日期前綴。 */
const dateOf = (value) => {
  const m = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const STUDY_GROUP = path.join(ROOT, 'courses/2025釋量論第二品大組共學');

test('大組共學：course.json 條目與 session 的 lastUpdated 日期一致', () => {
  const course = JSON.parse(fs.readFileSync(path.join(STUDY_GROUP, 'course.json'), 'utf8'));
  const mismatches = [];
  for (const entry of course.sessions || []) {
    const sessionPath = path.join(STUDY_GROUP, 'sessions', `session_${entry.sessionId}.json`);
    if (!fs.existsSync(sessionPath)) continue;
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    if (!entry.lastUpdated || !session.lastUpdated) continue;
    if (dateOf(entry.lastUpdated) !== dateOf(session.lastUpdated)) {
      mismatches.push(`${entry.sessionId}: course.json=${entry.lastUpdated} session=${session.lastUpdated}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('已存在的 correction-dates.html 與正式產生器輸出一致（不得只改日期不重生頁面）', () => {
  const drifted = [];
  for (const dir of fs.readdirSync(path.join(ROOT, 'courses'))) {
    const base = path.join(ROOT, 'courses', dir);
    const courseFile = path.join(base, 'course.json');
    const page = path.join(base, 'correction-dates.html');
    if (!fs.existsSync(courseFile) || !fs.existsSync(page)) continue;
    const course = JSON.parse(fs.readFileSync(courseFile, 'utf8'));
    const expected = renderCorrectionDates(course, buildRows(course, base));
    if (fs.readFileSync(page, 'utf8') !== expected) drifted.push(dir);
  }
  assert.deepEqual(
    drifted,
    [],
    `以下課程的 correction-dates.html 與逐字稿日期不同步，請跑 node scripts/course_correction_dates.mjs：${drifted.join('、')}`,
  );
});

test('CI 認可的 lastUpdated 格式，日期總表必須讀得懂（不得雙軌）', () => {
  const unrecognized = [];
  for (const dir of fs.readdirSync(path.join(ROOT, 'courses'))) {
    const base = path.join(ROOT, 'courses', dir);
    const courseFile = path.join(base, 'course.json');
    if (!fs.existsSync(courseFile)) continue;
    const sessionsDir = path.join(base, 'sessions');
    if (!fs.existsSync(sessionsDir)) continue;
    for (const file of fs.readdirSync(sessionsDir)) {
      if (!/^session_.*\.json$/.test(file)) continue;
      const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
      const value = session.lastUpdated;
      // 只有 CI 已經認可的格式才要求總表讀得懂；歷史資料不在此限。
      if (!evaluateLastUpdatedBump(value, null).pass) continue;
      const row = correctionDate(session);
      if (row.value === '未記錄') unrecognized.push(`${dir}/${file} lastUpdated=${value}`);
    }
  }
  assert.deepEqual(unrecognized, []);
});

test('29上（session_46）：重切句後 lastUpdated 已蓋到當次更新且符合 YYYY-MM-DD HH:MM', () => {
  const session = JSON.parse(fs.readFileSync(path.join(STUDY_GROUP, 'sessions/session_46.json'), 'utf8'));
  assert.equal(evaluateLastUpdatedBump(session.lastUpdated, '2026-11-20').pass, true);
  const mergedAt = session._meta?.sentenceMerge ? '2026-11-27' : null;
  assert.ok(mergedAt, 'session_46 缺少 _meta.sentenceMerge 記錄');
  assert.ok(
    dateOf(session.lastUpdated) >= mergedAt,
    `lastUpdated=${session.lastUpdated} 早於重切句日期 ${mergedAt}`,
  );
});
