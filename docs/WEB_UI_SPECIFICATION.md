# 《入中論善顯密意疏》逐字稿多媒體學習平台 —— Web UI 規格說明書 (v1.2)

本文件完整收錄目前多媒體逐字稿學習平台的**全套前端架構、介面佈局、音文同步機制、科判大綱導引、互動校勘系統、審核評分控制台與資料契約規範**，作為後續全面重構 Web UI 之標準基準依據。

---

## 一、 產品定位與技術體系

### 1.1 產品定位
本平台專為大乘佛學深層研讀（以宗喀巴大師《入中論善顯密意疏》為核心）設計，具備：
1. **多媒體音文時間軸精確對齊**（逐句毫秒級卡拉 OK 雙向連動）。
2. **多層級經論科判大綱即時跟隨**（全書總綱與本講分科即時導航）。
3. **群眾智慧互動校勘與筆記工作區**（雙擊編輯、字元級 Diff 比對、Markdown 匯出）。
4. **本機直連學習後台 (Port 9091)**（與 Python 服務器雙向同步，支援主動學習詞庫推送）。
5. **AI 智慧審核控制台**（支援讀者校勘建議比對、底本印證與 GitHub PR 提交）。

### 1.2 技術架構
* **前端架構**：原生 ES Modules (Vanilla JS) + Semantic HTML5 + Vanilla CSS (Design Tokens)。
* **依賴規範**：零大型第三方臃腫依賴，追求首屏 0.2 秒極速載入與純靜態部署（相容 GitHub Pages）。
* **字型體系**：
  * 中文內文：Google Fonts `Noto Serif TC`（宋體/明體，適合經典研讀）。
  * 介面與標題：`Inter`，搭配系統字體備援。

---

## 二、 介面佈局與設計系統規範 (Layout & Design System)

### 2.0 色彩哲學與主題色彩體系規範 (Color Philosophy & Design Tokens)

#### 1. 現行配色問題診斷與根本缺陷 (Color Audit & Problems)
目前平台樣式（`src/css/main.css` 與 `theme.css`）存在以下嚴重的人因工程與審美錯位：
1. **強烈的冷科技感與佛學研讀氛圍背離**：
   * 現有預設色為典型的 2015 舊式科技藍灰（`--primary-color: #2c3e50;`、`--accent-color: #3498db;`），缺乏古典佛典研讀所需的沉靜、典雅、溫潤氛圍。
2. **白底黑欄的極端割裂感 (Visual Discordance)**：
   * 閱讀區採用純白底色（`--bg-color: #fcfcfc`），而左側欄卻是極黑的深灰藍（`--sidebar-bg: #1e293b`）。兩者反差過於劇烈，視覺重心完全被側邊欄吸走，長時間閱覽萬字經論極易造成瞳孔調節疲勞。
3. **高飽和螢光黃高亮 (Aggressive Highlight Thrashing)**：
   * 現有播放句高亮為刺眼的螢光黃（`--highlight-bg: #fef08a;`），宛如亮色螢光筆粗暴塗抹，嚴重破壞宋體排版的美感與呼吸感。
4. **深色模式發藍發冷 (Cold Blue Dark Mode)**：
   * 現行深色模式直接套用程序員 IDE 的冷藍黑（`#0f172a` / `#020617`），藍光比例過高，缺乏古代經閣夜讀的玄曜溫潤墨韻。

---

#### 2. 三套典雅佛學主題調色盤 (Three Thematic Color Palettes)

為徹底解決上述問題，平台重構時全面導入三套專為古典長文研讀定制的設計系統變數（Design Tokens）：

##### 主題 A：【紙墨雅緻】(Parchment & Ink - 預設淺色，如沐講堂)
* **設計意象**：宣紙桑皮、徽墨松煙、菩提金光。
* **背景色 (`--bg-color`)**：`#FAF8F5`（溫暖米紙色，消弭慘白強光刺眼感）。
* **側欄色 (`--sidebar-bg`)**：`#F2ECE1`（深一層的古典宣紙色，與主閱讀區自然融為一體）。
* **主文字 (`--text-main`)**：`#2B2623`（徽墨古黑，柔和而極富雕版質感，WCAG 對比度 14:1）。
* **次要字 (`--text-muted`)**：`#6B635B`（松煙淡墨，清晰不干擾）。
* **莊嚴主色 (`--primary-color`)**：`#7C2D12`（袈裟深絳紅 / 沉香赭褐，象徵正法久住）。
* **智慧點綴色 (`--accent-color`)**：`#B45309`（菩提琥珀金，象徵般若智光）。
* **音文同步高亮 (`--highlight-bg`)**：`rgba(180, 83, 9, 0.08)`（晨曦金色柔光光暈）搭配左側 `3px solid #D97706` 沉金指標線。
* **邊框色 (`--border-color`)**：`#E6DED2`（溫潤紙線）。

##### 主題 B：【靜慮夜讀】(Zen Dark - 經閣夜闌)
* **設計意象**：夜闌燈影、經閣靜坐、沉檀玄曜。
* **背景色 (`--bg-color`)**：`#191817`（暖調玄黑，徹底杜絕刺眼冷藍光）。
* **側欄色 (`--sidebar-bg`)**：`#121110`（深檀黑）。
* **主文字 (`--text-main`)**：`#E6E1D8`（溫潤象牙柔白，對比舒適不眩光）。
* **次要字 (`--text-muted`)**：`#968F85`（月影石灰）。
* **智慧點綴色 (`--accent-color`)**：`#F59E0B`（溫暖明燈金）。
* **音文同步高亮 (`--highlight-bg`)**：`rgba(245, 158, 11, 0.14)` 搭配暗金微光外框。
* **邊框色 (`--border-color`)**：`#36332E`。

##### 主題 C：【貝葉古卷】(Sepia / Sandalwood - 經典護眼)
* **設計意象**：巴利貝葉、藏梵古卷、沉香茶褐色。
* **背景色 (`--bg-color`)**：`#F3EBD9`。
* **側欄色 (`--sidebar-bg`)**：`#E7DCB8`。
* **主文字 (`--text-main`)**：`#3D3022`（深焦茶墨）。
* **次要字 (`--text-muted`)**：`#756653`。
* **點綴色 (`--accent-color`)**：`#9A3412`（古磚赤褐）。
* **音文同步高亮 (`--highlight-bg`)**：`rgba(154, 52, 18, 0.10)`。

---

```
+---------------------------------------------------------------------------------------------+
| [Header] ☰ 🗂️ 199講目錄 | 平台標題 (全199講) | [🔍 搜尋講記... (⌘K)] | A- 100% A+ | ⚡同步 📥筆記 ⭐評分 🛡️審核 🌙深色 |
+---------------------------------------------------------------------------------------------+
| [Sidebar 側邊欄] (280px 可拖曳) | [Main Reader 閱讀主區] (Max 780px)                          |
|  - 課程選擇器 (📖 入中論...)      |  - 麵包屑導航: 🏠 全部課程 > 第 XX 堂                         |
|  - 🏠 課程總覽 (199講卡片)       |  - 即時科判路徑條 (動態往上追溯祖先層級)                       |
|  - 🔍 講次快速篩選 (02A/p.63)    |  - 講次標題 (第 XX 堂 | 日期 | 頁碼) + [📑 本課科判按鈕]       |
|  - 講次清單 (自然序排列)          |  - 📑 科判章節目錄 (可摺疊 Accordion: 本課科判 / 全書總科判)   |
|     * 01 ...                  |  - 逐字稿本文 (文章排版):                                    |
|     * 02A ...                 |     * 【科判導讀】小標題                                     |
|     * 02B ...                 |     * [📌 內嵌科判卡片]                                      |
|                               |     * 段落與逐句 (點擊跳播、雙擊校訂、長按氣泡選單)             |
|                               |  - [講次完畢推薦卡片] (自動倒數切換下一講)                     |
+---------------------------------------------------------------------------------------------+
| [Floating FAB] 🎯 回到播放處 (手動滾動偏離目前播放句時自動浮現)                                 |
+---------------------------------------------------------------------------------------------+
| [Bottom Player 播放器] 標題 | 音文同步中 | ⏮️ [HTML5 音訊控制列] ⏭️ | [1.0x/1.2x/1.5x/2.0x] | 📖科判 |
+---------------------------------------------------------------------------------------------+
```

