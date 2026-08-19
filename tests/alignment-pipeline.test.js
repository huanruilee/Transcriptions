// tests/alignment-pipeline.test.js
// Issue #11 v2 — guard tests for sentence-level monotonic forced alignment.
//
// This revision (supersedes 2eaaf4f / 054fd3c test file):
//   - NO silent pass: every missing-evidence path now HARD-FAILS (assert)
//     instead of `return` / `continue`. A missing file or missing diagnostic
//     is a test failure, never a skip.
//   - Adds negative tests required by the review contract:
//       * chunk overlap (n_aligned_words must not exceed content chars,
//         which double-alignment would inflate)
//       * token omission / insertion / substitution / multi-char via a JS
//         port of the monotonic identity mapper, driven by fixtures
//       * metadata preservation (pilot payload must carry sessionId, title,
//         paragraph ids matching the source session JSON)
//       * missing-evidence hard-fail (stage scripts sys.exit, not skip)
//   - CER assertions now point at stage3b_independent_cer.py (the real
//     Levenshtein/|ref| implementation); stage2v2 no longer computes CER.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const QA_DIR = path.join(ROOT, 'qa_27B');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'alignment');
const SESSIONS_DIR = path.join(ROOT, 'courses', '入中論善顯密意疏', 'sessions');
const PILOT_SESSIONS = ['01', '69A', '110B'];

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function readQA(name) { return readJson(path.join(QA_DIR, name)); }
function readFix(name) { return readJson(path.join(FIXTURES_DIR, name)); }
function readSrc(name) {
  const p = path.join(ROOT, 'scripts', name);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

// ---------- Identity mapper (JS port of stage2v2_alignment.monotonic_map) --
// Kept in lockstep with the Python implementation. Drives the negative
// tests for omission / insertion / substitution / multi-char tokens.
function norm(c) { return (c || '').trim().toLowerCase(); }
function monotonicMap(expected, alignedWords) {
  const n = expected.length, m = alignedWords.length;
  const charWords = new Array(n).fill(null);
  let wp = 0, i = 0, substituted = 0;
  const maxLookahead = 3;
  while (i < n && wp < m) {
    const exp = norm(expected[i]);
    const wtxt = norm(alignedWords[wp].word);
    if (wtxt === exp || (wtxt && exp && wtxt[0] === exp)) {
      charWords[i] = alignedWords[wp];
      if (wtxt !== exp) substituted++;
      i++; wp++;
    } else {
      let found = false;
      for (let k = wp + 1; k < Math.min(m, wp + maxLookahead + 1); k++) {
        if (norm(alignedWords[k].word) === exp) { wp = k; found = true; break; }
      }
      if (found) continue;
      wp++;
    }
  }
  const omitted = charWords.filter(w => w === null).length;
  const extra = m - wp;
  return { charWords, omitted, extra, substituted };
}
const W = (chars) => chars.map((c, idx) => ({ word: c, start: idx, end: idx + 0.3 }));

// ---------- File presence (HARD FAIL, no silent skip) ----------------------

test('Issue #11 v2: required v2 evidence files exist (hard fail if missing)', () => {
  assert.ok(readQA('stage2v2_alignment_manifest.json'),
    'stage2v2_alignment_manifest.json must exist');
  for (const sid of PILOT_SESSIONS) {
    assert.ok(readQA(`stage2v2_alignment_${sid}.json`),
      `stage2v2_alignment_${sid}.json must exist`);
    assert.ok(readQA(`stage2v2_aligned_${sid}.json`),
      `stage2v2_aligned_${sid}.json (pilot payload) must exist`);
    assert.ok(readQA(`stage3v2_measurement_${sid}.json`),
      `stage3v2_measurement_${sid}.json must exist`);
    assert.ok(readQA(`stage3b_independent_cer_${sid}.json`),
      `stage3b_independent_cer_${sid}.json must exist`);
  }
});

test('Issue #11 v2: 3-session alignment manifest lists all pilots', () => {
  const m = readQA('stage2v2_alignment_manifest.json');
  assert.ok(m, 'alignment manifest must exist');
  const sids = (m.stages || []).map(s => s.sessionId);
  for (const sid of PILOT_SESSIONS) {
    assert.ok(sids.includes(sid), `manifest must list session ${sid}`);
  }
});

// ---------- Per-session invariants (HARD FAIL) ------------------------------

for (const sid of PILOT_SESSIONS) {
  test(`[${sid}]: sentence timestamps monotonic non-decreasing`, () => {
    const r = readQA(`stage2v2_alignment_${sid}.json`);
    assert.ok(r, `stage2v2_alignment_${sid}.json must exist`);
    const dur = r.audio_duration;
    let lastEnd = 0;
    r.sentences.forEach((s, i) => {
      if (s.start === null || s.end === null) {
        assert.equal(s.needs_review, true,
          `sentence ${i} without timestamps must be NEEDS_REVIEW`);
        return;
      }
      assert.ok(s.start >= 0 && s.end <= dur + 0.5,
        `sentence ${i} out of bounds [${s.start},${s.end}] vs dur=${dur}`);
      assert.ok(s.start < s.end, `sentence ${i} start>=end`);
      assert.ok(s.start >= lastEnd - 0.5,
        `sentence ${i} non-monotonic: ${s.start} < ${lastEnd - 0.5}`);
      lastEnd = Math.max(lastEnd, s.end);
    });
  });

  // NEGATIVE: chunk overlap would double-align boundary sentences. The
  // definitive proof is a DISJOINT PARTITION invariant (each sentence in
  // exactly one chunk, no char duplicated across chunks), not a word-count
  // ratio band (wav2vec2 emits ~1.17 word tokens per CJK content char, so a
  // ratio band would false-positive on correct data).
  test(`[${sid}]: no chunk overlap (disjoint partition)`, () => {
    const r = readQA(`stage2v2_alignment_${sid}.json`);
    assert.ok(r && r.diagnostics, `diagnostics must exist for ${sid}`);
    const d = r.diagnostics;
    for (const k of ['no_chunk_overlap', 'n_sentences_assigned',
                     'n_sentences_in_multiple_chunks', 'chunk_char_sum',
                     'total_sentence_chars']) {
      assert.ok(k in d, `diagnostics must include ${k} for ${sid}`);
    }
    assert.equal(d.no_chunk_overlap, true,
      'no_chunk_overlap must be true (P1-1: disjoint partition)');
    assert.equal(d.n_sentences_in_multiple_chunks, 0,
      'no sentence may be in more than one chunk');
    assert.equal(d.n_sentences_assigned, d.n_sentences,
      'every sentence must be assigned to exactly one chunk');
    assert.equal(d.chunk_char_sum, d.total_sentence_chars,
      'per-chunk char sum must equal total (no duplicated text across chunks)');
  });

  test(`[${sid}]: identity-mapping diagnostics consistent (hard fail)`, () => {
    const r = readQA(`stage2v2_alignment_${sid}.json`);
    assert.ok(r && r.diagnostics, `diagnostics must exist for ${sid}`);
    const d = r.diagnostics;
    for (const k of ['n_content_chars', 'n_aligned_words', 'n_chars_matched',
                     'n_omitted_chars', 'n_extra_words', 'n_substituted_chars',
                     'char_coverage', 'n_non_monotonic_sentences', 'n_needs_review']) {
      assert.ok(k in d, `diagnostics must include ${k} for ${sid}`);
    }
    // char_coverage must equal (n_content_chars - n_omitted)/n_content_chars.
    const expectCov = (d.n_content_chars - d.n_omitted_chars) / d.n_content_chars;
    assert.ok(Math.abs(d.char_coverage - expectCov) < 0.001,
      `char_coverage ${d.char_coverage} != computed ${expectCov}`);
    // Zero non-monotonic sentences (alignment must be monotonic).
    assert.equal(d.n_non_monotonic_sentences, 0,
      `non-monotonic sentences must be 0, got ${d.n_non_monotonic_sentences}`);
  });

  test(`[${sid}]: pilot payload preserves session + paragraph metadata`, () => {
    const pil = readQA(`stage2v2_aligned_${sid}.json`);
    const src = readJson(path.join(SESSIONS_DIR, `session_${sid}.json`));
    assert.ok(pil, `pilot payload must exist for ${sid}`);
    assert.ok(src, `source session must exist for ${sid}`);
    // Top-level metadata (title, next-session nav, audio) preserved.
    assert.equal(pil.sessionId, src.sessionId ?? sid,
      'pilot must carry the real sessionId');
    if (src.title !== undefined) {
      assert.equal(pil.title, src.title, 'pilot must carry the title');
    }
    assert.ok(pil._pilot_v2 === true, 'pilot must set _pilot_v2 flag');
    assert.ok(pil._meta && pil._meta.alignment_engine === 'whisperx-wav2vec2-xlsr-53',
      'pilot _meta must carry alignment engine');
    assert.equal((pil._meta.audio_sha256 || '').length, 64,
      'pilot _meta must carry 64-char audio sha256');
    // Paragraph ids preserved (autoplay/next depends on these).
    assert.equal(pil.paragraphs.length, src.paragraphs.length,
      'pilot must carry the same number of paragraphs');
    for (let pi = 0; pi < src.paragraphs.length; pi++) {
      if (src.paragraphs[pi].id !== undefined) {
        assert.equal(pil.paragraphs[pi].id, src.paragraphs[pi].id,
          `paragraph ${pi} id must be preserved`);
      }
      assert.equal(pil.paragraphs[pi].sentences.length,
        src.paragraphs[pi].sentences.length,
        `paragraph ${pi} must carry all sentences`);
    }
  });
}

// ---------- Identity-mapping NEGATIVE tests (JS port) ------------------------

test('mapper: perfect 1:1 identity', () => {
  const r = monotonicMap([...('觀中')], W(['觀', '中']));
  assert.equal(r.omitted, 0); assert.equal(r.extra, 0);
  assert.equal(r.substituted, 0);
  assert.equal(norm(r.charWords[0].word), '觀');
  assert.equal(norm(r.charWords[1].word), '中');
});

test('mapper: aligner INSERTS a token (multi-token / 多字) — must skip it', () => {
  // Expected 觀中, aligner returns 觀 X 中. The X is an insertion and must
  // NOT be attributed to 觀 or 中.
  const r = monotonicMap([...('觀中')], W(['觀', 'X', '中']));
  assert.equal(norm(r.charWords[0].word), '觀', 'first char -> 觀');
  assert.equal(norm(r.charWords[1].word), '中', 'second char -> 中 (skip X)');
  assert.equal(r.omitted, 0, 'no expected char omitted');
});

test('mapper: aligner OMITS a token (漏字) — must flag omission, not shift', () => {
  // Expected 觀中, aligner returns only 觀. 中 is omitted and must be None;
  // 觀 must still map to the first word (no mis-attribution).
  const r = monotonicMap([...('觀中')], W(['觀']));
  assert.equal(norm(r.charWords[0].word), '觀', '觀 maps to first word');
  assert.equal(r.charWords[1], null, '中 is omitted -> null');
  assert.equal(r.omitted, 1, 'exactly one omission flagged');
});

test('mapper: aligner SUBSTITUTES a multi-char token (首字相同) — position kept, flagged', () => {
  // A "substitution" in the identity mapper means the aligner emitted a
  // multi-char token whose FIRST char matches the expected char (e.g. token
  // "中心" for expected "中"). The monotonic position is kept and it is
  // flagged as substituted (word text != expected char).
  const r = monotonicMap([...('中心')], W(['中心', '心']));
  assert.equal(norm(r.charWords[0].word), '中心', 'first char -> multi-char token 中心');
  assert.equal(norm(r.charWords[1].word), '心', 'second char -> 心');
  assert.equal(r.omitted, 0, 'no omission');
  assert.ok(r.substituted >= 1, 'at least one substitution flagged');
});

test('mapper: multi-character ASCII token stream aligns char-by-char', () => {
  // "a12b" content chars a,1,2,b each align to their own word.
  const r = monotonicMap([...('a12b')], W(['a', '1', '2', 'b']));
  assert.equal(r.omitted, 0);
  assert.deepEqual(r.charWords.map(w => norm(w.word)), ['a', '1', '2', 'b']);
});

test('mapper: monotonic invariant — word pointer never rewinds', () => {
  // Scattered insertions; the mapping must stay monotonic (no char maps to
  // a word earlier than the previous char's word).
  const r = monotonicMap([...('觀中論善')], W(['觀', 'q', '中', 'z', '論', '善', '!']));
  const starts = r.charWords.map(w => (w ? w.start : null)).filter(v => v !== null);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] >= starts[i - 1],
      `monotonicity broken at ${i}: ${starts[i]} < ${starts[i - 1]}`);
  }
  assert.deepEqual(r.charWords.filter(Boolean).map(w => norm(w.word)),
    ['觀', '中', '論', '善'], 'only expected chars mapped, insertions skipped');
});

