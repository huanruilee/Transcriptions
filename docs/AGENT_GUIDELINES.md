# AGENT_GUIDELINES.md — 小法 (gx10 Agent) GGF 標準作業 SOP

本指南乃小法 (gx10 Agent) 於 `Transcriptions` 儲存庫中進行開發、調錯、逐字稿轉譯與文檔維護時之標準作業準則 (SOP)，對齊 `gx10-governance` (GGF v1.1) 規範及小法於 gx10 伺服器之實戰記憶 (`MEMORY.md` & `USER.md`)。

---

## 1. 逐字稿校正與轉譯黃金法則 (Transcript Correction Rules)

小法於執行 ASR 語音轉文字與逐字稿校正時，**必須嚴格遵循以下 4 大法則**：

1. **校對表順序與簡繁轉換 (OpenCC Sequence)**：
   * `audio-cpp ASR` 輸出為簡體中文。
   * **順序極為關鍵**：必須**先套用佛學校對詞庫（對照簡體錯誤詞）**，最後才做簡轉繁（OpenCC）。若順序顛倒，校對表將全面失效！
   * **長度遞減排序**：校對詞庫 Key 必須按字串長度由長至短排序，避免短詞誤蓋長詞對照。
2. **RAG 原典對照 (RAG-Grounded Quality)**：
   * 校正過程必須優先對照《入中論善顯密意疏》經典原文，不接受無 RAG 對照之盲目 LLM 修辭。
3. **檔案去重 (Deduplication)**：
   * 自動過濾 ffmpeg 產生之 `*_seekable.mp3` 副本，並處理 `_` / ` ` / `-` 等多種檔名分隔符。
4. **小檢 QA 複驗機制 (Delegation to Xiaojian)**：
   * 執行 QA 或校正品質抽樣複驗時，主動用 `delegate_task` 委派給 **小檢 (xiaojian)** profile 進行獨立 quality assurance，評估 1-5 分指標與改進建議。

---

## 2. 任務領取與執行流程 (Task Protocol)

```text
[Step 1: Read] ➔ [Step 2: Check Spec] ➔ [Step 3: Dev & Test] ➔ [Step 4: Evidence] ➔ [Step 5: Commit]
```

1. **Step 1: Read Entrance**
   * 閱讀 `START_HERE.md` 與 `docs/TASKS.md`。
2. **Step 2: Check Spec**
   * 檢視 `docs/SPECIFICATION.md` 與 `docs/DATA_SCHEMA.md`，嚴禁自行猜測 JSON Schema。
3. **Step 3: Dev & Test**
   * 於 `src/` 修改程式，於 `tests/` 新增單元/整合測試。
4. **Step 4: Evidence Generation**
   * 於 gx10 上執行 Python 腳本時，**必須使用 `/home/henry/.hermes/hermes-agent/venv/bin/python3`**（包含 opencc 與關鍵套件）。
   * 執行 `npm test`，確認無報錯。
5. **Step 5: Commit & Log**
   * 更新 `docs/TASKS.md` 狀態，送出符合 GGF 規範之 Commit。

---

## 3. 語意化 Commit 規範 (Commit Message Format)

Commit 訊息格式統一為：`<type>: <description>`
* `feat:` 新增功能
* `fix:` 修復 Bug
* `docs:` 更新文檔
* `test:` 新增/修正測試
* `refactor:` 重構程式碼

---

## 4. Henry 保留決策清單 (Henry Reserved Decisions)

小法**嚴禁授權自行執行**以下變更，必須提報 Decision Package 供 Henry 親自裁決：
- 修改 `docs/DATA_SCHEMA.md` 中毀滅性相容之 JSON 結構。
- 刪除已存在之課程逐字稿資料。
- 變更遠端 GitHub 儲存庫 origin 或執行 `git push --force`。
