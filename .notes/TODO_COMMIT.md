# TODO_COMMIT.md — 提醒：3 個 untracked 檔待定稿後手動 commit

**日期**：2026-10-16  
**作者**：小法

## 提醒給 Henry 與未來的我

2026-10-16 audit 完成後，這 3 個檔案留在 working tree 未追蹤：

1. `docs/REPO_STATUS_2026-10-16.md` — repo 健康快照（一次性）
2. `docs/PHASE_2_ROADMAP.md` — Phase 2 路線圖（待路徑 X/Y/Z/W 決策 + 4 個待答問題）
3. `.notes/transcriptions-completion-plan.md` — 本次評估提案

## 為什麼不 commit（§58 提案先 .notes/ 紀律）

- PHASE_2_ROADMAP.md 還有 4 個待決問題，沒定稿就 commit = 污染 git history
- REPO_STATUS 是快照，每次 commit 退版一次，適合每 sprint 更新而非永久進版
- .notes/ 預設是工作區提案，未來 sprint 確認內容正確才進 docs/

## 建議 commit 觸發點

✅ 當以下條件**全部**滿足時，建議手動 commit：
1. PHASE_2_ROADMAP.md 4 個待答問題都有答案
2. Henry 拍了路徑（X / Y / Z / W）
3. TASKS.md 同步更新（如果適用）
4. AGY 簽核（若選派）

## commit 指令範本

```bash
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
git add docs/REPO_STATUS_2026-10-16.md docs/PHASE_2_ROADMAP.md
git add .notes/  # 注意：會把整個 .notes/ 目錄加入
git commit -m "docs(audit): 2026-10-16 repo status + Phase 2 roadmap

- REPO_STATUS_2026-10-16.md: repo health snapshot
- PHASE_2_ROADMAP.md: 4 paths proposed (X/Y/Z/W) pending decision
- .notes/transcriptions-completion-plan.md: initial evaluation proposal

Sources:
- origin/main @ 38b4b1e (synced)
- npm test 577/573/0/4
- 10 open issues, 13 open PRs
- 4 GitHub comments sent (Issue #10, #9, PR #252, #246)

Refs: §58 (proposal first), §65 (proposal flow), §55 (no auto-commit)"
```

## 不要做的事

- ❌ 不要 `git add .`（會把 .notes/ 其他工作檔、可能存在的 local scratch 都加進去）
- ❌ 不要 `git commit --amend`（除非剛 commit 想補東西）
- ❌ 不要 force push

## 已驗證

- `git status` 確認 3 個檔都在 untracked
- 與 origin/main 0 差距（`38b4b1e`）
- working tree 其他部分 clean