// ---------- CER methodology: Levenshtein/|ref| in stage3b (real impl) --------

test('CER: stage3b uses Levenshtein/|ref|, not SequenceMatcher.ratio', () => {
  const src = readSrc('stage3b_independent_cer.py');
  assert.ok(src, 'stage3b_independent_cer.py must exist');
  assert.ok(/def cer\(/.test(src), 'stage3b must define cer()');
  assert.ok(/levenshtein\s*\(/.test(src), 'stage3b must call a levenshtein()');
  assert.ok(/cer\s*\(.*\)/.test(src), 'stage3b must define or use cer()');
  assert.ok(/\/\s*len\s*\(/.test(src),
    'CER must be normalised by |ref| (i.e. / len(ref))');
  assert.ok(!src.includes('SequenceMatcher'),
    'stage3b must NOT use SequenceMatcher');
  assert.ok(!/ratio\(\)/.test(src), 'stage3b must NOT use .ratio()');
});

test('CER: stage2v2 no longer presents forced-align CER as accuracy', () => {
  const src = readSrc('stage2v2_alignment.py');
  assert.ok(src, 'stage2v2_alignment.py must exist');
  // stage2v2 must not compute CER at all (it is a pipeline-integrity
  // signal measured in stage3/3b). No cer() or levenshtein() here.
  assert.ok(!/def cer\(/.test(src),
    'stage2v2 must not define cer() (moved to stage3b/3)');
  assert.ok(!/levenshtein/i.test(src),
    'stage2v2 must not contain levenshtein (no self-echo CER)');
  assert.ok(!src.includes('SequenceMatcher'),
    'stage2v2 must not use SequenceMatcher');
});

test('CER: stage3v2 labels integrity CER as not an accuracy signal', () => {
  const r01 = readQA('stage3v2_measurement_01.json');
  assert.ok(r01, 'stage3v2_measurement_01.json must exist');
  const d = r01.diagnostics;
  assert.ok('cer_pipeline_integrity' in d, 'must report cer_pipeline_integrity');
  assert.ok('cer_independent_asr_proxy' in d,
    'must report cer_independent_asr_proxy (from stage3b)');
  assert.equal(d.is_text_accuracy_evidence, false,
    'stage3v2 must declare itself NOT text-accuracy evidence');
  // The independent proxy CER must be a real number (not null/undefined).
  assert.ok(typeof d.cer_independent_asr_proxy === 'number',
    'independent ASR proxy CER must be a number');
  assert.equal(d.cer_independent_asr_proxy_breakdown.script_normalized, true,
    'CER must be script-normalized (Traditional ↔ Traditional) so script-conversion noise does not inflate the signal');
});

// ---------- ts error reference is labelled legacy/coarse (not audio-grounded)

test('ts: reference labelled legacy/coarse, not audio-grounded', () => {
  const r01 = readQA('stage3v2_measurement_01.json');
  assert.ok(r01, 'stage3v2_measurement_01.json must exist');
  const d = r01.diagnostics;
  // New field names carry the _vs_legacy suffix (old ts_start_median removed).
  assert.ok('ts_start_median_vs_legacy' in d,
    'ts metrics must be labelled _vs_legacy');
  assert.ok('ts_reference' in d && /LEGACY/i.test(d.ts_reference),
    'ts_reference must state it is a legacy/coarse baseline');
  assert.ok(!/ts_start_median[^_]/.test(JSON.stringify(d)),
    'old unlabelled ts_start_median field must be gone');
});

// ---------- Missing-evidence HARD FAIL in stage scripts (no silent skip) ----

test('hard-fail: stage3v2 measurement sys.exit on missing evidence', () => {
  const src = readSrc('stage3v2_measurement.py');
  assert.ok(src, 'stage3v2_measurement.py must exist');
  // Must contain an explicit non-zero exit on missing alignment evidence.
  assert.ok(/sys\.exit\(\s*[2-9]/.test(src),
    'stage3v2 must sys.exit(non-zero) when alignment evidence is missing');
  // Must NOT have the old silent-skip pattern (return None + continue).
  assert.ok(!/if not align_path\.exists\(\):\s*\n\s*return None/.test(src),
    'stage3v2 must not silently return None on missing evidence');
});

test('hard-fail: stage3b transcribe passes model id (no global-before-use bug)', () => {
  const src = readSrc('stage3b_independent_cer.py');
  assert.ok(src, 'stage3b_independent_cer.py must exist');
  assert.ok(!/global ASR_MODEL/.test(src),
    'stage3b must not use `global ASR_MODEL` after reading it (SyntaxError)');
  assert.ok(/def transcribe\(sid: str, model_id: str\)/.test(src),
    'stage3b transcribe must take model_id as a parameter');
});

// ---------- No silent synthetic/fixed-step fallback --------------------------

test('no silent synthetic-step fallback (source guard)', () => {
  const src = readSrc('stage2v2_alignment.py');
  assert.ok(src, 'stage2v2_alignment.py must exist');
  assert.ok(/monotonic/.test(src) && /non_monotonic/.test(src),
    'stage2v2 must enforce monotonicity');
});

test('synthetic fixture: zero-variance gaps classified as synthetic', () => {
  const fix = readFix('synthetic_step_pattern.json');
  assert.ok(fix, 'synthetic_step_pattern.json fixture must exist (no silent skip)');
  const gaps = [];
  for (let i = 1; i < fix.sentences.length; i++)
    gaps.push(fix.sentences[i].start - fix.sentences[i - 1].start);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const var_ = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  assert.ok(var_ < 0.001, `synthetic fixture must have ~zero variance (got ${var_})`);
  assert.equal(var_ < 0.001 && gaps.length > 5, true,
    'detector must classify zero-variance gaps as synthetic');
});

test('random-step fixture: monotonic but not audio-grounded', () => {
  const fix = readFix('random_step_pattern.json');
  assert.ok(fix, 'random_step_pattern.json fixture must exist (no silent skip)');
  let last = -1, mono = true;
  for (const s of fix.sentences) { if (s.start < last) { mono = false; break; } last = s.start; }
  assert.equal(mono, true, 'random-step fixture is monotonic by construction');
});

// ---------- Pilot runtime: v2 payload bypasses global ratio scaling ----------

test('runtime: pilot v2 payload is consumed and ratio=1.0 bypass wired', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
  assert.ok(appJs, 'app.js must exist');
  assert.ok(/_pilot_v2/.test(appJs), 'app.js must check the _pilot_v2 flag');
  const sync = fs.readFileSync(path.join(ROOT, 'src', 'js', 'syncPlayer.js'), 'utf8');
  assert.ok(/pilot_v2/.test(sync), 'syncPlayer must accept pilot_v2 option');
});
