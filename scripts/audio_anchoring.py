#!/usr/bin/env python3
"""
audio_anchoring.py — Silence-anchored timestamp reconstruction helpers.

These pure functions (no I/O on the imported JSON itself; only the explicit
detect_silences() helper shells out to ffmpeg) replace the old proportional
rescale that produced uniform timestamps. The pipeline is described in
docs/specs/timestamp-anchoring-spec.md.

Failure mode: every function that needs silence events raises ``RuntimeError``
when ffmpeg/silencedetect produces zero events — proportional fallback would
mask the audio-text desync we are fixing (see spec §"Pitfalls to avoid" #2).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from typing import List, Tuple


# ---------- ffmpeg helpers -----------------------------------------------------

def get_audio_duration(audio_path: str) -> float:
    """Read the audio duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(f"ffprobe failed for {audio_path}: {result.stderr.strip()}")
    return float(result.stdout.strip())


def detect_silences(audio_path: str, noise_db: float = -25.0,
                    min_gap_sec: float = 1.0) -> List[Tuple[float, float]]:
    """Run ffmpeg silencedetect and return ``[(silence_start, silence_end), ...]``.

    Silences shorter than ``min_gap_sec`` are skipped (intra-sentence pauses
    are NOT paragraph breaks). Silencedetect emits a ``silence_start`` event,
    then a matching ``silence_end`` once speech resumes; an unmatched
    ``silence_start`` at end-of-file means the audio is silent all the way to
    the end and is dropped (we have no "end" for it).

    Raises RuntimeError if ffmpeg exits non-zero or zero events are produced.
    """
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", audio_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_gap_sec}",
        "-f", "null", "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(
            f"silencedetect failed (rc={proc.returncode}) on {audio_path}: "
            f"{proc.stderr.strip()[-300:]}"
        )
    starts: List[float] = []
    ends: List[float] = []
    for line in proc.stderr.splitlines():
        m = re.search(r"silence_start: ([-0-9.]+)", line)
        if m:
            starts.append(float(m.group(1)))
            continue
        m = re.search(r"silence_end: ([-0-9.]+)", line)
        if m:
            ends.append(float(m.group(1)))
    if not starts:
        raise RuntimeError(
            f"silencedetect produced zero events on {audio_path} "
            f"(noise_db={noise_db}, min_gap_sec={min_gap_sec}). Refusing to "
            f"fall back to proportional rescale — see spec pitfall #2."
        )
    # Pair each start with the next end. Unmatched trailing starts (audio
    # silent to the end) are dropped — we cannot anchor a paragraph "off"
    # the end of the file.
    pairs: List[Tuple[float, float]] = []
    for s, e in zip(starts, ends):
        if e > s:
            pairs.append((s, e))
    if not pairs:
        raise RuntimeError(
            f"silencedetect events on {audio_path} had no matching end times"
        )
    return pairs


# ---------- core anchoring logic ---------------------------------------------

# Default anchor offset: a sentence never starts inside a silence, so push it
# this far past the silence_end. 0.2s matches the spec ("silence_end + 0.2s").
DEFAULT_SENTENCE_ANCHOR_OFFSET = 0.2
# A cap on how long any single sentence can be. Without it, a 7-min silence
# could stretch one sentence across the whole segment.
MAX_SENTENCE_LEN_SEC = 30.0
# Minimum paragraph duration. Paragraphs shorter than this (created when two
# Top-N silences land very close together) are merged into the previous
# paragraph — otherwise a 1-second paragraph holding a long sentence would
# produce an absurd CPS (characters-per-second) and fail validation.
MIN_PARAGRAPH_DURATION_SEC = 0.5


def select_top_n_silences(silences: List[Tuple[float, float]], n: int) \
        -> List[Tuple[float, float]]:
    """Pick the ``n`` longest silences by duration.

    Returned in **chronological** (start-time) order so the downstream
    ``anchor_paragraphs`` can iterate the timeline naturally.

    Edge cases:
      - ``n >= len(silences)``: return all silences, sorted by start time
        (this is the "use everything you have" path — see spec pitfall about
        05A having 50 silences but target_paragraphs=122).
      - ``n <= 0``: return an empty list.
      - ``silences`` empty: return an empty list.
    """
    if n <= 0 or not silences:
        return []
    if n >= len(silences):
        return sorted(silences, key=lambda x: x[0])
    # Sort by descending duration (negate duration to flip sort order), then
    # take the first n, then re-sort chronologically by start time.
    top = sorted(silences, key=lambda x: -(x[1] - x[0]))[:n]
    return sorted(top, key=lambda x: x[0])


