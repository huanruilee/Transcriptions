---
trigger: always_on
description: 完整上線驗收紅線：必須確認 CI 全綠、PR 合併、Pages 部署成功與實頁抽查後才可宣稱完成
---

# 完整上線驗收紅線

- **嚴禁僅因本地腳本跑完或建立 PR 就宣稱完成**。
- 推送分支或執行最終驗證**前**，先執行 `git fetch origin && git merge origin/main --no-edit` 同步最新 `main`（避免多 Agent 並行合入造成分支過期擋合併），並跑完 `npm run summaries:audit`（`complete: true, invalid: 0`）、`npm run test:v2`、`npm test`（`fail: 0`）與 `npm run build:v2`。
- 任務結案前必確認：
  1. PR 所有 GitHub Actions 檢查全綠並已以 Merge commit（`gh pr merge <PR> --merge`）合併至 `main`；若在獨立 git worktree 中作業，改以 `git push origin --delete <branch>` 刪遠端分支，避免 `--delete-branch` 在本地切換被占用的 `main` 時報錯。
  2. 以該次合併提交 `headSha` 追蹤並確認 `Completion Acceptance` 與 `Deploy to GitHub Pages`（`deploy.yml`）皆執行成功（等待迴圈必設重試上限）。
  3. 實際開啟線上 `github.io` 頁面抽查確認最新版已生效。
