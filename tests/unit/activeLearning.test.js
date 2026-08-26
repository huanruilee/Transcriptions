// tests/unit/activeLearning.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('Active Learning & Terminology Absorption Unit Tests', async (t) => {
  const learnedDbPath = path.resolve('courses/入中論善顯密意疏/learned_corrections.json');

  await t.test('1. Learned Knowledge Base: JSON database exists and has valid structure', () => {
    assert.ok(fs.existsSync(learnedDbPath), 'learned_corrections.json must exist');
    const data = JSON.parse(fs.readFileSync(learnedDbPath, 'utf-8'));
    assert.ok(data.terms, 'must contain terms dictionary');
    assert.ok(data.terms['事事師'], 'must contain learned term 事事師');
    assert.equal(data.terms['事事師'].corrected, '實事師');
    assert.ok(data.terms['事事師'].confidence >= 0.9);
  });

  await t.test('2. Dynamic Absorption Rule: Terminology mappings are clean and non-empty', () => {
    const data = JSON.parse(fs.readFileSync(learnedDbPath, 'utf-8'));
    for (const [typo, info] of Object.entries(data.terms)) {
      assert.ok(typo.length > 0, 'typo key must be non-empty');
      assert.ok(info.corrected.length > 0, 'corrected value must be non-empty');
      assert.notEqual(typo, info.corrected, 'typo and corrected must differ');
    }
  });
});
