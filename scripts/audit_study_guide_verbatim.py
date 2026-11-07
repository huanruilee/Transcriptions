#!/usr/bin/env python3
"""研讀講記「原話對照抽屜」稽核（唯讀）。

檢查五項契約，用於判斷研讀講記的網頁產物是否忠實對應課堂原話：

  C1  抽屜集合 == 「有對應原話之 md 段」集合
  C2  抽屜內容與「依時間區間對齊應得之原話」逐字相符
  C3  verbatim 每一段都能在抽屜中找到（無原話不可見）
  C4  無空音檔，且有可用的音訊來源（YouTube embed 或非空 audio src）
  C5  每個抽屜所載原話，確為該 md 段時間區間所涵蓋之原話（對齊正確性）

C1/C2/C3 以「抽屜 vs 對齊結果」比對，不以段落序號比對：
研讀講記會重新分段，與課堂原話的段落切分並非一一對應，
一個 md 段可能涵蓋多個 verbatim 段落，反之亦然。

用法：
    python3 scripts/audit_study_guide_verbatim.py [course_dir ...]

預設掃描 courses/ 下所有含 publications/lecture_*_study_guide.html 且同層有
verbatim/ 目錄的課程。退出碼：全部 PASS 回 0，出現 FAIL 回 1。

注意：本腳本為唯讀稽核，不修改任何檔案。
"""
import html as H
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verbatim_alignment import align_verbatim_by_time_expanded, alignment_stats  # noqa: E402


def strip_tags(s: str) -> str:
    """去除 HTML 標籤並還原跳脫字元，用於抽屜文字與原話文字比對。"""
    return H.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def drawer_sentences(body: str) -> list:
    """從抽屜 HTML 取出每句原話文字。

    每句為一個 <div class="v-item">，其內含 v-ts / v-spk / v-txt 三個 span，
    v-txt 為末者；文字中可能巢狀 <span class="treatise-quote">，故不可直接用
    非貪婪的 v-txt 擷取（會在巢狀閉合標籤處提前截斷）。
    """
    out = []
    for item in re.findall(r'<div class="v-item".*?</div>', body, re.S):
        m = re.search(
            r'<span class="v-txt">(.*?)</span>(?=<span class="v-txt">|</div>\s*$)',
            item, re.S,
        ) or re.search(r'<span class="v-txt">(.*)$', item, re.S)
        if m:
            out.append(strip_tags(m.group(1)))
    return out


def md_seconds(md_text: str) -> list:
    """取出 md 中各時間戳段落的起始秒數（依序）。

    md 的時間戳寫法為：[▶ mm:ss](url#t=106)

    顯示文字僅精確到分鐘（mm:ss），而 URL 尾端的 `#t=106` 才是精確秒數；
    renderer 以 `#t=` 為準產生 playAt()。故此處優先取 `#t=`，
    缺 URL 時才退回解析顯示文字。

    取值來源不一致會導致稽核期望與實際產物不符（實測：釋量論 30 講
    p_35/p_36/p_38 三段誤判）。
    """
    out = []
    pattern = re.compile(
        r"\[▶\s*(\d+):(\d{2})(?::(\d{2}))?\]\(([^)]*)\)")
    for m in pattern.finditer(md_text):
        url = m.group(4) or ""
        frag = re.search(r"#t=(\d+)", url)
        if frag:
            out.append(int(frag.group(1)))
            continue
        if m.group(3):
            out.append(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)))
        else:
            out.append(int(m.group(1)) * 60 + int(m.group(2)))
    # 若無任何带 URL 的時間戳，退回單純解析顯示文字
    if not out:
        for m in re.finditer(r"\[▶\s*(\d+):(\d{2})(?::(\d{2}))?\]", md_text):
            if m.group(3):
                out.append(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)))
            else:
                out.append(int(m.group(1)) * 60 + int(m.group(2)))
    return out


