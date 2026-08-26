#!/usr/bin/env python3
"""
rebuild_all_sessions.py — Drive scripts/convert_macwhisper.py over every
session_*.json in courses/入中論善顯密意疏/sessions/ and write the result
back to the same path.

SAFETY: --dry-run is the DEFAULT. You must explicitly pass --write to
overwrite the committed session JSONs (spec §"Out of scope": regenerating
all 199 is intentionally NOT done in this atomic task; this script is the
mechanism for doing it later).

Logs every per-session outcome to qa_27B/rebuild_session_log.json (and a
human-readable .txt summary next to it).

Usage:
    python3 scripts/rebuild_all_sessions.py                   # dry run (default)
    python3 scripts/rebuild_all_sessions.py --write           # actually overwrite
    python3 scripts/rebuild_all_sessions.py --limit 5         # first 5 only
"""
from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESSIONS_DIR = os.path.join(REPO_ROOT, "courses", "入中論善顯密意疏", "sessions")
AUDIO_DIR = os.path.join(REPO_ROOT, "audio")
QA_DIR = os.path.join(REPO_ROOT, "qa_27B")
LOG_JSON = os.path.join(QA_DIR, "rebuild_session_log.json")
LOG_TXT = os.path.join(QA_DIR, "rebuild_session_log.txt")


def _ts() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def _read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: str, obj: dict) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--write", action="store_true",
                   help="actually overwrite the committed session JSONs")
    p.add_argument("--dry-run", action="store_true",
                   help="report only, do not write (DEFAULT if --write is absent)")
    p.add_argument("--limit", type=int, default=None,
                   help="only process the first N sessions")
    p.add_argument("--course-dir", default=SESSIONS_DIR,
                   help=f"course dir containing sessions/ (default: {SESSIONS_DIR})")
    p.add_argument("--audio-dir", default=AUDIO_DIR,
                   help=f"audio dir (default: {AUDIO_DIR})")
    p.add_argument("--log-dir", default=QA_DIR)
    args = p.parse_args(argv)

    sessions_glob = os.path.join(args.course_dir, "session_*.json")
    session_files = sorted(glob.glob(sessions_glob))
    if args.limit:
        session_files = session_files[: args.limit]
    print(f"[{_ts()}] found {len(session_files)} session files")
    if args.write:
        print(f"[{_ts()}] --write set: will overwrite committed session JSONs")
    else:
        print(f"[{_ts()}] --dry-run (DEFAULT): will NOT overwrite "
              "session JSONs. Pass --write to actually overwrite.")

    os.makedirs(args.log_dir, exist_ok=True)

    # Importing here keeps --help fast and avoids failing on missing
    # ffmpeg until the user actually wants to run the pipeline.
    sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
    import convert_macwhisper as cmw

    log_entries: list[dict] = []
    summary = {"ok": 0, "fail": 0, "skipped": 0}
    t0 = time.time()
    for sf in session_files:
        sid = (os.path.basename(sf)
               .replace("session_", "").replace(".json", ""))
        audio_path = os.path.join(args.audio_dir, f"{sid}.mp3")
        entry: dict = {
            "sessionId": sid,
            "session_json": sf,
            "audio_mp3": audio_path,
            "ts": _ts(),
            "status": None,
        }
        if not os.path.exists(audio_path):
            entry["status"] = "skipped"
            entry["reason"] = "audio_not_found"
            log_entries.append(entry)
            summary["skipped"] += 1
            print(f"  SKIP {sid}: audio not found ({audio_path})")
            continue
        try:
            # In --dry-run we still need an output path; write to qa_27B so
            # we don't overwrite any committed JSON. In --write we honour
            # the original path as the spec requires.
            if args.write:
                out_path = sf
            else:
                out_path = os.path.join(args.log_dir, f"rebuild_{sid}.json")
            os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

            # Snapshot old metadata so the log records the BEFORE state
            old_data = _read_json(sf)
            entry["old_n_paragraphs"] = len(old_data.get("paragraphs", []))
            entry["old_last_end"] = (
                old_data.get("paragraphs", [{}])[-1].get("end", 0.0)
                if old_data.get("paragraphs") else 0.0)

            t1 = time.time()
            new_data = cmw.convert(sf, out_path, audio_path,
                                   allow_no_audio=False)
            entry["elapsed_sec"] = round(time.time() - t1, 2)
            entry["status"] = "ok"
            entry["new_n_paragraphs"] = len(new_data.get("paragraphs", []))
            entry["new_last_end"] = (
                new_data.get("paragraphs", [{}])[-1].get("end", 0.0)
                if new_data.get("paragraphs") else 0.0)
            entry["output_json"] = out_path
            if not args.write:
                entry["dry_run"] = True
            log_entries.append(entry)
            summary["ok"] += 1
            print(f"  OK   {sid}: paragraphs "
                  f"{entry['old_n_paragraphs']} -> "
                  f"{entry['new_n_paragraphs']}  ({entry['elapsed_sec']}s)"
                  + ("  [DRY-RUN]" if not args.write else "  [WRITTEN]"))
        except SystemExit as e:
            entry["status"] = "fail"
            entry["reason"] = f"SystemExit({e.code})"
            log_entries.append(entry)
            summary["fail"] += 1
            print(f"  FAIL {sid}: {entry['reason']}")
        except Exception as e:
            entry["status"] = "fail"
            entry["reason"] = f"{type(e).__name__}: {e}"
            log_entries.append(entry)
            summary["fail"] += 1
            print(f"  FAIL {sid}: {entry['reason']}")

    elapsed = time.time() - t0
    log_payload = {
        "ts": _ts(),
        "repo_root": REPO_ROOT,
        "course_dir": args.course_dir,
        "audio_dir": args.audio_dir,
        "n_sessions": len(session_files),
        "mode": "write" if args.write else "dry-run",
        "elapsed_sec": round(elapsed, 2),
        "summary": summary,
        "log": log_entries,
    }
    with open(LOG_JSON, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, ensure_ascii=False, indent=2)
    with open(LOG_TXT, "w", encoding="utf-8") as f:
        f.write(f"[{_ts()}] rebuild_all_sessions.py\n")
        f.write(f"mode: {'WRITE' if args.write else 'DRY-RUN'}\n")
        f.write(f"sessions: {len(session_files)}\n")
        f.write(f"summary: ok={summary['ok']} "
                f"skipped={summary['skipped']} "
                f"fail={summary['fail']} "
                f"elapsed={elapsed:.2f}s\n\n")
        for e in log_entries:
            f.write(f"{e['sessionId']:<8s}  {e['status']:<8s}  "
                    f"{e.get('reason', '')}\n")
    print(f"[{_ts()}] summary: ok={summary['ok']} "
          f"skipped={summary['skipped']} "
          f"fail={summary['fail']} (elapsed={elapsed:.1f}s)")
    print(f"log -> {LOG_JSON}")
    return 0 if summary["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
