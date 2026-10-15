# 四念住第 8 講完整校稿狀態

日期：2026-10-16（Asia/Taipei）

## 結論

**COMPLETE / independent PASS / 已在隔離 worktree 升級正式逐字稿並完成本地驗證。**

最終 hash-bound runId 為 `e153a10f-c521-44b3-b300-82cd349bb207`，不可覆寫快照位於：

`reviews/evidence/transcript_proofreading/production/四念住/runs/e153a10f-c521-44b3-b300-82cd349bb207/`

候選已透過 promotion manifest 升級至 `courses/四念住/sessions/session_08.json`。本講使用公開正式講記、完整音訊 ASR、GX10 Qwen3.8-27B、MiniMax-M3 與獨立 reviewer 交叉處理；模型只提供候選或排序，正式講記、音訊、digest、程式門檻與獨立覆核才是採納依據。

## 完成結果

- 來源句數：2,136；ID、順序、時間戳、`rawText` 與非文字 metadata 保持不變。
- 發布文字修正：1,521 句；其餘 unresolved：191 項，已由獨立 reviewer 全數逐項檢查，沒有足以唯一支持的修正，故保守保留。
- 獨立審查：PASS；reviewer `01a13d6f-fd89-72f2-9aa1-a71e08bb7179`；共 11 輪。
- promotion 後正式檔 digest 與 candidate digest 完全相同：`sha256:1f21b6f7ad8c9e6fb246375c23bdb251355ba744be3c5e115dc20a3e6d724953`。
- 完整驗證：Node 635 tests／631 pass／0 fail／4 skip；前端 93/93；Vite production build 成功；evidence audit 12 manifests + 1 production manifest + 1 promotion manifest，全部有效；`git diff --check` 通過。
- `courses/` 修改：1（僅 `四念住/session_08.json`）。

## 關鍵證據

- 正式 PDF SHA-256：`sha256:4f9033175f6d5635f7fbbe47438265edf1112c35fe9e37b5f75581526099d6ba`
- 正式 PDF 抽取文字 SHA-256：`sha256:6d6c09ba1bcdb4febc63b4ed35bbf7c4db8e6c05546ef272a3187bbcab15e07e`
- 原始逐字稿檔案 SHA-256：`sha256:a2b41bba0b5613196004c252c7ad2d5aeb081478c84942c2cde20170dd104860`
- 音訊 SHA-256：`sha256:72b8d87d74b8ba7164555e1879758fae60156b469e8345f2ce94440182203f86`
- GX10 Qwen runtime fingerprint：`sha256:4ecd3da1ec720103df2825333dab42518df6d78e4accd2d321c7d81d60e7c400`
- ledger digest：`sha256:bac3ef279aabb431e386fd1254c00757628481be4c495fa03163d64991afb1ed`
- review queue digest：`sha256:756947ed799784f4354ccafa0737f22d5766f82458a9f4f3b1586367cce891e1`
- independent review digest：`sha256:7706040a1e00da087396b03f767018edfd5fa1e6fdae66191017744846f9b36f`

## 品質邊界

- `rawText` 保留原始 ASR 作追溯；品質掃描只判定發布用 `text`。
- 模型結論不能直接覆蓋 transcript；沒有充分證據的項目保留 unresolved。
- 所有正式驗收依 immutable `runs/<runId>/` 快照，不依可覆寫的 latest 檔。
- 不得把相鄰句內容搬入本句；跨句 guard 限定同段落前後兩句，以兼顧跨界錯置與佛典術語遠距重複的假陽性。

## GitHub 與全庫範圍

- 本講已完成本地 commit 前的全部內容與驗證，但含完整候選逐字稿、完整 ASR、模型證據、ledger 與 review queue 的推送曾被安全審查攔下；必須取得使用者在知情後的明確推送同意，不能繞過。
- PR #252 保持 draft；全庫 302 份中目前完成 1 份，尚餘 301 份。
- 下一位 Agent 應先取得該推送同意並把本講 checkpoint 安全送上 GitHub，再依相同 gate 開始下一講。
