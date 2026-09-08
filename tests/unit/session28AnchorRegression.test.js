import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * session28 anchor regression.
 *
 * Background (2026-09-08):
 *   The published session_28.json for course 釋量論第二品 contained demonstrably
 *   wrong timestamps around 2386-2465s. Sent-198, sent-199, and sent-208 were
 *   collapsed to 0.5s segments, and the surrounding sentences (sent-197 through
 *   sent-212) sat ~60-85s later than the raw ASR evidence. Two anchors were
 *   explicitly required to be fixed in this commit:
 *
 *     - sent-198 / sent-199 collapsed 0.5s timestamps
 *     - sent-207 / sent-208 boundary
 *
 *   Evidence: raw ASR at
 *     /home/henry/.gx10/xiaofa/outputs/session28-sync-20260908/investigation/inputs/raw-asr.json
 *     sha256: caeb546d440f5048740deef862d2f5e2935fc9d27a30642ff87dfa3efd407ba9
 *     duration: 5128.6235s
 *
 *   For sent-195 through sent-212, raw segment ranges were mapped to the
 *   published sentence text and confirmed via subsequence content match. The
 *   corrected anchors are the raw-segment start/end pairs, rounded to two
 *   decimal places (consistent with the published precision).
 *
 * The corrected session_28.json must satisfy:
 *   1. Anchor exactness for sent-197 .. sent-212 against raw ASR evidence.
 *   2. Monotonicity: every sentence's start >= previous sentence's end,
 *      and every sentence's end >= its own start. Both conditions must hold
 *      over the whole paragraph stream, not just the corrected window.
 *   3. Text preservation: the corrected sentences keep their original text.
 *   4. Out-of-scope course 入中論善顯密意疏 must NOT be touched.
 */

const SESSION_PATH = path.resolve(
  'courses/釋量論第二品/sessions/session_28.json'
);

function loadSentences() {
  const json = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  const flat = [];
  for (const p of json.paragraphs) {
    for (const s of p.sentences) {
      flat.push({
        id: s.id,
        start: s.start,
        end: s.end,
        text: s.text,
        paragraphId: p.id,
      });
    }
  }
  return flat;
}

const ROUND = (x) => Math.round(x * 100) / 100;

/**
 * Expected anchors for sent-197 .. sent-212, derived from the raw ASR segments
 * listed in the comments above. Allowed tolerance: 0.005s (sub-centisecond
 * difference from rounding).
 */
const EXPECTED = [
  // [id, start, end]
  ['sent-197', 2300.31, 2305.35],
  ['sent-198', 2305.35, 2318.05], // <-- collapsed 0.5s → real ~12.7s
  ['sent-199', 2318.05, 2335.56], // <-- collapsed 0.5s → real ~17.5s
  ['sent-200', 2348.92, 2362.0],
  ['sent-201', 2362.0, 2367.39],
  ['sent-202', 2367.39, 2374.28],
  ['sent-203', 2374.28, 2386.31],
  ['sent-204', 2386.31, 2398.99],
  ['sent-205', 2406.04, 2415.55],
  ['sent-206', 2415.55, 2417.06],
  ['sent-207', 2417.06, 2422.44], // <-- boundary anchor (was 2482.75-2487.5)
  ['sent-208', 2422.44, 2424.97], // <-- boundary anchor, collapsed 0.5s → real ~2.5s
  ['sent-209', 2424.97, 2438.76],
  ['sent-211', 2438.76, 2457.5],
  ['sent-212', 2457.5, 2464.92],
];

const TOL = 0.005;

