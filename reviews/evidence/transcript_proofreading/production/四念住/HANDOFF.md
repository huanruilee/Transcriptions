# Transcriptions 全庫校稿交接

## 可直接交給下一位 Agent 的 Prompt

請接手 GitHub PR #252、分支 `codex/transcript-proofreading-quality`，只在隔離 worktree `/Users/henry/.codex/worktrees/transcript-proofreading-quality/Transcriptions` 工作，不要碰共享 dirty checkout。先讀 `reviews/evidence/transcript_proofreading/production/四念住/session_08.status.md`，並以 immutable run `9e1c7764-b6dc-4ec6-b62b-86e8e48cc825` 為當前驗收基準。使用者已授權 repository 內 302 份逐字稿傳送至私人 GX10 `100.113.144.100` 的 Qwen3.8-27B，並授權逐字稿傳送至 MiniMax-M3；未授權將 production 內容送往 Eneural 外部服務。模型只可產生候選與品質稽核，不能作最終文字權威。

目前正式 `courses/` 尚未修改。先完成第 08 講：逐項處理獨立 reviewer 對 222 個 unresolved 的結論；任何修正都必須有正式 PDF、音訊、上下文或引用原文依據，並加入 `tests/unit/session08FinalCandidate.test.js`。每次重建用 `npm run proofread:reference:final-candidate` 產生新的 `runs/<runId>/` 不可覆寫快照，再請獨立 reviewer 對該固定 run 做 hash-bound PASS/FAIL。PASS 前不得覆蓋正式逐字稿。

取得 PASS 後，升級候選至 `courses/四念住/sessions/session_08.json`，建立能綁定原來源 digest、candidate/ledger/queue、獨立 review 與升級後 digest 的 promotion manifest。重跑 `node --test tests/unit/transcriptProofreadingPipeline.test.js tests/unit/session08FinalCandidate.test.js`、`npm test`、`npm run test:v2`、`npm run build:v2`、`npm run proofread:evidence:audit`、`git diff --check`。更新 status 與本交接檔，commit、push，並在 PR #252 留下精確 commit、runId、測試數、未完成範圍與下一步。禁止 force-push；PR 在一講完成後仍保持 draft，因 302 份全庫尚未完成。

正式參考：<https://ftp.budaedu.org/ghosa/C009/T0209/ref/T0209_08.pdf>。
