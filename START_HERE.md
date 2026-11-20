# START HERE — Transcriptions Project Agent Entrance, GGF & QMS Governance Guide

> 逐字稿、校字、導讀、講記、科判與發布任務，先完整閱讀 [最新版逐字稿流程](docs/TRANSCRIPTION_WORKFLOW.md) 與 [Agent 交接與全流程執行手冊](docs/AGENT_HANDOFF_PLAYBOOK.md)。其流程規則優先於本頁舊操作敘述；執行任何批次腳本前必查 [鎖定講次清冊](config/locked-sessions.json)。

> 開始轉寫／校稿前，完成 [參考資料預檢與 Benchmark 分流](docs/REFERENCE_EVIDENCE_PROTOCOL.md)，留下已找到／查無來源、版本與使用範圍；不得把整編文字一致性宣稱成錄音忠實度。

- Project ID: TRANSCRIPTIONS-CORE-001
- Authority Owner: Henry Lee
- Primary Agent Operator: 小法 (gx10 Agent)
- Governance Framework: gx10-governance (**GGF v1.1 Baseline**)
- Quality System Standard: **QMS / ISO 9001 Compliance** (`HERMES-QMS` & `QMS-ISO9001`)
- Primary Repository: https://github.com/huanruilee/Transcriptions
- Official Audio Catalog URL: https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68

---

## ⚠️ 音檔與 Git 儲存庫規範 (Audio Asset Policy)

* **🚫 嚴禁將音檔 (.mp3 / .wav) 上傳至 GitHub 或存放於 gdrive**：音檔放置於 `gx10` 伺服器本機工作區 (`/home/henry/audio_files/`)，透過 `transcriptions-audio-proxy.service` (port 39090，僅綁 127.0.0.1) 提供串流。原始音檔目錄可參照：[https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68](https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68)。
* **📄 GitHub 專用定位**：GitHub 儲存庫**僅存放程式碼 (`src/`)、規格文件 (`docs/`)、Schema (`DATA_SCHEMA.md`)、轉譯 JSON (`courses/`)、腳本 (`scripts/`) 與測試 (`tests/`)**，確保未來任何 Agent 都能遵循技術資料與規範自動復刻與執行。
* **🌐 即時網頁預覽 (Live Web Preview)**：小法每完成一批次轉譯與測試，**必須同步部署更新 `http://100.84.47.24:9090/index.html`**，並於進度簡報中附上預覽連結，讓 Henry 能即時線上測試與觀看成果。
  > **服務位置說明（2026-11-13 修正）**：此靜態網站**部署在 Henry 的 Mac 上**（`Mac-mini-M4.local`，Tailscale IP `100.84.47.24`），**不是**在 gx10 上。由 launchd 服務 `com.henry.transcriptions-web` 常駐（LaunchAgent：`~/Library/LaunchAgents/com.henry.transcriptions-web.plist`），服務根目錄為 **repo 根目錄**（`courses/` 與 `index.html` 都在根，非 `src/`）。
  > 查詢狀態：`launchctl list | grep com.henry.transcriptions-web`；重啟：`launchctl load -w ~/Library/LaunchAgents/com.henry.transcriptions-web.plist`。

本儲存庫的核心目標是 **「結合 GGF 治理與 QMS (ISO 9001) 品質管理體系，定義清楚的成果要求 (Deliverables) 與高階運作流程 (Workflow)」**。

* **成果與體驗優先**：定義音文雙向同步、科判 TOC 跳轉、2A/2B 命名、自動換段排版等最終使用者體驗標竿。
* **Agent 技術自主權**：**小法享有選擇具體工具（Python/JS 腳本、OpenCC、ffmpeg 等）與實現做法的完全裁量權**，只需確保產出符合 `docs/SPECIFICATION.md` 與 `docs/DATA_SCHEMA.md` 的成果標準。

---

## 2. GGF 與 QMS (ISO 9001) 雙重治理標準

當 **小法 (gx10 Agent)** 於本儲存庫運作時，必須同時遵循以下治理與品質要求：

### 🏛️ GGF (GX10 Governance Framework) 治理要求
1. **規格驅動 (Policy Before Prompt)**：`SPECIFICATION.md` 與 `DATA_SCHEMA.md` 為權威規範。
2. **審查與決策分離**：小法執行審查產生 Verdict；破壞性 Schema 修改屬 Henry Reserved Decisions。
3. **任務邊界控制**：嚴格依據 `docs/TASKS.md` 之 Milestone 與 Task 邊界推進。

### 📋 QMS / ISO 9001 品質管理要求
1. **可追溯性 (Traceability, ISO 9001 §8.5.2)**：所有程式碼變更與數據修改必須對應 `docs/TASKS.md` 中的 Task ID，並具備語意化 Commit 紀錄。
2. **交付驗收與證據化 (Verification Evidence, ISO 9001 §8.6)**：交付前必須執行 `npm test` 自動化測試，產生 0 錯誤之測試證據。
3. **不合格品控制與矯正 (CAR / CAPA, ISO 9001 §10.2)**：發現 Bug 或測試失敗時，深入分析根本原因（Root Cause）修復，嚴禁使用無掩蓋式 Dummy 補丁。

---

## 3. 讀取順序 (Required Reading Order)

所有 Agent 統一依 [AGENTS.md](AGENTS.md) 兩層架構進入：

1. `AGENTS.md`（超薄總入口：先 `git fetch origin`、確認權威與紅線）
2. `docs/TRANSCRIPTION_WORKFLOW.md`（單向轉稿與品管流程 SSOT，涵蓋 Stage 0～7 與自動化品質門檻）
3. `courses/<課程名>/COURSE_GUIDE.md`（若存在）與 `grounding.json`（課程專屬規則與底本對齊）
4. `START_HERE.md`（本檔案：GGF / QMS 治理定位與本機預覽環境說明）
5. 按需查閱：`docs/AGENT_GUIDELINES.md`、`docs/SPECIFICATION.md`、`docs/DATA_SCHEMA.md`、`docs/TASKS.md`

**按任務類型另讀**（非全部需讀）：

| 任務 | 另讀 |
|---|---|
| 逐字稿、逐字稿校字、導讀、發布 | `docs/TRANSCRIPTION_WORKFLOW.md`、`docs/REFERENCE_EVIDENCE_PROTOCOL.md` |
| 研讀講記之原話對照與抽屜 | `docs/STUDY_GUIDE_CALIBRATION_SOP.md` |
| 藍圖提綱 ↔ 共學提綱 ↔ 法師開示 三層對照 | `docs/OUTLINE_DISCLOSURE_LINK_SPEC.md`（稽核器 `scripts/audit_outline_links.py`） |

---

## 4. 高階運作流程 (Intake Protocol)

```text
1. 讀取 START_HERE.md & docs/TASKS.md -> 領取任務
2. 檢視 docs/SPECIFICATION.md -> 確認最終成果驗收標準 (QMS AC)
3. 小法自主選擇工具、語言與腳本進行開發與轉譯
4. 執行品質驗證 -> 產出驗證證據 Evidence (QMS §8.6)
5. 寫入 docs/TASKS.md -> Commit & Push (GGF / QMS 可追溯)
```
