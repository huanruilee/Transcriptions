#!/usr/bin/env python3
"""
scripts/sifayin_grounding.py

產生 courses/四法印/grounding.json（Step 0 知識包）：

  * entities／step0_entity_grounding：講師、頻道、教材的查證結果（含實測來源）
  * reference_materials：11 份官方整編逐字稿（SHA-256、local_path、取得時間）
  * high_frequency_doctrinal_terms：核心名相 + 「已觀測到的同音訛誤」
  * observed_homophone_corrections：由 correction_candidates.json 彙總的實測校正對
  * alignment_method：ASR 時間碼 + 官方底本字級對齊 + 提綱切段

術語的 misrecognitions 不是憑印象寫的：只收錄在 `correction_candidates.json`
裡實際出現過的 asrDelta→referenceDelta 對，並把單字對延伸回底本中出現的詞語。
"""

import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "四法印"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

COMPARABLE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")

SEED_TERMS = [
    "四法印", "三法印", "諸行無常", "有漏皆苦", "諸法無我", "涅槃寂靜",
    "四聖諦", "苦諦", "集諦", "滅諦", "道諦", "開經偈", "菩提心", "大悲心",
    "補特伽羅", "施設處", "取蘊", "常一自在的我", "輪迴", "解脫", "三寶",
    "因緣", "緣起", "無常", "無我", "空性", "执著", "煩惱",
]


def official_label(session_id: str) -> str:
    head = (COURSE_DIR / "source_text" / f"lecture_{session_id}.txt").read_text(encoding="utf-8")[:400]
    match = re.search(r"課程：(.+)", head)
    return match.group(1).strip() if match else ""


def terms_from_base_texts() -> Counter:
    counter = Counter()
    for path in sorted((COURSE_DIR / "source_text").glob("lecture_*.txt")):
        stream = "".join(COMPARABLE.findall(path.read_text(encoding="utf-8")))
        for n in (2, 3, 4, 5):
            for i in range(len(stream) - n + 1):
                counter[stream[i:i + n]] += 1
    return counter