### 2.1 桌面端 3 段式導航欄 (Sticky 3-Segment Header)
* **左側 (Header-left)**：側邊欄收合切換按鈕 (`#sidebar-toggle`，快捷鍵 `[`）、行動端目錄按鈕、平台標題與全講次動態計數器 (`#header-course-count`)。
* **中間 (Header-center)**：全局全文搜尋框 (`#search-input`，最大寬度 380px，支援 `⌘K` / `Ctrl+K` 快速聚焦)。
* **右側 (Header-right)**：
  * 字級平滑縮放控制器（`A-`、`100%`、`A+`，支援 80% ~ 150% 比例）。
  * 雙擊/長按編輯提示標籤。
  * `⚡ 本機同步` 按鈕（連接本地 Python 服務端 Port 9091）。
  * `📥 匯出筆記` 按鈕（匯出當講所有校勘與筆記為標準 Markdown）。
  * `⭐ 講次審核` 按鈕（開啟 1~10 分綜合評分與標籤回報彈窗）。
  * `🛡️ 審核中心` 外鏈（開啟 AI 審核控制台 `review.html`）。
  * `🌙 深色模式` 切換按鈕（支援本機深淺色偏好持久化）。
  * 行動端 `⋯ 更多` 按鈕（在螢幕寬度 < 768px 時聚合右側功能）。

### 2.2 側邊欄導航 (Collapsible & Resizable Sidebar)
* **預設寬度**：`280px`（CSS 變數 `--sidebar-width: 280px`）。
* **拖曳調整器 (Resizer Handle)**：右緣具備 `#sidebar-resizer`，支援滑鼠拖曳即時調整側欄寬度（最小 200px，最大 500px）。
* **多課程切換器 (`#course-select`)**：讀取 `courses/catalog.json`，支援平滑切換多部大論。
* **課程總覽按鈕 (`#course-overview-btn`)**：點擊開啟全庫 199 講卡片式大網格總覽（P1 UX 規格）。
* **即時篩選輸入框 (`#sidebar-filter`)**：
  * 支援講次代號搜尋（如 `02A`、`29A`）。
  * 支援底本頁碼搜尋（如 `p.63`、`p.97`）。
  * 支援主題科判或摘要關鍵字篩選（如 `歸敬頌`、`釋禮敬`）。
* **講次清單項 (`.session-item`)**：
  * 高度約 42px，呈現講次主標題、副標題、頁碼標籤與錄音日期。
  * 具有缺講/缺失音檔警告標記（如第 99B 講）。
  * 啟用狀態高亮（`.session-item.active`），切換時平滑滾動至可見區域。

### 2.3 核心閱讀容器 (Reader Container)
* **寬度規範**：`max-width: var(--max-reader-width, 780px)`（嚴格限制 780px 閱讀黃金行寬，避免寬螢幕下行長過長造成閱讀疲勞）。
* **排版規範**：行高 `--line-height: 1.75`，段落間距 `--paragraph-margin: 12px`。
* **科判導讀小標題 (`.transcript-heading`)**：由 LLM 深度校對萃取之章節標題（如 `【科判導讀】...`、`【正理抉擇】...`、`【經論引證】...`）。
* **內嵌科判錨點卡片 (`.toc-anchor-card`)**：當段落起始秒數與科判章節重合時，自動前置插入帶有 `📌` 圖標、科判標題、底本頁碼與時間戳之提示小卡。
* **句子元素 (`.sentence`)**：
  * 每個句子包覆於 `<span class="sentence" id="sent-X" data-start="S.SS" data-end="E.EE">`。
  * 單擊：觸發音訊跳轉播放 (Click-to-Seek)。
  * 雙擊：開啟互動校勘與筆記彈窗 (Sentence Editor Modal)。
  * 長按 (行動端 500ms)：觸發懸浮氣泡操作選單。
  * 狀態高亮：當前播放句給予 `.active`，游標懸停給予微動畫。

### 2.4 底部固定播放器 (Fixed Audio Player Bar)
* **高度**：`90px`，固定置底（`position: fixed; bottom: 0; left: 0; right: 0; z-index: 100`）。
* **正在播放資訊 (`.now-playing-info`)**：呈現當前講次名稱與音文同步狀態。
* **播放控制組 (`.player-controls`)**：
  * `⏮️` 上一講按鈕 (`#prev-session-btn`)。
  * 原生 HTML5 音訊元件 (`#audio-element`)。
  * `⏭️` 下一講按鈕 (`#next-session-btn`)。
  * 循環倍速切換按鈕 (`#playback-rate-btn`)：`1.0x` ➔ `1.2x` ➔ `1.5x` ➔ `2.0x` ➔ `1.0x`。
  * 行動端科判抽屜觸發按鈕 (`#toc-drawer-trigger`)。

### 2.5 行動端極致體驗設計 (Mobile-First UX Strategy)

針對手機垂直閱讀（Portrait Mode，螢幕寬度 375px ~ 430px）的空間特性，本平台專門設計了一整套**「以手機為本 (Mobile-First)」**的互動與版面自適應方案：

```
+-------------------------------------------------------------+
| [Mobile Header] ☰ 目錄 | 釋量論第二品 01 | ⋯ (更多功能)      | (48px)
+-------------------------------------------------------------+
| [可折疊 YouTube 影片區 (16:9 / 210px)] 或 [純音訊模式(隱藏)] |
+-------------------------------------------------------------+
| [分段頁籤]  (●) 逐字稿   ( ) 課文原典   ( ) 頌文對照釘選     | (36px)
+-------------------------------------------------------------+
| [手機主閱讀區 (流暢虛擬滾動)]                                |
|  - 【科判導讀】標題                                         |
|  - [📌 內嵌偈頌卡片] (點擊彈出梵藏原典)                     |
|  - 逐字稿內容 (字級支援 1.2x 大字，大拇指友善行高 1.85)       |
|    "法師說：我們看這句偈頌……"                                |
|  - 播放中句子自動柔和金光高亮，不阻擋字墨                    |
+-------------------------------------------------------------+
| [Floating FAB] 🎯 回到播放處 (大拇指 48px 熱區，偏離時浮現)   |
+-------------------------------------------------------------+
| [置底播放器] 釋量論 01 | ⏮️ ⏯️ ⏭️ | 1.2x | 📑科判  | 60px (+Safe Area)
+-------------------------------------------------------------+
```

#### 1. YouTube 影音與純音訊雙態切換 (Mobile Video / Audio Mode)
* **純音訊背景模式 (預設省電省頻寬)**：將 YouTube 視窗收起，僅保留置底 60px 的播放控制條，讓出 100% 的螢幕空間給經文閱讀。
* **頂部釘選影音模式 (Sticky Top Video)**：點擊「🎬 看畫面」，螢幕頂部固定 16:9 播放視窗（高度約 210px），下方自動計算剩餘高度並獨立滾動逐字稿，方便學員邊聽邊看如性法師的黑板板書或投影片。

#### 2. 小螢幕多重視角：分段切換器 (Segmented Control Tabs)
手機無法同時容納左右雙欄，因此在閱讀器頂部提供滑動分段控制器：
* **【講記逐字稿】視圖**：專注法師開示內容，遇有經論偈頌處以醒目的「內嵌偈頌卡片」嵌入正文。
* **【課文原典】視圖**：專注頌文通讀，展示全品偈頌、藏文原音與古注；點擊任一頌旁的「🎧」按鈕，立刻啟動播放並跳播至該頌開示處。
* **【上下對照釘選】模式**：上半部 120px 釘選目前正在解說的偈頌原檔，下半部是逐字稿，達成手機端的「上下雙欄對讀」。

#### 3. 手勢導航與底部滑出抽屜 (Bottom Sheet Gestures)
* **講次側邊欄抽屜 (`Sidebar Drawer`)**：點擊左上角漢堡圖示，自左側滑出半透明遮罩抽屜，支援左滑手勢快速收回。
* **科判大綱底部抽屜 (`TOC Bottom Sheet`)**：點擊播放列的「📑 科判」，自底部彈出全課科判導讀清單，支援向下滑動手勢（Swipe-down to Dismiss）關閉。
* **長按氣泡選單 (`Touch Context Menu`)**：手指在句子上長按 400ms（震動微回饋），在手指上方浮現專用大按鈕選單：`▶️ 跳播`、`📝 筆記`、`🛠️ 校勘`、`📋 複製`。

#### 4. 手機虛擬鍵盤智慧避讓 (Virtual Keyboard Avoidance)
* 在手機端進行逐句校稿或輸入筆記時，校勘面板以**全螢幕底部抽屜**形式展開。
* 採用 CSS `dvh`（Dynamic Viewport Height）與 `interactive-widget=resizes-content`，當手機虛擬鍵盤彈起時，輸入框與 Diff 對比區自動上移至鍵盤上方，徹底解決行動端「鍵盤遮蔽送出按鈕與輸入游標」之經典頑疾。

#### 5. 人體工學與安全區域適配 (Ergonomics & Safe Area)
* **大拇指單手操作區**：播放列主要觸控按鈕（播放、暫停、倍速、科判）直徑均 $\ge 44\text{px}$，符合 Apple HIG 與 Google Material 無障礙標準。
* **底部安全區 (Home Bar Safe Area)**：置底播放列設定 `padding-bottom: max(10px, env(safe-area-inset-bottom))`，防止與 iPhone 底部橫條或 Android 全螢幕手勢產生誤觸。


---

## 三、 核心邏輯與模組功能規格 (Functional Modules)

### 3.1 模組一：音文時間軸同步引擎 (`src/js/syncPlayer.js`)
* **核心責任**：精確追蹤音檔播放時間戳，將音訊播放位置對齊至句子 DOM，驅動高亮與平滑自動滾動。
* **演算法**：
  1. 監聽 `audio.ontimeupdate`。
  2. 使用二分搜尋法 (`findSentenceIndexByTime`) 於 500~1500 句之陣列中以 $O(\log N)$ 複雜度檢索當前秒數所屬句子。
  3. 支援時間軸拉伸比例修正 (`calculateTimeScaleRatio`)：當音檔長度與 Whisper 轉寫邊界存在微幅比例誤差時，自適應縮放對齊。
* **滾動衝突保護 (Scroll Lock Mechanism)**：
  1. 監聽視窗 `wheel` 與 `touchmove` 事件。
  2. 使用者手動滾動時，啟動「手動滾動鎖定」4 秒，期間凍結自動滾動，並浮現提示條 `#scroll-lock-indicator`。
  3. 點擊提示條或點擊 `#fab-return-playing` 立即解除鎖定並滾回播放句。
  4. 雙擊句子編輯時，透過 `freezeAutoScroll(500ms)` 凍結滾動，徹底防範視窗跳動。
* **模擬播放備援 (Simulated Playback Fallback)**：當音檔尚未發布或網路離線時，系統以定時器模擬 1 秒跳進度，確保在無音檔情況下閱讀器功能完整可用。

### 3.2 模組二：科判大綱與層級導覽引擎 (`src/js/toc.js`)
* **核心責任**：解析 `toc.json` 樹狀科判，呈現經論科判體系，並與時間軸實時連動。
* **功能特性**：
  1. **雙模式科判視野 (Scope Toggle)**：
     * `本課科判 (course)`：過濾並僅展示本講涵蓋之科判節點。
     * `全書總科判 (book)`：展開全書完整樹狀科判，並高亮本講對應章節。
  2. **實時科判路徑條 (Sticky Doctrinal Breadcrumb Bar)**：
     * 解析當前播放時間，即時往根節點遍歷祖先鏈（如：`甲一 釋題義 > 乙二 正釋論體 > 丙一 釋歸敬頌`）。
     * 固化於閱讀器頂端，隨播放動態更新。
  3. **跳轉連動 (Click-to-Seek)**：點擊科判節點，自動切換至對應講次並跳轉至該科判指定秒數開始播放。

### 3.3 模組三：互動式校勘與筆記工作區 (`src/js/annotation.js`)
* **核心責任**：提供讀者與校對者線上修改錯別字、記錄法義筆記並持久化儲存。
* **功能特性**：
  1. **句子校勘編輯器 (Sentence Editor Modal)**：
     * 呈現 Whisper 原始 ASR 辨識文字。
     * 提供校訂文字輸入框，自動執行中文逐字 Diff 比對（綠色新增 `diff-ins`、紅色刪除 `diff-del`）。
     * 提供個人筆記與疑問註記文字框。
  2. **本地儲存隔離 (LocalStorage Persistence)**：
     * 校勘索引鍵：`transcriptions_corr_{sessionId}`。
     * 筆記索引鍵：`transcriptions_note_{sessionId}`。
  3. **筆記匯出 (Markdown Export)**：
     * 一鍵產生包含「講次標題、時間戳、原文對照、校訂後文字、個人研讀筆記」之標準 GitHub Flavored Markdown 檔案並下載。

### 3.4 模組四：本機學習後台同步橋接器 (`src/js/localSync.js`)
* **核心責任**：與本地校對服務端 `scripts/sync_server.py` (Port 9091) 建立即時 API 通訊。
* **API 協議**：
  * `GET /api/status`：探測本地服務端是否在線、獲取目前詞庫版本與待審核佇列大小。
  * `POST /api/learn`：發送單句校對建議至後台，直接更新本機磁碟 JSON 與促進主動學習詞庫。
  * `POST /api/batch_sync`：一鍵將前端儲存之所有校勘批次同步回寫至後端本機檔案庫。
* **UI 元件**：本機同步彈窗 (`#local-sync-modal`)，呈現連線狀態燈號、佇列統計、單鍵同步與即時 Toast 提示。

### 3.5 模組五：講次品質審核與評分系統 (`src/js/reviewRating.js`)
* **核心責任**：讓資深研討人員對當講校對品質進行 1～10 分綜合評級，並蒐集結構化瑕疵回饋。
* **評分維度與標籤**：
  * 1~10 分數字階梯式評分按鈕。
  * 具體問題分類標籤：`佛學名相有誤`、`漏句或多句`、`時間戳未對齊`、`科判標題需優化`、`口語被過度文言化`、`斷句不自然`、`讀誦底本有錯字`、`品質優良無問題`。
  * 詳細回饋文字區。
  * 評分結果本機持久化 (`transcriptions_session_ratings_v1`) 並可傳回後台報表。

### 3.6 模組六：AI 智慧審核控制台 (`src/review.html` & `src/js/review.js`)
* **核心責任**：供主編審核讀者提交之校勘建議，自動比對經論原典並直接發起 GitHub PR。
* **審核卡片結構**：
  * 講次與時間戳標籤。
  * 原始句 vs 校訂建議之視覺化紅綠 Diff 框。
  * 音訊短片段 (Audio Clip) 即時試聽播放按鈕（直接播放前後 5 秒錄音）。
  * 經論出處與 AI 置信度評估（如：`【經論底本印證】善顯密意疏 p.102 第 14 行 (置信度 0.98)`）。
  * 審核操作：`採納並生成 PR`、`編輯調整`、`駁回`。
  * GitHub Personal Access Token (PAT) 驗證機制，直接調用 GitHub REST API 建立分支與 Pull Request。

### 3.7 模組七：無障礙與鍵盤操控 (`src/js/a11y.js`)
* **全域快捷鍵合約**：
  * `Space`：播放／暫停切換。
  * `←` / `→`：快退 5 秒 / 快進 5 秒。
  * `↑` / `↓`：調整音量。
  * `[`：收合或展開側邊欄。
  * `J` / `K` / `L`：經典 YouTube 式倒退 10 秒 / 暫停 / 快進 10 秒。
  * `⌘K` / `Ctrl+K`：聚焦全局搜尋框。
  * `Escape`：關閉所有彈窗、抽屜與清除搜尋高亮。
* **無障礙 (A11y) 支援**：全介面符合 WCAG 2.1 AA 標準，所有按鈕具備 `aria-label`，對話框具備 `role="dialog"` 與 `aria-modal="true"`。

---

## 四、 資料結構與契約規範 (Data Contracts & Schemas)

### 4.1 課程目錄清單 (`courses/catalog.json`)
```json
{
  "defaultCourseId": "ru-zhong-lun",
  "courses": [
    {
      "id": "ru-zhong-lun",
      "title": "入中論善顯密意疏",
      "path": "courses/入中論善顯密意疏",
      "totalSessions": 219,
      "description": "宗喀巴大師造，第六現前地中觀正見詳釋"
    }
  ]
}
```

### 4.2 課程中繼索引 (`courses/.../course.json`)
```json
{
  "courseId": "ru-zhong-lun",
  "title": "入中論善顯密意疏",
  "totalSessions": 219,
  "sessions": [
    {
      "sessionId": "02A",
      "sessionNum": 2,
      "subSession": "A",
      "periodLabel": "上",
      "date": "2016-05-28",
      "pageRange": "p.63",
      "title": "第 2A 堂 (上) | 2016-05-28 | p.63",
      "audioUrl": "https://buddha.flyday.com.tw/...",
      "summary": "甲二 釋禮敬 ・ 本講主要解釋《善顯密意疏》中第六現前地的內容...",
      "sidebarLabel": "（2A）20160528 p.63"
    }
  ],
  "unavailableSessions": []
}
```

### 4.3 講次逐字稿資料結構 (`courses/.../sessions/session_{id}.json`)
```json
{
  "sessionId": "02A",
  "title": "第 2A 堂 (上) | 2016-05-28 | p.63",
  "audioUrl": "https://buddha.flyday.com.tw/...",
  "lastUpdated": "2026-09-05",
  "paragraphs": [
    {
      "id": "p_1",
      "heading": "【科判導讀】第六現前地之名義與釋禮敬總綱",
      "sentences": [
        {
          "start": 0.0,
          "end": 3.42,
          "text": "我們看第六現前地。",
          "rawText": "我们看第六现前地",
          "proofreadText": "我們看第六現前地。"
        }
      ]
    }
  ],
  "_meta": {
    "status": "APPROVED",
    "qualityScore": 10.0,
    "model": "MiniMax-Text-01"
  }
}
```

### 4.4 科判綱目資料結構 (`courses/.../toc.json`)
```json
{
  "courseId": "ru-zhong-lun",
  "sections": [
    {
      "id": "sec-1",
      "title": "甲一 釋題義與歸敬頌",
      "page": 1,
      "sessionId": "01",
      "timestamp": 0.0,
      "children": [
        {
          "id": "sec-1-1",
          "title": "乙一 釋題義",
          "page": 1,
          "sessionId": "01",
          "timestamp": 12.5,
          "children": []
        }
      ]
    }
  ]
}
```

---

## 五、 UI 升級改進方案規格 (Recommended Feature & UX Upgrades)

為突破現有介面瓶頸，下列 7 項功能升級建議已正式納入平台演進路線圖：

### 5.1 雙模式切換：禪意研讀模式 vs 專業校勘模式
* **🧘 禪意研讀模式 (Zen Reader Mode，預設)**：
  * 目標：為一般僧俗二眾讀者提供極致純粹的法義聽讀與思維體驗。
  * 介面特徵：完全隱藏編輯提示、審核評分按鈕、本機同步按鈕與技術資訊；僅保留優雅的宋體排版、麵包屑、科判路徑條、平滑卡拉 OK 高亮與段落思維導讀。
* **✍️ 專業校勘模式 (Proofreader / Editorial Mode)**：
  * 目標：供團隊與志工進行經論校訂、聽辨難字與語義修正。
  * 介面特徵：一鍵開關開啟，逐句顯示 ASR 置信度色條、字元級紅綠 Diff 修訂標記、存疑標籤、一鍵本機同步 (Port 9091) 與 1~10 分綜合審核回報工具列。

### 5.2 桌面端三欄式科判導航 (Desktop 3-Column Layout)
* **佈局規格**：在螢幕寬度 $\ge$ 1280px 時，支援展開為現代三欄式結構：
  * **左欄 (260px)**：講次清單與快速搜尋（支援縮小為純圖標欄）。
  * **中欄 (320px)**：全書樹狀科判導航（常駐展示，音訊播放到哪裡，對應的科判節點自動高亮並展開，讀者可隨文入觀，清晰掌握自身在全書中的法義座標）。
  * **右欄 (主區 780px)**：逐字稿本文與卡拉 OK 滾動區。
* **自適應收合**：在平板與筆電螢幕（< 1280px）下，中欄自動平滑折疊至抽屜，確保主閱讀區始終維持 780px 黃金行寬。

### 5.3 佛學名相懸浮卡片與藏漢對照 (Glossary Popover & Tibetan Mapping)
* **資料來源**：直接對接平台已建立之 `learned_corrections.json`（已收錄 95+ 條核心詞目，包含名相定義、藏文對應與《善顯密意疏》底本頁碼）。
* **互動設計**：
  * 逐字稿中的核心專有名詞（如：*薩迦耶見*、*自證分*、*名言識*、*補特伽羅*、*依他起*）以低調細虛線底線呈現。
  * 滑鼠懸停（Desktop）或輕點（Mobile）時，彈出微型辭典卡片，呈現**藏文拉丁轉寫（如 tha-snyad shes-pa）、名相法義定義、經論初見頁碼**，打造全網最具學術深度的佛學多媒體研讀工具。

### 5.4 逐句單獨循環重播按鈕 (Sentence-Level Mini Loop & Replay)
* **互動設計**：
  * 當滑鼠游標懸停於任一句子上方時，行首左側微型浮現 `🔁`（單句循環）與 `▶`（單句重播）圖標。
  * 點擊 `▶`：立即將音訊 seek 至 `s.start` 並播放至 `s.end`。
  * 點擊 `🔁`：鎖定該句重複循環播放，特別適用於格西語速極快或深奧中觀辨析時的反覆精聽。

### 5.5 微型波形進度條與科判時間標記 (Canvas Mini Waveform)
* **介面升級**：將底部原生 `<audio>` 播放列升級為現代化 Canvas 音訊能量頻譜波形條。
* **科判旗標 (Chapter Flags)**：在波形條上精確打上科判章節切換點的錨點（Markers），游標懸停時即時預覽科判標題，點擊即可平滑跳播。

### 5.6 長篇逐字稿虛擬滾動 (Virtual Scrolling & Chunked Rendering)
* **效能瓶頸突破**：針對如第 30B 講（1,734 句、3,000+ DOM 節點）等大講次，引入虛擬列表（Virtual Scrolling）或基於 `IntersectionObserver` 的段落分塊渲染。
* **成效**：記憶體佔用降低 70%，消除音訊頻繁觸發 `timeupdate` 時的 DOM 重繪負擔，在低階手機端亦可達到 60fps 的極致流暢度。

### 5.7 PWA 離線快取與 Service Worker 規範 (Offline Capability)
* **應用場景**：支援修行者在無網路或離線環境（如禪修閉關中心、通勤地鐵、飛機）中順暢聽讀。
* **實作技術**：
  * 配置標準 Web App `manifest.json`，支援安裝至手機桌面（iOS / Android）。
  * 實裝 Service Worker Cache Storage，支援一鍵下載並離線快取「當前講次逐字稿 JSON 與 MP3 音檔」。

---

## 六、 路線 B 重構技術藍圖：Vite + Vue 3 / Preact (Route B Architecture Blueprint)

### 6.1 路線 B 深度剖析：為什麼是現代化前端重構的「最優解」？

在現行的 Vanilla JS 架構中，雖然實現了零依賴與極速載入，但隨著功能持續擴充（毫秒級卡拉 OK 音文同步、動態多層科判樹跟隨、長篇逐字稿虛擬捲動、雙擊/長按校勘編輯、本地 Python 9091 同步、AI 審核評分等），純命令式（Imperative）DOM 操作遇到了難以迴避的架構瓶頸：

1. **高頻音訊驅動下的「音文抖動與重排 (Audio-DOM Thrashing)」**：
   * 現況：`<audio>` 的 `timeupdate` 事件每秒觸發 3~4 次，純 JS 每次都需要進行全域節點查詢、遍歷上千個 `.sentence` 比對時間戳、手動 `classList.remove/add` 以及觸發 `scrollIntoView`。
   * 路線 B 解法：透過**響應式資料流 (Reactive Data Stream)** 與**二分搜尋 (Binary Search, O(log N))**，每幀僅更新 `activeSentenceId` 單一狀態，配合 Vue 3 的**靜態提升 (Static Hoisting)**，非活動的經文節點完全跳過 Diff，將每幀計算耗時壓制在 0.1ms 以內。

2. **長篇巨量經文的記憶體與渲染壓力**：
   * 現況：如第 30B 講長達 1,734 句，頁面一次性掛載超過 3,500 個 DOM 節點。在低階行動裝置或長輩使用的舊型平板上，快速滑動或跳轉時會產生明顯掉幀與白屏。
   * 路線 B 解法：無縫整合 `@vueuse/core` 的虛擬滾動清單 (`useVirtualList`) 或基於 `IntersectionObserver` 的動態預估分塊渲染，記憶體中僅常駐可視範圍前後 50~60 個 DOM 節點，渲染記憶體直接下降 70%，幀率穩定鎖定在 60fps。

3. **全域事件監聽器的混亂與記憶體洩漏風險**：
   * 現況：快捷鍵（`Space`, `[` , `⌘K`）、長按觸控、滾動節流、Resize 監聽器分散在 5 個不同 JS 檔案中，切換講次若未嚴格卸載容易發生閉包洩漏。
   * 路線 B 解法：利用 SFC（單檔案元件）生命週期鉤子（`onMounted` / `onUnmounted`）與 VueUse 的 `useEventListener`，所有事件監聽與資源在組件銷毀時自動清理回收，杜絕任何幽靈事件。

4. **狀態割裂與時序問題 (State Synchronization)**：
   * 現況：當前講次、播放進度、倍速、選中句子、校勘字典分散在各模組內部變數與全域物件中，缺乏單一真實來源 (Single Source of Truth)。
   * 路線 B 解法：採用 Pinia 建立集中式單向資料流（Unidirectional Data Flow），提供嚴格的 TypeScript 型別合約與 Time-travel 除錯能力。

---

### 6.2 技術選型深入對比：Vue 3 vs Preact

| 評估維度 | **推薦：Vue 3 (Vite + SFC + Pinia)** | Preact (Vite + Signals + JSX) |
| :--- | :--- | :--- |
| **框架體積 (Gzip)** | 約 **33 ~ 38 KB**（極輕量，現代 4G/5G 10ms 內載入） | 約 **4 ~ 6 KB**（極致羽量級） |
| **模板可讀性與佛典排版** | **★★★★★** (SFC `<template>` 保持原生 HTML 結構，經文排版最自然) | **★★★☆☆** (JSX 在多層次縮排、段落科判嵌合時括號較多) |
| **樣式隔離 (Scoped CSS)** | **內建 `<style scoped>`**，無需額外配置即可實現元件級樣式封裝 | 需搭配 CSS Modules 或 Tailwind CSS |
| **靜態經文優化 (Static Hoisting)** | **極致**（編譯期自動標記靜態文字，長篇經文 Diff 成本趨近於 0） | 依賴 Signals 手動細粒度綁定 |
| **生態豐富度 (Ecosystem)** | **Pinia + VueUse**（內建完整的音訊、虛擬清單、快捷鍵方案） | 需自行封裝音訊與虛擬滾動邏輯 |
| **學習與維護門檻** | 低，直觀明瞭，語法親和力強 | 中，需要對 JSX 與 Signals 響應底層有一定理解 |

> **權衡結論**：
> 強烈推薦採用 **Vite + Vue 3 (Composition API `<script setup>`) + Pinia + VueUse + TypeScript**。
> 對於《入中論》這種具備深層次樹狀科判、多段落文章排版與富文本注釋的古典研讀平台，Vue 3 的 SFC 模板語法、編譯期靜態提升與 VueUse 成熟生態具備壓倒性的開發維護優勢。

---

### 6.3 核心架構元件樹 (Component Hierarchy Tree)

```
<App>
├── <AppHeader>                     // 三段式 Sticky 頂部導航
│   ├── <HeaderLeft>                // 側欄開關 (快捷鍵 [)、平台 Logo、全課程/全講次計數器
│   ├── <GlobalSearchInput>         // ⌘K 全域全文搜尋框 (防抖 250ms、即時結果計數)
│   └── <HeaderToolbar>             // 字級縮放 (80%~150%)、本機 9091 同步、筆記匯出、講次審核、深淺色切換
│
├── <AppLayout>                     // 雙欄 / 三欄彈性響應式佈局主容器
│   ├── <SidebarNav>                // 左欄側邊欄 (280px，支援滑鼠拖曳調整寬度與收合)
│   │   ├── <CourseSelector>        // 課程切換下拉 (《入中論善顯密意疏》等)
│   │   ├── <CourseOverviewBtn>     // 🏠 199講完整課程總覽卡片視圖呼叫
│   │   ├── <SessionSearchInput>    // 講次即時篩選 (支援講次序號 02A、頁碼 p.63)
│   │   └── <SessionList>           // 虛擬講次滾動清單
│   │       └── <SessionListItem>   // 單一講次項目 (序號、主題、頁碼微標籤、校勘狀態)
│   │
│   ├── <TOCDesktopPanel>           // 中欄 (寬螢幕 ≥ 1280px 常駐)：科判大綱導航樹
│   │   ├── <TOCHeader>             // 科判折疊狀態切換 (本課科判 vs 全書總綱)
│   │   └── <TOCTreeNode>           // 遞迴科判節點 (當前所屬層級反白、點擊時間戳跳播)
│   │
│   └── <MainReader>                // 右欄：780px 禪意逐字稿閱讀主容器 (文字排版最佳寬度)
│       ├── <BreadcrumbNav>         // 導航路徑 (🏠 全部課程 > 第 XX 堂)
│       ├── <StickyDoctrinalBar>    // 即時動態科判懸浮條 (隨音訊進度動態回溯完整科判鏈)
│       ├── <SessionHeader>         // 講次標題 (第 XX 堂 | 日期 | 頁碼) + [📑 行動端科判按鈕]
│       ├── <TOCAccordion>          // 內嵌可折疊科判手風琴清單
│       ├── <TranscriptViewer>      // 逐字稿虛擬捲動容器 (Virtual Scroller)
│       │   ├── <TranscriptHeading> // 【科判導讀】小標題
│       │   ├── <TOCAnchorCard>     // 📌 內嵌科判提示卡片 (點擊可展開該科判子樹)
│       │   └── <ParagraphBlock>    // 自然段落容器
│       │       └── <SentenceSpan>  // 逐句渲染項目 (點選跳播、雙擊校訂、長按選單)
│       └── <EndOfSessionCard>      // 講次完畢推薦卡 (自動倒數切換下一講)
│
├── <FixedPlayerBar>                // 置底常駐播放控制器
│   ├── <NowPlayingInfo>            // 當前講次簡稱、音文同步狀態指示燈
│   ├── <AudioControls>             // 上一講、原生音訊核心 (HTML5 Audio)、下一講
│   ├── <PlaybackRateButton>        // 循環倍速切換 (1.0x ➔ 1.2x ➔ 1.5x ➔ 2.0x)
│   └── <MobileTOCTrigger>          // 行動端科判大綱底部抽屜觸發鈕
│
├── <FloatingFAB>                   // 🎯 回到播放處懸浮鈕 (用戶滾動離開播放位置時平滑浮現)
├── <MobileDrawer>                  // 行動端左側滑出抽屜 (講次切換與課程清單)
├── <MobileActionSheet>             // 行動端 ⋯ 更多操作面板
├── <TouchContextMenu>              // 行動端長按氣泡快顯功能表 (播放、編輯、筆記、複製)
├── <TOCBottomSheet>                // 行動端底部科判滑出抽屜 (支援手勢拖曳關閉)
├── <SentenceEditorModal>           // 逐句校勘編輯器 (支援即時字元級 Diff 紅綠比對)
├── <LocalSyncModal>                // 本機學習後台同步彈窗 (Port 9091 狀態、雙向詞庫拉取)
└── <ReviewRatingModal>             // 1~10 分綜合講次審核評分與問題標籤彈窗
```

---

### 6.4 集中式單一資料流狀態設計 (Pinia Stores)

#### 1. `usePlayerStore` (音訊與播放同步域)
```typescript
interface PlayerState {
  audioElement: HTMLAudioElement | null;
  currentTime: number;          // 當前播放秒數 (高頻更新)
  duration: number;             // 音檔總時長 (秒)
  isPlaying: boolean;           // 播放狀態
  playbackRate: number;         // 1.0, 1.2, 1.5, 2.0
  activeSentenceId: string | null; // 當前活動句 ID
  activeSentenceIndex: number;  // 當前活動句在陣列中之索引
  isUserScrolling: boolean;     // 用戶主動滑動鎖定 (抑制自動置中)
  scrollLockTimer: number | null;
}

// 核心 Actions:
// - initAudio(src: string): 初始化音訊與事件監聽
// - play() / pause() / togglePlay()
// - seek(timeSeconds: number): 時間戳跳轉
// - setRate(rate: number): 設定倍速 (持久化至 localStorage)
// - updateActiveSentence(time: number): 二分搜尋比對句子時間戳 (O(log N))
// - lockScrollTemporarily(timeoutMs = 2500): 暫時鎖定自動滾動
// - unlockScroll(): 立即解除鎖定並將視圖捲動置中至當前句
```

#### 2. `useCourseStore` (課程、講次與科判資料域)
```typescript
interface CourseState {
  currentCourseId: string;       // 預設 '入中論善顯密意疏'
  catalog: CourseCatalogItem[];  // 全課程目錄
  sessions: SessionMeta[];       // 當前課程所有講次簡介 (共 219 講)
  currentSessionId: string;      // 例如 '02A'
  sessionDetail: SessionData | null; // 當前講次完整逐字稿 JSON
  tocTree: TOCNode[];            // 完整科判樹
  searchQuery: string;           // 全域搜尋關鍵字
  activeTOCChain: TOCNode[];     // 當前播放秒數所處的科判祖先鏈 (Root -> Leaf)
}

// 核心 Actions:
// - fetchCatalog(): 載入全站課程
// - switchSession(sessionId: string): 切換講次並平滑載入對應 JSON
// - computeActiveTOC(currentTime: number): 計算當前時間所屬科判節點與祖先鏈
// - searchTranscript(query: string): 全文檢索與結果匹配
```

#### 3. `useAnnotationStore` (校勘、筆記與本機學習後台域)
```typescript
interface AnnotationState {
  corrections: Record<string, CorrectionItem>; // 句子 ID -> 校勘內容
  notes: Record<string, NoteItem>;             // 句子 ID -> 研讀筆記
  syncServerStatus: 'online' | 'offline' | 'checking';
  syncPort: number;                            // 預設 9091
  learnedTerms: Record<string, string>;        // 95+ 個已學習專有名詞對照表
}

// 核心 Actions:
// - saveCorrection(sentId: string, original: string, corrected: string, note?: string)
// - saveNote(sentId: string, noteText: string)
// - exportMarkdownNotes(): 匯出當講所有筆記與校勘修訂為標準 Markdown
// - checkSyncServer(): 探測 http://127.0.0.1:9091/api/health
// - pushCorrectionToServer(data: any): 向本機 Python 服務器推送校勘建議
```

#### 4. `useUIStore` (介面偏好與閱讀模式域)
```typescript
interface UIState {
  mode: 'zen' | 'proofreader';   // 禪意研讀模式 vs 專業校訂模式
  theme: 'light' | 'dark' | 'sepia';
  fontSizeRatio: number;         // 0.8 ~ 1.5 (預設 1.0)
  isSidebarCollapsed: boolean;   // 側邊欄是否收起
  isMobileDrawerOpen: boolean;   // 行動端目錄抽屜開關
  isTOCDrawerOpen: boolean;      // 行動端科判底部抽屜開關
  isSentenceModalOpen: boolean;  // 校勘彈窗開關
  editingSentenceId: string | null;
}
```

---

### 6.5 核心技術攻堅方案 (Core Engineering Solutions)

#### 方案 A：音文微秒級同步與 RAF 解耦 (Decoupled RAF Audio Engine)
* **演算法實作**：
  在長達數千句的講次中，摒棄每幀 O(N) 的線性遍歷。逐字稿資料按照 `start_time` 嚴格遞增，採用二分搜尋比對：
  ```typescript
  export function findSentenceIndexByTime(sentences: Sentence[], time: number): number {
    let low = 0;
    let high = sentences.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const s = sentences[mid];
      if (time >= s.start_time && time <= s.end_time) {
        return mid;
      }
      if (time < s.start_time) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return -1;
  }
  ```
* **平滑滾動與手動干預防衝突機制**：
  當用戶手動滑動滾輪或觸控螢幕時，觸發 `wheel` / `touchmove` 事件，立即設定 `isUserScrolling = true` 並重置 2.5 秒靜態定時器。在此期間音訊繼續播放、句子邊框高亮正常更新，但**絕對不強制捲動視窗**。同時，畫面右下角平滑淡入 `Floating FAB`（🎯 回到播放處）；用戶點擊 FAB 時立刻解除鎖定並捲動置中。

#### 方案 B：動態高度虛擬滾動 (Virtual List with Dynamic Measurement)
* **解決方案**：
  逐字稿中句子長短不一（短則數字，長則數十字符），採用**動態高度預估 + 實際測量快取 (Dynamic Height Cache)** 方案。
  只對進入可視窗口（加上上下各 500px 緩衝區）的段落生成真實 DOM，離開窗口者僅以高度佔位符替代。
* **效益**：
  無論講次多長（即使 3,000 句），DOM 樹中的句子節點始終保持在 40~60 個之間，極大緩解瀏覽器 Layout 與 Paint 壓力。

#### 方案 C：雙視角切換體驗 (Zen Mode vs Proofreader Studio)
* **禪意研讀模式 (Zen Reader Mode)**：
  專為深入思維、靜心聞法設計。介面隱藏所有校勘按鈕、Diff 紅綠標記、技術資訊與多餘干擾，保留宋體美感、呼吸感留白與流暢科判，營造「如在講堂現場」之沉浸體驗。
* **專業校勘模式 (Proofreader Studio Mode)**：
  專為義工與文字校勘人員設計。在每句下方展示語音波形時間戳、字元級 Diff 比對按鈕、錯誤類型標記標籤（專有名詞、底本異文、斷句瑕疵）以及一鍵推送至本機 9091 後台之快捷按鈕。

---

### 6.6 漸進式遷移步驟 (Step-by-Step Migration Roadmap)

為了確保在重構過程中**不中斷現有服務、不破壞 294+ 項防回歸測試**，建議採取五階段漸進式遷移：

```
[階段 1: 專案基建] ➔ [階段 2: 狀態層與資料讀取] ➔ [階段 3: 元件化重構] ➔ [階段 4: 效能與功能增強] ➔ [階段 5: 雙軌驗收與切換]
  Vite+Vue3+TS        Pinia Stores + API      Reader, Player, TOC     虛擬滾動, Zen模式      294項測試100%全綠
```

1. **階段一：現代化構建底座搭建 (Build Pipeline)**
   * 初始化 `vite.config.ts`、TypeScript 配置與單元測試套件 `vitest`。
   * 將現有 `tokens.css` 與排版樣式導入 `src/styles/`，無損繼承既有字型與配色體系。
2. **階段二：資料與狀態層遷移 (Stores & Data Contracts)**
   * 建立 `usePlayerStore`, `useCourseStore`, `useAnnotationStore`, `useUIStore`。
   * 驗證與 `courses/入中論善顯密意疏/` 靜態 JSON 檔案讀取的完全相容性。
3. **階段三：核心視覺元件重構 (UI Components)**
   * 依序重構：頂部導航欄 ➔ 側邊欄 ➔ 置底播放器 ➔ 780px 閱讀主區與科判樹。
   * 嚴格保留既有 DOM `id` 與 `data-testid`（如 `#transcript-container`, `#audio-element`, `#playback-rate-btn`, `[data-testid="mobile-toc-drawer-btn"]`），確保自動化測試合約完全滿足。
4. **階段四：進階功能賦能 (Advanced Features)**
   * 導入動態虛擬滾動與二分法音文微秒級同步。
   * 實裝「禪意模式」與「校勘工作台模式」一鍵雙視角無縫切換。
5. **階段五：雙軌並行測試與正式部署 (Zero-Downtime Cutover)**
   * 執行全部 294 項自動化驗收測試（包含側邊欄篩選、科判導航、鍵盤快捷鍵、行動端抽屜），確保通過率 100%。
   * `vite build` 打包為純靜態檔案，無縫替換 GitHub Pages 部署入口。

---

### 6.7 現代化重構功能完整性對照矩陣 (Feature Completeness Matrix)

為防止在 V2 重構過程中丟失任何經過驗收的業務邏輯與人因工程細節，所有模組必須 100% 滿足下列合約標準：

| 領域 | 必備功能模組 | 對應組件 / Composable | 驗收測試合約 (Vitest) |
| :--- | :--- | :--- | :--- |
| **導航與搜尋** | ⌘K 全文搜尋、匹配計數、Enter 跳轉下一處 | `<GlobalSearchInput>`, `useSearchEngine` | `searchEngine.test.ts` |
| **播放與講次** | ⏮️ 上一講 / ⏭️ 下一講連動、循環倍速、時間格式化 | `<FixedPlayerBar>`, `usePlayerStore` | `sessionNavigation.test.ts` |
| **科判大綱** | 內嵌可折疊手風琴（本課/全書切換）、行動端滑出抽屜 | `<TOCAccordion>`, `<TOCBottomSheet>` | `tocAccordion.test.ts` |
| **互動校勘** | 雙擊/長按編輯、LCS 字元級 Diff（紅刪綠增） | `<SentenceEditorModal>`, `useAnnotationStore` | `annotationStore.test.ts` |
| **筆記與匯出** | 匯出當講校勘修訂與研讀心得為 Markdown 檔案 | `useExportNotes` | `exportNotes.test.ts` |
| **後台同步** | Port 9091 本機服務器狀態探測、雙向推送與詞庫拉取 | `<LocalSyncModal>` | `localSyncBackend.test.ts` |
| **品質審核** | 1~10 分綜合評分、問題類型標籤勾選與持久化 | `<ReviewRatingModal>` | `reviewRating.test.ts` |
| **課程總覽** | 219 講全景大網格卡片視圖與跳轉 | `<CourseOverviewModal>` | `courseOverview.test.ts` |
| **無障礙 (A11y)** | 空白鍵播放/暫停、`[` 鍵收合側欄、`Esc` 關閉彈窗 | `useKeyboardShortcuts` | `keyboardShortcuts.test.ts` |
| **行動端** | 分段切換、YouTube 影音/音訊切換、手勢抽屜、大拇指熱區 | `<MobileSegmentedTabs>`, `useUIStore` | `mobileUx.test.ts` |

---

### 6.8 全功能模組技術規範與介面合約 (Detailed Feature Specifications & API Contracts)

為確保 V2 現代化重構無任何功能遺漏，以下規範各模組之輸入輸出、DOM 契約與驗收行為：

#### 1. 全文檢索與跳轉 (`useSearchEngine` & `<GlobalSearchInput>`)
* **DOM 契約**：
  * 輸入框：`#search-input`，支援快捷鍵 `⌘K` / `Ctrl+K` 聚焦。
  * 統計指示：`#search-results-counter`（如 `3 / 15 處`）。
  * 跳轉按鈕：`#search-prev-btn`、`#search-next-btn`。
* **演算法與行為**：
  * 去除前後空白並防抖（Debounce 150ms），忽略大小寫。
  * 遍歷當前講次句子清單，比對 `original_text`、`text`、`proofread_text`。
  * 命中項目依時間序排列，記錄其 `sentence_id`、`match_index`、`start_time`。
  * 支援鍵盤 `Enter`（跳至下一處）與 `Shift+Enter`（跳至上一處）。
  * 跳轉時平滑滾動到目標句子，並觸發高亮黃色微動畫（2 秒後漸隱）。

#### 2. 上下一講無縫連動 (`usePlayerStore` Session Navigation)
* **DOM 契約**：
  * 上一講按鈕：`#prev-session-btn`（首講時自動停用 `disabled`）。
  * 下一講按鈕：`#next-session-btn`（末講時自動停用 `disabled`）。
* **排序與邊界**：
  * 嚴格遵循自然排序（如 `01` < `02A` < `02B` < `03` ... < `99B` < `100` ... < `219`）。
  * 切換時保留當前音量與倍速設定，更新 URL Hash（`#session-XX`），並無縫載入新講次逐字稿與音訊。

#### 3. 雙視角科判手風琴 (`<TOCAccordion>` & `<TOCBottomSheet>`)
* **DOM 契約**：
  * 展開/收合開關：`#toc-accordion-toggle`。
  * 視角切換器：`.toc-mode-switch`（`session`: 僅顯示本講涉及科判節點；`all`: 顯示全書科判樹）。
  * 節點元素：`.toc-item[data-start]`。
* **行為**：
  * 自動根據當前講次時間範圍過濾科判節點。
  * 點擊任意科判項目立即跳轉播放至該時間點，並同步高亮。

#### 4. 研讀心得與校勘 Markdown 匯出 (`useExportNotes`)
* **DOM 契約**：
  * 匯出按鈕：`#export-notes-btn`。
* **產出格式**：
  * 檔名規格：`{course_title}_{session_id}_校勘與研讀筆記_{YYYYMMDD}.md`。
  * 標頭：包含課程名稱、講次編號、底本頁碼、匯出時間與統計資訊。
  * 內容結構：逐條列出已校訂句子之時間戳、原文、修訂文、字元級差異比較、個人研讀心得筆記。
  * 透過瀏覽器 Blob 與 Object URL 觸發自動下載。

#### 5. 本機校勘同步後台 (`<LocalSyncModal>` & `useSyncBackend`)
* **DOM 契約**：
  * 觸發按鈕：`#sync-modal-btn`。
  * 狀態指示燈：`#sync-status-indicator`（綠色：在線；灰色：離線；黃色：探測中）。
  * 連接埠設定：`#sync-port-input`（預設 9091）。
  * 推送按鈕：`#sync-push-btn`。
* **行為**：
  * 發送 `GET http://127.0.0.1:9091/api/health`（超時 2000ms）。
  * 支援將本機 LocalStorage 中所有待同步校勘記錄批次 `POST http://127.0.0.1:9091/api/corrections`。
  * 同步完成後自動更新已學習專有名詞詞庫（`learned_corrections`）。

#### 6. 講次品質評分與回報 (`<ReviewRatingModal>` & `useReviewStore`)
* **DOM 契約**：
  * 評分觸發：`#review-modal-btn`。
  * 星級評分：`.rating-star-btn`（1 ~ 10 分）。
  * 問題分類多選標籤：`.tag-checkbox`（如「錯別字」、「漏音」、「斷句問題」、「專有名詞」、「底本有異」）。
  * 詳細回饋文字框：`#review-feedback-textarea`。
  * 提交按鈕：`#review-submit-btn`。
* **持久化**：
  * 儲存至 `localStorage`（鍵值 `transcriptions_reviews_{courseId}_{sessionId}`），支援覆寫與讀取既有評分。

#### 7. 219 講大網格總覽 (`<CourseOverviewModal>`)
* **DOM 契約**：
  * 總覽按鈕：`#course-overview-btn`。
  * 篩選器：`.overview-filter-input`。
  * 卡片網格：`.overview-grid`，卡片項 `.overview-card[data-session-id]`。
* **視覺與互動**：
  * 顯示 219 講之代號、副標題、日期、底本頁碼、校訂完成率。
  * 當前講次以金邊（`--accent-color`）標示。
  * 點擊卡片直接切換至該講次並關閉彈窗。

#### 8. 全域無障礙與鍵盤捷徑 (`useKeyboardShortcuts`)
* **捷徑規範**：
  * `Space`（空白鍵）：播放 / 暫停音訊（焦點在文字輸入框或文字區時不攔截）。
  * `[`（左中括號）：快速收合 / 展開側邊欄。
  * `Esc`（退出鍵）：關閉當前開啟之任何浮動彈窗（校勘彈窗、同步彈窗、評分彈窗、總覽彈窗、行動端抽屜）。
  * `⌘K` / `Ctrl+K`：聚焦全文檢索輸入框。

#### 9. 講末自動導引卡片 (`<EndOfSessionCard>`)
* **DOM 契約**：
  * 卡片容器：`.end-of-session-card`。
  * 倒數按鈕：`#next-session-countdown-btn`（10 秒倒數計時）。
  * 取消按鈕：`#cancel-countdown-btn`。
* **行為**：
  * 當音訊播放完畢或滾動至文末時呈現。
  * 顯示下一講預覽標題，若無取消則於倒數結束自動切換至下一講。

#### 10. 行動端長按氣泡選單 (Touch Context Menu)
* **DOM 契約**：
  * 懸浮選單容器：`.touch-context-menu`。
* **行為**：
  * 在行動端長按（Touchstart 持續 500ms）句子時於觸控位置上方彈出。
  * 提供「校勘此句」、「播放此句」、「複製文字」三大常用功能。

---


---

## 七、 多課程擴展、YouTube 影音整合與課文原檔對照規格 (Multi-Course, YouTube & Canonical Source Text Architecture)

為全面支援後續如性法師《釋量論第二品：成量品》等更多經論課程，平台架構由「單一課程檢視器」全面升級為**「多課程、多媒體來源、課文底本對照、學習與校稿一體化」之現代佛典研讀與校勘標準平台**。

### 7.1 多課程自治化目錄與註冊體系 (Multi-Course Registry)

全站課程統一由 `courses/catalog.json` 註冊管理，並維持各課程資料夾完全解耦、獨立自治：

```
courses/
├── catalog.json                     // 全站課程註冊清單 (中繼資料、總講數、媒體模式)
│
├── 入中論善顯密意疏/                // 課程 A (見悲青增格西，純音訊 MP3)
│   ├── course.json                  // 課程中繼資料 (219 講)
│   ├── toc.json                     // 全書科判樹
│   ├── audio_map.json               // 音檔路徑對照
│   ├── learned_corrections.json     // 課程專屬已學習專有名詞詞庫 (95+ 條)
│   └── sessions/                    // 各講逐字稿 JSON
│
└── 釋量論第二品/                    // 課程 B (如性法師，YouTube 播放列表 + 課文原檔)
    ├── course.json                  // 課程中繼資料 (含 YouTube Playlist URL)
    ├── toc.json                     // 成量品完整科判大綱
    ├── audio_map.json               // YouTube Video ID 與音訊映射
    ├── learned_corrections.json     // 因明學/釋量論專有名詞詞庫
    ├── source_text/                 // 📖 釋量論原典課文原檔 (偈頌、原疏)
    │   ├── verses_root.json         // 結構化梵藏漢對照偈頌 (含 verse_id, 頌文文字)
    │   └── text_full.md             // 完整課文文字檔
    └── sessions/                    // 各講逐字稿 JSON (含與 source_text 之錨定關聯)
```

#### `courses/catalog.json` 擴充規範：
```json
{
  "defaultCourseId": "ru-zhong-lun",
  "courses": [
    {
      "id": "ru-zhong-lun",
      "title": "入中論善顯密意疏",
      "master": "見悲青增格西",
      "description": "宗喀巴大師所著《入中論善顯密意疏》講記系列課程。本課程透過逐字稿與音檔雙向同步，導讀中觀應成派無自性空性正見。",
      "path": "courses/入中論善顯密意疏",
      "mediaType": "audio/mp3",
      "totalSessions": 219,
      "features": ["audio-sync", "toc-tree", "proofreading"]
    },
    {
      "id": "shi-liang-lun-er",
      "title": "釋量論第二品",
      "master": "如性法師",
      "description": "如性法師開示《釋量論第二品：成量品》講記系列課程。",
      "path": "courses/釋量論第二品",
      "mediaType": "video/youtube-playlist",
      "playlistUrl": "https://www.youtube.com/watch?v=s-zO8jcvI2A&list=PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI",
      "totalSessions": 0,
      "features": ["youtube-sync", "source-text-dual-pane", "toc-tree", "proofreading"]
    }
  ]
}
```

---

### 7.2 多媒體適配器抽象層 (Unified Media Provider Pattern)

為同時相容「本機/CDN MP3 音檔」與「YouTube 播放清單 / 影片」，上層的音文同步引擎不直接依賴 `<audio>` 標籤，而是透過統一的 `IMediaAdapter` 介面封裝：

```typescript
// 統一媒體播放器介面合約
export interface IMediaAdapter {
  init(container: HTMLElement, config: MediaConfig): Promise<void>;
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  onTimeUpdate(callback: (currentTime: number) => void): () => void;
  onStateChange(callback: (state: 'playing' | 'paused' | 'ended' | 'buffering') => void): () => void;
  destroy(): void;
}
```

#### 具體實作：
1. **`HTML5AudioAdapter`**：基於原生 HTML5 Audio，服務於現有的純音檔課程。
2. **`YouTubeIframeAdapter`**：
   * 整合官方 **YouTube IFrame Player API** (`https://www.youtube.com/iframe_api`)。
   * 自動解析講次資料中的 `youtube_video_id` 或從 Playlist 自動對齊影片。
   * 透過 `requestAnimationFrame` 或 100ms 高頻輪詢取得 `player.getCurrentTime()`，毫秒級傳遞給 Pinia `usePlayerStore`，完美複用二分搜尋音文同步與卡拉 OK 高亮。
   * **雙顯示模式切換 (Display Modes)**：
     * **純聽聞省流量模式 (Audio-Only / Hidden IFrame)**：適合行動端通勤、鎖屏或低頻寬環境，將 YouTube 畫面隱藏或最小化，僅播放聲音與同步逐字稿。
     * **子母畫面 / 影音分欄模式 (Video PiP / Split-View Mode)**：當法師在黑板板書、指涉簡報投影片時，提供可拖曳縮放的懸浮視窗或上置影音區。

---

### 7.3 課文原檔與底本對照系統 (Canonical Source Text Dual-Pane System)

佛教經論研讀的核心特色，在於法師的講解是圍繞著「課文原典（偈頌或論著原文）」逐句釋意發揮。

#### 1. 課文結構化定義 (`courses/{course_id}/source_text/verses_root.json`)
```json
[
  {
    "verse_id": "v-01",
    "chapter": "成量品",
    "number": 1,
    "root_text": "敬禮定量欲利生，大師示導善逝救。",
    "tibetan": "ཚད་མར་གྱུར་པ་འགྲོ་ལ་ཕན་བཞེད་པ། །སྟོན་པ་བདེ་གཤེགས་སྐྱོབ་ལ་ཕྱག་འཚལ་ནས། །",
    "annotation": "此為《釋量論》全論之立宗歸敬頌，宣說世尊具足量士夫之德相。"
  },
  {
    "verse_id": "v-02",
    "chapter": "成量品",
    "number": 2,
    "root_text": "為成定量故宣說，此中定量不欺誑，明不知義故定量。",
    "tibetan": "ཚད་མ་བསླུ་མེད་ཅན་ཤེས་པ། །མ་ཤེས་དོན་གྱི་གསལ་བྱེད་ཀྱང་། །",
    "annotation": "宣說量之定義：一者不欺誑識，二者明未知義。"
  }
]
```

#### 2. 逐字稿句子與底本之雙向錨定 (`root_verse_id`)
在各講逐字稿 JSON (`session_xx.json`) 的句子物件中，支援可選欄位 `root_verse_id`：
```json
{
  "id": "s-42",
  "start_time": 182.5,
  "end_time": 190.2,
  "text": "法師說：我們看第一句偈頌，『敬禮定量欲利生，大師示導善逝救』，這裡的敬禮就是禮敬量士夫。",
  "root_verse_id": "v-01"
}
```

#### 3. 雙欄對讀互動機制 (Dual-Pane Reader Layout)
* **桌面端雙欄對照 (Split-Pane)**：
  * 左欄（寬度 360px 可收合）：**課文原典檢視器 (Canonical Text Viewer)**，展示原典偈頌、藏文原音、原注。
  * 右欄（780px）：**法師講記逐字稿 (Oral Lecture Transcript)**。
* **雙向同步聯動 (Bidirectional Sync)**：
  * **聽講驅動**：音訊/影片播放至句 `s-42` 時，左欄課文自動滾動至對應的 `v-01` 偈頌並加上沉金高光背景。
  * **閱讀驅動**：學員研讀課文時，點擊左欄任一偈頌旁的「🎧 聽解說」圖示，右欄逐字稿與播放器立刻自動尋道（Seek）至法師講解該頌的起始時間點。

---

### 7.4 一體化框架：自主研學 (Learning) 與 群眾校稿 (Proofreading) 雙引擎

本架構在同一個程式底座中，徹底打通「一般學員聽讀研學」與「義工學員專業校稿」兩大需求：

```
+-------------------------------------------------------------------------+
|                    統一多課程多媒體底座 (Core Engine)                     |
|    - Multi-Course Catalog      - Unified Media Adapter (Audio/YouTube)  |
|    - 2分法微秒音文同步           - 課文底本雙欄對照與錨定 (Root Text)       |
+------------------------------------+------------------------------------+
                                     |
           +-------------------------+-------------------------+
           |                                                   |
           v                                                   v
   【 🌿 禪意學習模式 】                               【 🛠️ 專業校勘工作台 】
   - 專注聽聞、無干擾極簡排版                           - 語音波形與時間戳精確微調
   - 偈頌與講記對讀研習                                 - 課文底本智慧印證 (ASR vs 頌文比對)
   - 科判全景導引與祖先鏈                               - 專有名詞主動學習與沉澱詞庫
   - 個人心得筆記與書籤標記                             - 本機 Port 9091 雙向同步 / GitHub PR 提報
```

#### 1. 課文底本智慧印證校稿 (Canonical Ground Truth Proofreading)
* **痛點**：法師在講解《釋量論》或《入中論》時，經常口誦課文，而通用 ASR 語音模型常將佛學專有名詞辨識為日常同音字（如將「所量」辨識為「數量」、「比量」辨識為「比良」、「自證」辨識為「自證」）。
* **底本印證機制**：當逐字稿句標記有 `root_verse_id` 時，校勘編輯器（`SentenceEditorModal`）自動調出對應偈頌進行字元級 Fuzzy 比對。若發現疑似同音訛字，介面直接彈出「課文建議替換詞」，校對者只需**按一下空白鍵即可瞬間完成校正**，效率提升 5 倍以上。

#### 2. 獨立自治的課程詞庫學習 (Autonomous Lexicon per Course)
* 每個課程擁有獨立的 `courses/{course_id}/learned_corrections.json`。
* 義工在校訂《釋量論》時累積的因明學專有名詞（如「量士夫」、「能立」、「所立」、「因三相」、「宗法」、「同品定有」），會直接沉澱至該課程詞庫中，並在後續批次校正與新講次轉譯時自動優先套用，實現「越校稿、系統越聰明」的正向回饋循環。



