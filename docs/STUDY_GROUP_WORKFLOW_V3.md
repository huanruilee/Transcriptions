# 《2025 釋量論・第二品》大組共學全課程精煉與講記補完工作流（Workflow v3）

本文件記錄 `courses/2025釋量論第二品大組共學` 全課程 47 講（`session_01`–`session_46` 含 `27B`）由 Wave 1 先導試點至全課程四波次迭代優化後的定版自動化工作流與 Prompt 規格，實作腳本位於 [upgrade_study_group_course.mjs](../scripts/upgrade_study_group_course.mjs)。

---

## 一、四波次迭代演進（Workflow v1 → v3）

| 版本 | 對應波次與範圍 | 發現之真實缺口 | 流程與 Prompt 改進措施 |
| :--- | :--- | :--- | :--- |
| **v1** | Wave 1（`session_23` / `12下` 試點） | 1. 僅改 `session` 未同步 `toc.json`（UI 仍見大量碎題）。<br>2. 主持人接引語（「請法師」「法師請說」）使同段法師開示被錯標為 `學員`。<br>3. `teacherSummary`、`heading` 與 `studyScaffolding` 仍殘留同音錯別字（如「胡稱／弗稱」）。<br>4. 改字後未重算 `contentOverview.sourceDigest`，導致稽核失敗。 | 建立三位一體同步原則、轉接語境自動校準、`sentences[].rawText` 零更動之全欄位法義詞庫校對，以及修改後重算 `sourceDigest`。 |
| **v2** | 初始批次流水線架構 | 需要將單講人工經驗轉為低雲端 Token 消耗之自動化雙階段 Prompt，並保留 `session_01`（SHA-256 鎖定）、`14/15/20/21` mapping IDs、`24` 數量不等式、`27B` 1:1 摘要、`34` 未綁定與 `46` >= 25 小標等測試合約。 | 設計 `Prompt A`（精煉 3–7 核心問句、6–8 小標與 4–6 段開示摘要）與 `Prompt B`（補完截斷講記），於各波次後跑自動化合約測試。 |
| **v2.1** | Wave 2（`23, 34, 41–46, 27B` 共 9 講） | 1. `normalizeBuddhistText` 將 URL 中的 `?v=` 誤轉成全形 `？v=`，導致 [render_study_guide_html.py](../scripts/render_study_guide_html.py) 無法解析 `youtubeVideoId`、`原話抽屜數` 歸零。<br>2. 直接呼叫 `hermes chat` CLI 在並發下因本地 `state.db` 鎖定與離線輔助端點探測而逾時（`42–45` 回退）。<br>3. 截斷講記尾端出現未閉合下引號「`」及口語回退片段。 | 1. 在符號正規化前遮罩保護所有 `https?://...` URL。<br>2. 優先採 IPv4 SSE 串流直連 `eNeural / glm53-flash`（失敗才退回 `hermes` CLI）。<br>3. 補齊引號自動閉合、`Prompt B` 第三人稱聞思筆記規範及 `BUDDHIST_TERM_REPLACEMENTS` 防誤殺守衛（避開 `無法值遇`、`建立他宗`）。 |
| **v2.2** | Wave 3（中段 21 講 `18–22, 24–33, 35–40`） | 1. 模型於長課時段輸出 `[▶ 01:10:18]`（`HH:MM:SS`）格式，未匹配 `[▶ mm:ss]` 時間按鈕規則，11 份講記後半段未轉為可點擊按鈕與原話抽屜。<br>2. 4 份講記 `[▶ mm:ss]` 與正文間多出空行，使 HTML 按鈕單獨佔據空段落。<br>3. 小標偶見多餘 `〔〕`、引號外重複句號 `。」。` 與「研讀講記指出」等後設語；`--only-study-guides` 誤裁 `42–45` 摘要。 | 1. 將 `snapMarkdownTimestampsToSession` 擴充支援 `HH:MM:SS` 並統一正規化為總分鐘 `[▶ mm:ss]`。<br>2. 自動合併時間戳與下文、剝除 `〔〕` 與 `([。！？])」。` 重複句點、清理後設自稱語。<br>3. 限定僅結構重建模式才調整 `teacherSummary` 數量。 |
| **v3** | Wave 4（前段 17 講 `01–17`）與全課程定版 | 1. 長課 `17A`、`17B` 因 `Prompt B` 檢核點採樣採 `0%–80%` 導致首輪停在 66%–68%，重跑又因缺少標題去重守衛造成 `###` 小標重複與時間錨點聚團。<br>2. 迴向偈語音錯別字（如「欲齒無上大師教」、「願成善士設受醫」）於多講重覆出現（同時尊重 `session_33` 原音核定合約 `皆由上師生恩故`）。 | 1. 將剩餘段落採樣改為 `20%–100%`（`Math.round(((k + 1) * (len - 1)) / targetParts)`），確保延伸至結勸與合掌迴向。<br>2. 於 `completeTruncatedStudyGuide` 新增 `###` 首標去重冪等守衛。<br>3. 納入迴向偈正字正規化規則，全課程 47 講講記涵蓋率與抽屜數全數達標。 |

---

## 二、低成本雙階段 Prompt 規格（Workflow v3 定版）

