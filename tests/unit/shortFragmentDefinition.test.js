/**
 * tests/unit/shortFragmentDefinition.test.js
 *
 * 「碎句」只有一個定義，兩個 gate 共用：scripts/check_session.mjs 的
 * isShortFragment（strict gate 的 shortFragmentPct）與
 * scripts/audit_reading_quality.mjs（SHORT_FRAGMENT_RATIO）。
 *
 * 為什麼要改定義：原本兩邊都是「去掉標點後 <=3 字」，於是完整的一字應答
 * （可以。／是的。／謝謝。／認同。）全被算成 ASR 碎句。30上（session_48）是
 * 師生一問一答，重切句後句數由 2229 降到 534，這些應答佔比自然升到 3% 以上，
 * 兩個 gate 同時誤紅；要壓比率只能把應答併進別人的發言，造成講者歸屬錯誤。
 * 真正的碎句是「被切在半句」——字數少 **而且** 沒有句末標點。
 *
 * 這個測試同時固定兩側：完整短句不誤報、真碎句不漏報，且兩個 gate 判定一致。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isShortFragment } from '../../scripts/check_session.mjs';
import { auditSession } from '../../scripts/audit_reading_quality.mjs';

test('完整的一字應答不是碎句', () => {
  for (const text of ['可以。', '是的。', '謝謝。', '認同。', '請說。', '對啊。', '以上。', 'OK。', '好，以上。', '近取因。', '理由是。', '法師好。']) {
    assert.equal(isShortFragment(text), false, `誤判為碎句：${text}`);
  }
});

test('被切在半句的殘片是碎句', () => {
  for (const text of ['那，', '傳，', '就是', '所以', '然後，', '那這個']) {
    assert.equal(isShortFragment(text), true, `漏判碎句：${text}`);
  }
});

test('長句一律不是碎句', () => {
  assert.equal(isShortFragment('我們在學習佛法之前，應該先調整自己的動機。'), false);
  assert.equal(isShortFragment(''), false);
});

function sessionWith(texts) {
  return {
    sessionId: 'session_99',
    paragraphs: [
      {
        id: 'p-1',
        heading: '1. 測試',
        start: 0,
        end: 60,
        sentences: texts.map((text, i) => ({
          id: `seg-${String(i + 1).padStart(4, '0')}`,
          start: i * 5,
          end: i * 5 + 5,
          text,
          rawText: text,
          speaker: '學員',
        })),
      },
    ],
  };
}

test('audit_reading_quality 與 strict gate 用同一個碎句定義', () => {
  const completeReplies = sessionWith(Array.from({ length: 20 }, (_, i) => (i % 2 ? '可以。' : '是的。')));
  const completeResult = auditSession(completeReplies);
  assert.equal(completeResult.metrics.shortFragments, 0, '完整應答不應計入碎句');
  assert.ok(
    !completeResult.violations.some((v) => v.code === 'SHORT_FRAGMENT_RATIO'),
    '完整應答不應觸發 SHORT_FRAGMENT_RATIO',
  );

  const chopped = sessionWith(Array.from({ length: 20 }, (_, i) => (i % 2 ? '那，' : '傳，')));
  const choppedResult = auditSession(chopped);
  assert.equal(choppedResult.metrics.shortFragments, 20);
  assert.ok(
    choppedResult.violations.some((v) => v.code === 'SHORT_FRAGMENT_RATIO'),
    '真正的碎句仍必須觸發 SHORT_FRAGMENT_RATIO',
  );
});