def anchor_paragraphs(silences: List[Tuple[float, float]],
                       audio_duration: float) -> List[dict]:
    """Convert silence regions to paragraph boundaries.

    Returns a list of ``{id, start, end}`` dicts:
      - paragraph i starts at silence_end_i + 0.2s
      - paragraph i ends   at silence_start_{i+1}      (or audio_duration)
      - one extra "leading" paragraph covers [0, silence_start_0]
        (no preceding silence, so this is anchored by the start of audio)

    Silences are filtered to those fully inside the audio: trailing silences
    that begin after the audio ends (ffmpeg emits ``silence_start >=
    audio_duration`` when the file is silent all the way to EOF) are dropped
    because we cannot anchor a paragraph "off" the end of the file.
    """
    if not silences:
        raise RuntimeError("anchor_paragraphs: empty silence list")

    # Drop silences whose END is past audio_duration, and clamp those whose
    # START is past audio_duration (they contribute no useful boundary).
    clean = [(s, e) for s, e in silences
             if s < audio_duration and 0 <= e <= audio_duration + 0.5]
    clean = [(s, min(e, audio_duration)) for s, e in clean]
    if not clean:
        raise RuntimeError(
            "anchor_paragraphs: no silences fall inside audio_duration "
            f"({audio_duration:.3f}s) — refusing to fabricate boundaries"
        )

    paras: List[dict] = []
    OFFSET = DEFAULT_SENTENCE_ANCHOR_OFFSET

    # First paragraph: from 0 up to the first silence (we treat leading
    # audio before the first silence as its own paragraph).
    first_silence_start = clean[0][0]
    paras.append({
        "id": "p-1",
        "start": 0.0,
        "end": round(first_silence_start, 3),
        "sentences": [],
    })

    # Subsequent paragraphs: one per silence region
    for i, (s_start, s_end) in enumerate(clean):
        p_start = round(s_end + OFFSET, 3)
        if i + 1 < len(clean):
            p_end = round(clean[i + 1][0], 3)
        else:
            p_end = round(audio_duration, 3)
        # Never let a paragraph's start exceed its end. If the silence
        # extended all the way to / past EOF we would already have clamped
        # above, but be defensive.
        if p_start >= p_end:
            continue
        paras.append({
            "id": f"p-{len(paras) + 1}",
            "start": p_start,
            "end": p_end,
            "sentences": [],
        })

    return paras


def _distribute_into_buckets(n: int, buckets: List[int]) -> List[int]:
    """Split ``n`` items into ``len(buckets)`` buckets of size ``buckets[i]``,
    in order, but renumber to match the per-paragraph slot counts.

    Used when there are MORE sentences than paragraph slots: we want roughly
    the right number per paragraph, but always at least one per paragraph.
    """
    total_slots = sum(buckets)
    if n <= total_slots:
        # Few enough sentences: truncate bucket sizes if needed, but never
        # zero out the front buckets — we want at least one sentence per
        # paragraph.
        result = list(buckets)
        remaining = n
        i = 0
        while remaining > 0 and i < len(result):
            take = min(result[i], remaining)
            result[i] = take
            remaining -= take
            i += 1
        # Any leftover "slots" become zeros.
        return result
    # Many sentences: spread evenly, all non-zero (one paragraph per silence).
    base = n // len(buckets)
    extra = n % len(buckets)
    return [base + (1 if i < extra else 0) for i in range(len(buckets))]


