# 《入中論善顯密意疏》課程專屬指導（COURSE_GUIDE）

本文件適用 `courses/入中論善顯密意疏/` 之所有講記（`publications/lecture_*_study_guide.md`）、科判（`source_outlines/*.json`）與逐字稿（`sessions/session_*.json`）。在不牴觸 [全域逐字稿標準流程](../../docs/TRANSCRIPTION_WORKFLOW.md) 紅線之前提下優先適用。

## 1. 強制完整保留《善顯》課文原文（100% Verbatim Preservation）
- 凡講者（格西）唸誦、引用或解釋《入中論》頌文或宗喀巴大師《善顯密意疏》課文時，**必須逐字完整保留原文**於講記段落中，以粗體引號 `「**……**」` 標示，並與 `courses/入中論善顯密意疏/source_text/page_XXX.txt` 逐字核對。
- 嚴禁省略課文原文或以白話摘要取代，因為整堂講記皆為釋論課文而設。

## 2. 跨頁回看必查（Cross-Page Flashback Verification）
- 若講者於課堂中指示學員翻回或翻至其他頁次對照（例如從 p.109 翻回 p.104 比對名相），必須同步載入對應之 `source_text/page_XXX.txt`，完整收入引用原文並記錄講者辨析，不得略過。

## 3. 嚴禁超前幻覺與跨講次核對（Anti-Hallucination & Next-Session Cutoff）
- 必須完整檢視音訊尾端之原始逐字稿，並核對下一講次開頭（`session_{NEXT_SID}.json`）。
- 若助教／讀者於下課前唸出新科判標題卻因學員提問中斷、實際講解順延至下一講，必須如實記錄問答，嚴禁憑課文超前捏造尚未講解之科判內容。

## 4. 講記段落粒度與三位一體同步（Triad Synchronization）
- 講記正文應拆分為 20～30 個附時間戳（`[▶ mm:ss](url#t=sec)`）之自然段，確保滿足 `tests/acceptance/goldenStandard.test.js` 的句數密度契約（`1.5 <= avgSentences <= 8.0`）。
- 凡修改 `.md` 講記，必須透過 `scripts/render_study_guide_html.py` 與 `scripts/sync_study_guide_to_session.py {SID}` 同步至 `.html`、`source_outlines/{SID}.json` 與 `sessions/session_{SID}.json`，並執行 `npm run summaries:audit` 與 `node --test tests/acceptance/goldenStandard.test.js`。

## 5. 參考索引
- 教材進度表：[TEXTBOOK_PROGRESS_TABLE.md](TEXTBOOK_PROGRESS_TABLE.md)
- 教材原典文字：`courses/入中論善顯密意疏/source_text/page_XXX.txt`
