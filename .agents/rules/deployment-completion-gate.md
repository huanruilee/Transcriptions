---
trigger: always_on
description: 完整上線驗收紅線：必須確認 CI 全綠、PR 合併、Pages 部署成功與實頁抽查後才可宣稱完成
---

# 完整上線驗收紅線

- **嚴禁僅因本地腳本跑完或建立 PR 就宣稱完成**。
- 提交 PR 前必跑：`npm run summaries:audit`（`complete: true, invalid: 0`）、`npm run test:v2`、`npm test`。
- **CI 觸發紅線**：`main` 分支保護強制每個 PR 必須回報 `Unit and acceptance tests`，嚴禁在 `.github/workflows/acceptance.yml` 使用 `paths-ignore`（提速應改用 job 內部的 `READER_SMOKE_SCOPE=core`）。
- 任務結案前必確認（可直接執行 `npm run pr:ship -- <PR_NUM>` 一鍵完成 auto-merge 與上線追蹤）：
  1. PR 所有 GitHub Actions 檢查全綠並已以 Merge commit（`--merge`／`--auto --merge`）合併至 `main`。
  2. `Deploy to GitHub Pages`（`deploy.yml`）執行成功。
  3. 實際開啟線上 `github.io` 頁面抽查確認最新版已生效，並於結案回覆附上直接線上閱讀連結（GX10 Worker 開立 PR 後交由 AGY 進行最後 Review 與合併上線）。