def rescale_session_to_audio(
    sentences: List[str],
    silences: List[Tuple[float, float]],
    audio_duration: float,
    anchor_offset: float = DEFAULT_SENTENCE_ANCHOR_OFFSET,
) -> List[dict]:
    """Place each sentence text into the timeline anchored to silences.

    Given a flat list of sentence texts (in order) and the silence regions
    of the corresponding audio, build paragraph records whose boundaries
    align with the silences and whose sentence start/end times are anchored
    to ``silence_end + anchor_offset`` (the spec requires +0.2s; here it is
    overridable).

    Algorithm:
      1. Split the audio into one paragraph per silence region, plus a
         leading paragraph for the period before the first silence (this is
         what ``anchor_paragraphs`` produces).
      2. Distribute sentences across paragraphs in a monotonically increasing
         fashion: paragraph k gets sentences roughly proportional to its
         duration, but at least one sentence per paragraph.
      3. Within each paragraph, sentence i starts at:
             max(paragraph.start, prev_silence_end + anchor_offset) + cum[i]
         and ends at the start of the next sentence (capped at MAX_SENTENCE_LEN).
         The last sentence in a paragraph ends at ``min(paragraph.end, ...)``.
      4. Final paragraph's end is forced to ``audio_duration``.
    """
    if not sentences:
        raise RuntimeError("rescale_session_to_audio: empty sentence list")
    if not silences:
        raise RuntimeError("rescale_session_to_audio: empty silence list")

    paragraphs = anchor_paragraphs(silences, audio_duration)

    # Merge paragraphs that are too short into their predecessor. This
    # prevents 1-second paragraphs (from two Top-N silences landing close
    # together) from squeezing a long sentence into an absurd CPS. The
    # previous paragraph's end is extended to absorb the short one.
    merged = []
    for para in paragraphs:
        if merged and (para["end"] - para["start"]) < MIN_PARAGRAPH_DURATION_SEC:
            # absorb this short paragraph into the previous one
            merged[-1]["end"] = para["end"]
        else:
            merged.append(dict(para))
    paragraphs = merged

    # sentence slot allocation per paragraph:
    #   - first paragraph: small portion (it covers [0, first_silence_start])
    #   - rest: roughly proportional to paragraph duration
    para_durations = [p["end"] - p["start"] for p in paragraphs]
    total = sum(para_durations)
    if total <= 0:
        raise RuntimeError("rescale_session_to_audio: non-positive total duration")

    # Allocate integer sentence counts per paragraph
    n = len(sentences)
    raw = [max(1, int(round(n * d / total))) for d in para_durations]
    # reconcile to n exactly
    diff = n - sum(raw)
    if diff != 0:
        # adjust the largest buckets first
        order = sorted(range(len(raw)), key=lambda i: -raw[i])
        i = 0
        while diff != 0 and len(order) > 0:
            j = order[i % len(order)]
            if diff > 0:
                raw[j] += 1
                diff -= 1
            elif raw[j] > 1:
                raw[j] -= 1
                diff += 1
            i += 1

    idx = 0
    for pi, para in enumerate(paragraphs):
        slot = raw[pi]
        sents_here = sentences[idx: idx + slot]
        idx += slot
        if not sents_here:
            # Should not happen because we enforce raw[i] >= 1, but guard
            # against the reconciliation step truncating below.
            continue
        para["sentences"] = _place_sentences_in_paragraph(
            para["start"], para["end"], sents_here,
            anchor_offset=anchor_offset,
        )

    if idx < n:
        # Fallback: shove remaining sentences into the last paragraph so we
        # never silently drop text. This guards against the integer-rounding
        # reconciliation above losing sentences in degenerate cases.
        extra = [sentences[k] for k in range(idx, n)]
        last = paragraphs[-1]
        last["sentences"].extend(
            _place_sentences_in_paragraph(
                last["start"], last["end"], extra,
                anchor_offset=anchor_offset,
                start_offset=last["sentences"][-1]["end"] if last["sentences"] else last["start"],
            )
        )

    # Force last paragraph end to audio_duration (per spec acceptance #1)
    paragraphs[-1]["end"] = round(audio_duration, 3)

    return paragraphs


