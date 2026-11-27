/**
 * tests/unit/studyGroupNameLeakDetection.test.js
 *
 * `findPossibleNameLeaks`（scripts/study_group_preflight.mjs）是 strict gate 的
 * 隱私檢查：它要抓「逐字稿裡出現學員真名」。原規則把「X師兄／X師姐」的 X 一律
 * 當人名、把「謝謝」後面 2–3 字一律當人名，於是 30上（session_48）被誤判 7 處：
 * 法師兄、以上師兄、其他的師兄、有個師姐、謝謝您剛提、謝謝您剛剛、謝謝師姐。
 *
 * 這裡同時固定兩側：稱謂／代詞不算姓名（不可誤報），真姓名仍要抓到（不可漏報）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findPossibleNameLeaks } from '../../scripts/study_group_preflight.mjs';

test('稱謂與代詞前綴不算姓名洩漏（30上 的 7 處誤報）', () => {
  const safe = [
    '法師兄好，師兄，我也有念頭',
    '這個角度去談的，所以我這個是認同的，以上師兄。',
    '那其他的師兄姐。',
    '好，謝謝師姐。',
    '謝謝您剛提到的。',
    '所以謝謝您剛剛所說。',
    '比如說昨天我們宗族共學的時候，有個師姐說假設是說我們長得很漂亮',
  ];
  for (const text of safe) {
    assert.deepEqual(findPossibleNameLeaks(text), [], `誤報：${text}`);
  }
});

test('真正的學員姓名仍要抓到（不可因放寬而漏報）', () => {
  assert.ok(findPossibleNameLeaks('美惠師姐說的').length > 0);
  assert.ok(findPossibleNameLeaks('謝謝淑貞').length > 0);
  assert.ok(findPossibleNameLeaks('謝謝美惠師姐').length > 0);
  assert.ok(findPossibleNameLeaks('請問春蘭師兄在嗎').length > 0);
});
