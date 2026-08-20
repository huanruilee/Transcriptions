#!/usr/bin/env python3
"""Human-ear review package builder (Issue #11 v2 — D1).

WHAT THIS IS
------------
Reads the two machine audits and the production-aligned pilot JSONs,
builds the union of "required" samples that a human reviewer must listen
to (reviewer round 3 — must NOT be truncated):

  - session start (i=0)
  - session end (last sentence)
  - every 300-s chunk-boundary sentence
  - every NEEDS_REVIEW sentence
  - every strict-audit INCONCLUSIVE / ANCHOR_FAIL
  - every substitute UNANCHORED

For each required sample, produces:
  - stable sample_id = "<sid>-<i:04d>"
  - session ID + sentence index + start/end
  - previous / current / next sentence text
  - reasons (one or more of: NEEDS_REVIEW, CHUNK_BOUNDARY,
            STRICT_INCONCLUSIVE, STRICT_ANCHOR_FAIL,
            SUBSTITUTE_UNANCHORED, START, END)
  - audio clip path (segment extracted with ffmpeg from the real audio,
    written to qa_27B/_human_review_clips/<sid>/<sample_id>.wav)
  - audio clip SHA-256
  - reviewer verdict fields (default null):
        ANCHOR_PASS, SHIFTED_PREVIOUS, SHIFTED_NEXT,
        BOUNDARY_TOO_EARLY, BOUNDARY_TOO_LATE,
        NO_SPEECH, INCONCLUSIVE
  - reviewer_note (free text, default "")

RAW AUDIO IS NOT UPLOADED TO GITHUB. The clip path is local-only; the
review page (reviews/index.html) plays clips from the local filesystem
under the existing Tailscale funnel. Reviewers on the local network
listen via the controlled URL; off-network reviewers must sync the
qa_27B/_human_review_clips/ directory alongside the manifest.

OUTPUTS
-------
  qa_27B/human_review_manifest.json   (machine-readable, full evidence)
  qa_27B/human_review_manifest.md     (markdown summary, no raw audio)
  reviews/index.html                  (interactive review page)
  reviews/README.md                   (instructions)
  qa_27B/_human_review_clips/         (extracted audio clips, LOCAL ONLY)
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa_27B"
REVIEWS = ROOT / "reviews"
AUDIO = ROOT / "audio"
CLIPS = QA / "_human_review_clips"
PILOT = ["01", "69A", "110B"]

# Reviewer-verdict enums (D1 spec). Reviewer MUST pick exactly one per sample.
VERDICT_OPTIONS = [
    "ANCHOR_PASS", "SHIFTED_PREVIOUS", "SHIFTED_NEXT",
    "BOUNDARY_TOO_EARLY", "BOUNDARY_TOO_LATE",
    "NO_SPEECH", "INCONCLUSIVE",
]


def extract_clip(sid: str, start: float, end: float, out: Path) -> bool:
    src = AUDIO / f"{sid}.mp3"
    if not src.exists(): return False
    dur = max(0.25, end - start)
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                        "-ss", f"{start:.3f}", "-i", str(src),
                        "-t", f"{dur:.3f}",
                        "-ar", "16000", "-ac", "1",
                        "-c:a", "pcm_s16le", str(out)],
                       check=True, timeout=60)
        return out.exists() and out.stat().st_size > 0
    except Exception:
        return False


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _compute_base_required(sents):
    """Compute start/end + 300-s chunk boundary + NEEDS_REVIEW directly
    from the pilot JSON. The audit JSONs only ADD samples to this base
    set; they never shrink it. Matches the policy enforced by
    tests/required-set-not-truncated.test.js (None-ts excluded)."""
    n = len(sents)
    req = set()
    if n and sents[0].get("start") is not None and sents[0].get("end") is not None:
        req.add(0)
    if n and sents[n-1].get("start") is not None and sents[n-1].get("end") is not None:
        req.add(n - 1)
    last_end = (sents[-1].get("end") or 0) if sents else 0
    for b in range(300, int(last_end), 300):
        pick = None
        for j, ss in enumerate(sents):
            if ss.get("start") is None or ss.get("end") is None:
                continue
            if ss["start"] <= b <= ss["end"]:
                pick = j; break
        if pick is None:
            best = min(((abs((ss.get("start") or 0) - b), j)
                        for j, ss in enumerate(sents)
                        if ss.get("start") is not None), default=None)
            if best is not None: pick = best[1]
        if pick is not None: req.add(pick)
    for j, ss in enumerate(sents):
        if ss.get("needs_review") and ss.get("start") is not None and ss.get("end") is not None:
            req.add(j)
    return req


def build():
    strict = json.loads((QA / "audio_anchor_audit.json").read_text())
    substitute = json.loads(
        (QA / "audio_anchor_audit_human_substitute.json").read_text())
    agreement_threshold = substitute.get("agreement_threshold", 0.7)

    # Strict audit threshold echoes
    strict_thresholds = {}
    for s in strict["sessions"]:
        strict_thresholds[s["sessionId"]] = {
            "max_own_cer_threshold": s.get("max_own_cer_threshold"),
            "min_seg_dur_threshold": s.get("min_seg_dur_threshold"),
        }

    # Index audits by sessionId
    by_sid = {s["sessionId"]: s for s in strict["sessions"]}
    sub_by_sid = {s["sessionId"]: s for s in substitute["sessions"]}

    out = {
        "schema_version": 1,
        "is_human_ear_review": True,
        "is_go_gate": False,
        "agreement_threshold_substitute": agreement_threshold,
        "strict_thresholds": strict_thresholds,
        "note": ("Machine audits produced this required-set; each sample is "
                 "either a forced-required sample (start/end/300s boundary/"
                 "NEEDS_REVIEW) or a machine-flagged failure. Reviewers "
                 "listen to the extracted clip and set exactly one verdict "
                 "from the enum. Default verdict is null (not yet reviewed)."),
        "verdict_options": VERDICT_OPTIONS,
        "sessions": [],
    }

    CLIPS.mkdir(exist_ok=True)
    for sid in PILOT:
        s_strict = by_sid.get(sid)
        s_sub = sub_by_sid.get(sid)
        if s_strict is None or s_sub is None:
            print(f"[WARN] {sid}: missing strict or substitute audit")

        # Load aligned pilot to get sentence texts and per-sentence flags.
        pil = json.loads((QA / f"stage2v2_aligned_{sid}.json").read_text())
        sents = []
        for para in pil["paragraphs"]:
            for s in para["sentences"]:
                sents.append({"start": s["start"], "end": s["end"],
                              "text": s["text"],
                              "needs_review": s.get("needs_review", False)})
        n = len(sents)

        # Required set: BASE (pilot-derived) UNION audit-derived
        # additions. The base set never shrinks; audits only add more
        # samples (machine-flagged failures). This guarantees that the
        # manifest is correct even when audit JSONs lack round-3 fields.
        base_required = _compute_base_required(sents)
        strict_indices = set(s_strict.get("audit_indices", [])) if s_strict else set()
        sub_indices = set(s_sub.get("audit_indices", [])) if s_sub else set()
        sub_queue = set(s_sub.get("human_review_queue", [])) if s_sub else set()
        required = base_required | strict_indices | sub_indices | sub_queue

        # Build per-row reason map from both audits.
        strict_reason_by_i = {
            r["i"]: r.get("verdict", "UNKNOWN") + (
                ":" + r.get("reason", "n/a") if r.get("reason") else "")
            for r in (s_strict.get("rows", []) if s_strict else [])}
        sub_verdict_by_i = {
            r["i"]: r.get("verdict", "UNKNOWN") for r in (s_sub.get("rows", []) if s_sub else [])}

        samples = []
        for i in sorted(required):
            if i >= n: continue
            s = sents[i]
            # Defensive skip: sentence with no audio-grounded timestamps.
            if s.get("start") is None or s.get("end") is None:
                # Still record it but mark as no-audio (no clip, no verdict
                # possible; reviewer notes say "no_ts" instead of verdicts).
                samples.append({
                    "sample_id": f"{sid}-{i:04d}",
                    "session_id": sid,
                    "sentence_index": i,
                    "start": None, "end": None,
                    "duration_s": None,
                    "prev_text": sents[i - 1]["text"] if i > 0 else "",
                    "current_text": s["text"],
                    "next_text": sents[i + 1]["text"] if i < n - 1 else "",
                    "needs_review_flag": s.get("needs_review", False),
                    "strict_verdict": strict_reason_by_i.get(i, "NOT_AUDITED"),
                    "substitute_verdict": sub_verdict_by_i.get(i, "NOT_AUDITED"),
                    "reasons": ["NO_AUDIO_TIMESTAMP"],
                    "audio_clip_path": None,
                    "audio_clip_sha256": None,
                    "reviewer_verdict": None,
                    "reviewer_note": "",
                })
                continue
            prev_text = sents[i - 1]["text"] if i > 0 else ""
            next_text = sents[i + 1]["text"] if i < n - 1 else ""

            reasons = []
            if i == 0: reasons.append("START")
            if i == n - 1: reasons.append("END")
            if s.get("needs_review"): reasons.append("NEEDS_REVIEW")
            # 300-s chunk boundary
            for b in range(300, int(sents[-1]["end"]) if sents and sents[-1].get("end") else 0, 300):
                if (s.get("start") is not None and s.get("end") is not None
                        and s["start"] <= b <= s["end"]):
                    reasons.append(f"CHUNK_BOUNDARY@{b}s"); break
            strict_v = strict_reason_by_i.get(i, "")
            if strict_v.startswith("INCONCLUSIVE"):
                reasons.append("STRICT_INCONCLUSIVE")
            elif strict_v.startswith("ANCHOR_FAIL"):
                reasons.append("STRICT_ANCHOR_FAIL")
            elif strict_v.startswith("ANCHOR_OK"):
                # ANCHOR_OK is NOT a reason for human review (already
                # confirmed by machine). Skip unless also NEEDS_REVIEW or
                # boundary.
                if reasons == []:
                    continue  # do not include ANCHOR_OK-only in the queue
            sub_v = sub_verdict_by_i.get(i, "")
            if sub_v == "UNANCHORED":
                reasons.append("SUBSTITUTE_UNANCHORED")
            if not reasons:
                reasons.append("EVEN_FILL")

            sample_id = f"{sid}-{i:04d}"
            (CLIPS / sid).mkdir(exist_ok=True)
            clip_path = CLIPS / sid / f"{sample_id}.wav"
            clip_ok = extract_clip(sid, s["start"], s["end"], clip_path)
            clip_sha = sha256_file(clip_path) if clip_ok else None

            samples.append({
                "sample_id": sample_id,
                "session_id": sid,
                "sentence_index": i,
                "start": s["start"], "end": s["end"],
                "duration_s": round((s["end"] or 0) - (s["start"] or 0), 3),
                "prev_text": prev_text,
                "current_text": s["text"],
                "next_text": next_text,
                "needs_review_flag": s.get("needs_review", False),
                "strict_verdict": strict_v or "NOT_AUDITED",
                "substitute_verdict": sub_v or "NOT_AUDITED",
                "reasons": reasons,
                "audio_clip_path": str(clip_path.relative_to(ROOT)) if clip_ok else None,
                "audio_clip_sha256": clip_sha,
                "reviewer_verdict": None,
                "reviewer_note": "",
            })

        out["sessions"].append({
            "sessionId": sid,
            "n_required": len(samples),
            "n_strict_audit_indices": len(strict_indices),
            "n_substitute_audit_indices": len(sub_indices),
            "n_substitute_human_queue": len(sub_queue),
            "samples": samples,
        })

    return out


def write_outputs(out: dict):
    (QA / "human_review_manifest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote qa_27B/human_review_manifest.json "
          f"({sum(len(s['samples']) for s in out['sessions'])} samples)")

    # Markdown summary (NO raw audio path; reviewers fetch manifest JSON).
    md = ["# Human-ear review package — Issue #11 v2",
          "",
          "Each sample below needs a human to listen to the extracted clip "
          "and pick one verdict from:",
          "",
          "```",
          ", ".join(VERDICT_OPTIONS),
          "```",
          "",
          "Generated by `scripts/build_human_review_package.py`.",
          "Audio clips live at `qa_27B/_human_review_clips/<sid>/<id>.wav` "
          "(LOCAL ONLY — not uploaded to GitHub).",
          "",
          f"Agreement threshold (substitute): `{out['agreement_threshold_substitute']}`",
          ""]
    for s in out["sessions"]:
        md.append(f"## Session {s['sessionId']} ({s['n_required']} required samples)")
        md.append("")
        md.append("| sample_id | i | start | end | dur | reasons | strict | sub | reviewer_verdict |")
        md.append("|---|---|---|---|---|---|---|---|---|")
        for sm in s["samples"]:
            md.append(f"| `{sm['sample_id']}` | {sm['sentence_index']} | "
                      f"{sm['start']} | {sm['end']} | {sm['duration_s']}s | "
                      f"{','.join(sm['reasons'])} | {sm['strict_verdict']} | "
                      f"{sm['substitute_verdict']} | {sm['reviewer_verdict'] or '_pending_'} |")
        md.append("")
    (QA / "human_review_manifest.md").write_text("\n".join(md))
    print(f"wrote qa_27B/human_review_manifest.md")

    # Interactive review page (HTML, local-only, no GitHub upload).
    REVIEWS.mkdir(exist_ok=True)
    write_html(out)


def write_html(out: dict):
    # The page reads human_review_manifest.json, lets reviewer click each
    # sample, listen to its clip, pick verdict + note, and export the
    # updated JSON. Audio clips served via /transcriptions/<filename>
    # (the existing Tailscale funnel already serves qa_27B/).
    html = """<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8">