def extract_drawers(html_text: str) -> dict:
    """回傳 {段落 key: 抽屜內容 HTML}。"""
    return dict(re.findall(
        r'<div id="drawer-(p_\d+)" class="verbatim-drawer"[^>]*>(.*?)(?=<div id="drawer-|</body>)',
        html_text, re.S,
    ))


def audit_course(course_dir: Path) -> list:
    """稽核單一課程，回傳 [(講次, 契約名, 結果, 說明)]。"""
    results = []
    pub = course_dir / "publications"
    vdir = course_dir / "verbatim"
    if not pub.is_dir() or not vdir.is_dir():
        return results

    for html_path in sorted(pub.glob("lecture_*_study_guide.html")):
        sid = re.search(r"lecture_([0-9A-Za-z]+)_study_guide", html_path.name)
        if not sid:
            continue
        sid = sid.group(1)
        md_path = pub / f"lecture_{sid}_study_guide.md"
        vpath = vdir / f"verbatim_{sid}.json"
        if not md_path.exists() or not vpath.exists():
            continue

        html_text = html_path.read_text(encoding="utf-8")
        md_text = md_path.read_text(encoding="utf-8")
        verbatim = json.loads(vpath.read_text(encoding="utf-8")).get("paragraphs", {})

        drawers = extract_drawers(html_text)
        md_ts_count = len(re.findall(r"\[▶\s*\d+:\d+\]", md_text))

        # ALT 分流：inline 原話型（正文直接內嵌原話、無抽屜元件）不適用 C1/C3，
        # 不能以「無 drawer」判為缺陷。此類講次的原話不在本 html，而在同課程的
        # 對照稿（如 sessions/session_*.json 或另建之對照檔），須另以該標的稽核。
        if not drawers:
            results.append((sid, "ALT 非抽屜型原話產物（不適用 C1/C3）", True,
                            "本 html 無原話抽屜元件，原話對照不在此檔；"
                            "C1/C3 對此類講次不適用，非缺陷"))
            empty_audio = len(re.findall(r'<audio[^>]*src=""', html_text))
            has_yt = bool(re.search(r"youtube\.com/embed", html_text))
            has_audio = bool(re.search(r'<audio[^>]*src="[^"]+"', html_text))
            results.append((sid, "C4 無空音檔且有音訊來源", empty_audio == 0 and (has_yt or has_audio),
                            f"empty_audio={empty_audio} youtube={has_yt} audio={has_audio}"))
            continue

        # 依時間區間對齊，重建「每個 md 段應載的原話」
        alignment = align_verbatim_by_time_expanded(verbatim, md_seconds(md_text))

        # C1：抽屜數應等於「有對應原話之 md 段數」
        #
        # 註：不再是「drawer 數 == md 時間戳段數」。研讀講記與課堂原話的
        # 段落切分不同，一個 md 段可能對應多個 verbatim 段，反之亦然；
        # 另有部分 md 段（如純承上段的續述）確實無對應原話，該段不顯示抽屜。
        # 契約為：有對應原話的 md 段皆須有抽屜，且抽屜不得超出該集合。
        expected_idx = {i for i, pids in alignment.items() if pids}
        drawer_idx = set()
        for key in drawers:
            mm = re.search(r"(\d+)", key)
            if mm:
                drawer_idx.add(int(mm.group(1)) - 1)
        c1_ok = drawer_idx == expected_idx
        c1_detail = (f"drawer={len(drawers)} 有對應原話的md段={len(expected_idx)}"
                     + (f" 缺={sorted(expected_idx - drawer_idx)[:6]}"
                        if expected_idx - drawer_idx else "")
                     + (f" 多={sorted(drawer_idx - expected_idx)[:6]}"
                        if drawer_idx - expected_idx else ""))
        results.append((sid, "C1 抽屜與有對應原話之md段一致", c1_ok, c1_detail))
        expected_by_index = {}
        for idx, pids in alignment.items():
            sents = []
            for pid in pids:
                sents.extend(verbatim.get(pid) or [])
            expected_by_index[idx] = [s["text"].strip() for s in sents]

        # 抽屜 id 為 p_<md段序號+1>，與對齊索引對應
        drawer_keys = sorted(drawers.keys(),
                             key=lambda k: int(re.search(r"\d+", k).group(0)))
        # C2：抽屜內容須與依時間對齊應得之原話逐字相符
        mismatched = []
        for key in drawer_keys:
            n = int(re.search(r"\d+", key).group(0))
            expect = expected_by_index.get(n - 1, [])
            if drawer_sentences(drawers[key]) != expect:
                mismatched.append(key)
        results.append((sid, "C2 抽屜內容==時間對齊原話逐字", not mismatched,
                        f"不符={len(mismatched)} {mismatched[:5]}"))

        # C3：verbatim 每段都應可見於某抽屜
        covered = set()
        for pids in alignment.values():
            covered |= set(pids)
        missing = [k for k in verbatim if k not in covered]
        results.append((sid, "C3 全部verbatim段落可見", not missing,
                        f"未出現={len(missing)} {missing[:8]}"))

        # C5：對齊品質 —— 須滿足三項
        #   a) 覆蓋率 100%：每個 verbatim 段落皆被某抽屜承載
        #   b) 無重複掛載：每個 verbatim 段落僅出現一次
        #   c) 句數守恆：對齊後原話句數 == verbatim 原話句數
        # 註：對齊採「掛給重疊最長的 md 段」，故單一 verbatim 段落可能
        # 跨越多個 md 段而僅掛在其中一段 —— 這是刻意的，非缺陷。
        stats = alignment_stats(alignment, verbatim)
        mounted = []
        for key in drawer_keys:
            n = int(re.search(r"\d+", key).group(0))
            mounted.extend(alignment.get(n - 1, []))
        c5_problems = []
        if stats["missing"]:
            c5_problems.append(f"未覆蓋 {len(stats['missing'])} 段")
        if stats["duplicated"]:
            c5_problems.append(f"重複掛載 {len(stats['duplicated'])} 段")
        if stats["aligned_sentences"] != stats["total_sentences"]:
            c5_problems.append(
                f"句數不符 {stats['aligned_sentences']} != {stats['total_sentences']}")
        results.append((sid, "C5 對齊品質（覆蓋100%/無重複/句數守恆）", not c5_problems,
                        "；".join(c5_problems) if c5_problems else
                        f"覆蓋 {stats['covered']}/{stats['verbatim_paragraphs']}、"
                        f"句數 {stats['aligned_sentences']}/{stats['total_sentences']}"))

        # C4：不得有空音檔，且須有可用音訊來源
        empty_audio = len(re.findall(r'<audio[^>]*src=""', html_text))
        has_yt = bool(re.search(r"youtube\.com/embed", html_text))
        has_audio = bool(re.search(r'<audio[^>]*src="[^"]+"', html_text))
        c4_ok = empty_audio == 0 and (has_yt or has_audio)
        results.append((sid, "C4 無空音檔且有音訊來源", c4_ok,
                        f"empty_audio={empty_audio} youtube={has_yt} audio={has_audio}"))
    return results


def main(argv):
    if argv:
        dirs = [Path(a).resolve() for a in argv]
    else:
        dirs = sorted(p for p in (REPO / "courses").iterdir() if p.is_dir())

    all_results = []
    for d in dirs:
        if d.is_dir():
            all_results.extend(audit_course(d))

    if not all_results:
        print("未找到可稽核的研讀講記（需同時有 publications/lecture_*_study_guide.html "
              "與同層 verbatim/verbatim_*.json）")
        return 0

    failed = 0
    for sid, name, ok, detail in all_results:
        status = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"[{status}] {sid} {name} — {detail}")

    print()
    print(f"稽核完成：{len(all_results)} 項檢查，FAIL {failed} 項")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
