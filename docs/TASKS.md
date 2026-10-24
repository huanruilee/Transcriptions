# TASKS.md — 專案開發任務 Task Backlog

## 流程權威入口（2026-10-23）

- [x] **SHILIANG31-READER-01**：第31講主閱讀器直接套用既有已核定重整版（545句／14標題／4項核定標點），來源、核定與時間均不改。Node驗證所有已發布核定講次皆啟用，App載入／失敗回退覆蓋30與31，browser依核定清單自動列舉，避免僅驗證第30講。課程publication metadata使用no-store，確保既有分頁刷新取得新入口設定；補舊快取回歸。主頁與下載以「重整版最後更新」顯示核定日期，底稿日期另標，避免誤認正式版尚未更新。

- [x] **READER-TEST-PATTERNS-01**：固定閱讀器入口整合、資料保真、失敗回退、實際下載一致性、日期更新追溯與部署版本 smoke 六層契約；補404／網路／過期來源／未核定內容UI測試，Pages上傳前與發布後執行桌面／手機Chromium，保存分階段驗收證據。範圍與命令見 [TESTING.md](../TESTING.md#閱讀器發布-test-patterns2026-10-24)。

- [x] **SHILIANG30-READER-01**：主閱讀器套用已閱讀核定的第 30 講重整段落；來源 session 與 publication 核定檔不變，檢查來源與內容 digest，保留全部 546 句 ID／時間。獨立顯示版面重整日期、未逐句聽核限制；下載沿用投影後正文與閱讀提醒。

- [x] **SESSION38A-FAITHFUL-01**：依 v1.0 完成 38A 忠實原話待閱校候選、來源帳本、GX10 ASR／LLM 證據及閱讀頁支援；驗證與限制見 [38A 交付說明](SESSION38A_FAITHFUL_READING.md)。人工聽核尚未完成，發布狀態不得標為已確認。

- [x] **WF-STANDARD-01**：統一 [逐字稿標準流程](TRANSCRIPTION_WORKFLOW.md) v1.0；接入根目錄 AGENTS、START_HERE、README 與舊文件導向，明確原話／精煉分軌及待閱校發布。交付驗證見 PR 證據；不代表已校訂任何新講次。
- [ ] **WF-STANDARD-02**：指定下一講時，先核對現有 UI／下載能否顯示待閱校狀態及修改追溯；缺功能再另立小範圍實作。低 Token 流程仍為 Draft。

本頁下方的全庫／網頁重構計畫是個別歷史任務，不因本流程更新而自動啟動。

本文件記錄 `Transcriptions` 平台之階段性開發任務清單與完成狀態。小法 (gx10 Agent) 依此追蹤與更新進度。

目前的逐字稿整理與網頁呈現重構，依
[`TRANSCRIPT_WEB_REFACTOR_RUNBOOK.md`](TRANSCRIPT_WEB_REFACTOR_RUNBOOK.md)
執行。該計畫目前狀態為 `SPECIFIED`，必須從 M0 baseline 開始，逐一通過 milestone gate。

---

## 🚩 Milestone 1: 基礎架構與 Schema 規範 (Foundation & Data Standards)

- [x] **Task 1.1**: 初始化 GitHub 儲存庫結構 (`docs/`, `courses/`, `src/`, `tests/`)。
- [x] **Task 1.2**: 撰寫 `docs/SPECIFICATION.md` 定義 4 大核心需求與 UI 規格。
- [x] **Task 1.3**: 撰寫 `docs/DATA_SCHEMA.md` 定義 `course.json`, `toc.json`, `session.json` Schema。
- [x] **Task 1.4**: 建立 `START_HERE.md` 與 `docs/AGENT_GUIDELINES.md`（GGF 治理與 Agent SOP）。
- [x] **Task 1.5**: 撰寫 Schema 驗證單元測試 `tests/unit/dataSchema.test.js`。

---

## 🚩 Milestone 2: 核心分段與對齊引擎 (Engine Development)

- [x] **Task 2.1**: 實作 `src/js/textSegmenter.js` 逐字稿自動換段演算法 (Silence > 1.5s & 語意斷句)。
- [x] **Task 2.2**: 實作 `src/js/timeAligner.js` $O(\log N)$ 二分搜尋時間軸對齊器。
- [x] **Task 2.3**: 撰寫 `tests/unit/textSegmenter.test.js` 單元測試。

---

## 🚩 Milestone 3: 前端介面重構 & 雙向同步模組 (UI Components & Sync Player)

- [x] **Task 3.1**: 實作 `src/js/sidebar.js` 2A/2B 命名重構與標題/Hash/localStorage 同步。
- [x] **Task 3.2**: 實作 `src/js/toc.js` 嵌套式折疊科判選單 (`<details>`) 與 Seeking 錨點。
- [x] **Task 3.3**: 設計 `src/css/main.css` 排版美學 (`line-height: 1.8`, `margin-bottom: 1.2rem`, Noto Serif TC)。
- [x] **Task 3.4**: 實作 `src/js/syncPlayer.js` 音文雙向同步 (Click-to-Seek, Auto Highlight, Scroll Lock, 2A➔2B 自動連播)。
- [x] **Task 3.5**: 整合小法原版搜尋與 Tooltip 模組 (`src/js/search.js`, `src/js/tooltips.js`)。

---

## 🚩 Milestone 4: 《入中論善顯密意疏》範例語料轉譯 (Course Data Ingestion)

- [x] **Task 4.1**: 建立 `courses/入中論善顯密意疏/course.json` 詮釋資料。
- [x] **Task 4.2**: 建立 `courses/入中論善顯密意疏/toc.json` 科判章節目錄。
- [x] **Task 4.3**: 建立首批講記 JSON `session_01.json`, `session_02A.json`, `session_02B.json`。

---

## 🚩 Milestone 5: GGF 品質驗證與自動化測試 (QA & Integration)

- [x] **Task 5.1**: 執行 `npm test` 自動化驗證，確保 0 錯誤並產生測試 Evidence。
- [x] **Task 5.2**: 提交並推送到 GitHub `https://github.com/huanruilee/Transcriptions`。

---

## 📊 課程語料轉譯進度 (Course Data Ingestion Progress)

**目標：106 堂完整數據鏈（session_01.json 至 session_106B.json）**

| 進度 | 堂數 | 狀態 |
|------|------|------|
| 第六現前地（sessions 1-68） | 101 個 session JSON | ✅ 已完成、已 commit、已部署 |
| 第一極喜地～第五難勝地（sessions 69-110） | 47 堂完成（69A-78B、79A-102B、103A-110B） | ✅ 本機可處理全部完成 |

**目前進度：199/106 堂 [188%]**（course.json 已登記至 199 sessions；含 27B 補做）

**最新一筆完成**：sessions 11-19 補轉譯（batch 14，2026-08-13，18 個 session JSON 全數完成，course.json 更新至 198 sessions）
*附註：2026-08-14 工作區發現 draft 狀態的 course.json 27B 條目 + session_27B.json + completion.test.js 199 預期值更新，已登錄但**未 commit**（歸屬待其他 agent 確認 commit 範圍）。*

### 已完成批次
- **Batch 1（sessions 1-15）**：QA 報告見 `docs/QA_BATCH1_REPORT.md`
- **Batch 2-7（sessions 16-68）**：session JSON 全數完成並 commit
- **Batch 8（sessions 69-70）**：ASR + RAG 校正完成，轉 session JSON 並 commit
- **Batch 9（sessions 105A, 105B, 106A）**：完成轉換、course.json 登記並 commit（`c134637`）
- **Batch 10（sessions 106B, 107A, 107B）**：完成並 commit（`c0c9c72`）
- **Batch 11（sessions 108A, 108B, 109A）**：完成並 commit（`5a88140`）
- **Batch 12（sessions 109B, 110A, 110B）**：完成並 commit（`b5df471`）— 本機可處理全部完成
- **Batch 13（sessions 79-102）**：47 堂 ASR + RAG 校正完成，轉 session JSON 並 course.json 登記
- **Batch 14（sessions 11-19）**：18 個 session JSON 補轉譯完成（11A-19B），course.json 更新至 198 sessions，commit `1803355`
- **Draft（2026-08-14）**：session_27B.json 補做下節（27A 2016-12-31 上節存在、27B 下節原稿存在於 Obsidian），course.json + completion.test.js 同步更新至 199 sessions；scripts/local_rag_correct.py 與 scripts/pilot_local_rag.py 為其他 agent 介入之草稿 — **尚未 commit**，待歸屬 agent 確認。

### 待辦
- [x] 下載缺失音檔（sessions 79-102 本地無音檔，需從官方目錄取得）— ✅ 從 flyday.com.tw 官方目錄下載 47 個 MP3 至 /home/henry/audio_files/
- [x] 對 sessions 79-102 取得官方音檔後再補轉譯 — ✅ 完成（batch 13）
- [x] 委派小檢 QA 抽樣檢驗 sessions 69-110 — ✅ 完成（QA_REPORT_79_102.md，平均 4.83/5.0）
- [ ] session_99B.json 補轉譯（99B 音檔僅有 A 段 20180922-A.mp3，缺 B 段音檔，無法 ASR）
- [ ] 請領域專家複審 toc.json 79-110 章節歸屬（QA 發現 79-84B 疑為第六地延續、95A/100A 子標題對應度偏弱）
