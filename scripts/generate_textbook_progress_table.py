#!/usr/bin/env python3
"""
generate_textbook_progress_table.py - Generate comprehensive textbook page progression table
for 《入中論善顯密意疏》 to serve as ground-truth reference for proofreading & alignment.
"""

import json
import re
from pathlib import Path

COURSE_JSON_PATH = Path("courses/入中論善顯密意疏/course.json")
CATALOG_PATH = Path("courses/入中論善顯密意疏/source_text/catalog.json")
OUTPUT_PATH = Path("courses/入中論善顯密意疏/TEXTBOOK_PROGRESS_TABLE.md")

def main():
    with open(COURSE_JSON_PATH, "r", encoding="utf-8") as f:
        course_data = json.load(f)

    catalog = {}
    if CATALOG_PATH.exists():
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            catalog = json.load(f)

    sessions = course_data.get("sessions", [])

    lines = []
    lines.append("# 《入中論善顯密意疏》格西課堂進度與課本頁數對照表")
    lines.append("")
    lines.append("> **📌 核心用途**：本表彙整全 198 堂格西授課錄音、授課日期、對應《入中論善顯密意疏》真值底本頁碼（Page Range）、科判大綱與法義主題，作為 AI 與人工法義校對、真值名相溯源及時間軸聲學定位之權威基準對照表。")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🧭 一、科判體系與全書六大分期概覽")
    lines.append("")
    lines.append("| 分期階段 | 課堂講次 | 善顯底本頁碼 | 科判大綱與核心主題 | 義理核心要點 |")
    lines.append("| :--- | :--- | :--- | :--- | :--- |")
    lines.append("| **第一期：序論與前五地** | 第 01 ~ 05A 堂 | p.63 ~ p.70 | **甲一 歸敬頌 ～ 乙二 說入大乘之次第** | 讚大悲心、造論宗旨、初地極喜地（施度）至五地難勝地（戒、忍、進、禪） |")
    lines.append("| **第二期：第六地甚深空性（破四生）** | 第 05B ~ 34B 堂 | p.70 ~ p.105 | **丁二 明第六地之體性（破生）** | 破自生（數論）、破他生、世俗諦與勝義諦二諦建立、破共生與無因生 |")
    lines.append("| **第三期：第六地破唯識與法無我** | 第 35A ~ 60B 堂 | p.106 ~ p.190 | **明唯識宗失壞二諦與以理破執** | 破阿賴耶識、破自證分、以緣起理破除實事師法我執 |")
    lines.append("| **第四期：第六地以理成立人無我** | 第 61A ~ 78B 堂 | p.191 ~ p.244 | **癸二 以理成立人無我（七相車喻）** | 破二十種薩迦耶見、七相推求成立人無我、名言安立我與法 |")
    lines.append("| **第五期：七地至十地與佛地果德** | 第 79A ~ 102B 堂 | p.245 ~ p.268 | **庚一至庚四 後四地 ～ 丙二 明果德** | 遠行地至法雲地、佛地三身建立、佛之十力、四無畏、大悲利生不息事業 |")
    lines.append("| **第六期：甚深中觀專題提撕與復習** | 第 103A ~ 110B 堂 | p.45 ~ p.63 (專題) | **中觀義理深究與難點通貫** | 實執斷除界限、二諦雙融、名言正量與勝義正量之辨析 |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 📖 二、全 198 講次課堂進度、課本頁數與原始音檔對照表")
    lines.append("")
    lines.append("| 講次 | 授課日期 | 善顯底本頁碼 | 🎧 原始音檔連結 | 科判主題與課堂開示摘要 | 底本對應關鍵科文/偈頌 |")
    lines.append("| :--- | :--- | :--- | :--- | :--- | :--- |")

    # Pre-extract section headings for all pages
    page_headings = {}
    for pt in Path("courses/入中論善顯密意疏/source_text").glob("page_*.txt"):
        try:
            pnum = int(re.search(r'\d+', pt.name).group())
            txt = pt.read_text(encoding="utf-8")
            h_matches = re.findall(r'([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]\s*[一二三四五六七八九十]+[、\s][^\n\r]+)', txt)
            if h_matches:
                clean_h = re.sub(r'\s+', ' ', h_matches[0]).strip()
                if len(clean_h) > 30:
                    clean_h = clean_h[:28] + "..."
                page_headings[pnum] = clean_h
        except Exception:
            pass

    for s in sessions:
        sid = s.get("sessionId", "")
        date = s.get("date", "—")
        prange = s.get("pageRange", "—")
        audio_url = s.get("audioUrl", f"https://buddha.flyday.com.tw/{sid}.MP3")
        summary = s.get("summary", "").replace("\n", " ").strip()
        
        # Parse page numbers
        p_nums = [int(n) for n in re.findall(r'\d+', prange)]
        section_h = "—"
        preview_text = "—"
        if p_nums:
            p_first = p_nums[0]
            # Get treatise heading
            if p_first in page_headings:
                section_h = page_headings[p_first]
            elif (p_first - 1) in page_headings:
                section_h = page_headings[p_first - 1]
            
            # Get preview
            p_str = str(p_first)
            if p_str in catalog:
                raw_p = catalog[p_str].get("preview", "").replace("\n", " ").strip()
                raw_p = re.sub(r'^\d+\s*', '', raw_p) # remove leading page num
                if len(raw_p) > 35:
                    raw_p = raw_p[:32] + "..."
                preview_text = raw_p

        # Clean summary
        if not summary or summary.startswith("嗯") or summary.startswith("對") or summary.startswith("OK") or summary.startswith("像"):
            if section_h != "—":
                summary_display = f"【科判】{section_h}"
            else:
                summary_display = summary[:45] + "..." if len(summary) > 45 else summary
        else:
            summary_display = summary[:50] + "..." if len(summary) > 50 else summary

        audio_link = f"[{sid}.MP3 ↗]({audio_url})" if audio_url else "—"
        lines.append(f"| **第 {sid} 堂** | {date} | `{prange}` | {audio_link} | {summary_display} | {preview_text} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🔄 三、同一課文位置之多講次交叉對照表（深度辯析與跨期呼應）")
    lines.append("")
    lines.append("> 當格西在多堂課中講述、辯析或複習同一頁課文時，本表將相關講次、授課日期、原始音檔與各堂側重焦點並列，方便校對者與學習者**同時交叉參照**。")
    lines.append("")
    lines.append("| 善顯底本頁碼 | 涵蓋講次列表 | 授課日期與音檔連結 | 科判主題大綱 | 課堂焦點與辨析要點 |")
    lines.append("| :--- | :--- | :--- | :--- | :--- |")

    # Build shared page map
    from collections import defaultdict
    page_to_s_list = defaultdict(list)
    for s in sessions:
        pr = s.get("pageRange", "").strip()
        if pr:
            page_to_s_list[pr].append(s)

    def sort_p_key(p):
        nums = re.findall(r'\d+', p)
        return int(nums[0]) if nums else 9999

    for pr in sorted([p for p in page_to_s_list if len(page_to_s_list[p]) >= 2], key=sort_p_key):
        s_list = page_to_s_list[pr]
        p_nums = [int(n) for n in re.findall(r'\d+', pr)]
        p_num = p_nums[0] if p_nums else 0
        
        section_h = page_headings.get(p_num, page_headings.get(p_num - 1, "—"))
        
        sids_text = "、".join([f"**第 {s['sessionId']} 堂**" for s in s_list])
        links_list = []
        for s in s_list:
            sid = s['sessionId']
            sdate = s['date']
            surl = s.get('audioUrl', f"https://buddha.flyday.com.tw/{sid}.MP3")
            links_list.append(f"• 第 {sid} 堂 ({sdate})：[{sid}.MP3 ↗]({surl})")
        links_text = "<br>".join(links_list)
        
        focus_items = []
        for s in s_list:
            sum_t = s.get("summary", "").replace("\n", " ").strip()
            if sum_t and not sum_t.startswith("嗯") and not sum_t.startswith("對") and not sum_t.startswith("OK"):
                focus_items.append(f"• **第 {s['sessionId']} 堂**：{sum_t[:45]}...")
            else:
                focus_items.append(f"• **第 {s['sessionId']} 堂**：課堂深究辯析與問答")
        focus_text = "<br>".join(focus_items)

        lines.append(f"| `{pr}` | {sids_text} (共 {len(s_list)} 堂) | {links_text} | {section_h} | {focus_text} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🔍 四、校正應用與檢索指南")
    lines.append("")
    lines.append("1. **法義與名相精準校正**：校對錄音時，若遇專用名相（如「七相推求」、「薩迦耶見」、「自相有」、「實事師」、「自證分」），可直接依本表定位底本頁數 `courses/入中論善顯密意疏/source_text/page_XXX.txt` 進行原文比對。")
    lines.append("2. **科判大綱劃分（Step 4 小標題）**：本表分期對照可作為篇章轉折與小標題結構之權威範疇依據。")
    lines.append("3. **跨講次義理連貫性檢驗**：同一個論題（如「破自生」橫跨第 20A~24A 堂，「破唯識」橫跨第 35A~55B 堂）可參考相鄰講次底本頁碼連貫核驗。")
    lines.append("4. **多講次目錄跳轉**：平台科判章節目錄（TOC）已支援多講次 Badge 標籤，讀者可直接在同一科判條目下自由點選跳轉至提及該課文的各講次錄音。")
    lines.append("")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"✅ Successfully generated {len(lines)} lines at {OUTPUT_PATH}")

if __name__ == "__main__":
    main()