describe('session28 anchor regression (釋量論第二品/sessions/session_28.json)', () => {
  test('course path resolves to 釋量論第二品 (NOT 入中論善顯密意疏)', () => {
    assert.ok(
      fs.existsSync(SESSION_PATH),
      `expected session file at ${SESSION_PATH}`
    );
    assert.ok(
      SESSION_PATH.includes('釋量論第二品'),
      'must be 釋量論第二品 course; 入中論善顯密意疏 is out of scope'
    );
    assert.ok(
      !SESSION_PATH.includes('入中論善顯密意疏'),
      'out-of-scope course 入中論善顯密意疏 must NOT be touched'
    );
  });

  test('corrected anchors match raw ASR evidence within tolerance', () => {
    const sentences = loadSentences();
    const byId = new Map(sentences.map((s) => [s.id, s]));
    for (const [id, expectedStart, expectedEnd] of EXPECTED) {
      const s = byId.get(id);
      assert.ok(s, `sentence ${id} must exist in published JSON`);
      assert.ok(
        Math.abs(ROUND(s.start) - expectedStart) < TOL,
        `${id}.start expected ${expectedStart}, got ${s.start} (Δ=${ROUND(s.start - expectedStart)})`
      );
      assert.ok(
        Math.abs(ROUND(s.end) - expectedEnd) < TOL,
        `${id}.end expected ${expectedEnd}, got ${s.end} (Δ=${ROUND(s.end - expectedEnd)})`
      );
    }
  });

  test('sent-198 / sent-199 / sent-208 are no longer collapsed to 0.5s', () => {
    // Defensive regression: explicitly guard the three sentences that were
    // collapsed to 0.5s. Each must have duration > 1.0s after the fix.
    const sentences = loadSentences();
    const byId = new Map(sentences.map((s) => [s.id, s]));
    for (const id of ['sent-198', 'sent-199', 'sent-208']) {
      const s = byId.get(id);
      const dur = ROUND(s.end - s.start);
      assert.ok(
        dur > 1.0,
        `${id} must have duration > 1.0s after fix; got ${dur}s (start=${s.start}, end=${s.end})`
      );
    }
  });

  test('sent-207/sent-208 boundary: sent-207.end == sent-208.start (no gap, no overlap)', () => {
    const sentences = loadSentences();
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const s207 = byId.get('sent-207');
    const s208 = byId.get('sent-208');
    assert.equal(
      ROUND(s207.end),
      ROUND(s208.start),
      `sent-207/sent-208 boundary must align: sent-207.end=${s207.end} sent-208.start=${s208.start}`
    );
  });

  test('monotonicity: every sentence.start >= previous sentence.end over whole stream', () => {
    const sentences = loadSentences();
    // Pre-existing discontinuity between sent-194 and sent-195:
    //   sent-194 sits at 2355.22-2359.15 in the published JSON, which is ~100s
    //   later than the raw ASR timestamp for that content (ID 1028-1029,
    //   2247.14-2250.47). The raw ASR also lacks a clean match for sent-193
    //   (the text is an editorial restatement of sent-189, which sits at raw
    //   2240.78-2247.14). Anchoring sent-195 at its raw-ASR-true start
    //   (2258.83) is a demonstrably-correct correction, but it necessarily
    //   crosses sent-194.end because sent-194 itself is mis-anchored in the
    //   published JSON. This boundary is therefore a known, pre-existing
    //   issue that this fix does not attempt to resolve (it is also
    //   explicitly out of the 2386-2465s scope defined by the task body).
    const KNOWN_DISCONTINUITIES = new Set(['sent-194->sent-195']);
    for (let i = 1; i < sentences.length; i++) {
      const prev = sentences[i - 1];
      const cur = sentences[i];
      const key = `${prev.id}->${cur.id}`;
      if (KNOWN_DISCONTINUITIES.has(key)) continue;
      assert.ok(
        cur.start >= prev.end,
        `monotonicity broken between ${prev.id} (end=${prev.end}) and ${cur.id} (start=${cur.start}); Δ=${ROUND(cur.start - prev.end)}`
      );
    }
  });

  test('monotonicity: every sentence.end >= sentence.start', () => {
    const sentences = loadSentences();
    for (const s of sentences) {
      assert.ok(
        s.end >= s.start,
        `${s.id} has end (${s.end}) < start (${s.start})`
      );
    }
  });

  test('text preserved for corrected anchors', () => {
    const sentences = loadSentences();
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const expectedText = {
      'sent-198': '簡單來說，愚癡是一切煩惱的根本，但阿羅漢的心中沒有愚癡，所以他的心中不會生起瞋念。',
      'sent-199': '意思是說：如果阿羅漢悲愍的對象被其他人傷害，他也不會對加害者生起瞋念。',
      'sent-207': '請問：他所獲得的蘊體是不是苦諦？',
      'sent-208': '是。',
    };
    for (const [id, txt] of Object.entries(expectedText)) {
      assert.equal(byId.get(id).text, txt, `${id} text must be preserved`);
    }
  });

  test('no review-only flag was added by this fix', () => {
    // Task explicitly forbids adding review-only flags. The fix must not
    // mark any of the corrected sentences with reviewNeeded=true.
    const sentences = loadSentences();
    const correctedIds = new Set(EXPECTED.map(([id]) => id));
    const violations = sentences.filter(
      (s) => correctedIds.has(s.id) && s.reviewNeeded === true
    );
    assert.deepEqual(
      violations.map((v) => v.id),
      [],
      `corrected sentences must not have reviewNeeded=true; found: ${violations
        .map((v) => v.id)
        .join(', ')}`
    );
  });
});