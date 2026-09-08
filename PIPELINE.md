# 🎙️ Tibetan Buddhist Lecture Transcription & AI Alignment Pipeline

本專案提供一套**100% 本地化（零外部雲端 API 依賴）**的高精度佛學錄音逐字稿轉錄、聲學時間戳對齊、論疏底本真值校正、語意分段與小標題生成流程。

任何 AI Agent 或開發者均可在具備 GPU（如 GX10）的環境下一鍵重現完全一致的成果。

---

## 🏛️ 系統架構與本地模型配置

| 元件 | 技術堆疊 / 模型 | 執行環境與端點 | 用途 |
| :--- | :--- | :--- | :--- |
| **本地語音辨識 (ASR)** | `faster-whisper large-v3-turbo` (VAD Filtered) | GX10 本地 GPU / CUDA / Python 3.11 | 零遺漏提取法師完整口述，產生字級/句級毫秒時間戳 |
| **權威真值底本庫** | 《入中論善顯密意疏》285 頁純文字庫 + 250 組偈頌索引 | `courses/入中論善顯密意疏/source_text/` | 提供各講次之標準文言字句、科判與佛學名相真值（Ground Truth） |
| **本地大語言模型 (LLM)** | `Qwen3.8-27B-FP8` (vLLM Engine) | `http://192.168.122.1:8001/v1/chat/completions` | 結合底本進行雙軌校正（文言引文對齊底本、口語開示保留語氣）、結構分析與小標題劃分 |
| **聲學同步盲測驗證** | `scripts/verify_audio_sync.py` (FFmpeg + Whisper) | 本地 / GX10 自動化測試 | 隨機切片音訊盲測，客觀比對 ASR 與文字吻合度（$\ge 75\%$） |
| **前端串流播放** | 原生 HTML5 Audio + `audio_map.json` | 官方原始 Flyday MP3 串流 (`https://buddha.flyday.com.tw/...`) | 網頁端直接載入原始高音質音檔，免自建音訊伺服器 |

---

## 🚀 複製與批次處理工作流程（5 步標準 Grounded Pipeline）

針對任何單堂課（例如 `01`、`29A`），依序執行以下 5 個步驟即可生成標準成果：

### 步驟 0：課次頁碼切片與底本掛載（Ground Truth Slicing）
* 依據 `course.json` 中的 `pageRange`（例如 `29A`: `p.97-p.100`，`01`: `p.63`），自動載入對應頁碼之論疏文字（`page_097.txt` ~ `page_100.txt`）。
* 自動從底本中抽取該講專屬之佛學專有名相（如「勝義諦」、「正世俗」、「倒世俗」、「損壞根」、「眩翳」等）。

### 步驟 1：完整 ASR 語音轉錄與聲學對齊
```bash
# 在 GX10 上執行 Whisper Large-v3 轉錄
python3 scripts/batch_convert_all.py --sessions 01
```
* **產出**：提取無遺漏的講述音軌，生成具備嚴格單調遞增時間戳（`start`, `end`）的句子陣列。

### 步驟 2：動態術語庫注入與標點初修（Pre-polishing）
* **產出**：依據停頓（`gap < 1.1s`）將碎片語音整併為自然全句，加上正體中文標點（`，` `。` `？` `！`），並套用動態佛學詞庫初修同音字。

### 步驟 3：調用本地 Qwen3.8-27B 進行底本雙軌深度校對（Grounded Proofreading）
* **輸入**：當講論疏底本全文 + ASR 句子批次（每批 12 句）。
* **雙軌原則**：
  1. **誦讀論疏/禮讚文時**：嚴格依照底本字句校正 ASR 錯字（如「僕為世間不許多 ➔ 普為世間不請友」、「摩尼塔王 ➔ 牟尼法王」）。
  2. **白話講述開示時**：保持口語對話與開示語氣自然流暢，僅依據底本校正佛學名相，不強行改寫為文言。
* **產出**：嚴格保持 1:1 句數與時間戳的純淨繁體中文逐字稿。

### 步驟 4：調用本地 Qwen3.8-27B 進行文義結構與小標題劃分
* **產出**：大模型研讀全篇內容，依科判與論義轉折劃分 6~10 個核心主題章節小標題，寫入 `paragraphs[].heading`。

### 步驟 5：客觀聲學同步盲測與單元驗收測試
```bash
# 1. 聲學同步盲測
python3 scripts/verify_audio_sync.py 29A audio/29A.mp3 --samples 15

# 2. 全套前端與資料驗收測試
npm test
```

---

## 📊 成果檢驗標準

1. **論疏引文真值吻合度**：凡法師誦讀之頌文與論疏，需與 `source_text/` 底本 100% 一致。
2. **聲學吻合度**：`verify_audio_sync.py` 盲測通過率需 $\ge 75\%$。
3. **時間戳單調性**：所有句子必須滿足 $s[i].\text{start} \ge s[i-1].\text{end} - 0.05$。
4. **音訊連結**：`audioUrl` 與 `audio_map.json` 指向官方原始 Flyday 串流。
5. **測試套件**：`npm test` 包含 148 項單元與驗收測試全數通過（PASS 綠燈；1 項品質測試預設跳過，可透過 `TRANSCRIPTIONS_RUN_QUALITY=1` 啟用）。

---

## 🧱 段落邊界（Paragraph Boundary）完整性規則

