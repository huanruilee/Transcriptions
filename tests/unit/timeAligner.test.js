import test from 'node:test';
import assert from 'node:assert/strict';
import { findSentenceIndexByTime, calculateTimeScaleRatio } from '../../src/js/timeAligner.js';

test('timeAligner: findSentenceIndexByTime returns -1 for empty/invalid inputs', () => {
  assert.equal(findSentenceIndexByTime([], 5.0), -1);
  assert.equal(findSentenceIndexByTime(null, 5.0), -1);
  assert.equal(findSentenceIndexByTime(undefined, 5.0), -1);
});

test('timeAligner: findSentenceIndexByTime accurately finds sentence during active interval', () => {
  const sentences = [
    { start: 0.0, end: 4.5, text: '第一句' },
    { start: 5.0, end: 9.5, text: '第二句' },
    { start: 10.0, end: 14.5, text: '第三句' }
  ];

  assert.equal(findSentenceIndexByTime(sentences, 2.0), 0);
  assert.equal(findSentenceIndexByTime(sentences, 7.5), 1);
  assert.equal(findSentenceIndexByTime(sentences, 12.0), 2);
});

test('timeAligner: smoothly holds previous sentence highlight during speech pause gap', () => {
  const sentences = [
    { start: 0.0, end: 4.0, text: '第一句' },
    { start: 6.0, end: 10.0, text: '第二句' } // 4.0s to 6.0s is a 2.0s silence gap
  ];

  // At 4.5s (during pause after sentence 0), it should hold sentence 0
  assert.equal(findSentenceIndexByTime(sentences, 4.5), 0);
  assert.equal(findSentenceIndexByTime(sentences, 5.8), 0);

  // Once 6.0s is reached, advances to sentence 1
  assert.equal(findSentenceIndexByTime(sentences, 6.0), 1);
});

test('timeAligner: respects ratio scaling when audio duration differs from transcript duration', () => {
  const sentences = [
    { start: 0.0, end: 10.0, text: 'A' },
    { start: 10.0, end: 20.0, text: 'B' }
  ];

  // Actual audio is 40s (ratio = 40 / 20 = 2.0)
  const ratio = calculateTimeScaleRatio(sentences, 40.0);
  assert.equal(ratio, 2.0);

  // At actual audio time 15s -> virtual time 7.5s -> sentence 0
  assert.equal(findSentenceIndexByTime(sentences, 15.0, ratio), 0);

  // At actual audio time 25s -> virtual time 12.5s -> sentence 1
  assert.equal(findSentenceIndexByTime(sentences, 25.0, ratio), 1);
});

test('timeAligner: returns -1 before beginning and after end', () => {
  const sentences = [
    { start: 2.0, end: 8.0, text: 'A' }
  ];

  assert.equal(findSentenceIndexByTime(sentences, 0.5), -1);
  assert.equal(findSentenceIndexByTime(sentences, 15.0), -1);
});
