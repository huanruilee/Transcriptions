# 🧪 自動化測試套件規範與要求說明 (Testing Specification)

本專案建立了涵蓋 **單元測試（Unit）**、**驗收測試（Acceptance）**、**端到端瀏覽器測試（Browser Smoke）** 與 **聲學盲測（Acoustic Verification）** 的全方位自動化測試體系。測試數量與結果以該版本的 CI 報告為準，不將歷史通過數視為當前驗收。

---

## 📋 測試類別與涵蓋要求

```mermaid
graph TD
    A[分層測試體系] --> B[1. 聲學同步與時間戳單調性]
    A --> C[2. 官方音檔串流與解析]
    A --> D[3. 原典底本與資料 Schema]
    A --> E[4. 本地大模型小標題與結構]
    A --> F[5. 393節點科判目錄連動]
    A --> G[6. 前端 UX、搜尋與無障礙]
    A --> H[7. 逐字稿完整性與防截斷]
```

---

### 1️⃣ 聲學同步與時間戳嚴謹性測試 (Acoustic & Monotonicity)
* **相關檔案**：`tests/unit/timeAligner.test.js`, `tests/unit/syncPlayer.test.js`, `tests/unit/textSegmenter.test.js`, `tests/acceptance/localModelHeadings.test.js`, `scripts/verify_audio_sync.py`
* **檢驗要求**：
  1. **時間戳嚴格單調遞增**：所有句子必須滿足 $s[i].\text{start} \ge s[i-1].\text{end} - 0.05$ 秒，絕不允許時間軸回溯或倒流。
  2. **二分搜尋效率**：`findSentenceIndexByTime` 需在 $O(\log N)$ 時間複雜度內精確鎖定當前發音句子。
  3. **語音停頓平滑維持**：法師開示停頓（Silence gap）期間，播放器需平滑維持上一句的高亮狀態，不閃爍。
  4. **比例縮放適應（Ratio Scaling）**：當音訊時長與逐字稿有些微時差時，自動計算比例對齊。
  5. **聲學盲測吻合度**：`verify_audio_sync.py` 透過 FFmpeg 隨機截取 15 段音訊並呼叫 ASR 交叉比對，吻合率需 $\ge 75\%$。

---

### 2️⃣ 官方原始音檔解析測試 (Audio Map & Stream Resolution)
* **相關檔案**：`tests/unit/audioMap.test.js`, `tests/unit/resolveAudioUrl.test.js`
* **檢驗要求**：
  1. **198 講全量覆蓋**：`audio_map.json` 必須 100% 包含全書 198 堂課的官方 Flyday 原始 MP3 串流網址。
  2. **解析相容性**：`resolveAudioUrl` 需同時支援相對路徑（`audio/29A.mp3`）與官方遠端 URL（`https://buddha.flyday.com.tw/...`）。
  3. **播放保護**：防止未緩衝的音訊直接 seek 導致播放器卡死或重頭播放。

---

### 3️⃣ 《入中論善顯密意疏》原典底本對齊測試 (Treatise Ground Truth)
* **相關檔案**：`tests/unit/sourceTextGrounding.test.js`, `tests/unit/dataSchema.test.js`
* **檢驗要求**：
  1. **285 頁原典底本存在性**：驗證真值底本（Ground-truth）285 頁論著全文皆存在且內容完整。
  2. **月稱菩薩本頌驗證**：驗證 `all_verses.json` 中收錄的所有偈頌出處與頁碼對照無誤。
  3. **講次頁碼映射**：驗證 `course.json` 中各堂課標註的 `pageRange` 皆能精確對應到真實論著頁面。
  4. **Schema 嚴格性**：驗證所有 `session_*.json` 符合 `sessionId`, `audioUrl`, `lastUpdated`, `paragraphs`, `sentences` 標準格式。

---

### 4️⃣ 本地大模型篇章結構與小標題測試 (Local LLM Structure & Headings)
* **相關檔案**：`tests/acceptance/localModelHeadings.test.js`
* **檢驗要求**：
  1. **主題劃分合理性**：驗證大模型產出 6～10 個符合《善顯密意疏》論義轉折的章節小標題。
  2. **DOM 視覺渲染**：驗證包含標題的段落能正確在網頁中生成 `<h3 class="transcript-heading">`。
  3. **段落 ID 綁定**：小標題需精準綁定至對應的起始段落 ID（如 `p-1`, `p-27` 等）。

