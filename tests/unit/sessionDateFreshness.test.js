/**
 * tests/unit/sessionDateFreshness.test.js
 *
 * 讀者頁「🕒 最後校正更新」直接顯示 session JSON 的 `lastUpdated`
 * （src/App.vue），校訂日期總表 correction-dates.html 也取自同一欄位。
 * 2026-11-27 的 29上重切句就是改了正文卻沒蓋日期，頁面仍宣稱 2026-11-20；
 * TESTING.md 早把這列為人工驗收 FAIL，但先前沒有任何自動檢查。
 *
 * 這裡補三層自動化：
 * 1. `evaluateFreshness` 純函式的行為（內容有變 ⇒ 日期不得早於改檔 commit）。
 * 2. 大組共學課程：course.json 條目與 session 的 lastUpdated 日期必須一致
 *    （讀者頁顯示 session、課程列表顯示 course.json，兩者漂移就是說謊）。
 * 3. 已存在的 correction-dates.html 必須等於正式產生器的輸出
 *    （改了日期卻忘了重生頁面即失敗）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFreshness, dateOf } from '../../scripts/check_session_dates.mjs';
import { buildRows, renderCorrectionDates } from '../../scripts/course_correction_dates.mjs';

const ROOT = process.cwd();
const STUDY_GROUP = path.join(ROOT, 'courses/2025釋量論第二品大組共學');

test('evaluateFreshness：日期落後改檔 commit 即違規，補到當次提交才通過', () => {
  assert.deepEqual(
    evaluateFreshness({ file: 'a.json', lastUpdated: '2026-11-20', lastCommitDate: '2026-11-27' }),
    [{
      file: 'a.json',
      code: 'STALE_LAST_UPDATED',
      detail: 'lastUpdated=2026-11-20 早於最後改檔 commit 2026-11-27（讀者頁會顯示過舊的校正日期）',
    }],
  );
  assert.deepEqual(evaluateFreshness({ file: 'a.json', lastUpdated: '2026-11-27', lastCommitDate: '2026-11-27' }), []);
  assert.deepEqual(evaluateFreshness({ file: 'a.json', lastUpdated: '2026-11-27 15:24', lastCommitDate: '2026-11-27' }), []);
  // 沒有 git 資訊（例如 shallow clone 找不到歷史）時不臆測違規
  assert.deepEqual(evaluateFreshness({ file: 'a.json', lastUpdated: '2026-11-20', lastCommitDate: null }), []);
  assert.equal(evaluateFreshness({ file: 'a.json', lastUpdated: undefined, lastCommitDate: '2026-11-27' })[0].code, 'MISSING_LAST_UPDATED');
  assert.equal(dateOf('2026-11-27 15:24:00'), '2026-11-27');
  assert.equal(dateOf(''), null);
});

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

test('29上（session_46）：重切句後 lastUpdated 已蓋到當次更新', () => {
  const session = JSON.parse(fs.readFileSync(path.join(STUDY_GROUP, 'sessions/session_46.json'), 'utf8'));
  const mergedAt = session._meta?.sentenceMerge ? '2026-11-27' : null;
  assert.ok(session.lastUpdated, 'session_46 缺少 lastUpdated');
  if (mergedAt) {
    assert.ok(
      dateOf(session.lastUpdated) >= mergedAt,
      `lastUpdated=${session.lastUpdated} 早於重切句日期 ${mergedAt}`,
    );
  }
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
