# START HERE — Transcriptions Project Agent Entrance, GGF & QMS Governance Guide

- Project ID: TRANSCRIPTIONS-CORE-001
- Authority Owner: Henry Lee
- Primary Agent Operator: 小法 (gx10 Agent)
- Governance Framework: gx10-governance (**GGF v1.1 Baseline**)
- Quality System Standard: **QMS / ISO 9001 Compliance** (`HERMES-QMS` & `QMS-ISO9001`)
- Primary Repository: https://github.com/huanruilee/Transcriptions

---

## 1. 專案核心定位與原則

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

## 3. 小法讀取順序 (Required Reading Order)

1. `START_HERE.md`（本檔案：定位、GGF 與 QMS 原則）
2. `docs/AGENT_GUIDELINES.md`（小法作業流程、GGF/QMS SOP 與自主權聲明）
3. `docs/SPECIFICATION.md`（最終交付成果與 UI/UX 驗收要求）
4. `docs/DATA_SCHEMA.md`（數據格式標準）
5. `docs/TASKS.md`（高階里程碑與 Task 清單）

---

## 4. 高階運作流程 (Intake Protocol)

```text
1. 讀取 START_HERE.md & docs/TASKS.md -> 領取任務
2. 檢視 docs/SPECIFICATION.md -> 確認最終成果驗收標準 (QMS AC)
3. 小法自主選擇工具、語言與腳本進行開發與轉譯
4. 執行品質驗證 -> 產出驗證證據 Evidence (QMS §8.6)
5. 寫入 docs/TASKS.md -> Commit & Push (GGF / QMS 可追溯)
```
