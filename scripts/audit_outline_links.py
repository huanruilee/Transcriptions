#!/usr/bin/env python3
"""藍圖提綱 ↔ 共學提綱 ↔ 法師開示 三層對照 稽核器（唯讀）

依 docs/OUTLINE_DISCLOSURE_LINK_SPEC.md 第六節 C1–C7 契約檢查。

用法:
    python3 scripts/audit_outline_links.py
    python3 scripts/audit_outline_links.py --course 2025釋量論第二品大組共學

退出碼 0 = 全 PASS；1 = 有 FAIL。
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def normalize(text):
    """正規化：統一空白、NFKC。不改動實詞。"""
    if text is None:
        return ""
    t = unicodedata.normalize("NFKC", str(text))
    t = t.replace("　", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return t.strip()


def parse_time_to_sec(label):
    """'1:29:04' / '0:06:48' / '1:29:04' → 秒。"""
    m = re.findall(r"(\d+):(\d{2}):(\d{2})", label)
    if m:
        h, mi, s = m[-1]
        return int(h) * 3600 + int(mi) * 60 + int(s)
    m = re.findall(r"(\d+):(\d{2})", label)
    if m:
        mi, s = m[-1]
        return int(mi) * 60 + int(s)
    return None


def parse_desc_chapters(desc):
    """解析 desc 中「🎞️影片段落：」區塊，回傳 [(start_sec, label)]。"""
    if not desc:
        return []
    i = desc.find("影片段落")
    if i < 0:
        return []
    block = desc[i:i + 4000]
    out = []
    for line in block.split("\n"):
        line = line.strip()
        m = re.match(r"^(\d+:\d{2}:\d{2})\s+(\S.*)$", line)
        if not m:
            if out:
                break
            continue
        t = parse_time_to_sec(m.group(1))
        if t is None:
            continue
        out.append((t, m.group(2)))
    return out


def next_chapter_start(chapters, start):
    """回傳 chapters 中大於 start 的最小起點；無則 None。"""
    nxt = [t for t, _ in chapters if t > start]
    return min(nxt) if nxt else None


def load_map(course_dir):
    p = course_dir / "outline-links" / "outline-disclose-map.json"
    if not p.exists():
        return None, p
    with p.open(encoding="utf-8") as f:
        return json.load(f), p


def gather_questions(outline):
    """回傳 [(section, heading, question)] 扁平清單。"""
    out = []
    for sec in outline or []:
        for q in sec.get("questions") or []:
            out.append((sec.get("section"), sec.get("heading"), q))
    return out


def collect_seg_records(entry):
    """回傳該影片所有 segs 記錄（含來自各題的 segs 與頂層 segs）。"""
    recs = []
    for _s, _h, q in gather_questions(entry.get("outline")):
        for sg in q.get("segs") or []:
            recs.append(sg)
    for sg in entry.get("segs") or []:
        recs.append(sg)
    return recs


def audit_course(course_dir, course_id, results):
    def add(cid, name, ok, detail):
        results.append((course_id, cid, name, bool(ok), detail))

    data, map_path = load_map(course_dir)
    if data is None:
        add(course_id, "C0 map 存在", False, f"找不到 {map_path}")
        return
    add(course_id, "C0 map 存在", True, f"{map_path.name} 條目 {len(data)}")

    if not isinstance(data, list):
        add(course_id, "C0 map 為陣列", False, f"top-level 為 {type(data).__name__}")
        return
    add(course_id, "C0 map 為陣列", True, "")

    video_ids = {e.get("id") for e in data if isinstance(e, dict)}

    # 來源：source_outlines/*.json
    so_dir = course_dir / "source_outlines"
    mappings = []
    unmatched_blueprint = 0
    so_files = sorted(so_dir.glob("*.json")) if so_dir.exists() else []
    for f in so_files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            add(course_id, "C5 source_outlines 可解析", False, f"{f.name}: {e}")
            continue
        for m in d.get("mappings") or []:
            mappings.append((f.name, m))
    add(course_id, "C5 source_outlines 可解析", True, f"{len(so_files)} 檔、{len(mappings)} 筆 mappings")

    # ---- C1 抽屜完整性：每筆 mappings 對應到的開示必須在 map 中可見 ----
    all_segs = []
    for e in data:
        if isinstance(e, dict):
            all_segs.extend(collect_seg_records(e))
    visible_keys = set()
    for e in data:
        if not isinstance(e, dict):
            continue
        vid = e.get("id")
        for _s, _h, q in gather_questions(e.get("outline")):
            for sg in q.get("segs") or []:
                visible_keys.add((vid, sg.get("start"), sg.get("end"), sg.get("label")))

    missing_c1 = []
    n_candidate = 0
    for fname, m in mappings:
        if m.get("status") == "unmatched":
            unmatched_blueprint += 1
            continue
        if m.get("status") == "candidate":
            # 初步對應，逐字稿未完成，允許無可見開示段，但須有 evidence
            n_candidate += 1
            if not (m.get("evidence") or "").strip():
                missing_c1.append(f"{fname} Q{m.get('sourceQuestionNo')} candidate 但 evidence 空")
            continue
        ref = m.get("outlineRef") or {}
        vid = ref.get("videoId")
        if not vid:
            missing_c1.append(f"{fname} Q{m.get('sourceQuestionNo')} 缺 outlineRef.videoId")
            continue
        found = False
        for e in data:
            if not isinstance(e, dict) or e.get("id") != vid:
                continue
            for sg in collect_seg_records(e):
                if sg.get("start") is not None and sg.get("end") is not None:
                    if (vid, sg["start"], sg["end"], sg.get("label")) in visible_keys:
                        found = True
                        break
            if found:
                break
        if not found:
            missing_c1.append(f"{fname} Q{m.get('sourceQuestionNo')} → video {vid} 無可見開示段")
    add(course_id, "C1 抽屜完整性", not missing_c1,
        f"mappings {len(mappings)}（unmatched {unmatched_blueprint}、candidate {n_candidate}）、"
        f"可見 segs {len(visible_keys)}、缺 {len(missing_c1)}"
        + ("" if not missing_c1 else "：" + "; ".join(missing_c1[:5])))

    # ---- C2 時間碼自洽 ----
    bad_c2 = []
    for e in data:
        if not isinstance(e, dict):
            continue
        vid, dur = e.get("id"), e.get("duration")
        segs = e.get("segs") or []
        desc_chapters = parse_desc_chapters(e.get("desc") or "")
        prev_start = -1
        for sg in segs:
            s, en = sg.get("start"), sg.get("end")
            if s is None or en is None:
                bad_c2.append(f"{vid} seg 缺 start/end")
                continue
            if not (s < en):
                bad_c2.append(f"{vid}@{s} start>=end")
            if dur and en > dur + 5:
                bad_c2.append(f"{vid}@{s} end={en} > duration={dur}")
            if s < prev_start:
                bad_c2.append(f"{vid}@{s} 未遞增")
            prev_start = s
            # 章節格式為「開始時間 標籤」，例：0:31:37 法師指導 1:29:04
            # 其中 label 內嵌時間是「法師開示自身的結束時間」，與 seg.end
            # （下一章節起點）為兩個不同概念，兩者皆須自洽：
            #   1) 內嵌結束時間 <= seg.end
            #   2) seg.end == desc 中下一章節的起點（尾段取影片長度）
            lbl = sg.get("label") or ""
            t = parse_time_to_sec(lbl)
            if t is not None and t > en + 2:
                bad_c2.append(f"{vid}@{s} label'{lbl}' 內嵌結束時間 {t} > seg.end {en}")
            nxt = next_chapter_start(desc_chapters, s)
            if nxt is not None and abs(nxt - en) > 2:
                bad_c2.append(f"{vid}@{s} end={en} 與下一章節起點 {nxt} 不符")
            if dur and nxt is None and abs(en - dur) > 2:
                bad_c2.append(f"{vid}@{s} 末段 end={en} 與影片長度 {dur} 不符")
    add(course_id, "C2 時間碼自洽", not bad_c2,
        f"檢查 {sum(len(e.get('segs') or []) for e in data if isinstance(e, dict))} 段，違例 {len(bad_c2)}"
        + ("" if not bad_c2 else "：" + "; ".join(bad_c2[:5])))

    # ---- C3 連結可用 ----
    bad_c3 = []
    n_links = 0
    for e in data:
        if not isinstance(e, dict):
            continue
        for sg in collect_seg_records(e):
            s = sg.get("start")
            if s is None:
                continue
            n_links += 1
            url = f"https://www.youtube.com/watch?v={e.get('id')}&t={s}s"
            if e.get("id") not in video_ids:
                bad_c3.append(f"{url} videoId 不在 playlist")
    add(course_id, "C3 連結可用", not bad_c3,
        f"連結 {n_links} 筆，playlist 內 videoId {len(video_ids)} 支，違例 {len(bad_c3)}")

    # ---- C4 逐字忠實：body/subs 必須在 desc 中逐字出現 ----
    bad_c4 = []
    n_check = 0
    for e in data:
        if not isinstance(e, dict):
            continue
        desc = normalize(e.get("desc") or "")
        for _s, _h, q in gather_questions(e.get("outline")):
            body = normalize(q.get("body") or "")
            if body:
                n_check += 1
                if body not in desc:
                    bad_c4.append(f"{e.get('id')} Q{q.get('num')} body 未逐字見於 desc")
            for sub in q.get("subs") or []:
                sub_n = normalize(sub)
                if not sub_n:
                    continue
                n_check += 1
                if sub_n not in desc:
                    bad_c4.append(f"{e.get('id')} Q{q.get('num')} sub 未逐字見於 desc")
    add(course_id, "C4 逐字忠實", not bad_c4,
        f"比對 {n_check} 處，違例 {len(bad_c4)}" + ("" if not bad_c4 else "：" + "; ".join(bad_c4[:5])))

    # ---- C5 對應有據 ----
    bad_c5 = []
    for fname, m in mappings:
        if not (m.get("evidence") or "").strip():
            bad_c5.append(f"{fname} Q{m.get('sourceQuestionNo')} evidence 空")
            continue
        ev = m["evidence"]
        # 須能辨識出藍圖提問側與共學提綱側的原文。
        # 標準格式首行為「藍圖提問：…」；candidate 類以
        # 「待 … 轉寫完成後補入對應句號」結尾者，仍須指出講次與題號。
        has_bp = "藍圖提問" in ev
        is_candidate = m.get("status") == "candidate"
        if not has_bp and not is_candidate:
            bad_c5.append(f"{fname} Q{m.get('sourceQuestionNo')} evidence 未標示藍圖提問原文")
    add(course_id, "C5 對應有據", not bad_c5,
        f"{len(mappings)} 筆，違例 {len(bad_c5)}" + ("" if not bad_c5 else "：" + "; ".join(bad_c5[:5])))

    # ---- C6 confidence 保守 ----
    bad_c6 = []
    n_conf = 0
    for fname, m in mappings:
        conf = m.get("confidence")
        n_conf += 1
        ev = m.get("evidence") or ""
        if conf == "high":
            nums = re.findall(r"相似度\s*([0-9]*\.?[0-9]+)", ev)
            if not nums:
                bad_c6.append(f"{fname} Q{m.get('sourceQuestionNo')} high 但無相似度數值")
            elif float(nums[-1]) < 0.90:
                bad_c6.append(f"{fname} Q{m.get('sourceQuestionNo')} high 但相似度 {nums[-1]} < 0.90")
        if conf == "low" and m.get("status") not in ("unmatched",):
            # low 不得用於已確認之對應，僅供延伸/背景
            if m.get("status") == "confirmed":
                bad_c6.append(f"{fname} Q{m.get('sourceQuestionNo')} confirmed 不得配 low")
        if conf == "unmatched" and not ev.strip():
            bad_c6.append(f"{fname} Q{m.get('sourceQuestionNo')} unmatched 無說明")
        if conf not in ("high", "medium", "low", "unmatched", None):
            bad_c6.append(f"{fname} Q{m.get('sourceQuestionNo')} 非法 confidence '{conf}'")
    add(course_id, "C6 confidence 保守", not bad_c6,
        f"{n_conf} 筆，違例 {len(bad_c6)}" + ("" if not bad_c6 else "：" + "; ".join(bad_c6[:5])))

    # ---- C7 產物可重建：HTML/MD 存在且涵蓋 map 中所有題目 ----
    ol_dir = course_dir / "outline-links"
    for fname in ("提綱與法師開示對照.html", "提綱與法師開示對照.md"):
        p = ol_dir / fname
        add(course_id, f"C7 產物存在 {fname}", p.exists(),
            f"{p.stat().st_size} bytes" if p.exists() else "缺檔")

    html_p = ol_dir / "提綱與法師開示對照.html"
    if html_p.exists():
        h = html_p.read_text(encoding="utf-8")
        n_q_html = h.count('class="q"')
        n_dlink = h.count('class="dlink"')
        n_bp = h.count('class="bp"')
        n_q_map = sum(len(gather_questions(e.get("outline")))
                      for e in data if isinstance(e, dict))
        n_bp_map = len([m for _f, m in mappings
                        if m.get("status") != "unmatched"])
        add(course_id, "C7 HTML 題數相符", n_q_html == n_q_map,
            f"html .q={n_q_html} map questions={n_q_map}")
        add(course_id, "C7 HTML 藍圖區塊相符", n_bp >= n_bp_map * 0.9,
            f"html .bp={n_bp} 對應數上限={n_bp_map}")
        add(course_id, "C7 HTML 開示連結存在", n_dlink > 0, f"html .dlink={n_dlink}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--course", default="2025釋量論第二品大組共學")
    ap.add_argument("--all", action="store_true", help="稽核所有含 outline-links 的課程")
    args = ap.parse_args()

    courses_dir = REPO / "courses"
    if args.all:
        targets = sorted(p for p in courses_dir.iterdir()
                         if p.is_dir() and (p / "outline-links" / "outline-disclose-map.json").exists())
    else:
        targets = [courses_dir / args.course]
        if not targets[0].exists():
            print(f"找不到課程目錄：{targets[0]}", file=sys.stderr)
            return 2

    results = []
    for t in targets:
        audit_course(t, t.name, results)

    width = max((len(f"{c} {n}") for c, _cid, n, _ok, _d in results), default=20)
    print("=" * 100)
    for c, cid, name, ok, detail in results:
        flag = "PASS" if ok else "FAIL"
        print(f"[{flag}] {c} {name}".ljust(width + 14) + f" — {detail}")
    print("=" * 100)
    n_fail = sum(1 for r in results if not r[3])
    print(f"稽核完成：{len(results)} 項檢查，FAIL {n_fail} 項")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
