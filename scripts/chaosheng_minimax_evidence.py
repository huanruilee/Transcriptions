#!/usr/bin/env python3
"""MiniMax 審稿發現的音訊佐證：裁音窗 → 容器 full large-v3 複辨 → 逐筆比對。

三步：
  --cut     依 findings.json 裁出每個被標記句的音窗
  --compare 比對 large-v3 結果，標記每筆建議是「音檔支持」還是「無音檔支持」
"""
import argparse
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROJECT = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026")
WORK = REPO / "reviews" / "evidence" / "朝聖前行課程" / "work" / "minimax_review"
WINS = PROJECT / "recheck" / "mm_windows"
V3OUT = PROJECT / "recheck" / "mm_v3"


def sentences_of(sid):
    data = json.loads((REPO / "courses" / "朝聖前行課程" / "sessions" / f"session_{sid}.json")
                      .read_text(encoding="utf-8"))
    out = []
    for para in data["paragraphs"]:
        for sent in para["sentences"]:
            out.append(sent)
    return out


def cut():
    findings = json.loads((WORK / "findings.json").read_text(encoding="utf-8"))
    WINS.mkdir(parents=True, exist_ok=True)
    index = {}
    for f in findings:
        key = f"{f['session']}_{f['idx']:04d}"
        if key in index:
            continue
        sents = sentences_of(f["session"])
        sent = sents[f["idx"] - 1]
        st = max(0.0, float(sent["start"]) - 2.0)
        dur = max(3.0, (float(sent["end"]) - float(sent["start"])) + 4.0)
        out = WINS / f"m{key}.mp3"
        if not out.exists():
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", f"{st:.2f}", "-t", f"{dur:.2f}",
                 "-i", str(PROJECT / "audio" / f"CSQX_{f['session']}.mp3"),
                 "-ac", "1", "-ar", "16000", str(out)],
                check=True,
            )
        index[key] = {"session": f["session"], "idx": f["idx"], "id": sent.get("id"),
                      "start": sent["start"], "end": sent["end"],
                      "win_start": st, "win_dur": dur, "file": str(out)}
    (WORK / "mm_windows_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1),
                                                encoding="utf-8")
    print(f"windows={len(index)}")


def compare():
    findings = json.loads((WORK / "findings.json").read_text(encoding="utf-8"))
    index = json.loads((WORK / "mm_windows_index.json").read_text(encoding="utf-8"))
    norm = lambda s: "".join((s or "").split())
    for f in findings:
        key = f"{f['session']}_{f['idx']:04d}"
        v3path = V3OUT / f"m{key}.json"
        f["v3Text"] = ""
        f["v3Evidence"] = "none"
        if v3path.exists():
            data = json.loads(v3path.read_text(encoding="utf-8"))
            v3 = data.get("text", "")
            f["v3Text"] = v3
            cur_hit = norm(f["find"]) in norm(v3)
            rep_hit = bool(norm(f["replace"])) and norm(f["replace"]) in norm(v3)
            if rep_hit and not cur_hit:
                f["v3Evidence"] = "supports-replace"
            elif cur_hit and not rep_hit:
                f["v3Evidence"] = "supports-current"
            elif rep_hit and cur_hit:
                f["v3Evidence"] = "ambiguous"
            else:
                f["v3Evidence"] = "no-hit"
        f["window"] = index.get(key, {}).get("file")
    (WORK / "findings.json").write_text(json.dumps(findings, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
    counts = {}
    for f in findings:
        counts[f["v3Evidence"]] = counts.get(f["v3Evidence"], 0) + 1
    print(f"findings={len(findings)}")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cut", action="store_true")
    ap.add_argument("--compare", action="store_true")
    args = ap.parse_args()
    if args.cut:
        cut()
    if args.compare:
        compare()
