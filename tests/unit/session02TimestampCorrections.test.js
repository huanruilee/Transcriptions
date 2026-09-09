import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SESSION = 'courses/釋量論第二品/sessions/session_02.json';
const EXPECTED = {
  'sent-16': [166.14, 171.86],
  'sent-17': [171.86, 195.84],
  'sent-147': [1443.53, 1445.97],
  'sent-148': [1460.38, 1479.11],
  'sent-262': [2379, 2393.56],
  'sent-263': [2396.84, 2400.04],
  'sent-270': [2422.66, 2425.65],
  'sent-271': [2425.65, 2431.73],
  'sent-380': [3682.59, 3691.72],
  'sent-381': [3691.72, 3721.30]
};

function sentenceMap() {
  const session = JSON.parse(fs.readFileSync(SESSION, 'utf8'));
  return new Map(session.paragraphs.flatMap((p) => p.sentences).map((s) => [s.id, s]));
}

test('session 02 published timestamps match the adjudicated raw-ASR spans', () => {
  const sentences = sentenceMap();
  for (const [id, [start, end]] of Object.entries(EXPECTED)) {
    const sentence = sentences.get(id);
    assert.ok(sentence, `${id} must exist`);
    assert.deepEqual([sentence.start, sentence.end], [start, end], `${id} timestamp drifted`);
    assert.ok(sentence.end > sentence.start, `${id} range must be positive`);
  }
});