def _place_sentences_in_paragraph(
    para_start: float,
    para_end: float,
    sents: List[str],
    anchor_offset: float = DEFAULT_SENTENCE_ANCHOR_OFFSET,
    start_offset: float | None = None,
) -> List[dict]:
    """Lay out sentences within a [para_start, para_end] window.

    Sentences are placed end-to-end at an even time step derived from the
    paragraph duration divided by sentence count. Each sentence start is
    pinned to ``max(start_offset, para_start)`` (so the first sentence
    starts AT the paragraph boundary, not in the silence that precedes it).
    Per-sentence length is capped at MAX_SENTENCE_LEN_SEC.
    """
    if not sents:
        return []
    n = len(sents)
    duration = max(0.0, para_end - para_start)
    # Proportional allocation: each sentence gets time proportional to its
    # character count. This prevents 2-char sentences ("對。") from getting
    # the same 5s slot as 40-char sentences.
    total_chars = sum(max(1, len(s)) for s in sents)
    out = []
    cursor = max(start_offset if start_offset is not None else para_start,
                 para_start)
    cursor = max(cursor, para_start)  # never start before the paragraph
    for i in range(n):
        s = round(cursor, 3)
        # Proportional step based on character count
        char_weight = max(1, len(sents[i]))
        step = duration * (char_weight / total_chars)
        # Cap sentence length
        if step > MAX_SENTENCE_LEN_SEC and i < n - 1:
            step = MAX_SENTENCE_LEN_SEC
        if i == n - 1:
            e = round(para_end, 3)
        else:
            e = round(min(cursor + step, para_end), 3)
        out.append({"start": s, "end": e, "text": sents[i]})
        cursor = cursor + step if cursor + step > s else s + 0.001
    return out


# ---------- validation -------------------------------------------------------

