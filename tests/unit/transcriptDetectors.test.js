import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadJson } from '../helpers/shiliangFixtures.js';
import {
  detectParagraphBoundaryCandidates,
  detectSentenceBoundaryCandidates,
  detectTextCandidates,
  detectVerseMappingCandidates,
} from '../../scripts/lib/transcriptDetectors.js';

const cases = loadJson(path.resolve(
  'tests/fixtures/transcript_web_refactor/detector_cases.json',
));

test('D1 emits only source-grounded known-term corrections', () => {
  const candidates = detectTextCandidates(cases.textCorrection.session, {
    sourceText: cases.textCorrection.sourceText,
    corrections: cases.textCorrection.corrections,
  });
  assert.deepEqual(candidates.map(({ sentenceId, replacement }) => ({ sentenceId, replacement })), [
    { sentenceId: 'sent-1', replacement: '比量' },
  ]);
});

test('D2 marks an internal question boundary UNVERIFIED when audio alignment is required', () => {
  const candidates = detectSentenceBoundaryCandidates(cases.sentenceBoundary);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sentenceId, 'sent-1');
  assert.equal(candidates[0].operation, 'SPLIT');
  assert.equal(candidates[0].confidence, 'UNVERIFIED');
  assert.equal(candidates[0].reason, 'audio_alignment_required');
});

test('D3 finds a cross-paragraph broken word without flagging a natural boundary', () => {
  const candidates = detectParagraphBoundaryCandidates(cases.paragraphBoundary);
  assert.deepEqual(candidates.map(({ targetParagraphId, sourceParagraphId }) => ({
    targetParagraphId,
    sourceParagraphId,
  })), [{ targetParagraphId: 'p_1', sourceParagraphId: 'p_2' }]);
});

test('D4 requires source text, sentence text, sentence id and active session to agree', () => {
  const hit = detectVerseMappingCandidates({
    session: cases.verseMapping.session,
    manifest: cases.verseMapping.manifest,
    sourceText: cases.verseMapping.sourceText,
  });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].status, 'source_match');

  const wrongSession = {
    ...cases.verseMapping.manifest,
    sessionId: '06',
  };
  assert.deepEqual(detectVerseMappingCandidates({
    session: cases.verseMapping.session,
    manifest: wrongSession,
    sourceText: cases.verseMapping.sourceText,
  }), []);
});
