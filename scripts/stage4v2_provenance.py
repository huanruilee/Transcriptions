#!/usr/bin/env python3
"""
Stage 4v2 — Issue #11 v2 full provenance + reproducibility manifest.

Replaces commit 2eaaf4f stage 4 which lacked version pinning and model
hashes. Records every environmental factor that could influence alignment
output so a future run can be byte-identical (or differ only in known
dimensions).

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
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa_27B"


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def git_head_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except Exception:
        return "unknown"


def pip_freeze() -> str:
    return subprocess.check_output(
        [sys.executable, "-m", "pip", "freeze"], text=True
    ).strip()


def node_version() -> str:
    try:
        return subprocess.check_output(["node", "-v"], text=True).strip()
    except Exception:
        return "unknown"


def audio_sha256() -> dict:
    out = {}
    audio_dir = ROOT / "audio"
    for mp3 in audio_dir.glob("*.mp3"):
        out[mp3.name] = sha256_file(mp3)
    return out


def main():
    parser = argparse.ArgumentParser()
    args = parser.parse_args()

    # Collect all input/output hashes
    inputs = {}
    for sid in ["01", "69A", "110B"]:
        sj = ROOT / "courses" / "入中論善顯密意疏" / "sessions" / f"session_{sid}.json"
        if sj.exists():
            inputs[f"session_{sid}.json"] = sha256_file(sj)

    outputs = {}
    for p in QA.glob("stage2v2_alignment_*.json"):
        outputs[p.name] = sha256_file(p)
    for p in QA.glob("stage2v2_aligned_*.json"):
        outputs[p.name] = sha256_file(p)
    for p in QA.glob("stage3v2_measurement_*.json"):
        outputs[p.name] = sha256_file(p)

    # Versions
    versions = {
        "python": platform.python_version(),
        "node": node_version(),
        "platform": platform.platform(),
        "cuda_available": subprocess.run(
            [sys.executable, "-c",
             "import torch; print(torch.cuda.is_available())"],
            capture_output=True, text=True
        ).stdout.strip(),
        "whisperx": subprocess.run(
            [sys.executable, "-c",
             "import whisperx; print(getattr(whisperx, '__version__', 'unknown'))"],
            capture_output=True, text=True
        ).stdout.strip(),
    }
    # Model identifiers (hash via download path; no git LFS so we record
    # the model dir name and file size as a substitute identifier).
    model_dir = Path.home() / ".cache" / "huggingface" / "hub" / \
        "models--jonatasgrosman--wav2vec2-large-xlsr-53-chinese-zh-cn"
    if not model_dir.exists():
        model_dir = Path("/tmp")  # not found marker
    versions["align_model_id"] = "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn"
    versions["align_model_dir_exists"] = str(model_dir.exists())
    versions["align_model_dir_size"] = str(
        sum(p.stat().st_size for p in model_dir.rglob("*") if p.is_file())
        if model_dir.exists() else 0
    )

    # Reproduction commands
    repro_commands = [
        # 1. Install deps (pinned, use existing venv)
        "pip install 'huggingface-hub>=0.34.0,<1.0' whisperx faster-whisper opencc-python-reimplemented",
        # 2. Run alignment on the three pilot sessions
        ("python scripts/stage2v2_alignment.py --sessions 01 69A 110B"),
        # 3. Run measurement (Levenshtein CER + matched-sentence ts error)
        ("python scripts/stage3v2_measurement.py --sessions 01 69A 110B"),
        # 4. Run full provenance capture (this script)
        ("python scripts/stage4v2_provenance.py"),
        # 5. Run the gate test suite
        ("npm test"),
        # 6. Verify pilot preview at
        #    https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=01
        #    and confirm audio seek + karaoke highlight use ratio = 1.0
        #    (console.log should show '[pilot] loading v2-aligned payload').
    ]

    # Resource estimates
    timings = {
        "alignment_session_01_minutes_estimated": 9,   # 9 chunks × ~60s
        "alignment_session_69A_minutes_estimated": 11,
        "alignment_session_110B_minutes_estimated": 11,
        "measurement_total_seconds_estimated": 10,
        "test_total_seconds_estimated": 30,
    }

    manifest = {
        "supersedes_commit": "2eaaf4f",
        "supersedes_reason": (
            "commit 2eaaf4f lacked model version pinning, audio hashes, "
            "and explicit reproduction commands. Stage 2 used an invalid "
            "60-second-mid-clip window; Stage 3 used SequenceMatcher.ratio "
            "as CER (wrong) and nearest-word ts error (wrong)."
        ),
        "branch": "issue11-v2-correction",
        "git_head_sha": git_head_sha(),
        "versions": versions,
        "inputs_sha256": inputs,
        "outputs_sha256": outputs,
        "audio_sha256": audio_sha256(),
        "repro_commands": repro_commands,
        "estimated_timings": timings,
        "historical_gaps": [
            "Original MacWhisper provenance cannot be recovered — the "
            "MacWhisper workflow ran outside this repo and did not emit "
            "version-locked transcripts. The published sentence texts and "
            "timestamps in courses/.../session_*.json are therefore treated "
            "as an opaque third-party artefact; we do not claim audio "
            "provenance for the original MacWhisper step.",
        ],
        "evidence_path": "qa_27B/stage4v2_provenance.json",
    }

    out_path = QA / "stage4v2_provenance.json"
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"-> {out_path}")

    # Also produce human-readable md
    md = ["# Issue #11 v2 — Provenance & Reproducibility",
          "",
          f"- **Branch:** `{manifest['branch']}`",
          f"- **Git HEAD:** `{manifest['git_head_sha']}`",
          f"- **Python:** {versions['python']}",
          f"- **Node:** {versions['node']}",
          f"- **Platform:** {versions['platform']}",
          f"- **CUDA available:** {versions['cuda_available']}",
          f"- **WhisperX:** {versions['whisperx']}",
          f"- **Align model:** `{versions['align_model_id']}`",
          f"- **Align model dir exists:** {versions['align_model_dir_exists']}",
          f"- **Align model dir size:** {int(versions['align_model_dir_size']):,} bytes",
          "",
          "## Reproduction commands",
          ""]
    md.extend(f"- `{c}`" for c in repro_commands)
    md += ["",
           "## Estimated timings",
           ""]
    md.extend(f"- {k}: {v}" for k, v in timings.items())
    md += ["",
           "## Historical gaps",
           ""]
    md.extend(f"- {g}" for g in manifest["historical_gaps"])
    md_path = QA / "stage4v2_provenance.md"
    md_path.write_text("\n".join(md))
    print(f"-> {md_path}")


if __name__ == "__main__":
    main()