#!/usr/bin/env python3
"""Detect study-group playlist availability changes against the published site.

Why this exists: the 2026-11-13 reference inventory recorded 4 videos as
`privateOrUnavailableInPlaylist`. One of them (IQxfpRRoDNE, 第29講（下）) became
public on 2026-11-15 and nothing re-checked it, so the lecture stayed off the
site for days. A snapshot alone cannot see this: `--flat-playlist` lists private
entries with `availability: null`, so availability must be probed per video.

Usage:
    python3 scripts/check_study_group_availability.py                 # probe + report
    python3 scripts/check_study_group_availability.py --offline FILE  # classify cached probes

Exit codes: 0 = nothing actionable, 2 = action needed (missing public video or a
private→public transition), 3 = probe/inventory problem. Network probing is the
only non-deterministic part; the classification core is pure and unit-tested in
tests/unit/studyGroupAvailability.test-adjacent python checks (see --self-test).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COURSE_DIR = ROOT / "courses" / "2025釋量論第二品大組共學"
COURSE_JSON = COURSE_DIR / "course.json"
SNAPSHOT = ROOT / "courses" / "study-groups" / "釋量論第二品-2025" / "playlist-snapshot.jsonl"
INVENTORY = ROOT / "reviews" / "evidence" / "study-group-2025" / "reference_inventory.json"
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh"


def read_snapshot(path: Path) -> list[dict]:
    entries = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            entries.append(json.loads(line))
    return entries


def site_video_ids(course_json: Path) -> dict[str, str]:
    """videoId -> displaySessionId for every session published on the site."""
    course = json.loads(course_json.read_text(encoding="utf-8"))
    out = {}
    for session in course.get("sessions", []):
        vid = session.get("youtubeVideoId")
        if vid:
            out[vid] = session.get("displaySessionId") or session.get("id", "")
    return out


def classify(probe: dict, listed_in_playlist: bool) -> str:
    """Map one probe result to a stable state name.

    probe keys: ok (bool), availability (str|None), error (str|None)
    """
    if not listed_in_playlist:
        return "removedFromPlaylist"
    if not probe.get("ok"):
        err = (probe.get("error") or "").lower()
        if "private" in err:
            return "private"
        if "unavailable" in err or "deleted" in err:
            return "unavailable"
        return "probeFailed"
    avail = (probe.get("availability") or "").lower()
    if avail in ("public", "unlisted"):
        return avail
    if avail == "private":
        return "private"
    # yt-dlp sometimes reports None for a video it did manage to read.
    return "public"


def diff(snapshot_entries: list[dict], probes: dict[str, dict], published: dict[str, str],
         previously_private: list[str]) -> dict:
    """Pure comparison. Returns the actionable findings."""
    listed_ids = [e["id"] for e in snapshot_entries]
    title_by_id = {e["id"]: e.get("title", "") for e in snapshot_entries}

    on_site_not_listed = sorted(set(published) - set(listed_ids))
    listed_not_on_site = [i for i in listed_ids if i not in published]

    states = {i: classify(probes.get(i, {"ok": False, "error": "not probed"}), True)
              for i in listed_ids}

    public_missing = [i for i in listed_not_on_site if states[i] in ("public", "unlisted")]
    private_missing = [i for i in listed_not_on_site if states[i] in ("private", "unavailable")]
    # A probe that failed must never look like "nothing to do".
    unresolved_missing = [i for i in listed_not_on_site if states[i] in ("probeFailed",)]
    transitions = [i for i in listed_ids
                   if i in previously_private and states[i] in ("public", "unlisted")]

    return {
        "playlistCount": len(listed_ids),
        "siteSessionCount": len(published),
        "states": states,
        "onSiteNotInPlaylist": on_site_not_listed,
        "listedNotOnSite": listed_not_on_site,
        "publicMissingFromSite": [
            {"videoId": i, "title": title_by_id.get(i, "")} for i in public_missing],
        "privateStillMissing": private_missing,
        "unresolvedMissing": unresolved_missing,
        "privateToPublicTransitions": [
            {"videoId": i, "title": title_by_id.get(i, "")} for i in transitions],
    }


def probe_playlist(playlist_url: str, timeout: int = 240) -> list[dict]:
    cmd = ["yt-dlp", "--no-warnings", "--flat-playlist", "-J", playlist_url]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"flat-playlist failed rc={out.returncode}: {out.stderr[-400:]}")
    return json.loads(out.stdout).get("entries", [])


def probe_video(video_id: str, timeout: int = 60) -> dict:
    cmd = ["yt-dlp", "--no-warnings", "--skip-download",
           "--print", "%(availability)s|%(upload_date)s|%(duration)s",
           f"https://www.youtube.com/watch?v={video_id}"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout"}
    if res.returncode != 0:
        return {"ok": False, "error": (res.stderr or "").strip()[-300:]}
    parts = (res.stdout or "").strip().split("|")
    return {
        "ok": True,
        "availability": parts[0] if parts else None,
        "upload_date": parts[1] if len(parts) > 1 else None,
        "duration": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None,
    }


def self_test() -> int:
    cases = [
        ({"ok": True, "availability": "public"}, True, "public"),
        ({"ok": True, "availability": None}, True, "public"),
        ({"ok": False, "error": "ERROR: this video is private"}, True, "private"),
        ({"ok": False, "error": "Video unavailable"}, True, "unavailable"),
        ({"ok": False, "error": "timeout"}, True, "probeFailed"),
        ({"ok": True, "availability": "public"}, False, "removedFromPlaylist"),
    ]
    bad = 0
    for probe, listed, want in cases:
        got = classify(probe, listed)
        if got != want:
            print(f"  FAIL classify({probe}, {listed}) = {got}, expected {want}")
            bad += 1
    snap = [{"id": "A", "title": "tA"}, {"id": "B", "title": "tB"}]
    probes = {"A": {"ok": True, "availability": "public"},
              "B": {"ok": False, "error": "private"}}
    d = diff(snap, probes, {}, ["B"])
    assert d["publicMissingFromSite"][0]["videoId"] == "A", d
    assert d["privateStillMissing"] == ["B"], d
    probes2 = {"A": {"ok": True, "availability": "public"},
               "B": {"ok": True, "availability": "public"}}
    d2 = diff(snap, probes2, {}, ["B"])
    assert [x["videoId"] for x in d2["privateToPublicTransitions"]] == ["B"], d2

    # Text surgery on the inventory must not reformat unrelated lines.
    sample = ('{\n  "taskId": "X",\n  "checkedAt": "2026-11-13",\n  "references": [{"role": ["a", "b"]}],\n'
              '  "coverageGapsIdentified": {\n'
              '    "missingPublicVideos": [{"sessionId": "43", "title": "\u7b2c27\u8b1b"}],\n'
              '    "privateOrUnavailableInPlaylist": ["OLD1", "OLD2"]\n  }\n}\n')
    tmp = Path("/tmp/_inv_selftest.json")
    tmp.write_text(sample, encoding="utf-8")
    res = {"checkedAt": "2026-11-18", "privateStillMissing": ["NEW1"], "unresolvedMissing": [],
           "privateToPublicTransitions": [{"videoId": "NEW2", "title": "t"}],
           "publicMissingFromSite": [{"videoId": "NEW1", "title": "t"}]}
    ok, note = update_inventory_text(tmp, res)
    out = tmp.read_text(encoding="utf-8")
    problems = []
    if not ok:
        problems.append(f"update failed: {note}")
    if '"checkedAt": "2026-11-18"' not in out:
        problems.append("checkedAt not updated")
    if '"privateOrUnavailableInPlaylist": ["NEW1"]' not in out:
        problems.append("private array not replaced")
    if '"availabilityTransitions"' not in out:
        problems.append("transitions not inserted")
    if '{"role": ["a", "b"]}' not in out or '"title": "\u7b2c27\u8b1b"' not in out:
        problems.append("unrelated lines were reformatted")
    # idempotency: a second run must merge, not duplicate
    update_inventory_text(tmp, res)
    out2 = tmp.read_text(encoding="utf-8")
    if out2.count('"videoId": "NEW2"') != 1:
        problems.append(f"not idempotent: {out2.count(chr(34) + 'videoId' + chr(34) + ': ' + chr(34) + 'NEW2' + chr(34))} entries")
    tmp.unlink()
    if problems:
        for pr in problems:
            print(f"  FAIL inventory surgery: {pr}")
        bad += len(problems)
    print(f"self-test: {len(cases)} classify + 2 diff + 1 inventory-surgery cases, {bad} failures")
    return 1 if bad else 0


def update_inventory_text(path: Path, result: dict) -> tuple[bool, str]:
    """Refresh the hand-maintained inventory WITHOUT reformatting it.

    The file is hand-authored with compact inline arrays; re-dumping the whole
    JSON would rewrite every line and bury the real change. So edit in place.
    """
    text = path.read_text(encoding="utf-8")
    checked = result["checkedAt"]
    new_private = sorted(set(result["privateStillMissing"]) | set(result["unresolvedMissing"]))

    new_text, n_date = re.subn(r'"checkedAt":\s*"[^"]*"', f'"checkedAt": "{checked}"',
                               text, count=1)
    key = '"privateOrUnavailableInPlaylist":'
    i = new_text.find(key)
    if i < 0:
        return False, "privateOrUnavailableInPlaylist key not found; inventory left untouched"
    j = new_text.index("[", i)
    depth = 0
    end = -1
    for k in range(j, len(new_text)):
        if new_text[k] == "[":
            depth += 1
        elif new_text[k] == "]":
            depth -= 1
            if depth == 0:
                end = k
                break
    if end < 0:
        return False, "unbalanced array; inventory left untouched"

    old_array = new_text[j:end + 1]
    new_text = new_text[:j] + json.dumps(new_private) + new_text[end + 1:]

    # Merge into an existing availabilityTransitions array if present, else insert one
    # right after the private list, keeping the file's indentation style.
    line_start = new_text.rfind("\n", 0, i) + 1
    indent = new_text[line_start:i]
    entries = [{"videoId": x["videoId"], "title": x["title"], "detectedAt": checked,
                "from": "private", "to": "public"}
               for x in result["privateToPublicTransitions"]]
    entries += [{"videoId": x["videoId"], "title": x["title"], "detectedAt": checked,
                 "to": "publicMissingFromSite"}
                for x in result["publicMissingFromSite"]]
    tkey = '"availabilityTransitions":'
    tpos = new_text.find(tkey)
    if tpos >= 0:
        tj = new_text.index("[", tpos)
        depth = 0
        tend = -1
        for k in range(tj, len(new_text)):
            if new_text[k] == "[":
                depth += 1
            elif new_text[k] == "]":
                depth -= 1
                if depth == 0:
                    tend = k
                    break
        existing = json.loads(new_text[tj:tend + 1])
        for entry in entries:
            if entry not in existing:
                existing.append(entry)
        new_text = new_text[:tj] + json.dumps(existing) + new_text[tend + 1:]
    else:
        if entries:
            insert = (',\n' + indent + '"availabilityTransitions": '
                      + json.dumps(entries))
            at = new_text.index("]", j) + 1
            new_text = new_text[:at] + insert + new_text[at:]

    if n_date == 0:
        return False, "checkedAt not found; inventory left untouched"
    path.write_text(new_text, encoding="utf-8")
    return True, (f"checkedAt={checked}; private={new_private}; "
                  f"transitions logged={len(entries)}; private array was {old_array}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", help="classify from a cached probe JSON instead of probing")
    ap.add_argument("--no-probe", action="store_true", help="only diff playlist vs site")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true", help="write evidence JSON + refresh snapshot")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    snapshot_path = SNAPSHOT
    if args.write:
        entries = probe_playlist(PLAYLIST_URL)
        snapshot_path = SNAPSHOT
        tmp = SNAPSHOT.with_suffix(".jsonl.tmp")
        # ensure_ascii matches the committed snapshot style (\uXXXX), so a
        # refresh only diffs entries that actually changed.
        tmp.write_text("".join(json.dumps(e) + "\n" for e in entries), encoding="utf-8")
        tmp.replace(SNAPSHOT)
        print(f"snapshot refreshed: {len(entries)} entries -> {SNAPSHOT.relative_to(ROOT)}")
    else:
        entries = read_snapshot(SNAPSHOT)

    published = site_video_ids(COURSE_JSON)
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8")) if INVENTORY.exists() else {}
    gaps = inventory.get("coverageGapsIdentified", {})
    previously = gaps.get("privateOrUnavailableInPlaylist", [])

    if args.offline:
        probes = json.loads(Path(args.offline).read_text(encoding="utf-8"))
    elif args.no_probe:
        probes = {}
    else:
        targets = [e["id"] for e in entries if e["id"] not in published]
        print(f"probing {len(targets)} playlist entries not yet on the site")
        probes = {v: probe_video(v) for v in targets}

    result = diff(entries, probes, published, previously)
    result["checkedAt"] = dt.date.today().isoformat()

    print(f"playlist entries: {result['playlistCount']}  site sessions: {result['siteSessionCount']}")
    for key, label in (
        ("publicMissingFromSite", "PUBLIC videos not on site (ACTION)"),
        ("privateToPublicTransitions", "private -> public transitions (ACTION)"),
        ("privateStillMissing", "still private/unavailable"),
        ("unresolvedMissing", "probe failed, state unknown (RE-PROBE)"),
        ("onSiteNotInPlaylist", "on site but not in playlist (investigate)"),
    ):
        items = result[key]
        print(f"\n{label}: {len(items)}")
        for it in items:
            print("  -", json.dumps(it, ensure_ascii=False) if isinstance(it, dict) else it)

    if args.write:
        out = ROOT / "reviews" / "evidence" / "study-group-2025" / \
            f"availability_check_{result['checkedAt']}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"playlistUrl": PLAYLIST_URL, "probes": probes, **result},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nevidence written: {out.relative_to(ROOT)}")

        # Write the finding back into the hand-maintained inventory so the next
        # run compares against today's truth instead of a stale 2026-11-13 claim.
        # `coverageGapsIdentified.missingPublicVideos` is left alone: it is the
        # historical record of what that pass found.
        if INVENTORY.exists():
            ok, note = update_inventory_text(INVENTORY, result)
            print(f"inventory {'updated' if ok else 'NOT updated'}: "
                  f"{INVENTORY.relative_to(ROOT)} — {note}")
            if not ok:
                return 3

    action = bool(result["publicMissingFromSite"] or result["privateToPublicTransitions"]
                  or result["onSiteNotInPlaylist"])
    if action:
        print("\nverdict: ACTION NEEDED")
        return 2
    if result["unresolvedMissing"]:
        print("\nverdict: incomplete — some probes failed, re-run")
        return 3
    print("\nverdict: in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