---

### 5️⃣ 🌟 29A 黃金標準高階驗收測試 (29A Golden Benchmark Quality Standard)
* **相關檔案**：`tests/acceptance/goldenStandard.test.js`
* **檢驗要求（針對所有已完成轉換之最新講次）**：
  1. **Pattern 1 - 引擎與版本元數據**：驗證包含 `_meta.engine` (Whisper Large-v3)、`_meta.llm_proofread` (Qwen3.8-27B)、`lastUpdated` (YYYY-MM-DD) 以及段落/句子計數完全一致。
  2. **Pattern 2 - 官方廣播級音訊串流**：驗證 `audioUrl` 直連 Flyday 官方原始 MP3 串流。
  3. **Pattern 3 - 主題小標題格式與段落密度**：驗證小標題語法為 `【主題】說明`，且平均段落密度介於 1.5～8.0 句之間。
  4. **Pattern 4 - 禁用同音字與法相純淨度（Negative Patterns）**：硬性斷言絕無「非紋症/肺紋症」、「至向有/自向有」、「損壞羹/更」、「設法心法」、「不先一心法」、「生一地/生意地」、「七狂法/七況法」、「羊眼」等 ASR 語音錯字。
  5. **Pattern 5 - 毫秒級聲學嚴格單調性**：驗證每個句子時間戳 $s[i].\text{start} \ge s[i-1].\text{end} - 0.05$ 秒，完全消除時間軸回溯。

---

### 6️⃣ 全書總科判目錄體系連動測試 (TOC & Navigation)
* **相關檔案**：`tests/unit/toc.test.js`, `tests/cross-artifact-consistency.test.js`
* **檢驗要求**：
  1. **393 個階層節點**：驗證 17 頁完整總科判（甲、乙、丙、丁、戊、己、庚層級）完整載入。
  2. **講次跳轉連動**：點擊科判條目必須正確跳轉至該講次與課本頁碼，絕無死連結（Dead links）。

---

### 6️⃣ 前端 UX、搜尋與無障礙測試 (Search, UX & A11y)
* **相關檔案**：`tests/unit/search.test.js`, `tests/unit/sidebarFilterBehavior.test.js`, `tests/unit/uxCourseOverview.test.js`, `tests/unit/a11y.test.js`, `tests/acceptance/browserSmoke.test.js`
* **檢驗要求**：
  1. **即時文字搜尋**：支援逐字稿內全文搜尋、黃色高亮匹配、`Enter` / `Shift+Enter` 上下跳轉匹配點、`Escape` 清除。
  2. **側邊欄多維過濾**：支援依講次編號（`02A`）、摘要關鍵字（`歸敬頌`）、頁碼（`p.63`）進行模糊過濾。
  3. **無障礙（A11y）防 Tab 陷阱**：實作 Roving Tabindex（僅第一句為 Tab focusable，其餘為 `-1`），防止鍵盤使用者陷入千句 Tab 迴圈。
  4. **瀏覽器端到端正常性**：Console 零致命報錯、所有 JS/CSS/JSON/MP3 資源 Content-Type 正確無誤。

---

### 7️⃣ 逐字稿完整性與防截斷測試 (Completion & Quality)
* **相關檔案**：`tests/acceptance/completion.test.js`, `tests/quality.test.js`, `tests/required-set-not-truncated.test.js`
* **檢驗要求**：
  1. **零內容遺漏**：逐字稿字數需與音訊時長完全匹配，無任何開頭或結尾截斷。
  2. **零大模型殘留雜質**：文字中絕不可包含「好的，這是我為您校對的...」或 Markdown 代碼塊等 Prompt 雜訊。

---

## 🏃 執行全套測試

```bash
npm test
```
* **期望結果**：零失敗；逐項列出 skip 與適用範圍。歷史數量不作為當前通過依據。


## 閱讀器發布 Test Patterns（2026-10-24）

來源：第 30 講重整版曾只新增獨立出版頁，主閱讀器仍載入舊 session。產物正確與 CI 通過，不代表使用者原入口已更新。以下五層須分別驗證：

