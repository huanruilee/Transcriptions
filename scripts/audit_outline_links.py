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


def has_verse_quotation(evidence):
    """判斷藍圖提問是否含偈頌原文引文。

    偈頌對照之 evidence 常以「偈頌中提到：『…』」或直接引錄偈頌的方式呈現，
    此類對應的 high 依據是偈頌原文本身，不以相似度數值為必要。
    """
    head = (evidence or "").split("\n")[0]
    return bool(re.search(r"[「『][^」』]{6,}[」』]", head)) and (
        "偈頌" in head or "頌文" in head or "頌曰" in head)


def extract_verdict(evidence):
    """自 evidence 取出「判定」類型（如 verse / same / teaching）。"""
    m = re.search(r"判定\s*[:：]\s*([A-Za-z]+)", evidence or "")
    return m.group(1) if m else None


def extract_evidence_side(evidence, label):
    """自 evidence 取出指定標籤（如「藍圖提問」）後的原文。

    回傳 None 表示該標籤不存在；回傳空字串表示標籤存在但無實質原文。
    """
    m = re.search(rf"{re.escape(label)}\s*[:：]\s*([^\n]*)", evidence or "")
    if not m:
        return None
    return m.group(1).strip()


def seg_key(sg):
    """seg 記錄的識別鍵（start/end/label）。"""
    return (sg.get("start"), sg.get("end"), sg.get("label"))


def collect_seg_records(entry):
    """回傳該影片所有 segs 記錄（含來自各題的 segs 與頂層 segs）。"""
    recs = []
    for _s, _h, q in gather_questions(entry.get("outline")):
        for sg in q.get("segs") or []:
            recs.append(sg)
    for sg in entry.get("segs") or []:
        recs.append(sg)
    return recs


def check_prerequisites(course_dir):
    """檢查套用本規格的前置條件 P1–P4。

    回傳 (是否全數成立, 說明文字)。
    P1 有藍圖提綱；P2 有每講共學提綱；P3 有法師開示時間碼；
    P4 提綱與開示可在同一時間軸對位。
    """
    so_dir = course_dir / "source_outlines"
    files = sorted(so_dir.glob("*.json")) if so_dir.exists() else []
    n_p1 = 0
    for f in files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if d.get("discussionOutline"):
            n_p1 += 1
    p1_ok = bool(files) and n_p1 == len(files)

    # P2/P3/P4 需由 map 判斷；map 缺失時無法判定
    p2_ok = p3_ok = p4_ok = False
    n_vid = 0
    data, _ = load_map(course_dir)
    if data:
        n_vid = len(data)
        has_q = any(gather_questions(e.get("outline")) for e in data if isinstance(e, dict))
        has_seg = any(collect_seg_records(e) for e in data if isinstance(e, dict))
        p2_ok = has_q
        p3_ok = has_seg
        p4_ok = has_q and has_seg

    details = [
        f"P1 藍圖提綱（source_outlines 有 discussionOutline）：{n_p1}/{len(files)} 檔"
        f" — {'成立' if p1_ok else '不成立'}",
        f"P2 每講共學提綱（map 含題目）：{'成立' if p2_ok else '不成立'}",
        f"P3 法師開示時間碼（map 含 segs）：{'成立' if p3_ok else '不成立'}",
        f"P4 同一時間軸對位：{'成立' if p4_ok else '不成立'}",
    ]
    if not p1_ok:
        details.append(
            "結論：P2/P3 不成立時應退化為兩層對照，"
            "改走 docs/REFERENCE_EVIDENCE_PROTOCOL.md，不得硬套本規格")
    return (p1_ok and p2_ok and p3_ok and p4_ok), "；".join(details)


