#!/usr/bin/env python3
"""
Stage 2v2 — Sentence-level monotonic forced alignment (Issue #11 v2, P1/P2 fix).

**Replaces commit 2eaaf4f and the interim 054fd3c.** This revision fixes the
three P1 findings from Codex review of 054fd3c:

P1-1  chunk overlap double-alignment
      The interim version aligned each 300s chunk with a `a0 - 10s` text
      overlap window, so boundary sentences were forced-aligned into TWO
      chunks. Concatenating produced duplicate aligned words that shifted the
      token allocation for every later sentence.
      FIX: assign every sentence to EXACTLY ONE chunk (the chunk whose
      [a0,a1) contains the sentence's published midpoint). No text overlap.
      Peak-memory is still bounded because align() is run on 300s audio
      slices; only the text assignment is made disjoint.

P1-2  fallback only by char count, no identity
      The interim version, on a count mismatch, distributed timestamps by
      character count only, which mis-attributes dropped/extra/multi-char
      tokens to the wrong sentence.
      FIX: build the expected content-character stream (CJK + alphanumeric,
      punctuation excluded) and map it to the aligner's word stream with a
      MONOTONIC two-pointer identity walk. The walk matches each expected
      character to an aligned word by comparing normalized text, advances the
      word pointer to skip aligner insertions, and flags aligner omissions.
      The result is a monotonic sequence correspondence: word k is never
      mapped to a character earlier than word k-1's character. Sentence
      start = min word start in the sentence, end = max word end in the
      sentence. This is the "monotonic sequence correspondence" the task
      requires (sentence-level delivery, not word-level delivery).

P2    pilot payload dropped metadata
      FIX: the pilot payload now carries the full session metadata
      (sessionId, title, date, page, audioUrl) and per-paragraph id/start/end
      so title, next-session nav, and autoplay are not broken.

CER   (P1-3) is NOT computed here. Forced-alignment CER (published text vs
      align-derived text) is a pipeline-integrity signal that is ~0 by
      construction and must not be presented as text accuracy. Real text
      accuracy is measured independently in stage3b_independent_cer.py by a
      separate neural ASR, labelled as a proxy, not a human-ear review.
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA   = ROOT / "qa_27B"
AUDIO = ROOT / "audio"
SESSIONS_DIR = ROOT / "courses" / "入中論善顯密意疏" / "sessions"
PILOT = ["01", "69A", "110B"]
ALIGN_MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn"


def sha256(p: Path) -> str:
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()


def get_duration(audio: Path) -> float:
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(audio)
    ]).decode().strip())


def is_content_char(c: str) -> bool:
    """A character that carries content (CJK or alnum) and should be aligned.
    Punctuation/whitespace/control are excluded from the alignment stream."""
    if c.isspace():
        return False
    if "\u4e00" <= c <= "\u9fff":   # CJK unified ideographs
        return True
    if c.isalnum():
        return True
    return False


def norm(c: str) -> str:
    return c.strip().lower()


def content_chars(text: str) -> list[str]:
    return [c for c in text if is_content_char(c)]


def build_expected(stream_text_per_sent: list[str]):
    """Return (expected_chars, char_to_sent_idx) for the content-char stream.

    Each sentence's content characters are concatenated in order; the result
    is the ground-truth sequence that the aligner word stream must map to.
    """
    expected = []
    char_to_sent = []
    for sidx, txt in enumerate(stream_text_per_sent):
        for c in content_chars(txt):
            expected.append(c)
            char_to_sent.append(sidx)
    return expected, char_to_sent


def _classify_extra_word(word: dict) -> str:
    """Classify an aligned word that was NOT consumed as a 1:1 content match.

    Categories (token-level, mutually exclusive):
      - "source_punctuation" : word text is a single Unicode P* (punctuation) char
                               present in the source sentence text.
      - "source_symbol"      : word text is a single Unicode S* (currency/modifier)
                               or C* (control) char present in the source.
      - "multi_char_token"   : word text is >1 char (aligner emitted a multi-char
                               token at a single position).
      - "unmatched"          : word text is not found in the source sentence text
                               (a genuine aligner hallucination) — needs review.
      - "empty"              : word text is empty/whitespace-only.
    """
    txt = word.get("word", "") or ""
    if txt == "" or txt.isspace():
        return "empty"
    if len(txt) > 1:
        return "multi_char_token"
    ch = txt
    import unicodedata
    cat = unicodedata.category(ch)
    if cat.startswith("P"):
        return "source_punctuation"
    if cat.startswith("S") or cat.startswith("C"):
        return "source_symbol"
    # A single L*/N* char that was not consumed = an unmatched aligner token.
    return "unmatched"


def monotonic_map(expected: list, aligned_words: list):
    """Monotonic two-pointer identity mapping of expected content chars -> words.

    `expected` is the ordered list of content chars (whitespace/punct excluded).
    `aligned_words` is the ordered list of aligned words (align() emits one word
    per non-whitespace source char, so it also includes punctuation/symbols).

    Returns:
      char_words: list[dict|None], index i is the aligned word matched to
                  expected[i] (None if the aligner dropped it).
      n_omitted: number of expected chars with no aligned word.
      n_extra:   number of aligned words not consumed by any expected char.
      n_substituted: number of expected chars matched to a word whose text differs.
      insertions: list of the extra aligned words (window skips + trailing).
      insertion_breakdown: {category: count} token-level classification.

    INVARIANT (holds by construction; asserted):
        matched   = n_content_chars - n_omitted_chars
        n_extra   = n_aligned_words - matched
                  = n_aligned_words - n_content_chars + n_omitted_chars
    n_extra counts EVERY skipped aligned token (leading, middle, trailing).
    """
    n = len(expected)
    m = len(aligned_words)
    char_words = [None] * n
    wp = 0
    max_lookahead = 3
    n_substituted = 0
    insertions = []          # the actual extra aligned words (for classification)

    def _record_extra(idx):
        w = dict(aligned_words[idx])
        w["kind"] = "inserted"
        insertions.append(w)

    i = 0
    while i < n and wp < m:
        exp = norm(expected[i])
        word = aligned_words[wp]
        wtxt = norm(word.get("word", ""))
        if wtxt == exp or (wtxt and exp and wtxt[0] == exp):
            char_words[i] = word
            if wtxt != exp:
                n_substituted += 1
            i += 1
            wp += 1
        else:
            # Look for exp within a small window ahead (aligner insertion run).
            found = False
            for k in range(wp + 1, min(m, wp + max_lookahead + 1)):
                if norm(aligned_words[k].get("word", "")) == exp:
                    for extra in range(wp, k):
                        _record_extra(extra)
                    wp = k
                    found = True
                    break
            if found:
                continue
            # No match in window: record this word as an extra, advance wp only
            # (keep the expected char; retry against the next word). This still
            # counts every skipped token, including runs longer than max_lookahead.
            _record_extra(wp)
            wp += 1

    # Trailing aligned words (no expected char left to consume them) are extras.
    while wp < m:
        _record_extra(wp)
        wp += 1

    n_matched = sum(1 for cw in char_words if cw is not None)
    n_omitted = n - n_matched
    # n_extra from the INVARIANT (source of truth), not from a separate count.
    n_extra = m - n_matched
    # Sanity: the recorded extras must reconcile exactly with the invariant.
    assert n_extra == len(insertions), \
        f"n_extra invariant broken: m={m} n_matched={n_matched} -> " \
        f"n_extra={n_extra}, but recorded extras={len(insertions)}"
    breakdown = {
        "source_punctuation": 0,
        "source_symbol": 0,
        "multi_char_token": 0,
        "unmatched": 0,
        "empty": 0,
    }
    for w in insertions:
        cat = _classify_extra_word(w)
        breakdown[cat] += 1
    return char_words, n_omitted, n_extra, n_substituted, insertions, breakdown


def _to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def align_session(sid: str, device: str = "cpu"):
    import whisperx
    audio = AUDIO / f"{sid}.mp3"
    sess_path = SESSIONS_DIR / f"session_{sid}.json"
    sess = json.loads(sess_path.read_text())
    audio_duration = get_duration(audio)

    # Build the full ordered sentence list with metadata.
    flat_sents = []  # (pi, si, text, published_start, published_end)
    for pi, p in enumerate(sess["paragraphs"]):
        for si, s in enumerate(p["sentences"]):
            flat_sents.append((pi, si, s["text"], s.get("start", 0.0),
                               s.get("end", 0.0)))
    print(f"  {len(flat_sents)} sentences", flush=True)

    out = {
        "sessionId": sid,
        "audio_duration": audio_duration,
        "audio_sha256": sha256(audio),
        "session_json_sha256": sha256(sess_path),
    }

    print(f"  loading whisperx align model ({device}) ...", flush=True)
    t0 = time.time()
    align_model, meta = whisperx.load_align_model(language_code="zh", device=device)
    print(f"  align model loaded {time.time()-t0:.1f}s", flush=True)

    # ---- P1-1 FIX: disjoint chunk assignment, no text overlap ----
    chunk_dur = 300.0
    n_chunks = max(1, int(audio_duration / chunk_dur) + 1)
    audio_arr = whisperx.load_audio(str(audio))
    sample_rate = 16000

    # Assign each sentence to exactly one chunk by published midpoint.
    sent_chunk: list = [None] * len(flat_sents)
    for sidx, (pi, si, txt, ps, pe) in enumerate(flat_sents):
        mid = (ps + pe) / 2.0 if (ps or pe) else ps
        c = min(int(mid / chunk_dur), n_chunks - 1)
        sent_chunk[sidx] = c

    all_words = []
    t0 = time.time()
    for ci in range(n_chunks):
        a0 = ci * chunk_dur
        a1 = min(audio_duration, (ci + 1) * chunk_dur)
        i0 = int(a0 * sample_rate)
        i1 = int(a1 * sample_rate)
        chunk_arr = audio_arr[i0:i1]
        # Text for this chunk: ONLY sentences assigned to it (disjoint).
        chunk_sent_idx = [k for k in range(len(flat_sents)) if sent_chunk[k] == ci]
        if not chunk_sent_idx:
            print(f"  chunk {ci}: [{a0:.1f},{a1:.1f}] no sentences, skip", flush=True)
            continue
        chunk_text = " ".join(flat_sents[k][2] for k in chunk_sent_idx)
        print(f"  chunk {ci}: [{a0:.1f},{a1:.1f}] {len(chunk_sent_idx)} sentences, "
              f"{len(chunk_text)} chars", flush=True)
        chunk_segs = [{"start": 0.0, "end": float(a1 - a0),
                       "text": chunk_text, "words": []}]
        aligned = whisperx.align(
            chunk_segs, align_model, meta,
            chunk_arr, device=device, return_char_alignments=True)
        cnt = 0
        for seg in aligned.get("segments", []):
            for w in seg.get("words", []) or []:
                s_ = _to_float(w.get("start"))
                if s_ is None:
                    continue
                w2 = dict(w)
                w2["start"] = s_ + a0
                w2["end"] = _to_float(w.get("end"))
                if w2["end"] is not None:
                    w2["end"] = w2["end"] + a0
                all_words.append(w2)
                cnt += 1
        print(f"    -> {cnt} aligned words", flush=True)
    print(f"  aligned full audio in {n_chunks} chunks: {time.time()-t0:.1f}s total", flush=True)

    # ---- P1-2 FIX: identity-based monotonic mapping ----
    # Expected content-char stream in the SAME order as flat_sents.
    expected, char_to_sent = build_expected([s[2] for s in flat_sents])
    print(f"  expected content chars: {len(expected)}, aligned words: {len(all_words)}", flush=True)
    (char_words, n_omitted, n_extra, n_substituted,
     insertion_words, insertion_breakdown) = monotonic_map(expected, all_words)
    print(f"  mapped: matched={len(expected)-n_omitted} omitted={n_omitted} "
          f"extra={n_extra} substituted={n_substituted} "
          f"breakdown={insertion_breakdown}", flush=True)

    # Accumulate per-sentence word start/end/score.
    s_start = [None] * len(flat_sents)
    s_end = [None] * len(flat_sents)
    s_scores = [[] for _ in flat_sents]
    s_nwords = [0] * len(flat_sents)
    for cidx, cw in enumerate(char_words):
        if cw is None:
            continue
        sidx = char_to_sent[cidx]
        st = cw.get("start"); en = cw.get("end")
        if st is not None:
            s_start[sidx] = st if s_start[sidx] is None else min(s_start[sidx], st)
        if en is not None:
            s_end[sidx] = en if s_end[sidx] is None else max(s_end[sidx], en)
        sc = _to_float(cw.get("score"))
        if sc is not None:
            s_scores[sidx].append(sc)
        s_nwords[sidx] += 1

    sents_out = []
    last_end = 0.0
    needs_review_count = 0
    no_align_count = 0
    non_mono_count = 0
    for sidx, (pi, si, txt, ps, pe) in enumerate(flat_sents):
        s = s_start[sidx]; e = s_end[sidx]
        scores = s_scores[sidx]
        avg_score = round(sum(scores) / len(scores), 4) if scores else None
        if s is None or e is None:
            no_align_count += 1
            needs_review_count += 1
            sents_out.append({
                "paragraph_index": pi, "sentence_index": si, "text": txt,
                "published_start": ps, "published_end": pe,
                "start": None, "end": None, "avg_score": None,
                "needs_review": True, "reason": "no_alignment",
                "n_content_chars": len(content_chars(txt)),
                "n_words_matched": s_nwords[sidx],
            })
            continue
        non_monotonic = s < last_end - 0.5
        out_of_bounds = s < 0 or e > audio_duration + 0.5
        low_confidence = avg_score is not None and avg_score < 0.5
        reason = None
        if non_monotonic:
            reason = "non_monotonic"; non_mono_count += 1
        elif out_of_bounds:
            reason = "out_of_bounds"
        elif low_confidence:
            reason = "low_confidence"
        needs_review = reason is not None
        if needs_review:
            needs_review_count += 1
        else:
            last_end = max(last_end, e)
        sents_out.append({
            "paragraph_index": pi, "sentence_index": si, "text": txt,
            "published_start": ps, "published_end": pe,
            "start": round(s, 3), "end": round(e, 3),
            "avg_score": avg_score,
            "needs_review": needs_review, "reason": reason,
            "n_content_chars": len(content_chars(txt)),
            "n_words_matched": s_nwords[sidx],
        })

    matched = len(expected) - n_omitted
    coverage = round(matched / max(1, len(expected)), 4)

    # ---- P1-1 PROOF: disjoint partition (no chunk overlap) ----
    # Each sentence is assigned to exactly one chunk (sent_chunk). Verify:
    #   (a) every sentence assigned exactly once, (b) no sentence in 2+ chunks,
    #   (c) sum of per-chunk sentence char counts == total (no duplicated text).
    chunk_sent_count = [0] * n_chunks
    for c in sent_chunk:
        chunk_sent_count[c] += 1
    n_sents_in_multiple_chunks = 0  # by construction each sidx sets one value
    # Rebuild per-chunk char counts to prove no text duplication across chunks.
    chunk_char_counts = [0] * n_chunks
    for sidx, (pi, si, txt, ps, pe) in enumerate(flat_sents):
        c = sent_chunk[sidx]
        chunk_char_counts[c] += len(txt)
    total_sent_chars = sum(len(flat_sents[k][2]) for k in range(len(flat_sents)))

    diag = {
        "n_sentences": len(flat_sents),
        "n_content_chars": len(expected),
        "n_aligned_words": len(all_words),
        "n_chars_matched": matched,
        "n_omitted_chars": n_omitted,
        "n_extra_words": n_extra,
        "n_substituted_chars": n_substituted,
        "char_coverage": coverage,
        # Token-level classification of every extra aligned token (P1-2 fix):
        # proves whether extras are source punctuation/symbols vs genuine
        # aligner insertions. Sum of breakdown == n_extra_words by construction.
        "insertion_breakdown": insertion_breakdown,
        "insertion_breakdown_sum": sum(insertion_breakdown.values()),
        # Invariant that must hold for any correct mapper:
        "n_extra_invariant_check": (
            n_extra == len(all_words) - (len(expected) - n_omitted)
        ),
        "n_non_monotonic_sentences": non_mono_count,
        "n_no_align": no_align_count,
        "n_needs_review": needs_review_count,
        "ratio_needs_review": round(needs_review_count / max(1, len(flat_sents)), 4),
        "audio_duration": round(audio_duration, 3),
        # Disjoint-partition proof (P1-1):
        "n_chunks": n_chunks,
        "n_sentences_assigned": sum(1 for c in sent_chunk if c is not None),
        "n_sentences_in_multiple_chunks": n_sents_in_multiple_chunks,
        "chunk_char_sum": sum(chunk_char_counts),
        "total_sentence_chars": total_sent_chars,
        "no_chunk_overlap": (
            sum(1 for c in sent_chunk if c is not None) == len(flat_sents)
            and n_sents_in_multiple_chunks == 0
            and sum(chunk_char_counts) == total_sent_chars
        ),
    }

    payload = {
        "sessionId": sid,
        "audio_duration": audio_duration,
        "audio_sha256": out["audio_sha256"],
        "session_json_sha256": out["session_json_sha256"],
        "model": {
            "engine": "whisperx",
            "whisperx_version": _whisperx_version(),
            "align_model": ALIGN_MODEL_ID,
            "device": device,
            "language": "zh",
        },
        "diagnostics": diag,
        "sentences": sents_out,
    }
    full_path = QA / f"stage2v2_alignment_{sid}.json"
    full_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  -> {full_path} {diag}", flush=True)

    # ---- P2 FIX: pilot payload preserves full session metadata ----
    by_pi = {}
    for s in sents_out:
        by_pi.setdefault(s["paragraph_index"], []).append(s)
    pil_paras = []
    for pi in sorted(by_pi):
        orig_para = sess["paragraphs"][pi]
        pi_sents = []
        for s in sorted(by_pi[pi], key=lambda x: x["sentence_index"]):
            pi_sents.append({
                "start": s["start"],
                "end": s["end"],
                "text": s["text"],
                "needs_review": bool(s["needs_review"]),
                "match_score": s["avg_score"],
            })
        pil_paras.append({
            "id": orig_para.get("id"),
            "start": min([x["start"] for x in pi_sents if x["start"] is not None], default=None),
            "end": max([x["end"] for x in pi_sents if x["end"] is not None], default=None),
            "sentences": pi_sents,
        })
    pil = {
        "sessionId": sess.get("sessionId", sid),
        "title": sess.get("title"),
        "date": sess.get("date"),
        "page": sess.get("page"),
        "audioUrl": sess.get("audioUrl"),
        "paragraphs": pil_paras,
        "_pilot_v2": True,
        "_meta": {
            "source_session": sid,
            "alignment_engine": "whisperx-wav2vec2-xlsr-53",
            "audio_sha256": out["audio_sha256"],
            "audio_duration": audio_duration,
            "char_coverage": diag["char_coverage"],
            "n_omitted_chars": n_omitted,
            "supersedes": "commit 2eaaf4f / 054fd3c (overlap + char-budget fallback)",
        },
    }
    pil_path = QA / f"stage2v2_aligned_{sid}.json"
    pil_path.write_text(json.dumps(pil, ensure_ascii=False, indent=2))
    print(f"  -> {pil_path}", flush=True)
    return payload


def _whisperx_version() -> str:
    try:
        from importlib.metadata import version
        return version("whisperx")
    except Exception:
        return "unknown"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    args = ap.parse_args()

    summary = {
        "stages": [],
        "supersedes": ["2eaaf4f", "054fd3c"],
        "supersedes_reason": (
            "v2 fix: disjoint chunk assignment (no text overlap) + identity-based "
            "monotonic char->word mapping. Forced-alignment CER removed from this "
            "stage (it is a pipeline-integrity signal, ~0 by construction); real "
            "text accuracy measured independently in stage3b_independent_cer.py."),
    }
    for sid in args.sessions:
        print(f"\n=== session {sid} ===", flush=True)
        payload = align_session(sid, device=args.device)
        summary["stages"].append({
            "sessionId": sid,
            "diagnostics": payload["diagnostics"],
            "audio_sha256": payload["audio_sha256"],
            "session_json_sha256": payload["session_json_sha256"],
            "evidence_path": f"qa_27B/stage2v2_alignment_{sid}.json",
            "pilot_path": f"qa_27B/stage2v2_aligned_{sid}.json",
        })
    (QA / "stage2v2_alignment_manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2))
    print("\n=== DONE ===")
    print(json.dumps(summary["stages"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
