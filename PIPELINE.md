# 🎙️ Tibetan Buddhist Lecture Transcription & AI Alignment Pipeline

本專案提供一套**100% 本地化（零外部雲端 API 依賴）**的高精度佛學錄音逐字稿轉錄、聲學時間戳對齊、佛學名相校正、語意分段與小標題生成流程。

任何 AI Agent 或開發者均可在具備 GPU（如 GX10）的環境下一鍵重現完全一致的成果。

---

## 🏛️ 系統架構與本地模型配置

| 元件 | 技術堆疊 / 模型 | 執行環境與端點 | 用途 |
| :--- | :--- | :--- | :--- |
| **本地語音辨識 (ASR)** | `faster-whisper large-v3-turbo` (VAD Filtered) | GX10 本地 GPU / CUDA / Python 3.11 | 零遺漏提取法師完整口述，產生字級/句級毫秒時間戳 |
| **本地大語言模型 (LLM)** | `Qwen3.8-27B-FP8` (vLLM Engine) | `http://192.168.122.1:8001/v1/chat/completions` | 佛學名相同音字校正、文義分析、篇章結構與小標題劃分 |
| **聲學同步盲測驗證** | `scripts/verify_audio_sync.py` (FFmpeg + Whisper) | 本地 / GX10 自動化測試 | 隨機切片音訊盲測，客觀比對 ASR 與文字吻合度（$\ge 75\%$） |
| **前端串流播放** | 原生 HTML5 Audio + `audio_map.json` | 官方原始 Flyday MP3 串流 (`https://buddha.flyday.com.tw/...`) | 網頁端直接載入原始高音質音檔，免自建音訊伺服器 |

---

## 🚀 複製與批次處理工作流程（5 步標準 Pipeline）

針對任何單堂課（例如 `29A`），依序執行以下 5 個步驟即可生成標準成果：

### 步驟 1：完整 ASR 語音轉錄與聲學對齊
```bash
# 在 GX10 上執行 Whisper Large-v3 轉錄
python3 scripts/retranscribe_session.py 29A
```
* **產出**：提取無遺漏的講述音軌，生成具備嚴格單調遞增時間戳（`start`, `end`）的句子陣列。

### 步驟 2：佛學詞典與基礎標點初修
```bash
python3 scripts/polish_session_29A.py
```
* **產出**：依據停頓（`gap < 1.1s`）將碎片語音整併為自然全句，加上正體中文標點（`，` `。` `？` `！`），並替換基礎同音詞。

### 步驟 3：調用本地 Qwen3.8-27B 進行深度佛學校對
```bash
python3 scripts/llm_proofread_session_29A.py
```
* **產出**：調用 GX10 本地 vLLM 端點，嚴格保持 1:1 句數與時間戳，修正「飛蚊症」、「自相有」、「執正識/倒識」、「損壞根」、「色法心法不相應行法」等深度法義同音錯字。

### 步驟 4：調用本地 Qwen3.8-27B 進行文義結構與小標題劃分
```bash
python3 scripts/llm_structure_analysis_29A.py
```
* **產出**：大模型研讀全篇內容，依科判與論義轉折劃分 6~10 個核心主題章節小標題，寫入 `session_29A.json` 的 `paragraphs[].heading`。

### 步驟 5：客觀聲學同步盲測與單元驗收測試
```bash
# 1. 聲學同步盲測
python3 scripts/verify_audio_sync.py 29A audio/29A.mp3 --samples 15

# 2. 全套前端與資料驗收測試
npm test
```

---

## 📊 成果檢驗標準

1. **聲學吻合度**：`verify_audio_sync.py` 盲測通過率需 $\ge 75\%$。
2. **時間戳單調性**：所有句子必須滿足 $s[i].\text{start} \ge s[i-1].\text{end} - 0.05$。
3. **音訊連結**：`audioUrl` 與 `audio_map.json` 指向官方原始 Flyday 串流。
4. **測試套件**：`npm test` 包含 144 項單元與驗收測試全數通過（PASS 綠燈）。
