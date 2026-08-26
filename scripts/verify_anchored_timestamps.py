#!/usr/bin/env python3
"""
verify_anchored_timestamps.py — Acceptance validator for the silence-anchored
timestamp pipeline (Issue #1 fix, spec docs/specs/timestamp-anchoring-spec.md).

For a (session.json, audio.mp3) pair, runs ffmpeg silencedetect and compares
the JSON's paragraph boundaries against the real audio silence regions.

Reports:
  - paragraph count vs silence count                  (should match ±20%)
  - % sentences starting inside a silence region      (should be 0%)
  - max boundary drift (JSON paragraph.end vs nearest silence_end)
  - mean boundary drift
  - overall verdict (PASS / REVIEW / FAIL)

Exit codes:
  0  PASS or REVIEW
  2  FAIL  (regression vs. the spec acceptance criteria)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
import audio_anchoring as aa


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("session_json")
    p.add_argument("audio_mp3")
    p.add_argument("--noise-db", type=float, default=-25.0)
    p.add_argument("--min-gap-sec", type=float, default=1.0)
    p.add_argument("--out-json", default=None,
                   help="write the report here (else: stdout only)")
    p.add_argument("--silences-used-json", default=None,
                   help="path to sidecar JSON listing the silences the "
                        "convert pipeline actually used (overrides raw "
                        "silencedetect for validation). Auto-detected from "
                        "<session_json>.silences.json when present.")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    # Auto-detect sidecar (default behaviour: any convert run with
    # --target-paragraphs writes a sidecar next to the session JSON)
    silences_used = None
    raw_count = None
    sidecar_path = args.silences_used_json
    if sidecar_path is None:
        candidate = args.session_json + ".silences.json"
        if os.path.exists(candidate):
            sidecar_path = candidate
    if sidecar_path and os.path.exists(sidecar_path):
        with open(sidecar_path, "r", encoding="utf-8") as f:
            sidecar = json.load(f)
        silences_used = [(float(s), float(e))
                         for s, e in sidecar.get("silences", [])]
        raw_count = sidecar.get("raw_count")
        if not args.quiet:
            print(f"[INFO] using sidecar {sidecar_path} "
                  f"({len(silences_used)} used / {raw_count} raw)")

    report = aa.validate_session(args.session_json, args.audio_mp3,
                                 noise_db=args.noise_db,
                                 min_gap_sec=args.min_gap_sec,
                                 silences_used=silences_used,
                                 n_silences_raw=raw_count)
    if args.out_json:
        os.makedirs(os.path.dirname(os.path.abspath(args.out_json)) or ".",
                    exist_ok=True)
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        if not args.quiet:
            print(f"report -> {args.out_json}")
    if not args.quiet:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["verdict"] == "FAIL":
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
