#!/usr/bin/env python3
"""
Stage 4v2 — Issue #11 v2 full provenance + reproducibility manifest.

Records every environmental factor that could influence alignment output so
a future run can be byte-identical (or differ only in known dimensions).
This revision:
  - records EXACT package versions via importlib.metadata (whisperx,
    faster-whisper, opencc, huggingface-hub) instead of the broken
    getattr(whisperx, '__version__', 'unknown') which returned 'unknown';
  - records the final git HEAD SHA (or --head-sha override);
  - includes the independent ASR proxy outputs (stage3b) in the manifest;
  - asserts the 3-session alignment manifest is present (hard-fail if not).

Outputs: qa_27B/stage4v2_provenance.json (machine) +
         qa_27B/stage4v2_provenance.md (human).
"""
import json
import os
import platform
import subprocess
import sys
import hashlib
import argparse
from importlib.metadata import version as pkg_version
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa_27B"
PILOT = ["01", "69A", "110B"]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()


def git_head_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"


def pkg_ver(name: str) -> str:
    try:
        return pkg_version(name)
    except Exception:
        return "unknown"


def node_version() -> str:
    try:
        return subprocess.check_output(["node", "-v"], text=True).strip()
    except Exception:
        return "unknown"


def audio_sha256() -> dict:
    out = {}
    for mp3 in (ROOT / "audio").glob("*.mp3"):
        out[mp3.name] = sha256_file(mp3)
    return out


