// tests/unit/reviewConsole.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyAdminPasskey,
  calculateAudioSliceRange,
  applyReviewPatchToSession
} from '../../src/js/review.js';

test('Web Review Console Engine Tests', async (t) => {

  await t.test('1. Passkey Authentication: validates master passkey', () => {
    // Default passkey for maintenance (e.g. 'geshe2026' or custom)
    assert.equal(verifyAdminPasskey('geshe2026'), true, 'valid passkey should authenticate');
    assert.equal(verifyAdminPasskey('wrong_pass'), false, 'invalid passkey must fail');
    assert.equal(verifyAdminPasskey(''), false, 'empty passkey must fail');
  });

  await t.test('2. Audio Slicing: calculates safe 3-second bounded interval around target sentence', () => {
    const sentenceStart = 45.0;
    const sentenceEnd = 48.0;
    const totalAudioDuration = 3600.0;

    const slice = calculateAudioSliceRange(sentenceStart, sentenceEnd, totalAudioDuration, 1.5);
    assert.equal(slice.start, 43.5, 'slice start should prepend 1.5s padding');
    assert.equal(slice.end, 49.5, 'slice end should append 1.5s padding');
    assert.equal(slice.targetDuration, 6.0);

    // Boundary at beginning (0s)
    const beginSlice = calculateAudioSliceRange(0.5, 2.0, totalAudioDuration, 1.5);
    assert.equal(beginSlice.start, 0.0, 'slice start should not be negative');

    // Boundary at end
    const endSlice = calculateAudioSliceRange(3599.0, 3600.0, totalAudioDuration, 1.5);
    assert.equal(endSlice.end, 3600.0, 'slice end should not exceed audio duration');
  });

  await t.test('3. Patch Application: applies accepted corrections to session JSON structure', () => {
    const sessionData = {
      sessionId: '29A',
      paragraphs: [
        {
          id: 'p-1',
          sentences: [
            { id: 'sent-1', start: 10.0, end: 14.0, text: '因此破除事事師。' },
            { id: 'sent-2', start: 14.5, end: 18.0, text: '無有自相。' }
          ]
        }
      ]
    };

    const patch = {
      sessionId: '29A',
      sentenceId: 'sent-1',
      correctedText: '因此破除實事師。'
    };

    const updated = applyReviewPatchToSession(sessionData, patch);
    assert.equal(updated.paragraphs[0].sentences[0].text, '因此破除實事師。');
    assert.equal(updated.paragraphs[0].sentences[0].start, 10.0, 'timestamps must remain intact');
    assert.equal(updated.paragraphs[0].sentences[1].text, '無有自相。', 'other sentences untouched');
  });
});