<title>Human-ear review — Issue #11 v2</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif;
         background: #1c1c1c; color: #e0e0e0; padding: 24px; max-width: 1100px; }
  h1, h2, h3 { color: #ffd166; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #444; text-align: left; vertical-align: top; }
  th { background: #2c2c2c; }
  audio { display: block; margin: 4px 0; max-width: 380px; }
  select, textarea { background: #2c2c2c; color: #e0e0e0; border: 1px solid #555;
                     padding: 4px 6px; border-radius: 3px; }
  textarea { width: 100%; min-height: 48px; font-family: inherit; }
  button { background: #ffd166; color: #1c1c1c; border: none;
           padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: 600; }
  .done { background: #06d6a0; color: #1c1c1c; padding: 2px 6px; border-radius: 3px; }
  .pending { background: #ef476f; color: #1c1c1c; padding: 2px 6px; border-radius: 3px; }
  pre { background: #2c2c2c; padding: 12px; border-radius: 4px; overflow-x: auto; }
  .controls { position: sticky; top: 0; background: #1c1c1c; padding: 12px 0;
              border-bottom: 1px solid #444; margin-bottom: 16px; }
</style></head><body>
<h1>Human-ear review — Issue #11 v2</h1>
<p>Reviewer: listen to each clip, pick one verdict, add a note, and click
<b>Save</b>. When all rows are done, click <b>Export JSON</b> to dump the
final review manifest. The exported JSON can be committed as
<code>reviews/human_review_verdicts.json</code> (no audio committed —
clips stay on disk).</p>
<div class="controls">
  <button onclick="exportJSON()">📥 Export JSON</button>
  <span id="progress"></span>
</div>
<div id="root"></div>
<script>
const MANIFEST = MANIFEST_PLACEHOLDER;
const STORAGE_KEY = "xiaofa_human_review_v1";
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function verdictClass(v) { return v ? "done" : "pending"; }
function verdictLabel(v) { return v ? "✓ " + v : "⏳ pending"; }
function render() {
  const state = load();
  const root = document.getElementById("root");
  let html = "";
  let total = 0, done = 0;
  for (const s of MANIFEST.sessions) {
    html += `<h2>Session ${s.sessionId} — ${s.n_required} required samples</h2>`;
    html += `<table><tr><th>#</th><th>sample</th><th>audio</th>
             <th>current text</th><th>reasons</th><th>verdict</th><th>note</th></tr>`;
    s.samples.forEach((sm, idx) => {
      total++;
      const k = sm.sample_id;
      const v = (state[k] && state[k].verdict) || "";
      const n = (state[k] && state[k].note) || "";
      if (v) done++;
      const clipUrl = sm.audio_clip_path ? sm.audio_clip_path : "";
      html += `<tr>
        <td>${idx+1}</td>
        <td><code>${k}</code><br><small>${sm.start}-${sm.end} (${sm.duration_s}s)</small></td>
        <td>${clipUrl ? `<audio controls src="${clipUrl}"></audio>` : "(no clip)"}</td>
        <td>${escapeHtml(sm.current_text).slice(0,140)}</td>
        <td><small>${sm.reasons.join(", ")}</small></td>
        <td>
          <select data-k="${k}" onchange="setVerdict('${k}', this.value)">
            <option value="">—</option>
${MANIFEST.verdict_options.map(o =>
  `<option value="${o}" ${v===o?"selected":""}>${o}</option>`).join("\n")}
          </select>
          <span class="${verdictClass(v)}">${verdictLabel(v)}</span>
        </td>
        <td><textarea data-k="${k}" onchange="setNote('${k}', this.value)"
                      placeholder="optional">${escapeHtml(n)}</textarea></td>
      </tr>`;
    });
    html += "</table>";
  }
  html += `<p>Progress: ${done}/${total} reviewed.</p>`;
  root.innerHTML = html;
  document.getElementById("progress").textContent = `${done}/${total}`;
}
function setVerdict(k, v) {
  const s = load(); s[k] = s[k] || {}; s[k].verdict = v || null;
  save(s); render();
}
function setNote(k, v) {
  const s = load(); s[k] = s[k] || {}; s[k].note = v;
  save(s);
}
function exportJSON() {
  const state = load();
  const out = { reviewer_state: state, exported_at: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "human_review_verdicts.json"; a.click();
  URL.revokeObjectURL(url);
}
function escapeHtml(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }
render();
</script></body></html>"""
    html = html.replace("MANIFEST_PLACEHOLDER", json.dumps(out, ensure_ascii=False))
    (REVIEWS / "index.html").write_text(html)
    print(f"wrote reviews/index.html")

    readme = """# Human-ear review — Issue #11 v2

## How to review

1. Open `reviews/index.html` in a browser **on the local network** so the
   audio clips (`qa_27B/_human_review_clips/...`) are reachable via the
   existing Tailscale funnel at `https://gx10-2887.tail378c21.ts.net/transcriptions/...`.
   Or serve locally with `python -m http.server 8000 -d reviews`.

2. Each row has:
   - a 16-kHz mono WAV clip of the audio segment
   - the current sentence text (published / 校正後)
   - the previous / next sentence text
   - reasons (one or more: START, END, CHUNK_BOUNDARY, NEEDS_REVIEW,
     STRICT_INCONCLUSIVE, STRICT_ANCHOR_FAIL, SUBSTITUTE_UNANCHORED)

3. Pick **exactly one** verdict from the dropdown. Options are:
"""
    readme += "\n".join(f"   - `{v}`" for v in VERDICT_OPTIONS)
    readme += """

4. Add an optional note (free text). Click elsewhere to auto-save.

5. When finished, click **Export JSON** to download your verdicts. Save
   the file as `reviews/human_review_verdicts.json` and commit it. **Do
   NOT commit raw audio** — clips stay on disk under
   `qa_27B/_human_review_clips/`.

## What the verdicts mean

- **ANCHOR_PASS** — the audio segment clearly contains the published sentence text.
- **SHIFTED_PREVIOUS** — the audio segment actually belongs to the PREVIOUS sentence (timestamp is too late).
- **SHIFTED_NEXT** — the audio segment actually belongs to the NEXT sentence (timestamp is too early).
- **BOUNDARY_TOO_EARLY** — `[start, end]` cuts off the spoken sentence at its beginning.
- **BOUNDARY_TOO_LATE** — `[start, end]` includes audio that belongs to the next sentence.
- **NO_SPEECH** — the segment is silent / intro / music / sub-volunteer ID; not a sentence anchor failure.
- **INCONCLUSIVE** — couldn't decide (e.g., unclear recording).

## Acceptance criteria (next-step)

- All `NEEDS_REVIEW` sentences must have a verdict.
- All `START` / `END` samples must have a verdict.
- All `STRICT_INCONCLUSIVE` rows must have a verdict.
- A `SHIFTED_PREVIOUS` or `SHIFTED_NEXT` verdict on any `CHUNK_BOUNDARY`
  sample is an automatic `AUDIO_ALIGNMENT_FAILED` (path E-A).
"""
    (REVIEWS / "README.md").write_text(readme)
    print(f"wrote reviews/README.md")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    args = ap.parse_args()
    out = build()
    write_outputs(out)


if __name__ == "__main__":
    main()