def main() -> None:
    inventory = json.loads((EVIDENCE / "reference" / "reference_inventory.json").read_text(encoding="utf-8"))
    pair_counter = Counter()
    per_session = {}
    for folder in sorted(EVIDENCE.glob("playlist-*")):
        candidate_path = folder / "correction_candidates.json"
        if not candidate_path.exists():
            continue
        data = json.loads(candidate_path.read_text(encoding="utf-8"))
        session_id = data["sessionId"]
        applied = [c for c in data["applied"] if c["asrDelta"] and c["referenceDelta"]]
        for c in applied:
            pair_counter[(c["asrDelta"], c["referenceDelta"])] += 1
        per_session[session_id] = {
            "appliedCorrections": len(applied),
            "pendingReview": data["unresolvedCount"],
            "asrSegments": json.loads((folder / "raw_asr.json").read_text(encoding="utf-8"))["segmentCount"],
        }

    ngrams = terms_from_base_texts()

    def expand_to_term(fragment: str) -> str:
        """把單字訛誤延伸回底本實際出現的詞語（取頻率最高者）。"""
        if len(fragment) >= 2 and ngrams.get(fragment, 0) >= 3:
            return fragment
        best = None
        for gram, count in ngrams.items():
            if count < 3 or len(gram) < 3 or len(gram) > 5:
                continue
            if fragment in gram:
                if best is None or count > best[1]:
                    best = (gram, count)
        return best[0] if best else fragment

    misrec_by_term = defaultdict(list)
    for (asr_part, ref_part), count in pair_counter.most_common():
        term = expand_to_term(ref_part)
        note = f"{asr_part}（{count} 次）"
        if note not in misrec_by_term[term]:
            misrec_by_term[term].append(note)

    doctrinal_terms = []
    seen = set()
    for term in SEED_TERMS:
        if term in seen:
            continue
        seen.add(term)
        entry = {"term": term, "baseTextFrequency": ngrams.get(term, 0)}
        if misrec_by_term.get(term):
            entry["observed_misrecognitions"] = misrec_by_term[term][:6]
        doctrinal_terms.append(entry)
    extra_terms = [
        {"term": term, "baseTextFrequency": count, "observed_misrecognitions": misrec_by_term[term][:6]}
        for term, count in ngrams.most_common(400)
        if count >= 8 and len(term) >= 3 and term not in seen and misrec_by_term.get(term)
    ][:20]
    doctrinal_terms.extend(extra_terms)

    grounding = {
        "courseId": "si-fa-yin",
        "title": "四法印（如性法師主講・2020 臺灣營隊）",
        "verified_at": datetime.now().strftime("%Y-%m-%d"),
        "step0_entity_grounding": {
            "note": "依 docs/TRANSCRIPTION_WORKFLOW.md §3 Step 0 執行。本課程每講 YouTube 描述均附官方整編逐字稿 PDF 與官方音檔，"
                     "故 Step 0 產物即該 11 份官方底本：名相與引文以底本為準，時間碼一律以 ASR 為準。",
            "probe_1_channel_and_instructor": {
                "query": "四法印 如性法師 如來法性影音頻道 營隊",
                "result": "如來法性影音頻道（channelId UCcL81Q7idwmC-AIFGtKt8Pg）播放列表 "
                          "PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl，共 11 支：導論《法師的教學藍圖與建議》＋四法印 10-1〜10-10。"
                          "底本首页：「講解：如性法師／日期：2020 年7 月26 日〜8 月2 日／地點：臺灣」。",
                "status": "verified",
                "evidence": "reviews/evidence/sifayin/playlist_inventory.tsv, video_metadata.tsv, courses/四法印/source_text/lecture_02.txt 首行",
            },
            "probe_2_textbook": {
                "query": "四法印 文字檔 官方 下載",
                "result": "每講描述提供「文字檔下載」Google Drive 連結（官方整編定稿，11/11 可下載）、"
                          "「電子書下載」與「聲音檔下載」；官方音檔長度與 YouTube duration 逐講一致（誤差 <1 秒）。",
                "status": "verified",
                "evidence": "reviews/evidence/sifayin/intake_manifest.json, reviews/evidence/sifayin/reference/README.md",
            },
            "probe_3_related_courses": {
                "query": "如性法師 三主要道 釋量論 平台既有課程",
                "result": "同頻道同講師的《三主要道》（san-zhu-yao-dao）與《2025 釋量論・第二品大組共學》已在平台上線，"
                          "可沿用其 video/youtube schema 與提綱切段做法；本課程另有官方底本，故採底本對校路徑。",
                "status": "verified",
                "evidence": "courses/san-zhu-yao-dao 之先例；tests/unit/sanZhuYaoDao.test.js",
            },
        },
        "entities": {
            "channel": {
                "name": "如來法性影音頻道",
                "channel_id": "UCcL81Q7idwmC-AIFGtKt8Pg",
                "playlist_id": "PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl",
                "playlist_url": "https://www.youtube.com/playlist?list=PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl",
                "soundcloud": "https://soundcloud.com/rulaifaxing",
            },
            "instructor": {
                "name": "如性法師",
                "tradition": "漢傳佛教・兼修藏傳格魯派五部大論",
                "venues": "2020 年臺灣營隊（第三營；第一營四聖諦、第二營《緣起讚》）",
                "common_misrecognitions": ["如信法師", "如心法師", "如興法師", "人性法師"],
            },
            "textbook": {
                "title": "《四法印》官方整編逐字稿（11 講）",
                "compiled_by": "如性法師主講，頻道助手整理定稿",
                "pages_total_observed": "17〜31 頁／講（見 reference/README.md）",
                "role": "edited-text-reference",
                "chapter_map": [
                    {
                        "session": f"session_{sid}",
                        "official_label": official_label(sid),
                    }
                    for sid in sorted(json.loads((EVIDENCE / "intake_manifest.json").read_text(encoding="utf-8"))["sessions"])
                ],
            },
        },
        "reference_materials": inventory["references"],
        "high_frequency_doctrinal_terms": doctrinal_terms,
        "observed_homophone_corrections": [
            {"asr": asr_part, "official": ref_part, "count": count}
            for (asr_part, ref_part), count in pair_counter.most_common()
        ],
        "per_session_asr_stats": per_session,
        "alignment_method": {
            "asr": "本地 whisper-gpu-service（/v1/audio/transcriptions, response_format=verbose_json, "
                   "language=zh, vad_filter=true, no_speech_threshold=0.6, condition_on_previous_text=true）；"
                   "時間碼全部來自 ASR segments。",
            "simplified_to_traditional": "OpenCC s2twp（venv: ~/projects/transcription-web/venv）。",
            "base_text_alignment": "python difflib.SequenceMatcher 字級對齊（只比對 CJK 字元），"
                                   "逐句取其對應的底本視窗做局部對齊。",
            "correction_policy": "只自動套用「同音／近音字替換且長度≤3、單次改動≤6 字」的差異"
                                 "（pypinyin 聲母韻母相同）；整編稿的口語刪節／改寫標記為 editorial-divergence，"
                                 "不覆寫講者口語；位置錯位者標記 reviewNeeded 交人工。",
            "paragraph_segmentation": "段落邊界取自每講 YouTube 描述的官方附時間碼提綱（sifayin_outline.py），"
                                      "小標即官方提綱條目；提綱缺失時明確回報，不猜測小標。",
            "scripts": [
                "scripts/sifayin_intake.py",
                "scripts/sifayin_outline.py",
                "scripts/sifayin_asr.py",
                "scripts/sifayin_build_transcript.py",
                "scripts/sifayin_evidence_docs.py",
                "scripts/sifayin_build_catalog.py",
                "scripts/sifayin_grounding.py",
            ],
        },
    }

    out = COURSE_DIR / "grounding.json"
    out.write_text(json.dumps(grounding, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[grounding] terms={len(doctrinal_terms)} pairs={len(pair_counter)} sessions={len(per_session)} -> {out.relative_to(BASE)}")


if __name__ == "__main__":
    main()
