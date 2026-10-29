# Transcriptions 計畫完成評估 + 小法可執行清單

**日期**：2026-10-16  
**作者**：小法（xiaofa）  
**基於**：origin/main `38b4b1e`（同步後 working tree 狀態）  
**給**：Henry 審

---

## 1. 計畫做完了嗎？—— 評估結論

**短答：核心功能 90% 完成，「內容品質 + 治理」4 個未完成**。

| 層 | 狀態 | 證據 |
|---|---|---|
| 程式碼健康 | ✅ 完成 | npm test 577/573/0/4、CI `38b4b1e` 綠燈 |
| 課程覆蓋 | ✅ 完成 | 4 門課程：219+32+42+8 = 301 sessions |
| README badge | ✅ 完成 | Progress 219/219 100%、Quality 10.0/10.0 |
| 4 個 open 功能 PR | ⚠️ 未決 | #252 #246 #226 #225 沒人 merge |
| 10 個 open issues | ⚠️ 部分 | 1 blocked、1 needs-review、6 enhancement、2 bug |
| 內容/資料品質 | ⚠️ 部分 | #252 還在 12 堂試點、#246 在「候選稿」階段 |
| Live 部署 (#10) | ⚠️ 未知 | Issue #10 仍 open，但已過 301 commits 修復歷史 |

---

## 2. 小法能做的範圍（誠實評估）

### ✅ 能做
1. 跑 npm test / 統計 / 報告證據
2. 讀所有 repo 檔案、查 issue/PR
3. 改 `src/js/`、`tests/`、`courses/`、`scripts/`（先建備份）
4. 寫 `.notes/` 提案、修補式 patch
5. 在 PR / Issue 貼 **comment**（不是 merge / close）
6. 用 `delegate_task` 派小檢（xiaojian）獨立 QA
7. 派 AGY（agy-cli skill）做獨立 review
8. 跑 background LLM / ASR pipeline（不阻塞 main）

### ❌ 不能做
1. **merge PR**（只有 huanruilee / henrylee-agents 可 merge）
2. **關 issue**（同上）
3. **改 `.github/workflows/*.yml`**（只有 repo owner）
4. **`git push --force`** 到 main
5. **刪除既有 session JSON**（Henry Reserved Decisions）
6. **改 DATA_SCHEMA.md 不相容變更**（同上）
7. **聽 audio 校稿**（無耳朵）
8. **Live browser 端實測**（無 dev server 環境）

---

## 3. 小法可立即執行的清單（本提案的 scope）

依「只做我能做的」原則，本提案只挑**不需 Live 驗證、不需 merge、不需 push main**的項目：

### A. 觀察收尾（必做，5 項）

- [ ] **A-1**：產出 `docs/REPO_STATUS_2026-10-16.md`（repo 健康快照）—— 已驗證事實寫下，不含預測
- [ ] **A-2**：在 Issue #10 貼 comment（用 `gh issue comment`）—— 標「Issue #10 自動 fix 候選追蹤」
- [ ] **A-3**：在 Issue #9 貼 comment —— 同上
- [ ] **A-4**：在 PR #252 貼 review comment（不 approve）—— 問「12 堂試點 → 推到全庫的 Gate 是什麼」
- [ ] **A-5**：在 PR #246 貼 review comment —— 問「候選稿 → published 的驗收標準」

### B. 修低風險 bug（如果 Henry 同意，1 項）

- [ ] **B-1**：修 Issue #9 側欄搜尋過濾（**前提**：先查 src/js/sidebar.js / search 邏輯確認 root cause）

### C. 計畫文件（1 項）

- [ ] **C-1**：寫 `docs/PHASE_2_ROADMAP.md`（Phase 2 計畫）—— 含 4 條路徑完整細節、AGY review 預留

### D. 留給 Henry / repo owner 的事（**不**做）

- ❌ merge PR
- ❌ 關 issue
- ❌ 修 Issue #10（無 live dev server 環境）
- ❌ 修 Issue #11 v2 forced alignment（需 GPU + 大量 LLM，AGY 配額議題）
- ❌ 處理 #252 推全庫（設計未定）

---

## 4. 不在這次變更的東西

- 不改 `docs/TASKS.md`（除非 Henry 明確要求，且 §65 提案流程）
- 不改 `package.json` 的 test script
- 不改任何 `.github/workflows/*.yml`
- 不 force push 任何 commit
- 不刪除任何 session JSON / reviews/ 證據
- 不 push 到 main（除非明確任務指定）

---

## 5. 預期 git 狀態

完成 A + C 後：
- 1 個新檔：`docs/REPO_STATUS_2026-10-16.md`
- 1 個新檔：`docs/PHASE_2_ROADMAP.md`
- 4 個 GitHub comment（Issue #10, #9, PR #252, PR #246 各一）
- 0 個 git push
- 0 個 merge / close
- 0 個 session JSON 修改
- 0 個 .github/ 變更

B-1（修 #9）只有在 A + C 完成 + Henry 確認才執行。

---

## 6. 待 Henry 決策

1. **範圍確認**：A 5 項 + C 1 項，總計 6 個交付物，可接受嗎？
2. **B-1 是否執行**：要修 Issue #9 嗎？修之前我會先 read_file 找 root cause 給你看
3. **AGY review 必要嗎**：本提案要派 AGY 獨立 review（C-1 完成後）嗎？
4. **是否同步 .notes/ 給其他 agent**：本檔是 .notes/（untracked），其他 agent 預設看不到。要 commit 到 .notes/ 嗎？

---

**寫入時間**：2026-10-16 18:30 CST  
**檔案位置**：`/home/henry/.gx10/xiaofa/workspace/Transcriptions/.notes/transcriptions-completion-plan.md`  
**狀態**：提案待 Henry 審