def model_dir_size(rel: str) -> tuple:
    d = Path.home() / ".cache" / "huggingface" / "hub" / rel
    if not d.exists():
        return (False, 0)
    size = sum(p.stat().st_size for p in d.rglob("*") if p.is_file())
    return (True, size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--head-sha", default=None,
                    help="explicit final head SHA (default: git rev-parse HEAD)")
    args = ap.parse_args()
    head_sha = args.head_sha or git_head_sha()

    # Inputs: published session JSONs (all 3).
    inputs = {}
    sess_dir = ROOT / "courses" / "入中論善顯密意疏" / "sessions"
    for sid in PILOT:
        sj = sess_dir / f"session_{sid}.json"
        if sj.exists():
            inputs[f"session_{sid}.json"] = sha256_file(sj)
        else:
            sys.stderr.write(f"HARD FAIL: missing session {sid}\n"); sys.exit(2)

    # Outputs: alignment + aligned pilot + measurement + independent ASR.
    outputs = {}
    for p in sorted(QA.glob("stage2v2_alignment_01.json")):
        outputs[p.name] = sha256_file(p)
    for name in ["stage2v2_alignment_01.json", "stage2v2_alignment_69A.json",
                 "stage2v2_alignment_110B.json",
                 "stage2v2_aligned_01.json", "stage2v2_aligned_69A.json",
                 "stage2v2_aligned_110B.json",
                 "stage3v2_measurement_01.json", "stage3v2_measurement_69A.json",
                 "stage3v2_measurement_110B.json",
                 "stage3b_independent_cer_01.json", "stage3b_independent_cer_69A.json",
                 "stage3b_independent_cer_110B.json"]:
        p = QA / name
        if p.exists():
            outputs[name] = sha256_file(p)
        else:
            sys.stderr.write(f"WARN: missing output {name}\n")

    # 3-session alignment manifest presence (hard requirement).
    manifest_path = QA / "stage2v2_alignment_manifest.json"
    manifest_ok = manifest_path.exists()
    if not manifest_ok:
        sys.stderr.write(
            "HARD FAIL: stage2v2_alignment_manifest.json missing — "
            "stage2v2_alignment.py must be run first to produce it.\n"
        )
        sys.exit(2)

    versions = {
        "python": platform.python_version(),
        "node": node_version(),
        "platform": platform.platform(),
        "torch": pkg_ver("torch"),
        "whisperx": pkg_ver("whisperx"),
        "faster_whisper": pkg_ver("faster-whisper"),
        "opencc": pkg_ver("opencc-python-reimplemented"),
        "huggingface_hub": pkg_ver("huggingface-hub"),
        "transformers": pkg_ver("transformers"),
    }
    a_exists, a_size = model_dir_size(
        "models--jonatasgrosman--wav2vec2-large-xlsr-53-chinese-zh-cn")
    asr_exists, asr_size = model_dir_size(
        "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo")
    versions["align_model_id"] = "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn"
    versions["align_model_dir_exists"] = a_exists
    versions["align_model_dir_size"] = a_size
    versions["independent_asr_model_id"] = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
    versions["independent_asr_model_dir_exists"] = asr_exists
    versions["independent_asr_model_dir_size"] = asr_size

    if versions["whisperx"] == "unknown":
        sys.stderr.write("WARN: whisperx version unknown (importlib)\n")

    repro_commands = [
        "pip install 'huggingface-hub>=0.34.0,<1.0' whisperx faster-whisper opencc-python-reimplemented",
        "python scripts/stage2v2_alignment.py --sessions 01 69A 110B",
        "python scripts/stage3b_independent_cer.py --sessions 01 69A 110B",
        "python scripts/stage3v2_measurement.py --sessions 01 69A 110B",
        "python scripts/stage4v2_provenance.py --head-sha <FINAL_SHA>",
        "npm test",
        "curl -s https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=01",
    ]

    manifest = {
        "supersedes": ["2eaaf4f", "054fd3c"],
        "supersedes_reason": (
            "2eaaf4f lacked version pinning and used a 60s-mid-clip window "
            "(non-monotonic) + SequenceMatcher.ratio as CER. 054fd3c added "
            "chunking but had a text-overlap double-alignment (P1-1) and a "
            "char-budget fallback (P1-2), and still presented forced-align "
            "CER as accuracy (P1-3)."),
        "branch": "issue11-v2-correction",
        "git_head_sha": head_sha,
        "versions": versions,
        "inputs_sha256": inputs,
        "outputs_sha256": outputs,
        "audio_sha256": audio_sha256(),
        "alignment_manifest_present": manifest_ok,
        "repro_commands": repro_commands,
        "estimated_timings": {
            "alignment_session_minutes_est": 9,
            "independent_asr_session_minutes_est": 8,
            "measurement_seconds_est": 10,
            "test_seconds_est": 30,
        },
        "historical_gaps": [
            "Original MacWhisper provenance cannot be recovered — it ran "
            "outside this repo. Published sentence texts/timestamps are "
            "treated as an opaque third-party artefact; no audio provenance "
            "is claimed for the original MacWhisper step.",
        ],
        "evidence_path": "qa_27B/stage4v2_provenance.json",
    }
    out_path = QA / "stage4v2_provenance.json"
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"-> {out_path}")

    md = ["# Issue #11 v2 — Provenance & Reproducibility", "",
          f"- **Branch:** `{manifest['branch']}`",
          f"- **Git HEAD (final):** `{head_sha}`",
          f"- **Python:** {versions['python']}",
          f"- **Node:** {versions['node']}",
          f"- **Platform:** {versions['platform']}",
          f"- **torch:** {versions['torch']}",
          f"- **whisperx:** {versions['whisperx']}",
          f"- **faster-whisper:** {versions['faster_whisper']}",
          f"- **opencc:** {versions['opencc']}",
          f"- **huggingface-hub:** {versions['huggingface_hub']}",
          f"- **transformers:** {versions['transformers']}",
          f"- **Align model:** `{versions['align_model_id']}` "
          f"(dir {versions['align_model_dir_size']:,} B, exists={a_exists})",
          f"- **Independent ASR model:** `{versions['independent_asr_model_id']}` "
          f"(dir {versions['independent_asr_model_dir_size']:,} B, exists={asr_exists})",
          f"- **3-session alignment manifest present:** {manifest_ok}",
          "", "## Reproduction commands", ""]
    md.extend(f"- `{c}`" for c in repro_commands)
    md += ["", "## Estimated timings", ""]
    md.extend(f"- {k}: {v}" for k, v in manifest["estimated_timings"].items())
    md += ["", "## Historical gaps", ""]
    md.extend(f"- {g}" for g in manifest["historical_gaps"])
    md_path = QA / "stage4v2_provenance.md"
    md_path.write_text("\n".join(md))
    print(f"-> {md_path}")


if __name__ == "__main__":
    main()
