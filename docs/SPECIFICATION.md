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
   * **音檔存放規範**：音檔放置於 `gx10` 本機目錄 `/home/henry/audio_files/`，**嚴禁存放於 gdrive 或上傳至 GitHub**。GitHub 僅存放程式碼、規格、Schema、JSON 與測試。
   * **即時網頁預覽與部署 (Live Preview & Deployment)**：小法每完成一批次轉譯，必須同步更新 `gx10` 上的即時網頁服務 `https://gx10-2887.tail378c21.ts.net:9090/index.html`，讓 Henry 可以在小法作業期間邊做邊線上預覽！
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
原始 ASR 逐字稿缺乏自然語意段落切分，或僅以短句密集換行形成破碎文字牆，造成閱讀疲勞與視覺中斷。

### 規格規範
1. **閱讀雙模式切換 (Dual-View Reading System)**：
   * **閱讀模式 (Continuous Reading View - 預設)**：將同一語意段落（`paragraph`）內的句子串接成連續流暢的段落文字，句子間僅保留淡色時間錨點小標記（點擊仍可精確跳轉播放），並維持舒適的經文字距行距。
   * **對照模式 (Verbatim / Subtitle View)**：供邊聽邊校對、核字時使用，維持單句條列、時間軸、講者與信心狀態顯示。
2. **自動分段演算法 (`textSegmenter.js`)**：
   * **時間間隔規則**：相鄰兩句的時間差 `(next.start - current.end) > 1.5s` 觸發強制換段。
   * **語意與標點規則**：累積標點符號 (`。！？`) 滿 3~5 句，且遭遇語意轉折/發語詞（如「好、總之、接下去、另外」）時觸發換段。
   * 輸出為標準 HTML `<p class="paragraph">` 標籤。
3. **視覺美學與閱讀版面 (Typography)**：
   * **段落間距**：`margin-bottom: 1.4rem;`
   * **行高設定**：`line-height: 1.85;`
   * **閱讀寬度限制**：文字內容區設定 `max-width: 820px;`（置中，避免過長單行造成眼睛追蹤疲勞）。
   * **字體選用**：優先採用 **思源宋體 / Noto Serif TC** 或系統襯線字體，提升經論閱讀質感。
4. **ASR 異常與雜音的優雅容錯 (Graceful Audio Defect Handling)**：
   * 遇到連續重複幻覺或雜音亂碼時，嚴禁在正文中直接顯示破壞閱讀沉浸感的大段生硬警告。
   * 改用專屬的**「音訊瑕疵膠囊標籤」（Audio Defect Pill）**（例：`[⚠️ 音訊雜訊片段 0:15]`）收折呈現；讀者點擊可展開原始辨識內容或跳轉音訊聽核。

---

## 4. 🎵 音檔與逐字稿雙向同步 (Audio-Text Synchronization)

### 痛點背景
缺乏聲音、文字與導讀科判之間的動態聯動，讀者無法點擊文字聽聲音，且講記抽屜與主播放器分離。

### 規格規範
1. **點擊跳轉 (Click-to-Seek)**：
   * 時間標籤或逐字稿句子節點統一標註 `data-start` 與 `data-end` 屬性。
   * 點擊文字區塊即可跳轉設定音檔播放時間 `audio.currentTime = parseFloat(element.dataset.start);`。
2. **自動高亮與居中滾動 (Auto Highlight & Auto-scroll)**：
   * 監聽 `bottomAudio` 的 `timeupdate` 事件。
   * 使用 $O(\log N)$ 二分搜尋 (`timeAligner.js`) 尋找當前秒數句子，動態切換 `.active` 高亮樣式。
   * 觸發 `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`，讓目前播放位置維持在螢幕視覺中央。
3. **研讀講記與主播放器雙向聯動 (Study Guide Bi-directional Sync)**：
   * 講記抽屜（Study Guide Drawer）與主閱讀器必須透過狀態管理或 `postMessage` 雙向聯動：
     1. 點擊講記內的科判時間按鈕，主播放器立即跳轉對應時間並播放。
     2. 主播放器播放時，講記對應段落與左側科判樹同步高亮。
4. **手動滾動防干擾機制 (Scroll Lock)**：
   * 監聽 `wheel` 與 `touchmove` 事件。
   * 當讀者手動滑動頁面瀏覽其他段落時，暫停自動滾動 4 秒，避免滾動位置被播放進度強制拉回。
5. **連續播放 (Auto Play Queue)**：
   * 監聽播放器 `audio.addEventListener('ended', ...)`。
   * 當 2A 堂音檔播放結束時，自動載入並接續播放 2B 堂音檔與逐字稿，側邊欄 active 狀態自動遞移。

---

## 5. 📖 頁碼與原文出處對照 (Page Citation & Source Mapping)

### 痛點背景與小法日誌洞察
根據小法 (gx10 Agent) 教練日誌（*「把查原文從驗證變成敘述的組成部分」*），長篇經論講記學習必須具備精確的頁碼出處標註。讀者聽講時需要對照《入中論善顯密意疏》實體書頁碼（如 `p.63`）。

### 規格規範
1. **前置基礎知識研讀與底本固化（Course Grounding Phase）**：
   * 在開始任何新課程轉譯前，Agent 必須先閱讀課程概要、檢索課本（如達賴喇嘛原著）、講義與對應經論原文，建立該課程的 `grounding.json`。
   * 包含：講者/道場實體、引用論師、核心術語集、章節科判結構。
   * 此知識包作為後續 ASR 後處理、模型提示、詞庫消歧與閱讀註釋的唯一底本來源。
2. **段落頁碼標記 (Page Citation Tag)**：
   * 逐字稿段落標記出處頁碼（例：`[p.63]`）。
3. **MacWhisper 原始檔名自動轉換器 (`scripts/convert_macwhisper.py`)**：
   * 小法可使用轉換腳本自動解析 MacWhisper 的產出檔名：`YYYYMMDD-[A/B] 課程名稱-科判pXX(堂數).txt` 或 `.whisper`，自動提取 `date`, `subSession ('A'/'B')`, `pageRange`, `sessionNum` 並產出標準 `session.json`。

---

## 6. 💡 佛學名相與傳承背景懸浮註釋 (Glossary Tooltips & Context Cards)

### 痛點背景
跨經論與宗派的講座（例如同時融合格魯派道次第、漢傳《瑜伽師地論》與人間佛教《空之探究》）具有大量特定名相與背景人物，初學讀者易產生閱讀阻礙。

### 規格規範
1. **名相懸浮卡片 (Glossary Hover Cards)**：
   * 核心佛學專有名相（如「勝義菩提心」、「菩薩種姓」、「老參」）、關鍵經論（如《空之探究》）與傳承人物，前端自動識別或由標記提供微懸浮卡片。
   * 懸浮內容提供簡短釋義與出處，不打斷主文閱讀流程。

---

## 7. 🤝 讀者協同校對與反饋機制 (Reader-in-the-Loop Proofreading)

### 痛點背景
「待閱校版」上線後，讀者在聆聽研讀時發現錯字或 ASR 遺漏時，缺乏輕量、直觀的反饋管道。

### 規格規範
1. **一鍵選字回報 (Inline Suggestion)**：
   * 讀者在文字段落選取錯別字後，浮現「回報錯字」小按鈕。
   * 填寫建議正字與簡短理由後送出，記錄為待審核提案（包含 sentence ID、時間戳、建議字詞與時間）。
2. **稽核與增量學習整合**：
   * 回報資料匯入校對佇列，經管理員或 Agent 審核後直接合併回 session 與詞庫中。
