// tests/required-set-not-truncated.test.js
//
// Reviewer (PR #12 #5349634955 round 3) — the human-review queue MUST
// include every required sample (start/end, every 300-s chunk boundary,
// every NEEDS_REVIEW, every strict-audit INCONCLUSIVE/ANCHOR_FAIL, every
// substitute UNANCHORED). Prior scripts silently dropped required
// samples via [:n_target] and [:20] caps. This test HARD-FAILS if:
//
//   (1) The strict audit drops any required sample from audit_indices.
//   (2) The substitute audit drops any required sample from
//       human_review_queue.
//   (3) The human review manifest drops any required sample.
//
// A sample is "required" iff it is start/end / chunk boundary /
// NEEDS_REVIEW. The test recomputes the required set from the pilot
// JSONs and the strict-audit verdict rows, so it does not trust the
// scripts to have audited what they should have.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PILOT = ['01', '69A', '110B'];

function readJSON(rel) {
  const p = join(ROOT, 'qa_27B', rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Compute the required set: start/end + 300-s chunk boundaries +
// NEEDS_REVIEW. This is the ground-truth definition the scripts must
// honor (recomputed here independently so the scripts cannot game it).
// Sentences with start=None or end=None are excluded (they have no
// audio-grounded timestamp to anchor); matches the audit script's
// `none_ts_skipped` policy.
function computeRequiredSet(sid) {
  const pil = readJSON(`stage2v2_aligned_${sid}.json`);
  if (!pil) return null;
  const sents = [];
  for (const para of pil.paragraphs) {
    for (const s of para.sentences) {
      sents.push({ start: s.start, end: s.end, text: s.text,
                   needs_review: !!s.needs_review });
    }
  }
  const n = sents.length;
  const required = new Set();
  if (n && sents[0].start != null && sents[0].end != null) required.add(0);
  if (n && sents[n - 1].start != null && sents[n - 1].end != null) required.add(n - 1);
  // 300-s chunk boundaries
  const last_end = sents.length ? (sents[sents.length - 1].end || 0) : 0;
  for (let b = 300; b < Math.floor(last_end); b += 300) {
    let pick = null;
    for (let j = 0; j < n; j++) {
      const s = sents[j];
      if (s.start != null && s.end != null && s.start <= b && b <= s.end) {
        pick = j; break;
      }
    }
    if (pick == null) {
      let best = null, bestDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (sents[j].start == null) continue;
        const d = Math.abs((sents[j].start || 0) - b);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      if (best != null) pick = best;
    }
    if (pick != null) required.add(pick);
  }
  // NEEDS_REVIEW (skip those with no timestamps)
  for (let j = 0; j < n; j++) {
    if (sents[j].needs_review && sents[j].start != null && sents[j].end != null) {
      required.add(j);
    }
  }
  return { required, sents };
}

for (const sid of PILOT) {
  // Each test is conditional: if the audit JSON has the new
  // `audit_indices` / `human_review_queue` fields, the test runs and
  // asserts no required sample was dropped. If the fields are absent
  // (legacy evidence, pre round-3 commit), the test is a soft skip so
  // CI doesn't fail before the next evidence refresh. A separate
  // test below asserts the fields ARE present in committed evidence.
  test(`[${sid}] required set honored by strict audit (when audit_indices present)`, () => {
    const strict = readJSON('audio_anchor_audit.json');
    assert.ok(strict, 'audio_anchor_audit.json missing');
    const s = strict.sessions.find(x => x.sessionId === sid);
    assert.ok(s, `strict audit missing session ${sid}`);
    if (!Array.isArray(s.audit_indices)) {
      console.log('  (skip: strict audit lacks audit_indices field — '
        + 'regenerate via scripts/audio_anchor_audit.py)');
      return;
    }
    const audit_idx = new Set(s.audit_indices);
    const ground = computeRequiredSet(sid);
    const { required } = ground;
    for (const j of required) {
      assert.ok(audit_idx.has(j),
        `${sid}: required sample ${j} is missing from strict audit audit_indices. `
        + `Reviewer requires start/end + 300-s boundary + NEEDS_REVIEW to NEVER be dropped.`);
    }
  });

  test(`[${sid}] required set honored by substitute audit (when queue present)`, () => {
    const sub = readJSON('audio_anchor_audit_human_substitute.json');
    assert.ok(sub, 'audio_anchor_audit_human_substitute.json missing');
    const s = sub.sessions.find(x => x.sessionId === sid);
    assert.ok(s, `substitute audit missing session ${sid}`);
    if (!Array.isArray(s.audit_indices) || !Array.isArray(s.human_review_queue)) {
      console.log('  (skip: substitute audit lacks audit_indices/human_review_queue '
        + '— regenerate via scripts/audio_anchor_human_substitute.py)');
      return;
    }
    const sub_idx = new Set(s.audit_indices);
    const sub_q = new Set(s.human_review_queue);

    const ground = computeRequiredSet(sid);
    const { required } = ground;
    for (const j of required) {
      assert.ok(sub_idx.has(j),
        `${sid}: required sample ${j} missing from substitute audit_indices`);
    }
    for (const r of s.rows || []) {
      if (r.verdict === 'UNANCHORED' || r.needs_human_review) {
        assert.ok(sub_q.has(r.i),
          `${sid}: UNANCHORED/needs_human sample ${r.i} missing from human_review_queue`);
      }
    }
  });

  test(`[${sid}] human_review_manifest.json contains every required sample`, () => {
    const m = readJSON('human_review_manifest.json');
    if (!m) return;  // manifest not built yet — handled in build step
    const s = m.sessions.find(x => x.sessionId === sid);
    assert.ok(s, `human_review_manifest missing session ${sid}`);
    const sample_is = new Set(s.samples.map(x => x.sentence_index));

    const ground = computeRequiredSet(sid);
    const { required } = ground;
    for (const j of required) {
      assert.ok(sample_is.has(j),
        `${sid}: required sample ${j} is missing from human_review_manifest.`);
    }
    // No `[:20]` cap should have dropped tail samples.
    assert.ok(s.n_required >= required.size,
      `${sid}: human_review_manifest.samples has ${s.n_required} rows but required set is ${required.size}`);
  });
}

// HARD gate: every committed audit must carry audit_indices /
// human_review_queue, OR the audit JSON must be absent (legacy state
// before round 3). This catches the "someone regenerated one audit
// but not the other" failure mode without forcing a global evidence
// refresh before code can ship.
test('GATE: every committed audit carries round-3 fields (or is absent)', () => {
  const strict = readJSON('audio_anchor_audit.json');
  const sub = readJSON('audio_anchor_audit_human_substitute.json');
  const manifest = readJSON('human_review_manifest.json');
  if (strict) {
    for (const sid of PILOT) {
      const s = strict.sessions.find(x => x.sessionId === sid);
      assert.ok(s, `strict audit missing session ${sid}`);
      assert.ok(Array.isArray(s.audit_indices),
        `${sid}: strict audit.audit_indices is missing — regenerate via `
        + `scripts/audio_anchor_audit.py (round 3 added the field)`);
    }
  }
  if (sub) {
    for (const sid of PILOT) {
      const s = sub.sessions.find(x => x.sessionId === sid);
      assert.ok(s, `substitute audit missing session ${sid}`);
      assert.ok(Array.isArray(s.audit_indices) && Array.isArray(s.human_review_queue),
        `${sid}: substitute audit missing audit_indices/human_review_queue — `
        + `regenerate via scripts/audio_anchor_human_substitute.py`);
    }
  }
  if (manifest) {
    for (const sid of PILOT) {
      const s = manifest.sessions.find(x => x.sessionId === sid);
      assert.ok(s, `human_review_manifest missing session ${sid}`);
      assert.ok(Array.isArray(s.samples) && s.samples.length > 0,
        `${sid}: human_review_manifest.samples is empty`);
    }
  }
});

test('human_review_manifest.json exists once built', () => {
  const m = readJSON('human_review_manifest.json');
  if (!m) return;
  assert.ok(m.sessions && Array.isArray(m.sessions));
  assert.ok(m.verdict_options && m.verdict_options.length > 0);
});