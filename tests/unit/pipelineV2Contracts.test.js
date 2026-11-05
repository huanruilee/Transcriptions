import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

test('Pipeline V2: T1 learned_corrections includes 36A/36B verified homophones', () => {
  const p = path.join(ROOT, 'courses/入中論善顯密意疏/learned_corrections.json');
  assert.ok(existsSync(p));
  const data = JSON.parse(readFileSync(p, 'utf8'));
  const g = data.global_terms || {};

  const required = [
    ['一百年事業', '一百零四頁'],
    ['臥行常斷', '苦行常斷'],
    ['另一方面的中庸', '定方面的中庸'],
    ['會方面的中庸', '慧方面的中庸'],
    ['蓄留異弊', '續流亦必'],
    ['無少億', '無少益'],
    ['樹說', '數說'],
    ['色有四面', '設有是念'],
    ['應非理的種別生', '應非離種別生'],
    ['雙鋪耳邊', '雙破二邊'],
    ['看人觀察', '堪忍觀察'],
    ['七款', '欺誑'],
    ['必知如必喜', '棄之如敝屣'],
    ['志向有', '自相有'],
    ['勝儀', '勝義'],
    ['明言諦', '名言諦'],
    ['限量', '現量'],
    ['專破秩序', '專破自續'],
  ];

  for (const [typo, corr] of required) {
    assert.ok(g[typo], `missing learned term: ${typo}`);
    assert.equal(g[typo].corrected, corr, `mismatched correction for ${typo}`);
    assert.ok(g[typo].safe_regex, `safe_regex required for ${typo}`);
  }
});

// T2–T5 executable behavior is covered by pipelineBehavior.test.js.
