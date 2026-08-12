# Transcriptions (系列課程逐字稿多媒體學習平台)

[![GGF Governed](https://img.shields.io/badge/Governance-GGF%20v1.1-blue.svg)](https://github.com/huanruilee/gx10-governance)
[![QMS Compliant](https://img.shields.io/badge/Quality-QMS%20ISO%209001-green.svg)](docs/AGENT_GUIDELINES.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`Transcriptions` 是一個開源、模組化、高互動性的系列課程逐字稿多媒體學習平台專案。

本專案旨在將傳統影音與純文字逐字稿結合，提供**聲音與文字雙向同步高亮**、**可折疊科判 (TOC) 錨點 Seeking**、**自動換段與排版優化**、**集數 2A/2B 命名重構**以及**全文檢索與名詞註解**等學習功能。

第一階段以 **《入中論善顯密意疏》** 講記作為標竿示範課程。

---

## 🌟 核心功能特色 (Core Features)

1. 🗂️ **側邊欄與集數標示重構 (Sidebar & Session Naming)**
   - 將同日期的上下節課重構為 `2A / 2B`（標示為 `第 2A 堂 (上)` 與 `第 2B 堂 (下)`）。
   - 側邊欄統一顯示格式：`第 [X][A/B] 堂 | YYYY-MM-DD | p.XX`。
   - 點擊集數時同步更新右側主標題、網址 Hash (`#session-02A`) 與 `localStorage` 觀看紀錄。

2. 📑 **科判章節目錄 (Collapsible TOC & Audio Seek)**
   - 提供階層化、可折疊收折的科判選單 (`<details>` / `<summary>`)。
   - 點擊子項目觸發平滑文字滾動與音訊 `currentTime` 精確Seeking播放。

3. 📖 **逐字稿自動分段與排版美學 (Text Segmentation & Typography)**
   - 採用 `textSegmenter.js` 演算法，根據停頓時間 (`Silence > 1.5s`) 與語意標點/發語詞自動換段 (`<p>`)。
   - 優化視覺呼吸感：`line-height: 1.8;`, `margin-bottom: 1.2rem;`, 最大寬度 `800px`，字體選用思源宋體 (`Noto Serif TC`)。

4. 🎵 **音檔與文字雙向同步 (Audio-Text Sync & Auto Play)**
   - **Click-to-Seek**：點擊任何逐字稿句子或時間標籤即可播放該段音訊。
   - **Auto Highlight & Auto-Scroll**：音檔播放時，當前句自動套用高亮樣式並滾動至畫面中央。
   - **手動滾動防干擾 (Scroll Lock)**：讀者手動滑動頁面時暫停自動跳轉，保護閱讀體驗。
   - **連續播放**：當 2A 堂音檔結束時，自動載入並接續播放 2B 堂音檔與逐字稿。

5. 🔍 **檢索與輔助學習 (Search & Tooltips)**
   - 支援全文關鍵字搜尋高亮與佛學專有名詞 Tooltip 浮動註解。

---

## 📁 儲存庫結構 (Repository Layout)

```text
Transcriptions/
├── START_HERE.md                       # 小法 Agent 進入點與 GGF 啟動聲明
├── README.md                           # 專案總覽與使用指南
├── LICENSE                             # MIT 授權條款
├── package.json                        # NPM 配置與測試腳本
├── .gitignore                          # 系統與快取忽略清單
├── docs/
│   ├── SPECIFICATION.md                # 系統 4 大核心改進與 UI 規格書
│   ├── DATA_SCHEMA.md                 # 課程/科判/逐字稿 JSON Schema 規範
│   ├── AGENT_GUIDELINES.md             # GGF 治理原則與小法作業 SOP
│   └── TASKS.md                        # 小法待辦任務清單 (GGF Task Backlog)
├── courses/
│   └── 入中論善顯密意疏/
│       ├── course.json                 # 課程詮釋資料
│       ├── toc.json                    # 科判章節目錄與時間戳
│       └── sessions/                   # 各堂逐字稿 JSON (01, 02A, 02B...)
├── src/
│   ├── index.html                      # 主介面 HTML
│   ├── css/
│   │   ├── main.css                    # 排版美學與設計系統
│   │   └── theme.css                   # 深色/淺色主題控制
│   └── js/
│       ├── app.js                      # 應用程式進入點與數據載入
│       ├── sidebar.js                  # 2A/2B 側邊欄與標題同步
│       ├── toc.js                      # 可折疊科判與 Seek 組件
│       ├── textSegmenter.js            # 自動換段演算法
│       ├── timeAligner.js              # 二分搜尋時間軸對齊器
│       ├── syncPlayer.js               # 音文同步、滾動防打架與連播
│       ├── search.js                   # 關鍵字搜尋引擎
│       └── tooltips.js                 # 專有名詞 Tooltip 處理
└── tests/
    ├── unit/
    │   ├── textSegmenter.test.js       # 分段演算法單元測試
    │   └── dataSchema.test.js          # JSON Schema 驗證測試
    └── integration/
        └── audioSync.test.js           # 音文同步整合測試
```

---

## 🚀 本地開發與測試 (Local Development & Testing)

### 1. 複製專案
```bash
git clone https://github.com/huanruilee/Transcriptions.git
cd Transcriptions
```

### 2. 執行自動化測試 (GGF Evidence Verification)
```bash
npm test
```

### 3. 啟動本地開發服務
```bash
npm run dev
# 或使用任何 HTTP 靜態服務開啟 src/index.html
```

---

## 🤖 小法 (gx10 Agent) 協作說明

本專案遵循 `gx10-governance` (GGF v1.1) 治理規範。當小法 (gx10 Agent) 進入本 repo 時，請優先閱讀 `START_HERE.md` 與 `docs/AGENT_GUIDELINES.md` 以取得開發授權與 SOP。

---

## 📜 授權條款 (License)

本專案採用 [MIT License](LICENSE) 開源授權。
