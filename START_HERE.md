# START HERE — Transcriptions Project Agent Entrance & Governance Guide

- Project ID: TRANSCRIPTIONS-CORE-001
- Authority Owner: Henry Lee
- Primary Agent Operator: 小法 (gx10 Agent)
- Governance Authority: gx10-governance (GGF v1.1 / GGF v2.0 Baseline)
- Primary Repository: https://github.com/huanruilee/Transcriptions

---

## 1. 專案核心定位與原則

本儲存庫的核心目標是 **「定義清楚的成果要求 (Deliverable Requirements) 與高階運作流程 (Operating Workflow)」**。

* **成果與體驗優先**：定義音文雙向同步、科判 TOC 跳轉、2A/2B 命名、自動換段排版等最終使用者體驗標竿。
* **Agent 技術自主權**：**小法享有選擇具體工具（Python/JS 腳本、OpenCC、ffmpeg 等）與實現做法的完全裁量權**，只需確保產出符合 `docs/SPECIFICATION.md` 與 `docs/DATA_SCHEMA.md` 的成果標準。

---

## 2. GGF 成果導向治理原則

當 **小法 (gx10 Agent)** 於本儲存庫運作時，遵循以下 4 大 GGF 成果治理原則：

1. **成果與驗收標準為本 (Deliverables & Acceptance Basis First)**：
   * 閱讀 `docs/SPECIFICATION.md` 作為最終交付成果的審查標準。
2. **工具與實作自主 (Tooling & Implementation Autonomy)**：
   * 小法自由決定使用何種語言、工具、轉譯庫或批次處理邏輯，不設限特定工具。
3. **驗證與證據提供 (Verification Evidence)**：
   * 每次交付必須通過測試與驗證，確保網頁與 JSON 資料品質無誤。
4. **保留決策權 (Henry Reserved Decisions)**：
   * 僅破壞性 Schema 修改或刪除數據列為 Henry 保留決策。

---

## 3. 小法讀取順序 (Required Reading Order)

1. `START_HERE.md`（本檔案：定位與原則）
2. `docs/AGENT_GUIDELINES.md`（小法作業流程與自主權聲明）
3. `docs/SPECIFICATION.md`（最終交付成果與 UI/UX 驗收要求）
4. `docs/DATA_SCHEMA.md`（數據格式標準）
5. `docs/TASKS.md`（高階里程碑與 Task 清單）

---

## 4. 高階運作流程 (Intake Protocol)

```text
1. 讀取 START_HERE.md & docs/TASKS.md -> 領取任務
2. 檢視 docs/SPECIFICATION.md -> 確認最終成果驗收標準
3. 小法自主選擇工具、語言與腳本進行開發與轉譯
4. 執行品質驗證 -> 產出驗證證據 (Evidence)
5. 寫入 docs/TASKS.md -> Commit & Push
```
