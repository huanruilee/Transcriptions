import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentSentences } from '../../src/js/textSegmenter.js';
import { findSentenceIndexByTime } from '../../src/js/timeAligner.js';

test('segmentSentences breaks paragraphs on pause >= 1.5s', () => {
  const mockSentences = [
    { start: 0.0, end: 5.0, text: '第一句。' },
    { start: 5.2, end: 10.0, text: '第二句。' },
    { start: 12.0, end: 16.0, text: '第三句 (停頓 2.0s)。' } // pause from 10.0 to 12.0 is 2.0s
  ];

  const result = segmentSentences(mockSentences, 1.5);
  assert.equal(result.length, 2, 'Should create 2 paragraphs due to 2.0s pause');
  assert.equal(result[0].sentences.length, 2);
  assert.equal(result[1].sentences.length, 1);
});

test('findSentenceIndexByTime finds correct index using O(log N) binary search', () => {
  const mockSentences = [
    { start: 0.0, end: 5.0, text: 'A' },
    { start: 5.1, end: 10.0, text: 'B' },
    { start: 10.1, end: 15.0, text: 'C' },
    { start: 15.1, end: 20.0, text: 'D' }
  ];

  assert.equal(findSentenceIndexByTime(mockSentences, 2.5), 0);
  assert.equal(findSentenceIndexByTime(mockSentences, 7.0), 1);
  assert.equal(findSentenceIndexByTime(mockSentences, 12.0), 2);
  assert.equal(findSentenceIndexByTime(mockSentences, 18.0), 3);
  assert.equal(findSentenceIndexByTime(mockSentences, 99.0), -1);
});
