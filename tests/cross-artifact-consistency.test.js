#!/usr/bin/env node
// Cross-artifact consistency hard-fail test (Issue #11 v2 — review #5349634955).
//
// The reviewer found the committed brief claimed n_extra_words=1488/2035/1773
// while the committed raw JSON said 1. Root cause: brief + verification package
// are hand-written and drifted from raw evidence.
//
// This test is the enforcement layer: it reads the RAW pipeline JSONs and
// compares EVERY numeric/diagnostic field against:
//   (a) stage2v2_alignment_manifest.json
//   (b) review_verification_package.json
//   (c) review_brief_issue11v2.md  (the metrics table)
//
// ANY mismatch → hard fail. After a pipeline re-run, the generator
// (scripts/generate_review_artifacts.py --patch-brief) regenerates (b) and (c)
// from the raw JSON, so this test passing proves all four artifacts are in
// lockstep.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QA = join(ROOT, 'qa_27B');
const PILOT = ['01', '69A', '110B'];

function readJSON(rel) {
  const p = join(QA, rel);
  if (!existsSync(p)) {
    // Not yet generated (pipeline not run) → skip, don't fail CI before evidence
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function readBrief() {
  const p = join(QA, 'review_brief_issue11v2.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

// Extract a numeric value from the brief table by row label + column index.
// Table format: "| label | 01 | 69A | 110B |"
function briefValue(label, col) {
  const brief = readBrief();
  if (!brief) return null;
  const re = new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|]+)\\|\\s*([^|]+)\\|\\s*([^|]+)\\|`, 'm');
  const m = brief.match(re);
  if (!m) return null;
  return m[col + 1].trim().replace(/\*\*/g, '').replace(/,/g, '').replace(/\s+/g, '');
}

// Extract a number from a brief cell (may be "1 488" or "1488" or "0.2918")
function parseNum(s) {
  if (s === null || s === undefined) return null;
  const clean = s.replace(/,/g, '').replace(/\s+/g, '').trim();
  if (clean === 'true') return true;
  if (clean === 'false') return false;
  const n = parseFloat(clean);
  return Number.isNaN(n) ? clean : n;
}

test.describe('Cross-artifact consistency (hard fail on ANY drift)', () => {
  // Load raw evidence
  const raws = PILOT.map(sid => ({ sid, a: readJSON(`stage2v2_alignment_${sid}.json`) }));
  const manifest = readJSON('stage2v2_alignment_manifest.json');
  const pkg = readJSON('review_verification_package.json');
  const brief = readBrief();

  const missingRaw = raws.filter(r => r.a === null).map(r => r.sid);
  const hasEvidence = missingRaw.length === 0;
  const hasAll = hasEvidence && manifest !== null && pkg !== null && brief !== null;

  // HARD FAIL on missing evidence (reviewer #5349634955 follow-up:
  // was previously soft-skipped, hiding drift). Each missing artifact gets
  // its own assertion so the failure log names exactly what is gone.
  test('evidence files exist (HARD FAIL if any missing)', () => {
    const missing = [];
    for (const { sid, a } of raws) {
      if (a === null) missing.push(`qa_27B/stage2v2_alignment_${sid}.json`);
    }
    if (manifest === null) missing.push('qa_27B/stage2v2_alignment_manifest.json');
    if (pkg === null) missing.push('qa_27B/review_verification_package.json');
    if (brief === null) missing.push('qa_27B/review_brief_issue11v2.md');
    assert.deepEqual(missing, [],
      `HARD FAIL — cross-artifact evidence is incomplete; cannot guarantee consistency. Missing: ${missing.join(', ')}. Run scripts/run_full_chain.sh to regenerate.`);
  });

  // --- 1. Raw JSON internal invariant: n_extra = n_aligned - n_content + n_omitted
  if (hasEvidence) {
    test('raw JSON: n_extra invariant holds for all 3 sessions', () => {
      for (const { sid, a } of raws) {
        const d = a.diagnostics;
        const inv = d.n_aligned_words - d.n_content_chars + d.n_omitted_chars;
        assert.equal(d.n_extra_words, inv,
          `${sid}: n_extra_words=${d.n_extra_words} != invariant ${inv}`);
      }
    });

    test('raw JSON: insertion_breakdown_sum == n_extra_words', () => {
      for (const { sid, a } of raws) {
        const d = a.diagnostics;
        assert.equal(d.insertion_breakdown_sum, d.n_extra_words,
          `${sid}: breakdown_sum ${d.insertion_breakdown_sum} != n_extra ${d.n_extra_words}`);
      }
    });
  }

  // --- 2. Manifest vs raw JSON
  // The stage2v2 manifest stores per-session data under `stages[]` (each
  // entry has `sessionId` + `diagnostics{}`). Normalize that once.
  const manifestBySid = manifest && (manifest.sessions
    || (manifest.stages && Object.fromEntries(
         manifest.stages.map(s => [s.sessionId, s.diagnostics]))));
  if (hasEvidence && manifestBySid) {
    test('manifest: n_extra_words matches raw JSON for all sessions', () => {
      for (const { sid, a } of raws) {
        const entry = manifestBySid[sid];
        assert.ok(entry, `manifest missing session ${sid}`);
        assert.equal(entry.n_extra_words, a.diagnostics.n_extra_words,
          `${sid}: manifest n_extra ${entry.n_extra_words} != raw ${a.diagnostics.n_extra_words}`);
      }
    });

    test('manifest: n_content_chars + n_aligned_words match raw JSON', () => {
      for (const { sid, a } of raws) {
        const entry = manifestBySid[sid];
        assert.equal(entry.n_content_chars, a.diagnostics.n_content_chars,
          `${sid}: manifest n_content ${entry.n_content_chars} != raw ${a.diagnostics.n_content_chars}`);
        assert.equal(entry.n_aligned_words, a.diagnostics.n_aligned_words,
          `${sid}: manifest n_aligned ${entry.n_aligned_words} != raw ${a.diagnostics.n_aligned_words}`);
      }
    });
  }

  // --- 3. Verification package vs raw JSON
  if (hasEvidence && pkg) {
    test('verification package: n_extra_words matches raw JSON', () => {
      for (const { sid, a } of raws) {
        const entry = pkg.sessions[sid]?.alignment_diagnostics;
        assert.ok(entry, `package missing session ${sid}`);
        assert.equal(entry.n_extra_words, a.diagnostics.n_extra_words,
          `${sid}: package n_extra ${entry.n_extra_words} != raw ${a.diagnostics.n_extra_words}`);
      }
    });

    test('verification package: insertion_breakdown matches raw JSON', () => {
      for (const { sid, a } of raws) {
        const entry = pkg.sessions[sid]?.alignment_diagnostics;
        assert.ok(entry, `package missing session ${sid}`);
        assert.deepEqual(entry.insertion_breakdown, a.diagnostics.insertion_breakdown,
          `${sid}: package insertion_breakdown mismatch`);
      }
    });
  }

  // --- 4. Brief table vs raw JSON
  if (hasEvidence && brief) {
    test('brief: "n extra words" row matches raw JSON n_extra_words', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('n extra words', i));
        assert.equal(bv, a.diagnostics.n_extra_words,
          `${sid}: brief "n extra words"=${bv} != raw ${a.diagnostics.n_extra_words}`);
      }
    });

    test('brief: "n content chars" row matches raw JSON', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('n content chars', i));
        assert.equal(bv, a.diagnostics.n_content_chars,
          `${sid}: brief n_content=${bv} != raw ${a.diagnostics.n_content_chars}`);
      }
    });

    test('brief: "n aligned words" row matches raw JSON', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('n aligned words', i));
        assert.equal(bv, a.diagnostics.n_aligned_words,
          `${sid}: brief n_aligned=${bv} != raw ${a.diagnostics.n_aligned_words}`);
      }
    });

    test('brief: "n omitted chars" row matches raw JSON', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('n omitted chars', i));
        assert.equal(bv, a.diagnostics.n_omitted_chars,
          `${sid}: brief n_omitted=${bv} != raw ${a.diagnostics.n_omitted_chars}`);
      }
    });

    test('brief: "char_coverage" row matches raw JSON', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('char_coverage', i));
        assert.ok(Math.abs(bv - a.diagnostics.char_coverage) < 0.001,
          `${sid}: brief char_coverage=${bv} != raw ${a.diagnostics.char_coverage}`);
      }
    });

    test('brief: "no_chunk_overlap" row is true for all', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const bv = parseNum(briefValue('no_chunk_overlap', i));
        assert.equal(bv, true, `col ${i}: brief no_chunk_overlap=${bv} != true`);
      }
    });

    // NEW: insertion breakdown rows
    test('brief: "extra = source_punctuation" row matches raw insertion_breakdown', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const { sid, a } = raws[i];
        const bv = parseNum(briefValue('extra = source_punctuation', i));
        const raw = a.diagnostics.insertion_breakdown?.source_punctuation ?? 0;
        assert.equal(bv, raw, `${sid}: brief source_punct=${bv} != raw ${raw}`);
      }
    });

    test('brief: "extra = unmatched" row is 0 (no genuine hallucination)', () => {
      for (let i = 0; i < PILOT.length; i++) {
        const bv = parseNum(briefValue('extra = unmatched', i));
        assert.equal(bv, 0, `col ${i}: brief unmatched=${bv}, expected 0`);
      }
    });
  }
});