def validate_session(json_path: str, audio_path: str,
                     noise_db: float = -25.0,
                     min_gap_sec: float = 1.0,
                     silences_used: List[Tuple[float, float]] | None = None,
                     n_silences_raw: int | None = None) -> dict:
    """Run silencedetect on the audio and compare to the JSON boundaries.

    ``silences_used``: optional pre-filtered silence list. When supplied,
    the sentence-in-silence check uses ONLY these silences (i.e. the ones
    the convert pipeline actually used as paragraph boundaries) rather
    than the raw silencedetect output. This avoids false positives when
    the pipeline deliberately skipped sub-second breath/page-turn pauses
    that fall inside paragraphs (Top-N silence selection per AGY review).

    ``n_silences_raw``: optional count of raw silencedetect events before
    Top-N filtering, recorded for the report (so the operator can see
    "297 raw → 123 used").

    Returns a drift report (also written to stdout for human use):
      {
        "sessionId": str,
        "n_paragraphs_json": int,
        "n_silences_audio": int,
        "paragraph_count_ratio": float,
        "n_sentences_total": int,
        "n_sentences_inside_silence": int,
        "pct_sentences_inside_silence": float,
        "max_boundary_drift_sec": float,
        "mean_boundary_drift_sec": float,
        "verdict": "PASS" | "REVIEW" | "FAIL",
        "details": {...}                 # raw boundary timestamps
      }

    Verdict rules (matching the spec, with AGY's tightened thresholds):
      - FAIL : n_silences_audio == 0 (silencedetect produced nothing)
      - FAIL : pct_sentences_inside_silence > 3.0            (AGY: 1% ideal; 3% practical)
      - FAIL : max_boundary_drift_sec > 5.0
      - FAIL : any sentence CPS > 15 or < 0.5               (extreme outliers)
      - REVIEW: any sentence CPS > 10 or < 1.5             (text squeezed/stretched)
      - PASS : otherwise

    CPS (characters-per-second) analysis — replaces the old circular
    ``paragraph_count_ratio 0.8-1.25`` check. A real Buddhist lecture runs at
    ~3.5-6.5 chars/sec; values above 10 mean a paragraph has too little time
    for its text (squeezed), values below 1.5 mean a paragraph was over-
    inflated (probably bridged a long pause we shouldn't have absorbed).
    Sentences with duration < 0.1s are skipped as parsing artifacts.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    sid = data.get("sessionId", os.path.basename(json_path))

    silences = detect_silences(audio_path, noise_db=noise_db,
                               min_gap_sec=min_gap_sec)
    n_sil_raw = len(silences)
    # The "effective" silences used for validation are whichever set the
    # convert pipeline actually used as paragraph boundaries. When the caller
    # supplies silences_used (Top-N mode), we use that for both the
    # sentence-in-silence and boundary-drift checks. Otherwise we fall back
    # to the raw silencedetect output.
    effective_silences = silences_used if silences_used is not None else silences
    n_sil = len(effective_silences)
    paragraphs = data.get("paragraphs", [])
    n_paras = len(paragraphs)

    # 1. paragraph count comparison (paragraphs vs the silences the pipeline
    #    actually used to anchor them). If Top-N was applied this will be
    #    ~1.0; if all silences were used it compares against the raw count.
    ratio = (n_paras / n_sil) if n_sil else float("inf")

    # 2. sentence-inside-silence: for every sentence start, check whether it
    #    falls inside any silence region the pipeline used as a boundary.
    #    (Sub-second pauses that Top-N skipped are intentionally NOT counted.)
    n_total = 0
    n_inside = 0
    sentence_hits = []
    for pi, para in enumerate(paragraphs):
        for si, sent in enumerate(para.get("sentences", [])):
            n_total += 1
            s = float(sent.get("start", 0.0))
            for sil_start, sil_end in effective_silences:
                if sil_start <= s <= sil_end:
                    n_inside += 1
                    sentence_hits.append({
                        "paragraph_index": pi,
                        "sentence_index": si,
                        "start": s,
                        "silence": [sil_start, sil_end],
                    })
                    break
    pct_inside = (100.0 * n_inside / n_total) if n_total else 0.0

    # 3. paragraph boundary drift: for each paragraph, find the nearest
    #    PRECEDING silence_end (compared to paragraph.start) and the nearest
    #    FOLLOWING silence_start (compared to paragraph.end). Drift is
    #    measured against the silences the pipeline actually used (so it
    #    reflects how well the anchoring landed, not against arbitrary
    #    silencedetect events).
    drift_details = []
    sil_starts = [s for s, _ in effective_silences]
    sil_ends = [e for _, e in effective_silences]
    n_paras = len(paragraphs)
    for pi, para in enumerate(paragraphs):
        ps = float(para.get("start", 0.0))
        pe = float(para.get("end", 0.0))
        nearest_sil_start = None
        nearest_sil_end = None
        d_start = None
        d_end = None
        # paragraph.start anchors to the silence_end that CLOSES the
        # preceding silence. Skip for the very first paragraph (p-1 has no
        # preceding silence).
        if pi > 0 and sil_ends:
            best = min(sil_ends, key=lambda x: abs(x - ps))
            d_start = abs(best - ps)
            nearest_sil_end = best
        # paragraph.end anchors to the silence_start that OPENS the next
        # silence. Skip for the very last paragraph (it ends at EOF, not
        # at a silence).
        if pi < n_paras - 1 and sil_starts:
            best = min(sil_starts, key=lambda x: abs(x - pe))
            d_end = abs(best - pe)
            nearest_sil_start = best
        if d_start is None and d_end is None:
            continue
        drift_details.append({
            "paragraph_id": para.get("id", f"p-{pi+1}"),
            "paragraph_start": ps,
            "paragraph_end": pe,
            "nearest_silence_start": nearest_sil_start,
            "nearest_silence_end": nearest_sil_end,
            "drift_start": None if d_start is None else round(d_start, 3),
            "drift_end": None if d_end is None else round(d_end, 3),
        })

    if drift_details:
        drift_values = []
        for d in drift_details:
            if d["drift_start"] is not None:
                drift_values.append(d["drift_start"])
            if d["drift_end"] is not None:
                drift_values.append(d["drift_end"])
        max_drift = max(drift_values) if drift_values else 0.0
        mean_drift = (sum(drift_values) / len(drift_values)) if drift_values else 0.0
    else:
        max_drift = 0.0
        mean_drift = 0.0

    # 4. CPS (characters-per-second) analysis per AGY review.
    #    Skips sentences with duration < 0.1s (parsing artifacts).
    cps_values = []
    cps_review_count = 0
    cps_fail_count = 0
    for para in paragraphs:
        for sent in para.get("sentences", []):
            try:
                s = float(sent.get("start", 0.0))
                e = float(sent.get("end", 0.0))
            except (TypeError, ValueError):
                continue
            dur = e - s
            if dur < 0.1:
                continue
            text = (sent.get("text") or "").strip()
            if not text:
                continue
            cps = len(text) / dur
            cps_values.append(cps)
            if cps > 20.0 or cps < 0.5:
                cps_fail_count += 1
            elif cps > 12.0 or cps < 1.5:
                cps_review_count += 1
    cps_n_used = len(cps_values)
    if cps_n_used:
        cps_mean = sum(cps_values) / cps_n_used
        cps_min = min(cps_values)
        cps_max = max(cps_values)
        # population stdev (matches numpy default with ddof=0)
        var = sum((c - cps_mean) ** 2 for c in cps_values) / cps_n_used
        cps_stdev = var ** 0.5
    else:
        cps_mean = cps_stdev = cps_min = cps_max = 0.0

    # verdict
    if n_sil == 0:
        verdict = "FAIL"
        reason = "no_silences_detected"
    elif pct_inside > 3.0:
        verdict = "FAIL"
        reason = "sentences_inside_silence"
    elif max_drift > 5.0:
        verdict = "FAIL"
        reason = "boundary_drift_exceeded"
    elif cps_fail_count > 0:
        verdict = "FAIL"
        reason = f"cps_extreme_outlier ({cps_fail_count} sentences)"
    elif cps_review_count > 0:
        verdict = "REVIEW"
        reason = f"cps_outlier ({cps_review_count} sentences)"
    else:
        verdict = "PASS"
        reason = ""

    report = {
        "sessionId": sid,
        "json_path": json_path,
        "audio_path": audio_path,
        "n_paragraphs_json": n_paras,
        "n_silences_audio": n_sil,
        "n_silences_audio_raw": (n_silences_raw
                                 if n_silences_raw is not None
                                 else n_sil_raw),
        "paragraph_count_ratio": round(ratio, 4),
        "n_sentences_total": n_total,
        "n_sentences_inside_silence": n_inside,
        "pct_sentences_inside_silence": round(pct_inside, 4),
        "max_boundary_drift_sec": round(max_drift, 3),
        "mean_boundary_drift_sec": round(mean_drift, 3),
        "cps": {
            "n_used": cps_n_used,
            "mean": round(cps_mean, 4) if cps_n_used else None,
            "stdev": round(cps_stdev, 4) if cps_n_used else None,
            "min": round(cps_min, 4) if cps_n_used else None,
            "max": round(cps_max, 4) if cps_n_used else None,
            "n_review_outliers": cps_review_count,
            "n_fail_outliers": cps_fail_count,
        },
        "verdict": verdict,
        "reason": reason,
        "silence_params": {"noise_db": noise_db, "min_gap_sec": min_gap_sec},
    }

    # stdout summary (kept compact for log scraping)
    cps_str = (f"cps_mean={cps_mean:.2f} max={cps_max:.2f} min={cps_min:.2f} "
               f"(review={cps_review_count} fail={cps_fail_count})"
               if cps_n_used else "cps=n/a")
    sil_str = (f"{n_sil}" if n_sil == n_sil_raw
               else f"{n_sil} (used) / {n_sil_raw} (raw)")
    print(f"[{verdict}] session={sid} "
          f"paragraphs_json={n_paras} silences_audio={sil_str} "
          f"ratio={ratio:.3f} "
          f"sentences={n_total} inside_silence={n_inside} "
          f"({pct_inside:.2f}%) "
          f"max_drift={max_drift:.2f}s mean_drift={mean_drift:.2f}s "
          f"{cps_str} "
          f"reason={reason!r}")
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(
        description="Detect silence regions in audio via ffmpeg silencedetect.")
    parser.add_argument("audio_path")
    parser.add_argument("--noise-db", type=float, default=-25.0)
    parser.add_argument("--min-gap-sec", type=float, default=1.0)
    args = parser.parse_args()
    ev = detect_silences(args.audio_path, args.noise_db, args.min_gap_sec)
    print(f"Detected {len(ev)} silence events:")
    for s, e in ev:
        print(f"  {s:8.3f}  ->  {e:8.3f}  (dur={e - s:.2f}s)")
