# Transcriptions (系列課程逐字稿多媒體學習平台)

[![100% Complete](https://img.shields.io/badge/Progress-199%2F199%20(100%25)-brightgreen.svg)](https://huanruilee.github.io/Transcriptions/)
[![Quality Score](https://img.shields.io/badge/Quality%20Score-10.0%2F10.0%20(Full%20Pass)-blue.svg)](docs/ASR_M1_FINAL_CLOSURE_REPORT.md)
[![ASR Gate Passed](https://img.shields.io/badge/ASR--M2%20Gate-6%2F6%20Passed-success.svg)](tests/unit/asrIntegrityGate.test.js)
[![GGF Governed](https://img.shields.io/badge/Governance-GGF%20v1.1-blue.svg)](https://github.com/huanruilee/gx10-governance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`Transcriptions` 是一個開源、高精度、具備主動學習與自進化能力的系列課程逐字稿多媒體學習平台。

本專案已圓滿完成 **《入中論善顯密意疏》全系列 199 講（共 166.3 小時、71,842 句、186 萬字）** 的全量 Grounded 高精度語音轉寫，提供**微秒級聲音文字雙向同步高亮**、**可折疊科判 (TOC) 錨點 Seeking**、**1～10 分線上 Review 評分工單**與**主動學習防誤判自進化**等前沿學習功能。

🌐 **線上正式閱讀器**：👉 **[https://huanruilee.github.io/Transcriptions/](https://huanruilee.github.io/Transcriptions/)**

---

## 📚 專案核心文件索引 (Documentation Index)

* 📖 **[系統介紹與使用說明 (User Guide)](docs/USER_GUIDE.md)**：一般讀者與法友專屬的介面功能導覽、三分鐘快速上手與操作小技巧。
* 🔬 **[完整可複現性指南 (Reproducibility Guide)](docs/REPRODUCIBILITY_GUIDE.md)**：開發者與 AI Agent 專屬的環境建置、GPU 端點、批次流水線與自進化 SOP。
* 📜 **[199 講全量完工結案報告 (Final Project Closure Report)](docs/ASR_M1_FINAL_CLOSURE_REPORT.md)**：量化數據指標、品質評分、技術突破與架構圖。
* 🛡️ **[ASR-M2 品質防退化門禁測試](tests/unit/asrIntegrityGate.test.js)**：Schema 契約、時間戳單調性、文字純度與名相黑名單。
* 🧠 **[主動學習三級語境歧義仲裁引擎](scripts/active_learning_manager.py)**：防止同音字誤判（如十地「二地」vs「二諦」）的閉環自進化機制。

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