段落劃分只服務「閱讀節奏」與「小標題主題切換」，不得切斷句法。下一段轉錄／校對／結構化步驟都必須遵守以下規則：

1. **不得在未完成句、詞組或引用續文中建立 paragraph 邊界。** 當一個 paragraph 的最後一個 `sentence.text` 沒有句末標點（`。！？`）且下一個 paragraph 的首句是其語法續文（介詞、連詞、量詞、補語、名詞短語延續等），必須把下一段併入同一 paragraph，不得跨段。
2. **檢出方式**：以 `paragraphs[].sentences` 為單位，比較「上一段末句的 `text` 末尾字元」與「下一段首句的 `text` 開頭字元」。若上一段末句不以句末標點收尾（`[。！？…」』]`），且滿足下列**全部**條件，則視為明確錯斷，須合併：
   - 上一段末句長度 ≤ 14 字元（避免誤把一般段落切分當錯斷）；
   - 上一段末句不以「的是了不在也都就還又但而之」等子句收束常見字元結尾；
   - 下一段首句開頭不是新主題常見起首詞（`所這那一二三四五六七八九十某何為並另再接下不此外然雖當如果即就或乃豈寧`）；
   - 合併後的串接文字語法上明顯比切開更順（例如 `我`+`們`=`我們`、`莊`+`嚴`=`莊嚴`、`所`+`以`=`所以`、`成`+`佛`=`成佛`、`簡`+`單`=`簡單` 等 mid-word / mid-quote 錯斷）。
3. **修復手段**：只允許「把後續 paragraph 的 `sentences` 原順序併入上一段，並把上一段 `paragraphs[i].end` 更新為合併前最末段的 `end`」。**禁止**：
   - 修改任何 `sentence.id`、`sentence.text`、`sentence.start`、`sentence.end`、`sentence.rawText` 或其他音檔對齊欄位。
   - 把多句文字合併成單一 `sentence`（每個 `sentence` 仍須獨立存在）。
   - 新增空白 placeholder sentence。
   - 改動後續 paragraph 的 `id`、內容或順序。
4. **可重現驗收**：`tests/unit/paragraphBoundaryIntegrity.test.js` 至少以 `session_27` 的 `sent-400` / `sent-401` 為 regression fixture，斷言兩者同 paragraph 且拼接後包含「他是在無漏蘊體的聚合體及續流上假立而有」。該測試須覆蓋**全部 32 講**（不限 session_27）：
   - 每講 paragraph 內的 sentence 時間戳單調遞增；
   - 每講 sentence id 不重複、無孤兒 sentence；
   - 每講 paragraph 自身的 `.end` 等於其最末句 `.end`（合併後無殘留）；
   - 每講每個 paragraph 的 `id` 與 `sentences[]` 中 sentence 順序皆未變動。

   測試須可用 `node --test` 獨立執行（`node --test tests/unit/paragraphBoundaryIntegrity.test.js`），並納入 `npm test`。
5. **可審計證據**：每次 paragraph 邊界修復必須在 `reviews/evidence/<course>_<session>_boundary/` 留下 `summary.md`、`before_after.json`、`commands.log`，記錄 baseline/after 雜湊、paragraph/sentence 計數、修改檔案清單與所有執行指令的 exit code。`session_NN` 全 32 講統一在 `reviews/evidence/shiliang_32/` 留下 `upgrade_evidence.json` 與 `summary.md`。

## 🏷️ 科判編號（Heading Ordinal）一致性規則

`paragraphs[].heading` 為閱讀索引、科判導讀、TOC 對齊的主要依據，須遵守以下規則：

1. **權威來源**：`courses/<course>/toc.json` 的 `sections[].children` 為序位權威。每個 child 的 `title` 形如 `一、xxx` / `二、xxx` / …，其中 `一`～`十三` 為中文序位。
2. **格式**：`paragraph.heading` 必須寫成「`【<原分類>】<序位>、<標題>`」格式。`<原分類>` 是 heading 中既有的 `【…】` 標籤（`法義深探`、`名相辨析`、`破邪顯正`、`正理修持`、`教誡結語`、`科判導讀`、`根本頌釋`、`重點總結` 等），不可改寫。`<標題>` 沿用 heading 既有標題文字；當 toc 與現存標題出現 Unicode 異體（例如 `今` vs `㉃今`、`下` vs `㆘`），以**現存 heading 文字為準**，不主動統一。
3. **重複段處理**：同一講內若多個 paragraph 共用同一段標題文字，必須沿用同一序位；不得因重複出現而重新指派。
4. **缺漏處理**：當 toc 的某個 child 在該講找不到任何匹配的 paragraph（標題文字模糊對應失敗），不要憑空補上該序位；改在 `reviews/evidence/shiliang_32/summary.md` 與 `upgrade_evidence.json` 留下 `missingTocOrdinals` 紀錄，待音檔／底本確認後再修。
5. **可重現驗收**：`tests/unit/paragraphBoundaryIntegrity.test.js` 內「`全 32 講 paragraph.heading 必須符合【分類】<ordinal>、標題 格式`」與「`每講重複出現的相同 paragraph.title 必須使用同一 ordinal`」兩個斷言須通過；toc 與 heading 的對齊證據留在 `reviews/evidence/shiliang_32/upgrade_evidence.json`。
