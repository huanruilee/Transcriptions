# 所有 Agent 的專案入口（SSOT 路由）

適用本儲存庫全部路徑。本檔為精簡總入口，完整細節與量化門檻一律以 [最新版逐字稿流程（`docs/TRANSCRIPTION_WORKFLOW.md`）](docs/TRANSCRIPTION_WORKFLOW.md) 為單一事實來源（SSOT），不在此重複複述。

## 開工必走順序
1. **先同步遠端**：詢問專案現況或啟動任何新計畫前，必須先執行 `git fetch origin` 確認 `origin/main` 最新狀態（不可僅憑本地舊分支或過時快取做判斷）。
2. **兩層指導必讀**：
   - 全域層：閱讀 [最新版逐字稿流程](docs/TRANSCRIPTION_WORKFLOW.md)（以 GitHub `main` 最新版為準）、[一句話指令執行劇本（`docs/AGENT_COMMANDS.md`）](docs/AGENT_COMMANDS.md) 與 [START_HERE.md](START_HERE.md)。
   - 課程層：操作任一課程前，必須讀取 `courses/<課程名>/grounding.json`；若該目錄存在 `courses/<課程名>/COURSE_GUIDE.md`，在不牴觸全域紅線前提下優先遵守。
3. **保護工作區與分支紀律**：保留無關 dirty 檔；不得直接改 `main`；程式行為變更須先有能重現問題的測試；文件修改須檢查規範與連結。

## 不可逾越的最高紅線
- **前置實體奠基（Step 0）**：未完成聯網檢索與 `grounding.json` 不得開工；所有專名校對須溯源查證，嚴禁憑空腦補。
- **低 Token 漏斗分工**：90% 無爭議句由本地規則定稿，僅抽取 `reviewRequired=true` 爭議小卡送高階模型仲裁（詳見 `docs/AGENT_HANDOFF_PLAYBOOK.md`）。
- **保真與誠實標記**：100% 保留 `rawText`（不覆寫原始軌）；「待閱校版」不得宣稱已人工確認，但仍須通過 `npm run audit:reading-quality -- courses/<課程名>` 與 `docs/TRANSCRIPTION_WORKFLOW.md` §8 量化門檻，嚴禁以未整編的 Raw ASR 充數。
- **隱私與授權**：禁止將使用者私密資料、音訊或未公開逐字稿轉交未獲授權的 provider。
