import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJsonObject } from '../../scripts/lib/eneuralClient.mjs';
import {
  assertRawTextPreserved,
  findLowDensitySegments,
  isLockedSession,
  loadLockedSessions,
  maskUrls,
  unmaskUrls,
} from '../../scripts/lib/transcriptGuards.mjs';

test('locked-sessions registry protects known SHA-256 pinned sessions', () => {
  const locked = loadLockedSessions();
  assert.ok(locked.length >= 2);
  assert.equal(
    isLockedSession('courses/2025釋量論第二品大組共學/sessions/session_01.json'),
    true,
  );
  assert.equal(
    isLockedSession('courses/四念住/sessions/session_08.json'),
    true,
  );
  assert.equal(
    isLockedSession('courses/四念住/sessions/session_05.json'),
    false,
  );
});

test('maskUrls preserves ?v= query strings across punctuation normalization', () => {
  const input = '參考影音 https://www.youtube.com/watch?v=HyF9OE1P1Z0&t=12s 這是什麼?';
  const { masked, urls } = maskUrls(input);
  const normalized = masked.replace(/\?/g, '？');
  const output = unmaskUrls(normalized, urls);
  assert.equal(
    output,
    '參考影音 https://www.youtube.com/watch?v=HyF9OE1P1Z0&t=12s 這是什麼？',
  );
});

test('extractJsonObject parses fenced and plain JSON objects', () => {
  const fenced = '```json\n{"fixes":[{"id":"seg-1","text":"abc"}],"breaks":[]}\n```';
  const parsed = extractJsonObject(fenced);
  assert.deepEqual(parsed.fixes, [{ id: 'seg-1', text: 'abc' }]);
});

test('assertRawTextPreserved throws when rawText is mutated', () => {
  const before = {
    paragraphs: [{ sentences: [{ id: 'seg-1', text: '原句', rawText: '原句' }] }],
  };
  const validAfter = {
    paragraphs: [{ sentences: [{ id: 'seg-1', text: '修正句', rawText: '原句' }] }],
  };
  const invalidAfter = {
    paragraphs: [{ sentences: [{ id: 'seg-1', text: '修正句', rawText: '竄改' }] }],
  };
  assert.doesNotThrow(() => assertRawTextPreserved(before, validAfter));
  assert.throws(() => assertRawTextPreserved(before, invalidAfter), /rawText mutation detected/);
});

test('findLowDensitySegments flags compressed opening chants and ignores normal speech', () => {
  const session = {
    paragraphs: [
      {
        sentences: [
          { id: 'seg-0001', start: 32.06, end: 101.99, text: '聖誠，昨天我們提到，在輪迴中，我們無時無刻' },
          { id: 'seg-0002', start: 101.99, end: 112.0, text: '不被業和煩惱束縛，當我們被業和煩惱束縛時處在不自主狀態。' },
        ],
      },
    ],
  };
  const flagged = findLowDensitySegments(session);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].id, 'seg-0001');
  assert.ok(flagged[0].durationSec > 60);
  assert.ok(flagged[0].charsPerSec < 1.0);
});
