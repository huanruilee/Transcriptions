# TASKS.md — 專案開發任務 Task Backlog

本文件記錄 `Transcriptions` 平台之階段性開發任務清單與完成狀態。小法 (gx10 Agent) 依此追蹤與更新進度。

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