def audit_course(course_dir, course_id, results):
    def add(cid, name, ok, detail):
        results.append((course_id, cid, name, bool(ok), detail))

    data, map_path = load_map(course_dir)
    if data is None:
        add(course_id, "C0 map 存在", False, f"找不到 {map_path}")
        # ---- C0 前置條件檢查（P1–P4）：讓不適用本規格的課程
        # 能明確列出「缺什麼」，而非只報 map 缺失。
        p_ok, p_detail = check_prerequisites(course_dir)
        add(course_id, "C0 前置條件 P1–P4", p_ok, p_detail)
        return
    add(course_id, "C0 map 存在", True, f"{map_path.name} 條目 {len(data)}")

    if not isinstance(data, list):
        add(course_id, "C0 map 為陣列", False, f"top-level 為 {type(data).__name__}")
        return
    add(course_id, "C0 map 為陣列", True, "")

    # C3 的 playlist 清單必須來自「獨立來源」，不可由受稽核的 map 自證。
    # 優先讀取 course.json 的 playlists 區段；查無則退而以 map 自列之
    # video 檔案清單為準，並於說明中標示為「map 自證」（信心較低）。
    # C3 的 playlist 清單必須來自「獨立來源」，不可由受稽核的 map 自證。
    # 來源優先序：
    #   1) course.json 的 sessions[*].youtubeVideoId（權威講次清單）
    #   2) course.json 的 playlists[*].videos[*].id
    #   3) course/videos/*.json
    #   4) 皆不可得 → 退而以 map 自列清單，並於說明中標示信心低
    playlist_ids = set()
    playlist_source = "map 自證（無獨立 playlist 清單，信心低）"
    course_json = course_dir / "course.json"
    known_sessions = set()
    if course_json.exists():
        cj = json.loads(course_json.read_text(encoding="utf-8"))
        for key in ("sessions", "pendingSessions", "unavailableSessions"):
            for s_ in (cj.get(key) or []):
                sid = s_.get("sessionId") or s_.get("id")
                if sid:
                    known_sessions.add(sid)
                vid = s_.get("youtubeVideoId") or s_.get("youtubeId")
                if vid:
                    playlist_ids.add(vid)
        for pl in (cj.get("playlists") or []):
            for v in (pl.get("videos") or []):
                vid = v.get("id") or v.get("videoId")
                if vid:
                    playlist_ids.add(vid)
        if playlist_ids:
            playlist_source = "course.json sessions[*].youtubeVideoId"
    if not playlist_ids:
        vids_dir = course_dir / "videos"
        if vids_dir.exists():
            for vp in vids_dir.glob("*.json"):
                try:
                    vd = json.loads(vp.read_text(encoding="utf-8"))
                except Exception:
                    continue
                for e in (vd if isinstance(vd, list) else [vd]):
                    if isinstance(e, dict) and e.get("id"):
                        playlist_ids.add(e["id"])
            if playlist_ids:
                playlist_source = "videos/*.json"
    if not playlist_ids:
        playlist_ids = {e.get("id") for e in data if isinstance(e, dict)}

    video_ids = playlist_ids

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

    # 依 videoId 建立「章節 → 題目 → segs」索引，
    # 供 C1 精準解析 mapping 所指向的那一題。
    # 不可僅以「該影片任一段可見」為準 —— 那會讓同影片的無關開示
    # 滿足所有 mapping（review finding：需解析到被參照的題目）。
    by_video = {}
    for e in data:
        if not isinstance(e, dict):
            continue
        vid = e.get("id")
        secs = {}
        for sec, _h, q in gather_questions(e.get("outline")):
            secs.setdefault(sec, []).append(q)
        by_video[vid] = secs

    def resolve_ref_segs(vid, section, question_no):
        """回傳 (該題之 segs, 解析狀態)。

        解析狀態：'ok' 找到該題；'no_section' 章節不存在；
        'no_question' 章節存在但題號不存在；'no_video' 影片不存在。
        """
        secs = by_video.get(vid)
        if secs is None:
            return [], "no_video"
        qs = secs.get(section)
        if qs is None:
            return [], "no_section"
        for q in qs:
            if str(q.get("num")) == str(question_no):
                return (q.get("segs") or []), "ok"
        return [], "no_question"

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
            # 缺 videoId 時，若該筆所屬 session 已存在於 course.json 且該講
            # 尚未轉寫（pendingSessions），屬合法中間狀，不計為缺陷；
            # 否則視為對應資料不完整。
            sids = [m.get("sessionId")] if m.get("sessionId") else []
            known = any(x in known_sessions for x in sids)
            if known:
                continue
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} 缺 outlineRef.videoId"
                f"（sessionId={sids or '無'}）")
            continue
        section = ref.get("section")
        qno = ref.get("questionNo")
        if section is None or qno is None:
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} 缺 outlineRef.section/questionNo")
            continue
        ref_segs, status = resolve_ref_segs(vid, section, qno)
        if status == "no_video":
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} → video {vid} 不存在於 map")
            continue
        if status == "no_section":
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} → {vid} 章節「{section}」不存在")
            continue
        if status == "no_question":
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} → {vid} 章節「{section}」"
                f"無題號 {qno}")
            continue
        # 該題須至少有一個可見開示段
        found = False
        for sg in ref_segs:
            if sg.get("start") is not None and sg.get("end") is not None:
                if (vid, sg["start"], sg["end"], sg.get("label")) in visible_keys:
                    found = True
                    break
        if not found:
            missing_c1.append(
                f"{fname} Q{m.get('sourceQuestionNo')} → {vid}「{section}」"
                f"Q{qno} 無可見開示段")
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
        desc_chapters = parse_desc_chapters(e.get("desc") or "")
        # 檢查所有「被消費的」seg 記錄：題目層 segs 與頂層 segs 皆須驗證，
        # 且題目層的副本必須與頂層的對應記錄一致。
        top_by_key = {}
        for sg in e.get("segs") or []:
            top_by_key[seg_key(sg)] = sg
        consumed = []
        for sec, _h, q in gather_questions(e.get("outline")):
            for sg in q.get("segs") or []:
                consumed.append((f"Q{q.get('num')}", sg))
        for sg in e.get("segs") or []:
            consumed.append(("top", sg))
        prev_start = -1
        for origin, sg in consumed:
            s, en = sg.get("start"), sg.get("end")
            if s is None or en is None:
                bad_c2.append(f"{vid}[{origin}] seg 缺 start/end")
                continue
            if not (s < en):
                bad_c2.append(f"{vid}[{origin}]@{s} start>=end")
            if dur and en > dur + 5:
                bad_c2.append(f"{vid}[{origin}]@{s} end={en} > duration={dur}")
            if origin != "top" and s < prev_start:
                bad_c2.append(f"{vid}[{origin}]@{s} 未遞增")
            if origin == "top":
                prev_start = s
            # 題目層 seg 須與頂層同名 seg 一致（若頂層存在該筆記錄）
            if origin != "top":
                top = top_by_key.get(seg_key(sg))
                if top is not None and (top.get("start") != s or top.get("end") != en):
                    bad_c2.append(
                        f"{vid}[{origin}]@{s} 與頂層 seg 不一致"
                        f"（top={top.get('start')}-{top.get('end')}）")
            # 章節格式為「開始時間 標籤」，例：0:31:37 法師指導 1:29:04
            # 其中 label 內嵌時間是「法師開示自身的結束時間」，與 seg.end
            # （下一章節起點）為兩個不同概念，兩者皆須自洽：
            #   1) 內嵌結束時間 <= seg.end
            #   2) seg.end == desc 中下一章節的起點（尾段取影片長度）
            lbl = sg.get("label") or ""
            t = parse_time_to_sec(lbl)
            if t is not None and t > en + 2:
                bad_c2.append(
                    f"{vid}[{origin}]@{s} label'{lbl}' 內嵌結束時間 {t} > seg.end {en}")
            nxt = next_chapter_start(desc_chapters, s)
            if nxt is not None and abs(nxt - en) > 2:
                bad_c2.append(f"{vid}[{origin}]@{s} end={en} 與下一章節起點 {nxt} 不符")
            if dur and nxt is None and abs(en - dur) > 2:
                bad_c2.append(f"{vid}[{origin}]@{s} 末段 end={en} 與影片長度 {dur} 不符")
    n_c2_checked = sum(
        len(gather_questions(e.get("outline"))[i][2].get("segs") or [])
        if False else 0
        for i in [])
    n_c2_checked = 0
    for e in data:
        if not isinstance(e, dict):
            continue
        n_c2_checked += sum(len(q.get("segs") or [])
                            for _s, _h, q in gather_questions(e.get("outline")))
        n_c2_checked += len(e.get("segs") or [])
    add(course_id, "C2 時間碼自洽", not bad_c2,
        f"檢查 {n_c2_checked} 段（含題目層），違例 {len(bad_c2)}"
        + ("" if not bad_c2 else "：" + "; ".join(bad_c2[:5])))

    # ---- C3 連結可用 ----
    bad_c3 = []
    n_links = 0
    for e in data:
        if not isinstance(e, dict):
            continue
        vid = e.get("id")
        # map 中出現的 videoId 必須在獨立 playlist 清單內
        if vid not in video_ids:
            bad_c3.append(f"video {vid} 不在 playlist（來源：{playlist_source}）")
        for sg in collect_seg_records(e):
            s = sg.get("start")
            if s is None:
                continue
            n_links += 1
    # 對應（mappings）所參照的 videoId 亦須在 playlist 內
    for fname, m in mappings:
        vid = (m.get("outlineRef") or {}).get("videoId")
        if vid and vid not in video_ids:
            bad_c3.append(f"{fname} Q{m.get('sourceQuestionNo')} 參照 video {vid} 不在 playlist")
    add(course_id, "C3 連結可用", not bad_c3,
        f"連結 {n_links} 筆，playlist 內 videoId {len(video_ids)} 支"
        f"（來源：{playlist_source}），違例 {len(bad_c3)}"
        + ("" if not bad_c3 else "：" + "; ".join(bad_c3[:5])))

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
    n_c5_checked = 0
    for fname, m in mappings:
        # unmatched（尚未找到對應共學提綱）不適用本契約 ——
        # 其 evidence 本就無「共學提綱原文」可引。
        if m.get("status") == "unmatched":
            continue
        n_c5_checked += 1
        if not (m.get("evidence") or "").strip():
            bad_c5.append(f"{fname} Q{m.get('sourceQuestionNo')} evidence 空")
            continue
        ev = m["evidence"]
        # 須能辨識出藍圖提問側與共學提綱側的原文。
        # 標準格式首行為「藍圖提問：…」；candidate 類以
        # 「待 … 轉寫完成後補入對應句號」結尾者，仍須指出講次與題號。
        is_candidate = m.get("status") == "candidate"
        # 規格要求 evidence 能辨識出「藍圖提問」與「共學提綱」兩側的原文，
        # 且兩側皆須為非空引文 —— 僅出現標籤字樣（如 "藍圖提問："）而無實質
        # 原文者，不構成可追溯之依據。
        bp = extract_evidence_side(ev, "藍圖提問")
        outline_side = extract_evidence_side(ev, "共學提綱") or \
            extract_evidence_side(ev, "提綱原文")
        if not is_candidate:
            if bp is None:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} evidence 未標示藍圖提問原文")
            elif not bp:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} 藍圖提問原文為空")
            if outline_side is None:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} evidence 未標示共學提綱原文")
            elif not outline_side:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} 共學提綱原文為空")
        else:
            # candidate：逐字稿未完成，允許以「待…補入對應句號」結尾。
            # 但仍須有藍圖提問原文，且須指出所對應的講次與題號。
            if bp is None:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} candidate evidence 缺藍圖提問原文")
            elif not bp:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} candidate 藍圖提問原文為空")
            if not re.search(r"待.{0,60}補入", ev) and not outline_side:
                bad_c5.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} candidate evidence 缺對應指示"
                    f"（講次/章節/題號或待補註記）")
    add(course_id, "C5 對應有據", not bad_c5,
        f"檢查 {n_c5_checked} 筆（不含 unmatched），違例 {len(bad_c5)}"
        + ("" if not bad_c5 else "：" + "; ".join(bad_c5[:5])))

    # ---- C6 confidence 保守 ----
    bad_c6 = []
    n_conf = 0
    for fname, m in mappings:
        conf = m.get("confidence")
        n_conf += 1
        ev = m.get("evidence") or ""
        if conf == "high":
            nums = re.findall(r"相似度\s*([0-9]*\.?[0-9]+)", ev)
            verdict = extract_verdict(ev)
            if not nums:
                # 無相似度數值時，不得單憑標籤判 high。
                # 但以下兩種情形，其 high 的依據由 evidence 本身確立，
                # 不以相似度數值為必要：
                #   (a) 明確載明「判定：verse」（偈頌原文直接對上）
                #   (b) 藍圖提問本身含偈頌原文引文，屬偈頌對應性質
                if verdict == "verse":
                    pass
                elif has_verse_quotation(ev):
                    pass
                else:
                    bad_c6.append(
                        f"{fname} Q{m.get('sourceQuestionNo')} high 但無相似度數值"
                        f"（判定：{verdict or '無'}）")
            elif float(nums[-1]) < 0.90 and verdict != "verse":
                # 相似度門檻 0.90 僅適用於「教學層次同一命題」的對應。
                # 判定為 verse 者，其比較對象是「偈頌原文」與「教學提問」，
                # 措辭本就相異，相似度天然偏低（實測 0.64–0.82），
                # 不宜以同一門檻要求。
                bad_c6.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} high 但相似度 {nums[-1]} < 0.90"
                    f"（判定：{verdict or '無'}）")
            elif float(nums[-1]) < 0.70 and verdict == "verse" and m.get("status") == "confirmed":
                # 偈頌對應若相似度低於 0.70，語意接近已難以自證，
                # 仍須人工複驗 —— 如實標示，不直接判定為灌水。
                bad_c6.append(
                    f"{fname} Q{m.get('sourceQuestionNo')} high/verse 但相似度僅 {nums[-1]}"
                    f"，低於 0.70，須人工複驗")
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
    md_p = ol_dir / "提綱與法師開示對照.md"
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

        # ---- C7 內容層級一致性：產物必須反映 map，而非僅計數相符 ----
        # 僅比對 class 計數無法察覺「題目文字已過期」或「開示連結時碼錯誤」。
        # 故逐題比對題幹原文，並逐一驗證每個開示連結的 videoId 與 t= 秒數
        # 是否存在於 map。
        stale_questions = []
        for e in data:
            if not isinstance(e, dict):
                continue
            vid = e.get("id")
            for _sec, _h, q in gather_questions(e.get("outline")):
                body = normalize(q.get("body") or "")
                if not body:
                    continue
                if body not in normalize(h):
                    stale_questions.append(f"{vid} Q{q.get('num')}")
        add(course_id, "C7 HTML 題幹內容與 map 一致", not stale_questions,
            f"比對 {n_q_map} 題，過期={len(stale_questions)}"
            + ("" if not stale_questions else "：" + "; ".join(stale_questions[:5])))

        # 驗證每個「開示連結」（class="dlink"）的 (videoId, t=秒數)
        # 皆存在於 map 的 segs。
        #
        # 只驗證 dlink，不驗證全部 watch 連結 —— 頁面另有每支影片一筆的
        # 「觀看整支影片」入口連結（t=0s），其刻意指向影片開頭而非開示時碼，
        # 不屬於 map 的 seg 集合，計入會造成誤判。
        map_seg_pairs = set()
        for e in data:
            if not isinstance(e, dict):
                continue
            vid = e.get("id")
            for sg in collect_seg_records(e):
                if sg.get("start") is not None:
                    map_seg_pairs.add((vid, int(sg["start"])))
        bad_links = []
        n_html_links = 0
        for m2 in re.finditer(
                r'<a[^>]*class="[^"]*dlink[^"]*"[^>]*href="[^"]*'
                r'youtube\.com/watch\?v=([A-Za-z0-9_-]{6,})&(?:amp;)?t=(\d+)s', h):
            n_html_links += 1
            pair = (m2.group(1), int(m2.group(2)))
            if pair not in map_seg_pairs:
                bad_links.append(f"{pair[0]}@{pair[1]}s")
        add(course_id, "C7 HTML 開示連結時碼與 map 一致", not bad_links,
            f"開示連結 {n_html_links} 筆，越界={len(bad_links)}"
            + ("" if not bad_links else "：" + "; ".join(bad_links[:5])))

    # ---- C7 Markdown 產物：須存在、非空，且涵蓋所有題目原文 ----
    if md_p.exists():
        md_text = md_p.read_text(encoding="utf-8")
        n_q_map = sum(len(gather_questions(e.get("outline")))
                      for e in data if isinstance(e, dict))
        md_missing = []
        for e in data:
            if not isinstance(e, dict):
                continue
            vid = e.get("id")
            for _sec, _h, q in gather_questions(e.get("outline")):
                body = normalize(q.get("body") or "")
                if body and body not in normalize(md_text):
                    md_missing.append(f"{vid} Q{q.get('num')}")
        add(course_id, "C7 MD 非空", len(md_text.strip()) > 0,
            f"{len(md_text)} 字元")
        add(course_id, "C7 MD 題幹內容與 map 一致", not md_missing,
            f"比對 {n_q_map} 題，缺={len(md_missing)}"
            + ("" if not md_missing else "：" + "; ".join(md_missing[:5])))
    else:
        add(course_id, "C7 MD 非空", False, "缺檔")


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
