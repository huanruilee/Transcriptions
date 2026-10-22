# Transcriptions 全庫校稿交接

2026-10-22 優先交接更新：第 08 講推送授權已解除，origin 已含 384f8e7 與 83f3f45。後續修復只更新 contentOverview，以 session_08.overview-amendment.json 保存更新前後 digest；原 PASS 正文快照不變。新增摘要回歸 gate，promotion 前驗證摘要來源與支持性。下文「先取得推送同意」已過期；此次範圍僅第 08 講，不啟動其餘試點。

## 可直接交給下一位 Agent 的 Prompt

請接手 GitHub PR #252、分支 `codex/transcript-proofreading-quality`，只在隔離 worktree `/Users/henry/.codex/worktrees/transcript-proofreading-quality/Transcriptions` 工作，不要碰共享 dirty checkout。先讀 `reviews/evidence/transcript_proofreading/production/四念住/session_08.status.md`，並以 immutable run `e153a10f-c521-44b3-b300-82cd349bb207` 為第 08 講最終驗收基準。使用者已授權 repository 內 302 份逐字稿傳送至私人 GX10 `100.113.144.100` 的 Qwen3.8-27B，並授權逐字稿傳送至 MiniMax-M3；未授權將 production 內容送往 Eneural 外部服務。模型只可產生候選與品質稽核，不能作最終文字權威。

第 08 講已完成：1,521 句發布文字修正，191 個 unresolved 已由獨立 reviewer 全數覆核且沒有唯一可支持的修正；immutable independent review 為 PASS，共 11 輪。候選已由 `scripts/promote_session08_candidate.mjs` 升級至 `courses/四念住/sessions/session_08.json`，promotion manifest 綁定原來源、candidate、ledger、review queue、completion、獨立 review與正式檔 digest。完整驗證結果為 Node 635 tests／631 pass／0 fail／4 skip、前端 93/93、Vite build 成功、evidence audit 12 manifests + 1 production + 1 promotion 全部有效、`git diff --check` 通過。

注意：含完整候選逐字稿、完整 ASR、MiniMax/Qwen 證據、ledger、review queue 與 promotion artifacts 的 GitHub push 已被安全審查攔下。不得繞過；先向使用者說明風險並取得明確同意，把目前本地 commits 推送到 PR #252，然後在 PR 留下精確 commit、runId、測試數與剩餘 301 份範圍。PR 仍保持 draft，禁止 force-push，因 302 份全庫尚未完成。

推送 checkpoint 後，再開始下一講。沿用第 08 講的流程：先建立 immutable source/audio/model evidence，模型僅做候選；採用項目必須有正式講記、音訊、上下文或引用原文依據；保留 `rawText`；每個 run 使用不可覆寫的 `runs/<runId>/`；獨立 reviewer 對固定 digest 做 PASS/FAIL；promotion 前後均需 digest gate、聚焦測試、完整 Node、前端、build、evidence audit 與 `git diff --check`。每完成一講就 commit 並在 PR 留可交接 checkpoint，不要等全庫結束才留下遠端證據。

正式參考：<https://ftp.budaedu.org/ghosa/C009/T0209/ref/T0209_08.pdf>。
