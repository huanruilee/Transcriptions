/**
 * tests/unit/session48ReadingGranularity.test.js
 *
 * 30上（session_48）閱讀粒度回歸閘門。
 *
 * 缺陷：這個講次原本是 ASR 碎句原樣（2229 句、句中位 11 字、每段中位 70 字、
 * 平均每段 4.6 句）。strict gate 原本靠大量短句稀釋比率而僥倖全綠，
 * 閱讀頁則是一句一行的電報體。修法與 29上／29下 相同：
 * scripts/merge_session_sentences.py 只重切句界與段界，不改用字。
 *
 * 30上 是師生一問一答的討論課，重切後仍有 25 句「可以。／是的。／謝謝。」這種
 * 完整的一字應答，各自成一個發言回合。它們不是 ASR 碎句（碎句的定義是「字數少
 * 而且沒有句末標點」），併入相鄰句會跨講者、造成發言歸屬錯誤，因此保留原樣。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeSessionMetrics, evaluateStrictSession } from '../../scripts/check_session.mjs';

const ROOT = process.cwd();
const SESSION_PATH = path.join(
  ROOT,
  'courses/2025釋量論第二品大組共學/sessions/session_48.json',
);
const REL_PATH = path.relative(ROOT, SESSION_PATH);
// 重切句只換標點位置：漢字流必須逐字不變（33454 字）。全文字數 38003 比原稿多 1，
// 是段末懸空片段補上句號所致（danglingTailsClosed），不是校字。
const EXPECTED_HANZI_CHARS = 33454;
const EXPECTED_TOTAL_CHARS = 38003;

function loadSession() {
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
}

function flatten(session) {
  return session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
}

const hanzi = (text) => (String(text).match(/[\u4e00-\u9fff]/g) || []).join('');

test('30上（session_48）通過 strict gate：句尾標點、碎句比例、段內句數', () => {
  const summary = computeSessionMetrics(loadSession(), ROOT, REL_PATH);
  const verdict = evaluateStrictSession(summary);
  assert.deepEqual(verdict.violations, []);
  assert.ok(summary.noEndPunctPct < 5, `noEndPunctPct=${summary.noEndPunctPct}`);
  assert.equal(summary.maxParaOver35, 0);
});

test('30上（session_48）閱讀粒度：不得退回 ASR 碎句', () => {
  const session = loadSession();
  const sentences = flatten(session);
  const lengths = sentences.map((s) => String(s.text || '').trim().length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];

  assert.ok(sentences.length >= 400 && sentences.length <= 700, `句數=${sentences.length}`);
  assert.ok(median >= 60, `句中位字數=${median}（碎句原樣為 11）`);
  assert.ok(session.paragraphs.length <= 420, `段數=${session.paragraphs.length}（碎句原樣為 486）`);
});

test('30上（session_48）合併不得跨講者', () => {
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

test('30上（session_48）對外引用可解析：討論題與 contentOverview evidence', () => {
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

test('30上（session_48）重切句不得增刪字', () => {
  const session = loadSession();
  const sentences = flatten(session);
  assert.equal(
    sentences.reduce((sum, s) => sum + hanzi(s.text).length, 0),
    EXPECTED_HANZI_CHARS,
    '漢字流改變代表有校字或漏字；若為刻意校字請同步更新本常數並在 PR 說明',
  );
  assert.equal(
    sentences.reduce((sum, s) => sum + String(s.text || '').length, 0),
    EXPECTED_TOTAL_CHARS,
    '全文字數改變（含標點）代表不只補了段末句號；請確認是否刻意校字',
  );
});
