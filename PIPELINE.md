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

### 步驟 5：客觀聲學同步盲測、回歸審計與單元驗收測試
```bash
# 1. 單講品質審計與 7 大 Pattern 回歸測試（例如 97B 或 29A）
npm run audit:session -- 97B

# 2. 聲學同步盲測
python3 scripts/verify_audio_sync.py 29A audio/29A.mp3 --samples 15

# 3. 全套前端與資料驗收測試
npm test
```

---

## 📊 成果檢驗標準

1. **論疏引文真值吻合度**：凡法師誦讀之頌文與論疏，需與 `source_text/` 底本 100% 一致。
2. **聲學吻合度**：`verify_audio_sync.py` 盲測通過率需 $\ge 75\%$。
3. **時間戳單調性**：所有句子必須滿足 $s[i].\text{start} \ge s[i-1].\text{end} - 0.05$。
4. **音訊連結**：`audioUrl` 與 `audio_map.json` 指向官方原始 Flyday 串流。
5. **單講品質審計**：`npm run audit:session -- <sessionId>` 達到 0 Failures（符合 29A Golden Standard）。
6. **測試套件**：`npm test` 包含 148 項單元與驗收測試全數通過（PASS 綠燈；1 項品質測試預設跳過，可透過 `TRANSCRIPTIONS_RUN_QUALITY=1` 啟用）。


