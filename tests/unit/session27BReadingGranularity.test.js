/**
 * tests/unit/session27BReadingGranularity.test.js
 *
 * 27下（session_27B）閱讀粒度回歸閘門。
 *
 * 缺陷重現：2026-11 之前這個講次是 ASR 碎句原樣（371 句／97 段、句中位 102 字、
 * 45.8% 的「句子」沒有句末標點），check_session --strict 的 noEndPunctPct 直接紅燈。
 * 只把句界合起來（--para-max 300）仍有 6.53%：13 個段落合句後只剩 1 句，段末懸空，
 * 既不能把尾句順延到下一段（會把段落清空），就只能留白。根因是段界被 ASR 切在句中，
 * 不是標點。修法是照 session_46 的前例重切段界
 * （scripts/merge_session_sentences.py --para-max 1200 --preserve-para-ids）。
 *
 * 本測試把修好的性質固定下來，避免日後重建又退回碎句或退回懸空段：
 * 1. strict gate 必須通過。
 * 2. 句長中位數、句數、段數落在閱讀版區間。
 * 3. 每段只有一個講者（合併不得跨講者）。
 * 4. 對外引用（討論題、teacherTeaching 起訖句、contentOverview evidence）必須解析得到，
 *    且 evidence quote 等於該句全文。
 * 5. 全講字數不變（重切句不得增刪字；唯一例外是換講者處 4 個懸空尾句被收尾，
 *    其中 2 個是「，→。」（字數不變）、2 個是補「。」（各 +1 字），故 +2）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeSessionMetrics, evaluateStrictSession } from '../../scripts/check_session.mjs';

const ROOT = process.cwd();
const SESSION_PATH = path.join(
  ROOT,
  'courses/2025釋量論第二品大組共學/sessions/session_27B.json',
);
// 重切前（分支 xiaofa/lecture27-strict @ aa8bc55）為 37825；重切只在 2 個換講者處補了
// 句號（另 2 處是逗號換句號），故 +2。origin/main 的 37794 較少，是因為本分支先前的
// 去識別化與 ASR 勘誤已改過正文，不是重切造成的。
// 37827 -> 37837：抽屜掃描（t_7ae0ccb0）抓到 6 處裸名未被第一輪去識別化涵蓋
// （點名式「好，X，我確認一下」「謝謝。X，那我想再請…」等，無師姐／師兄後綴故
// leak detector 未攔），改為 學員N 各 +2 字；另 1 處「以上如是」的裸名刪去 -2 字。
// 淨 +10。逐條見 PR 說明。
const EXPECTED_TOTAL_CHARS = 37837;

function loadSession() {
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
}

function flatten(session) {
  return session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
}

test('27下（session_27B）通過 strict gate：句尾標點、碎句比例、段內句數', () => {
  const summary = computeSessionMetrics(loadSession(), ROOT, path.relative(ROOT, SESSION_PATH));
  const verdict = evaluateStrictSession(summary);
  assert.deepEqual(verdict.violations, []);
  assert.ok(summary.noEndPunctPct < 5, `noEndPunctPct=${summary.noEndPunctPct}`);
  assert.ok(summary.shortFragmentPct < 2, `shortFragmentPct=${summary.shortFragmentPct}`);
  assert.equal(summary.maxParaOver35, 0);
  assert.equal(summary.rawTextDiffCount, 0, 'rawText 必須與 origin/main 逐句全等');
});

test('27下（session_27B）閱讀粒度：不得退回 ASR 碎句', () => {
  const session = loadSession();
  const sentences = flatten(session);
  const lengths = sentences.map((s) => String(s.text || '').trim().length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];

  assert.ok(sentences.length >= 150 && sentences.length <= 260, `句數=${sentences.length}`);
  assert.ok(median >= 60, `句中位字數=${median}（碎句原樣為 102 字但有 45.8% 無句末標點）`);
  assert.ok(session.paragraphs.length >= 30 && session.paragraphs.length <= 60, `段數=${session.paragraphs.length}（碎句原樣為 97）`);
  assert.ok(
    sentences.filter((s) => String(s.text || '').trim().length <= 3).length / sentences.length < 0.02,
    '短句（<=3 字）比例須低於 2%',
  );
  const ids = session.paragraphs.map((paragraph) => paragraph.id);
  assert.equal(new Set(ids).size, ids.length, '段 id 不得重複');
});

test('27下（session_27B）合併不得跨講者', () => {
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

test('27下（session_27B）對外引用可解析：討論題、teacherTeaching、contentOverview evidence', () => {
  const session = loadSession();
  const textById = new Map(flatten(session).map((s) => [s.id, String(s.text || '').trim()]));

  for (const question of session.discussionQuestions || []) {
    assert.ok(
      textById.has(question.sentenceId),
      `討論題 ${question.id} 的 sentenceId=${question.sentenceId} 不存在`,
    );
    for (const field of ['startSentenceId', 'endSentenceId']) {
      const id = question.teacherTeaching?.[field];
      assert.ok(textById.has(id), `討論題 ${question.id} 的 teacherTeaching.${field}=${id} 不存在`);
    }
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

test('27下（session_27B）重切句不得增刪字', () => {
  const session = loadSession();
  const total = flatten(session).reduce((sum, s) => sum + String(s.text || '').length, 0);
  assert.equal(
    total,
    EXPECTED_TOTAL_CHARS,
    '全講字數改變代表有校字或漏字；若為刻意校字請同步更新本常數並在 PR 說明',
  );
});
