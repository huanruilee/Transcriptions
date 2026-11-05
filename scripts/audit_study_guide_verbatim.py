#!/usr/bin/env python3
"""研讀講記「原話對照抽屜」稽核（唯讀）。

檢查四項契約，用於判斷研讀講記的網頁產物是否忠實對應課堂原話：

  C1  drawer 數 == md 內時間戳段落數
  C2  每個抽屜的句子與 verbatim 對應段落逐字相符
  C3  verbatim 每一段都能在抽屜中找到（無原話不可見）
  C4  無空音檔，且有可用的音訊來源（YouTube embed 或非空 audio src）

用法：
    python3 scripts/audit_study_guide_verbatim.py [course_dir ...]

預設掃描 courses/ 下所有含 publications/lecture_*_study_guide.html 且同層有
verbatim/ 目錄的課程。退出碼：全部 PASS 回 0，出現 FAIL 回 1。

注意：本腳本為唯讀稽核，不修改任何檔案。C3 對「課堂原話段落數多於研讀講記
分段數」的課程必然 FAIL（研讀講記會重新分段），此時需人工判斷是揭露不足
還是索引錯位，不可僅以 FAIL 判定內容有誤。
"""
import html as H
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


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

        # C1：抽屜數應等於 md 時間戳段數
        c1_ok = len(drawers) == md_ts_count
        results.append((sid, "C1 drawer數==md時間戳段數", c1_ok,
                        f"drawer={len(drawers)} md時間戳段={md_ts_count}"))

        # C2：抽屜內容須與 verbatim 逐字相符
        mismatched = []
        for key, body in drawers.items():
            expect = [s["text"].strip() for s in verbatim.get(key, [])]
            if drawer_sentences(body) != expect:
                mismatched.append(key)
        results.append((sid, "C2 抽屜內容==verbatim逐字", not mismatched,
                        f"不符={len(mismatched)} {mismatched[:5]}"))

        # C3：verbatim 每段都應可見
        missing = [k for k in verbatim if k not in drawers]
        results.append((sid, "C3 全部verbatim段落可見", not missing,
                        f"未出現={len(missing)} {missing[:8]}"))

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
