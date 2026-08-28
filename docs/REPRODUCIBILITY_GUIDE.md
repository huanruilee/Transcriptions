# 🔬 《入中論善顯密意疏》逐字稿可複現性指南 (Reproducibility Guide)

> 本文件專為 **開發人員 (Humans)** 與 **AI Agents (Antigravity / 小法 / Hermes)** 撰寫，提供完整、確定性（Deterministic）的環境建置、GPU 推論服務配置、轉寫流水線執行、品質掃描與主動學習自進化之複現 SOP。

---

## 📋 目錄
1. [硬體與環境前置條件](#1-硬體與環境前置條件)
2. [本地微服務架構與端點配置](#2-本地微服務架構與端點配置)
3. [目錄與數據庫結構](#3-目錄與數據庫結構)
4. [單講 / 批量 Grounded 轉寫複現步驟](#4-單講--批量-grounded-轉寫複現步驟)
5. [自動化品質評分與局部靶向修復](#5-自動化品質評分與局部靶向修復)
6. [主動學習與三級語境歧義仲裁](#6-主動學習與三級語境歧義仲裁)
7. [CI/CD 防退化品質門禁測試](#7-cicd-防退化品質門禁測試)
8. [前端 Web 閱讀器本地啟動與部署](#8-前端-web-閱讀器本地啟動與部署)

---

## 1. 硬體與環境前置條件

* **主機環境**：
  * Linux aarch64 (Ubuntu 22.04 / 24.04 LTS) 或 macOS (Apple Silicon M-series)
  * GPU: NVIDIA GB10 (sm_121 架構) 或 RTX 4090 / A100 / H100
  * Node.js >= 22.0.0
  * Python >= 3.11
  * Docker >= 24.0
  * `ffmpeg`（音訊格式轉換與時長探測）

---

## 2. 本地微服務架構與端點配置

本專案採用高效率的本地雙微服務架構，徹底消除對外部雲端 API 的依賴與 Token 費用：

| 服務名稱 | 容器映像 / 實體 | 埠號 (Port) | 協定與端點 | 用途 |
| :--- | :--- | :--- | :--- | :--- |
| **GPU Whisper ASR** | `local/whisper-gpu:gx10-sm121` | `8010` | `POST /v1/audio/transcriptions` | 59x Realtime GPU 語音轉寫 (RTF 0.017) |
| **本地 LLM (vLLM)** | `vllm/vllm-openai:v0.26.0-aarch64` | `8001` | `POST /v1/chat/completions` | Qwen3.8-27B-FP8 深度校勘與科判提煉 |
| **Smart Router (備援)** | GX10 Smart Router | `4001` | `POST /v1/chat/completions` | 高並發排隊溢出時的自動分流備援 |

### 檢查微服務健康狀態：
```bash
# 檢查 Whisper GPU 服務
curl -s http://127.0.0.1:8010/health
# 預期輸出: {"backend":"cuda","compute_type":"int8","device":"cuda","model_loaded":true,"status":"ok"}

# 檢查 vLLM LLM 服務
curl -s http://192.168.122.1:8001/v1/models
```

---

## 3. 目錄與數據庫結構

```text
Transcriptions/
├── courses/
│   └── 入中論善顯密意疏/
│       ├── course.json              # 199 講課程全量中繼資料 (標題、日期、課本頁碼)
│       ├── toc.json                 # 宗喀巴大師科判階層樹與音訊時間戳
│       ├── audio_map.json           # 199 講官方 MP3 下載網址映射
│       ├── learned_corrections.json # 主動學習知識庫 (全域專有名相與語境防護)
│       ├── source_text/             # 《善顯密意疏》逐頁底本 (page_001.txt ~ page_336.txt)
│       └── sessions/                # 201 講次逐字稿 JSON (session_01.json ~ 110B.json)
├── scripts/
│   ├── batch_convert_all.py         # Grounded 轉寫核心流水線 (GPU Whisper + 27B LLM)
│   ├── quality_scorer.py            # 全庫 1~10 分自動品質評分與局部靶向修復工具
│   └── active_learning_manager.py   # 主動學習三級語境歧義仲裁引擎
├── tests/
│   ├── unit/
│   │   ├── asrIntegrityGate.test.js # ASR-M2 六大自動化防退化門禁測試
│   │   ├── reviewRating.test.js     # 前端 1~10 分線上 Review 對話框回歸測試
│   │   └── activeLearning.test.js   # 三級語境歧義仲裁單元測試
└── src/                             # 前端靜態閱讀器 (HTML / CSS / Vanilla JS)
```

---

## 4. 單講 / 批量 Grounded 轉寫複現步驟

### 步驟 4.1：轉寫單一講次（例如第 53A 堂）
```bash
python3 scripts/batch_convert_all.py --sessions 53A
```

流水線將自動執行五大階段：
1. **[Step 1/5] 🎙️ GPU Whisper ASR (Port 8010)**：提取微秒級聲學時間戳句子。
2. **[Step 2/5] 📝 標點與語意斷句**：合併零碎語氣詞為 28 字以內的自然長句。
3. **[Step 3/5] 🧠 Grounded 深度校勘**：注入 `source_text/` 對應頁碼底本，由 27B LLM 執行 25 句批次校勘。
4. **[Step 4/5] 📑 科判標題提煉**：提煉 8～10 個結構化科判小標題並標注起始句序號。
5. **[Step 5/5] 🏮 正體轉換與封裝**：OpenCC s2twp 繁體化並寫入 `courses/入中論善顯密意疏/sessions/session_53A.json`。

### 步驟 4.2：斷點續傳批量重跑全庫
```bash
python3 scripts/batch_convert_all.py --all --resume --workers 2
```

---

## 5. 自動化品質評分與局部靶向修復

專案提供極速（<0.5 秒）的全庫品質檢測工具，無需重複跑整堂 50 分鐘的流水線：

```bash
# 1. 執行全庫 1~10 分品質掃描與錯字報表
npm run score
# 終端機將印出全庫平均分、滿分講次、以及任何低於 8 分的錯字位置與原文

# 2. 一秒執行局部精準靶向修復（直接修復可疑句子，將全庫提分至 10.0/10 滿分）
npm run score:fix
```

---

## 6. 主動學習與三級語境歧義仲裁

當專家在線上閱讀器中手動校正句子時，可透過主動學習引擎將修改轉化為全庫知識：

```bash
# 評估單句修改並執行三級語境歧義仲裁
npm run learn:eval -- --session 29A --original "因此破除事事師的妄計" --proposed "因此破除實事師的妄計" --page "p.97"

# 模擬全庫自進化回溯效果（查看 Diff 抽查，零風險）
npm run learn:dry-run

# 安全套用新規則並回溯推廣至全庫 199 講
npm run learn:sync
```

### 仲裁分類原則：
* `GLOBAL_PROMOTED`：無歧義名相（如「補特伽羅」、「實事師」）➔ 自動生成 Lookaround 負向約束正則並收錄庫存。
* `CONTEXT_SPECIFIC`：依語境同音詞（如十地之「二地」vs「二諦」）➔ 隔離為單句修改，**絕對不推廣至全庫**，防止破壞「菩薩十地」。
* `REJECTED`：不符合中觀法義 ➔ 拒絕收錄。

---

## 7. CI/CD 防退化品質門禁測試

在提交任何程式碼或數據前，必須執行全套門禁：

```bash
# 執行 6 大 ASR 物理與契約完整性門禁 (Schema、單調時間戳、文字純度、黑名單錯字)
npm run test:asr-gate

# 執行全套單元回歸測試 (含 Review 對話框與主動學習測試)
npm test
```

---

## 8. 前端 Web 閱讀器本地啟動與部署

```bash
# 啟動本地開發伺服器
npm run dev
# 瀏覽器打開 http://localhost:9090

# 線上正式版（GitHub Pages）
# 只要 push 至 main 分支，GitHub Actions 將自動打包並在 30 秒內發布上線：
# https://huanruilee.github.io/Transcriptions/
```

---
*文檔維護者*：Antigravity Agent & Henry Lee  
*最後驗證日期*：2026-08-28
