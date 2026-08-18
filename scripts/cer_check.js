// scripts/cer_check.js
// Issue #11 v2 — Standard Levenshtein CER, ESM module.
// Used by the guard tests in tests/alignment-pipeline.test.js to verify
// the formula. Production code uses the same logic in
// scripts/stage2v2_alignment.py (Levenshtein / |ref|).

/**
 * Standard CER: Levenshtein edit distance / |reference characters|.
 * Whitespace is stripped before measurement.
 * @param {string} ref
 * @param {string} hyp
 * @returns {number}
 */
export function cer(ref, hyp) {
  const r = (ref || '').replace(/\s+/g, '');
  const h = (hyp || '').replace(/\s+/g, '');
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return levenshtein(r, h) / r.length;
}

/**
 * Levenshtein edit distance. Pure DP, no SequenceMatcher.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      ));
    }
    prev.length = 0;
    prev.push(...cur);
  }
  return prev[prev.length - 1];
}

export default { cer, levenshtein };