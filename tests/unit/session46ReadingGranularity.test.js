/**
 * tests/unit/session46ReadingGranularity.test.js
 *
 * 29上（session_46）閱讀粒度回歸閘門。
 *
 * 缺陷重現：2026-11 之前，這個講次仍是 ASR 碎句原樣（2134 句、句中位 13 字、
 * 49.4% 的「句子」以逗號結尾），check_session --strict 的 noEndPunctPct 直接紅燈，
 * 閱讀頁讀起來是電報體。修法是 scripts/merge_session_sentences.py：只重切句界與段界，
 * 不改用字（見該檔開頭說明）。
 *
 * 本測試把修好的性質固定下來，避免日後重建時又退回碎句：
 * 1. strict gate 必須通過。
 * 2. 句長中位數、句數、段數落在閱讀版區間。
 * 3. 每段只有一個講者（合併不得跨講者）。
 * 4. 對外引用（討論題、contentOverview evidence）必須解析得到，且 quote 等於該句全文。
 * 5. 全講字數不變（重切句不得增刪字）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeSessionMetrics, evaluateStrictSession } from '../../scripts/check_session.mjs';

const ROOT = process.cwd();
const SESSION_PATH = path.join(
  ROOT,
  'courses/2025釋量論第二品大組共學/sessions/session_46.json',
);
const EXPECTED_TOTAL_CHARS = 36719;

function loadSession() {
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
}

function flatten(session) {
  return session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
}

test('29上（session_46）通過 strict gate：句尾標點、碎句比例、段內句數', () => {
  const summary = computeSessionMetrics(loadSession(), ROOT, path.relative(ROOT, SESSION_PATH));
  const verdict = evaluateStrictSession(summary);
  assert.deepEqual(verdict.violations, []);
  assert.ok(summary.noEndPunctPct < 5, `noEndPunctPct=${summary.noEndPunctPct}`);
  assert.ok(summary.shortFragmentPct < 2, `shortFragmentPct=${summary.shortFragmentPct}`);
  assert.equal(summary.maxParaOver35, 0);
});

test('29上（session_46）閱讀粒度：不得退回 ASR 碎句', () => {
  const session = loadSession();
  const sentences = flatten(session);
  const lengths = sentences.map((s) => String(s.text || '').trim().length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];

  assert.ok(sentences.length >= 350 && sentences.length <= 600, `句數=${sentences.length}`);
  assert.ok(median >= 60, `句中位字數=${median}（碎句原樣為 13）`);
  assert.ok(session.paragraphs.length <= 320, `段數=${session.paragraphs.length}（碎句原樣為 350）`);
  assert.ok(
    sentences.filter((s) => String(s.text || '').trim().length <= 3).length / sentences.length < 0.02,
    '短句（<=3 字）比例須低於 2%',
  );
});

test('29上（session_46）合併不得跨講者', () => {
  const session = loadSession();
  for (const paragraph of session.paragraphs) {
    const speakers = new Set((paragraph.sentences || []).map((s) => s.speaker));
    assert.equal(
      speakers.size,
      1,
      `${paragraph.id} 混有多個講者：${[...speakers].join('/')}`,
    );
  }
});

test('29上（session_46）對外引用可解析：討論題與 contentOverview evidence', () => {
  const session = loadSession();
  const textById = new Map(flatten(session).map((s) => [s.id, String(s.text || '').trim()]));

  for (const question of session.discussionQuestions || []) {
    assert.ok(
      textById.has(question.sentenceId),
      `討論題 ${question.id} 的 sentenceId=${question.sentenceId} 不存在`,
    );
  }

  for (const group of ['mainPoints', 'discussionTopics', 'referenceViews']) {
    for (const item of session.contentOverview[group] || []) {
      assert.ok(item.evidence.length >= 1 && item.evidence.length <= 3, `${group} evidence 數量`);
      for (const evidence of item.evidence) {
        const actual = textById.get(evidence.sentenceId);
        assert.ok(actual, `${group} evidence sentenceId=${evidence.sentenceId} 不存在`);
        assert.equal(evidence.quote, actual, `${group} evidence quote 與句子全文不符`);
      }
    }
  }
});

test('29上（session_46）重切句不得增刪字', () => {
  const session = loadSession();
  const total = flatten(session).reduce((sum, s) => sum + String(s.text || '').length, 0);
  assert.equal(
    total,
    EXPECTED_TOTAL_CHARS,
    '全講字數改變代表有校字或漏字；若為刻意校字請同步更新本常數並在 PR 說明',
  );
});
