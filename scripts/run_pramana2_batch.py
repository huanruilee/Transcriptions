#!/usr/bin/env python3
"""
scripts/run_pramana2_batch.py — serial driver: ASR (if raw missing) + calibration
for a list of session ids. Skips sessions whose calibrated JSON already exists.

Usage: python3 scripts/run_pramana2_batch.py 02 03 04
       python3 scripts/run_pramana2_batch.py --range 5-16
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASR_DIR = ROOT / "asr_out" / "pramana2"
SESSIONS = ROOT / "courses" / "釋量論第二品" / "sessions"


def ids_from_args(argv):
    if argv and argv[0] == "--range":
        a, b = argv[1].split("-")
        return [str(i).zfill(2) for i in range(int(a), int(b) + 1)]
    return [a.zfill(2) for a in argv]


def main():
    ids = ids_from_args(sys.argv[1:])
    for sid in ids:
        if (SESSIONS / f"session_{sid}.json").exists():
            print(f"SKIP {sid} (calibrated exists)", flush=True)
            continue
        if not (ASR_DIR / f"session_{sid}_raw.json").exists():
            print(f"WAIT {sid} (raw ASR missing)", flush=True)
            continue
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / "calibrate_pramana2_session.py"),
                            "--session", sid], cwd=ROOT)
        if r.returncode != 0:
            print(f"FAIL {sid} rc={r.returncode}", flush=True)
    print("BATCH DONE", flush=True)


if __name__ == "__main__":
    main()
