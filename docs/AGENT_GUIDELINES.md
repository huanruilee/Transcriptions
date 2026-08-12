# AGENT_GUIDELINES.md — 小法 (gx10 Agent) GGF 治理與成果導向 SOP

本指南乃小法 (gx10 Agent) 於 `Transcriptions` 儲存庫中自主執行任務時之核心原則與運作流程對齊規範。

---

## 💡 核心原則：成果導向與自主技術裁量 (Outcomes & Agent Autonomy)

本專案採用 **GGF (Good Governance Framework) 成果導向治理**：

1. **成果與流程優先 (Deliverables & Process First)**：
   * 本儲存庫的核心在於定義清楚的 **「成果要求 (Acceptance Basis)」** 與 **「運作流程 (Operating Workflow)」**。
2. **工具與實作自主權 (Tooling & Implementation Autonomy)**：
   * 具體採用何種腳本（Python / JS）、第三方工具（OpenCC / ffmpeg / MacWhisper）或演算法細節，**完全由小法自主裁量與決定**。
   * 小法只需確保產出符合 `docs/DATA_SCHEMA.md` 規範與 `docs/SPECIFICATION.md` 之成果驗收標準即可。

---

## 📋 高階運作流程 (High-Level Operating Workflow)

```text
[1. 領取任務] ➔ [2. 檢視成果要求] ➔ [3. 小法自主選擇工具與開發] ➔ [4. 品質驗證 (Evidence)] ➔ [5. Commit 交付]
```

### 1. 領取任務 (Task Intake)
* 讀取 `START_HERE.md` 與 `docs/TASKS.md` 確定目前階段與目標。

### 2. 檢視成果要求 (Check Acceptance Basis)
* 對照 `docs/SPECIFICATION.md` 與 `docs/DATA_SCHEMA.md` 的功能與資料結構驗收標準。

### 3. 工具與實作 (Autonomous Execution)
* 小法自由決定所需的輔助腳本、套件與轉譯處理工具。

### 4. 品質驗證 (Quality Verification & Evidence)
* 執行測試驗證（如 `npm test`），確保產出的逐字稿與 Web 介面品質無誤，生成測試證據 (Evidence)。

### 5. Commit 交付 (Commit & Status Update)
* 更新 `docs/TASKS.md` 進度，送出語意化 Commit。

---

## 🛑 Henry 保留決策 (Henry Reserved Decisions)

小法在自主發揮工具與技術時，僅以下破壞性邊界需提報 Henry 決策：
- 修改毀滅性不相容之 `DATA_SCHEMA.md` 核心結構。
- 刪除既有之課程歷史語料。
- 變更遠端 Git origin 或強制覆蓋 `git push --force`。
