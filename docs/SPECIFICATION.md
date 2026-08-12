# SPECIFICATION.md — 逐字稿系統核心改進規格書

本規格書為 `Transcriptions` 平台開發與改進之唯一權威規格文件（Source of Truth）。所有元件開發與重構均須嚴格遵照本規範落實。

---

## 1. 🗂️ 側邊欄目錄與集數標示重構 (Sidebar & Session Naming)

### 痛點背景
同日期的課程拆分為上下兩節，原選單出現重複的數字（如兩個 2、兩個 3），讀者無法區分節次。

### 規格規範
1. **集數後綴重構**：
   * 同日期的上、下兩節課統一重構標示為 `2A` 與 `2B`（顯示文字：`第 2A 堂 (上)` 與 `第 2B 堂 (下)`）。
   * 原始音檔目錄來源：[https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68](https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68)。
   * **音檔存放規範**：音檔留在 `gx10` 伺服器 workspace/gdrive，**嚴禁將 .mp3 上傳至 GitHub**。GitHub 僅存放程式碼、規格、Schema、JSON 與測試。
2. **統一顯示格式**：
   * 側邊欄每項固定格式：`第 [X][A/B] 堂 | YYYY-MM-DD | p.XX`（例：`第 2A 堂 | 2016-05-28 | p.63`）。
3. **標題與狀態同步 (Title & State Sync)**：
   * 點擊側邊欄項目切換集數時，右側逐字稿頂部 H1 主標題同步更新（例：`第 2A 堂 - 2016-05-28 (上節 p.63)`）。
   * 網址 Hash 自動同步至 `#session-02A`。
   * 將使用者最後瀏覽集數寫入 `localStorage.setItem('last_session_id', '02A')`。

---

## 2. 📑 章節目錄功能實作 (Table of Contents / TOC)

### 痛點背景
目前的章節目錄區塊為靜態文字連結，缺乏科判（判教體系）的階層架構與折疊收折機能。

### 規格規範
1. **可折疊科判選單**：
   * 採用 HTML5 原生 `<details>` 與 `<summary>` 標籤，或是現代 Accordion UI 組件。
   * 支援二層以上嵌套（例：`第六地現前地 ➔ 訓釋 ➔ 慧度真聖`）。
2. **錨點與音檔跳轉 (Anchor & Seeking)**：
   * 點擊 TOC 子項目（例如 `[11:30] 第六地「現前地」之訓釋`）時，同時觸發：
     1. **文字平滑滾動 (Smooth Scroll)**：右側逐字稿滾動至對應章節段落。
     2. **音檔精確 Seek 與播放**：底欄音訊播放器 `audio.currentTime = timestamp; audio.play();`。

---

## 3. 📖 逐字稿自動分段與語法排版 (Text Segmentation & Typography)

### 痛點背景
原始 ASR 逐字稿缺乏段落切分，形成密集「文字牆」，造成閱讀疲勞。

### 規格規範
1. **自動分段演算法 (`textSegmenter.js`)**：
   * **時間間隔規則**：相鄰兩句的時間差 `(next.start - current.end) > 1.5s` 觸發強制換段。
   * **語意與標點規則**：累積標點符號 (`。！？`) 滿 3~5 句，且遭遇語意轉折/發語詞（如「好、總之、接下去、另外」）時觸發換段。
   * 輸出為標準 HTML `<p class="paragraph">` 標籤。
2. **視覺美學與閱讀版面 (Typography)**：
   * **段落間距**：`margin-bottom: 1.2rem;`
   * **行高設定**：`line-height: 1.8;`
   * **閱讀寬度限制**：文字內容區設定 `max-width: 800px;`（置中，避免過長單行造成眼睛追蹤疲勞）。
   * **字體選用**：優先採用 **思源宋體 / Noto Serif TC** 或系統襯線字體，提升經論閱讀質感。

---

## 4. 🎵 音檔與逐字稿雙向同步 (Audio-Text Synchronization)

### 痛點背景
缺乏聲音與文字的動態聯動，讀者無法點擊文字聽聲音或邊聽邊對照當前文字。

### 規格規範
1. **點擊跳轉 (Click-to-Seek)**：
   * 時間標籤或逐字稿句子節點統一標註 `data-start` 與 `data-end` 屬性。
   * 點擊文字區塊即可跳轉設定音檔播放時間 `audio.currentTime = parseFloat(element.dataset.start);`。
2. **自動高亮與居中滾動 (Auto Highlight & Auto-scroll)**：
   * 監聽 `bottomAudio` 的 `timeupdate` 事件。
   * 使用 $O(\log N)$ 二分搜尋 (`timeAligner.js`) 尋找當前秒數句子，動態切換 `.active` 高亮樣式。
   * 觸發 `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`，讓目前播放位置維持在螢幕視覺中央。
3. **手動滾動防干擾機制 (Scroll Lock)**：
   * 監聽 `wheel` 與 `touchmove` 事件。
   * 當讀者手動滑動頁面瀏覽其他段落時，暫停自動滾動 4 秒，避免滾動位置被播放進度強制拉回。
4. **連續播放 (Auto Play Queue)**：
   * 監聽播放器 `audio.addEventListener('ended', ...)`。
   * 當 2A 堂音檔播放結束時，自動載入並接續播放 2B 堂音檔與逐字稿，側邊欄 active 狀態自動遞移。

---

## 5. 📖 頁碼與原文出處對照 (Page Citation & Source Mapping)

### 痛點背景與小法日誌洞察
根據小法 (gx10 Agent) 教練日誌（*「把查原文從驗證變成敘述的組成部分」*），長篇經論講記學習必須具備精確的頁碼出處標註。讀者聽講時需要對照《入中論善顯密意疏》實體書頁碼（如 `p.63`）。

### 規格規範
1. **段落頁碼標記 (Page Citation Tag)**：
   * 逐字稿段落標記出處頁碼（例：`[p.63]`）。
2. **MacWhisper 原始檔名自動轉換器 (`scripts/convert_macwhisper.py`)**：
   * 小法可使用轉換腳本自動解析 MacWhisper 的產出檔名：`YYYYMMDD-[A/B] 課程名稱-科判pXX(堂數).txt` 或 `.whisper`，自動提取 `date`, `subSession ('A'/'B')`, `pageRange`, `sessionNum` 並產出標準 `session.json`。