| Pattern | 驗證契約 | 執行入口 |
| --- | --- | --- |
| 入口整合 | 從實際 course metadata 與原網址載入 App；本文套用已核定版本，不能只驗證連結存在 | `tests/unit_v2/shiliangRebuildReader.test.ts` |
| 資料保真 | ID、順序、時間、文字完整；source／approval digest 變動須拒絕投影；閱讀確認不冒稱聽核 | `tests/unit/shiliangRebuildReader.test.js` |
| 失敗回退 | 404、網路例外、過期來源及未核定內容：明示顯示原稿，保留末句與全句數，不顯示「本文已套用」或新版日期 | `tests/unit_v2/shiliangRebuildReader.test.ts` |
| 畫面／下載一致 | 實際點擊下載，核對全部句子與原時間碼、標題及未逐句聽核提醒；formatter 單元測試不能取代下載驗收 | `tests/browser/readerRelease.spec.ts` |
| 版本／部署驗收 | 在上傳前的相同 `_site` 及部署後原網址，以桌面／手機 Chromium 驗證預期 build 資產、已核定正文與標題、實際下載 | `.github/workflows/deploy.yml` |

瀏覽器 gate 不得因缺 Chromium 或網址不可達而 skip；載入舊資產、舊正文或缺少正文皆失敗。預期值來自 checkout 的 build 與已核定 publication，不能從待驗證網站反推預期值。部署成功後 smoke 失敗，整個部署 workflow 仍為失敗，須修復或 revert，不以 deploy-pages 成功冒稱驗收完成。

瀏覽器會從釋量論第二品 course metadata 自動列舉所有已發布且 sourceRebuildStatus 為 reading-approved 的講次，目前包含第 30、31 講；兩講主頁、核定正文與實際下載均須通過。已發布核定重整版若缺少主閱讀器啟用設定，Node 與 browser gate 都直接失敗，不能從案例清單靜默漏掉。此範圍仍不代表全庫均已驗證；新增其他課程或發布路徑時須增加案例。測試攔截外部 YouTube 媒體與 Google Fonts 字型請求以降低外部服務干擾；本站 JS／CSS／JSON 維持真實載入。這是閱讀器與下載工程 gate，不是影音播放、聲學對齊或人工聽核。

```bash
# 既有快測與失敗回退
npx vitest run tests/unit_v2/shiliangRebuildReader.test.ts
node --test tests/unit/shiliangRebuildReader.test.js

# 瀏覽器：須先 build 與準備站台，CI 自動執行以下兩階段
npx playwright install --with-deps chromium
READER_BASE_URL=http://127.0.0.1:4173/Transcriptions/ npm run test:reader-smoke
READER_SMOKE_PHASE=deployed READER_BASE_URL=https://huanruilee.github.io/Transcriptions/ npm run test:reader-smoke
```

前一個指令要求本機伺服器提供與預計上傳相同的站台，且 `dist/index.html` 是該版本 `vite build --base=/Transcriptions/` 的輸出。CI 的準備與啟動方式見 deploy workflow。每次瀏覽器驗收保存 JSON 結果與成功畫面；失敗另保存 screenshot／trace，附於該 deployment run 的 `reader-release-<SHA>` artifact。artifact 與 deployed 結果分開保存。測試採零重試，不用自動重試掩蓋失敗。

手機 viewport 的實際點擊前先將下載按鈕捲至視窗中央，確認完整位於 viewport，再以一般 pointer hit testing 點擊；禁止 `force: true` 或改用程式直接呼叫匯出來繞過遮擋。成功截圖以獨立 PNG 隨證據 artifact 保存。

同一個 `scripts/test_reader_artifact.sh` 亦在 PR／main 的 Completion Acceptance Linux browser job 執行，以免只在合併後才發現跨平台互動問題。手機案例使用正常觸控 `tap()`，桌面使用正常 `click()`；兩者皆保留 actionability／hit testing，並保存下載前 hit-target 診斷。

手機案例另驗證 `innerWidth` 等於設定的viewport寬度，且document不得水平溢位；不同OS字型／表單intrinsic width導致的版面擴張亦須失敗，不以縮放或更改手機viewport隱藏問題。
