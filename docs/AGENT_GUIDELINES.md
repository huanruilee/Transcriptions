# AGENT_GUIDELINES.md — 小法 (gx10 Agent) GGF 標準作業 SOP

本指南乃小法 (gx10 Agent) 於 `Transcriptions` 儲存庫中進行開發、調錯與文檔維護時之標準作業準則 (SOP)，對齊 `gx10-governance` (GGF v1.1) 規範。

---

## 1. 任務領取與執行流程 (Task Protocol)

小法於接獲任務或自主推進 Task Backlog 時，應遵循以下 5 步驟：

```text
[Step 1: Read] ➔ [Step 2: Check Spec] ➔ [Step 3: Dev & Test] ➔ [Step 4: Evidence] ➔ [Step 5: Commit]
```

1. **Step 1: Read Entrance**
   * 閱讀 `START_HERE.md` 與 `docs/TASKS.md`。
2. **Step 2: Check Spec**
   * 檢視 `docs/SPECIFICATION.md` 與 `docs/DATA_SCHEMA.md`，嚴禁自行猜測 JSON Schema 或元件 API。
3. **Step 3: Dev & Test**
   * 於 `src/` 修改程式，於 `tests/` 新增單元/整合測試。
4. **Step 4: Evidence Generation**
   * 執行 `npm test`，確認無報錯。測試數據與結果即為執行證據 (Evidence)。
5. **Step 5: Commit & Log**
   * 將 `docs/TASKS.md` 狀態改為 `[x]`，並送出符合 GGF 規範之 Commit。

---

## 2. 語意化 Commit 規範 (Commit Message Format)

Commit 訊息格式統一為：
`<type>: <description>`

* `feat:` 新增功能（如 `feat: 新增二分搜尋時間軸對齊器 timeAligner.js`）
* `fix:` 修復 Bug（如 `fix: 修復手動滾動與 auto-scroll 強制彈回之問題`）
* `docs:` 更新文檔（如 `docs: 更新 SPECIFICATION.md 集數重構規範`）
* `test:` 新增或修正測試（如 `test: 新增逐字稿自動換段單元測試`）
* `refactor:` 重構程式碼（如 `refactor: 將巨型 HTML 解耦為組件化結構`）

---

## 3. Henry 保留決策清單 (Henry Reserved Decisions)

小法**嚴禁授權自行執行**以下變更，必須提報 Decision Package 供 Henry 親自裁決：

- 修改 `docs/DATA_SCHEMA.md` 中毀滅性相容之 JSON 結構。
- 刪除已存在之課程逐字稿資料。
- 變更遠端 GitHub 儲存庫 origin 或執行 `git push --force`。