全流程使用 `eNeural / glm53-flash`（IPv4 SSE 串流、`reasoning_effort: "none"`），單講僅送出壓縮摘錄（約 3–9 KB），絕不整篇送審，搭配快取目錄實現冪等重跑：

### Prompt A：教學結構精煉與法師摘要擷取

```text
請為《2025釋量論大組共學》第{displaySessionId}講（{sessionId}）做教學結構精煉，僅回傳純 JSON（無多餘文字），一律用正體中文，嚴禁簡體字與空泛詞（如深入探討、綜上所述）。
標題：{session.title}
科判:{sourceOutline.courseOutline}
原題:{sourceOutline.discussionOutline 前8題摘要}

原討論微題(idx@秒:摘要)：
{壓縮抽樣微題清單}

法師關鍵指導段(pId@秒:摘要)：
{均勻抽樣 >=90字 法師段落清單}

要求JSON格式：
{
  "questions": [
    {"startQIdx": 0, "title": "第1題：完整精確的核心討論問句（必以？結尾，25-65字）？"}
  ],
  "headings": [
    {"startSec": 120, "title": "簡明段落小標（12-28字，標示學員發表或法師指導焦點）"}
  ],
  "teacherSummaries": [
    {"paragraphId": "p_0010", "items": ["法師開示重點1（具體教理或譬喻）", "重點2"]}
  ]
}
規則：
1. questions 共 {targetCount} 題，按 startQIdx 嚴格遞增覆蓋全講各討論單元，每題必須融合原題與共學脈絡且以「？」結尾。
2. headings 共 6-8 個，按 startSec 嚴格遞增覆蓋開場、各題研討與法師總結。
3. teacherSummaries 共 4-6 個，paragraphId 必須選自上方列出的 pId 並按時序排列，每段給 2-3 條具體、不重複且忠實於法師原意的要點。
```

### Prompt B：截斷講記後半段補完（覆蓋 `72%` 以上缺口）

```text
你是一位佛學《釋量論》講記編輯。下方是一份第{displaySessionId}講（{title}）研讀講記的後半段補完任務。
影片URL：{videoUrl}
目前文章已寫至秒數 {lastTs}s（全長約 {dur}s），討論題目：
{已定稿核心討論題目清單}

請根據以下剩餘段落與結尾原話摘要，撰寫 3 至 5 節正文續寫（Markdown 格式，僅輸出續寫的新增章節本身，不要重複開頭或前面已寫的內容）：
{依 20%-100% 區間抽樣之 @秒數 與摘要}
[結尾原話參考]：{末3段話尾180字}

輸出格式與文體嚴格規定：
1. 每節以 `### 節次小標` 開頭（請勿使用 `〔〕` 括住標題），後空一行接一段第三人稱聞思筆記式闡述（如「法師進一步指出……」「針對此一問題，課堂研討釐清……」，嚴禁出現「研讀講記指出」「本講記整理時」等後設自稱），字數 150-240 字，正體中文，標點完整，不捏造未講內容，不可直接貼上口語碎片。
2. 每段開頭必須使用總分鐘格式（例如 `[▶ 70:18]({videoUrl}#t=4218)`，嚴禁使用 `01:10:18` 小時三段格式），並緊接一格半形空格與正文寫在同一行（切勿在時間連結後換行），SEC 按時序嚴格遞增且 > {lastTs}。
3. 最後一節務必總結法師結勸與大眾合掌誦念迴向（若結尾原話有提及「願成善士攝受因」則如實記載），且引號內已有句號時勿再於引號外重複加句號。
```

---

## 三、確定性防護網與驗收門檻

1. **原話零汙染與 URL 保護**：所有校字與標點正規化嚴格排除 `sentences[].rawText`，並於替換 `? -> ？` 前暫存保護全部 HTTP(S) URL。
2. **時間軸對齊與抽屜生成**：Markdown `[▶ mm:ss](url#t=SEC)` 一律透過 `snapMarkdownTimestampsToSession` 遞增對齊 `session_XX.json` 實句起點後，再交由 [render_study_guide_html.py](../scripts/render_study_guide_html.py) 生成含 `.verbatim-drawer` 的 HTML。
3. **導讀摘要與合約鎖保護**：每次更動後執行 [content_overview_pipeline.mjs](../scripts/content_overview_pipeline.mjs) 驗證與 `sourceDigest` 同步；維持 `session_01.json` 零變動及所有單元測試合約，並透過以下回歸測試把關：
   - [studyGroup27Prototype.test.js](../tests/unit/studyGroup27Prototype.test.js)（全課程 47 講 TOC 同步、問句、說話者與講記完整性檢查）
   - [studyGroupSourceMapping.test.js](../tests/unit/studyGroupSourceMapping.test.js)
   - [studyGroupSession01RemoteReviewBundle.test.js](../tests/unit/studyGroupSession01RemoteReviewBundle.test.js)
   - [studyGuideDrawerTimestampAlignment.test.js](../tests/unit/studyGuideDrawerTimestampAlignment.test.js)
   - [studyGuideVerbatimCoverage.test.js](../tests/unit/studyGuideVerbatimCoverage.test.js)
