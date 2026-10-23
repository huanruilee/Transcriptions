import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLDEN_STANDARD_QUALITY_PROFILE,
  TRADITIONAL_CHINESE_PURITY_PROFILE,
  findForbiddenGoldenStandardText,
  findGoldenStandardSimplifiedCharacters,
  findTraditionalChinesePurityViolations,
} from '../../scripts/lib/transcriptQualityPolicy.js';

test('traditional purity and golden standard retain distinct simplified-character rules', () => {
  assert.deepEqual(findTraditionalChinesePurityViolations('后传罗萨'), ['后', '传', '罗', '萨']);
  assert.deepEqual(findGoldenStandardSimplifiedCharacters('后传罗萨'), []);
  assert.deepEqual(findGoldenStandardSimplifiedCharacters('为这'), ['为', '这']);
});

test('traditional purity mapping supplies only changed Simplified-to-Traditional entries', () => {
  assert.equal(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad['后'], '後');
  assert.equal(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad['传'], '傳');
  assert.equal(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad['罗'], '羅');
  assert.equal(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad['萨'], '薩');
  assert.equal(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad['佛'], undefined);
});

test('golden forbidden homophone rules keep their original patterns and names', () => {
  assert.equal(GOLDEN_STANDARD_QUALITY_PROFILE.forbiddenHomophones.length, 9);
  const cases = [
    ['飛蚊症', []], ['肺紋症', ['肺紋症']],
    ['自相有', []], ['自向有', ['自向有']],
    ['損壞根', []], ['損壞更', ['損壞更']],
    ['色法心法', []], ['設法心法', ['設法心法']],
    ['不相應行法', []], ['不先一心法', ['不先一心法']],
    ['勝義諦', []], ['生意地', ['生意地']],
    ['欺誑法', []], ['七況法', ['七況法']],
    ['陽焰', []], ['羊眼', ['羊眼']],
    ['執那個正的識', []], ['執那個正的是', ['執那個正的是']],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(findForbiddenGoldenStandardText(text), expected, text);
  }
});

test('quality scans are repeatable and do not leak regular-expression lastIndex', () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(findTraditionalChinesePurityViolations('后'), ['后']);
    assert.deepEqual(findGoldenStandardSimplifiedCharacters('为'), ['为']);
    assert.deepEqual(findForbiddenGoldenStandardText('七況法'), ['七況法']);
  }
  assert.deepEqual(findTraditionalChinesePurityViolations('佛法'), []);
  assert.deepEqual(findGoldenStandardSimplifiedCharacters('佛法'), []);
  assert.deepEqual(findForbiddenGoldenStandardText('佛法'), []);
});
