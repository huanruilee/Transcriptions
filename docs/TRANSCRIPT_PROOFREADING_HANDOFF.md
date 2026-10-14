# 全庫逐字稿校稿交接紀錄

最後更新：2026-10-15 07:15 CST

## 工作位置

- 分支：`codex/transcript-proofreading-quality`
- 起始基準：`38b4b1eb7e6cd9d088050e669f7b17401ccc285c`
- 隔離 worktree：`/Users/henry/.codex/worktrees/transcript-proofreading-quality/Transcriptions`
- GX10：`100.113.144.100`
- vLLM 模型：`Qwen3.8-27B`
- 本機轉送端點：`http://127.0.0.1:18001/v1`

不得在共享 dirty checkout 工作，也不得直接修改或提交 `courses/` 來源逐字稿。現階段只產生候選、ledger、覆核佇列與稽核證據。

## 已完成

- 建立出版級品質契約、確定性用字規則、候選產生器、證據稽核器與測試。
- 固定分層試點涵蓋四門課各首、中、末三堂，共 12 堂。
- 第一階段 Qwen 候選已完成 12/12；`npm run proofread:evidence:audit` 最近一次結果為 12/12 valid。
- 因內容抽查發現不可靠修正，已新增第二階段逐項 verifier：只有 `accept` 可進候選；`reject`、`uncertain` 與跨句搬字一律進覆核佇列或 quarantine。
- 第二階段 verifier 已完成 12/12：
  - `2025釋量論第二品大組共學`：01、22、41
  - `入中論善顯密意疏`：01、56A、110B
  - `四念住`：01、05、08
  - `釋量論第二品`：01、17、32
- 聚焦測試最近一次為 25/25 通過；新增 verifier 之前的完整 `npm test` 為 599 tests、0 fail、4 skipped。第二階段全部完成後必須再跑完整測試。
- `courses/` 目前零修改。

## 執行中

2026-10-15 檢查：第二階段 verifier 已完成 12/12，GX10 SSH tunnel 已關閉，沒有需要續跑的模型批次。`npm run proofread:evidence:audit` 為 12/12 valid，聚焦測試為 25/25 通過。

依使用者要求，本輪完成 `四念住/session_08` 後暫停並交接。該堂全部 169 個 verifier accept 已做 before/after 掃描，並對 14 組高風險候選展開相鄰來源核對。內容 gate 結果為 **FAIL / DO NOT SCALE**；詳見 `reviews/evidence/transcript_proofreading/pilot/四念住/session_08.codex-audit.md`。禁止啟動 302 堂全庫批次。

## 續跑指令

若既有程序已停止：

```bash
ssh -N -L 18001:127.0.0.1:8001 100.113.144.100
npm run proofread:pilot:local -- --batch-size 50
npm run proofread:evidence:audit
node --test tests/unit/transcriptProofreadingPipeline.test.js tests/unit/transcriptProofreadingEvidenceAudit.test.js
```

本機可續跑 checkpoint 位於被 Git 忽略的 `reports/transcript-proofreading/work/`。若換機或重新 clone，已提交的 session 證據仍可稽核，但目前 runner 不會從證據檔重建 generation checkpoint，因此可能重新產生該堂候選；不可把舊證據誤認為可續跑 checkpoint。

## 尚未通過的 gate

- `四念住/session_08` 內容抽查已完成但 FAIL；其餘 11 堂尚未做同等 Codex 內容抽查。
- 尚未重跑完整 `npm test`、build 與全域稽核。
- 試點內容 gate 尚未通過，因此禁止啟動 302 堂全庫批次。
- 尚未進入正式套用、人工音訊／論義覆核、合併或部署階段。

## 下一步

1. 先為 `session_08.codex-audit.md` 中的阻擋案例新增 RED 測試並收緊 verifier gate。
2. 重跑 `四念住/session_08` verifier，直到內容抽查通過；不得直接刪除失敗案例來規避測試。
3. 再對其餘 11 堂做同等來源對照抽查。
4. 完整測試與 build 全綠後，才判斷試點是否允許進入 302 堂候選生成。
5. 每完成一個 gate，就更新本文件並在 Draft PR 留一則包含 commit、測試與下一步的交接留言。

## 重要品質邊界

- 模型是未受信任的候選產生者，不是最終校稿者。
- 不得改句子 ID、順序、時間戳、講者、否定、數字、因果、宗義或引文。
- `sourceDigest` 不符、manifest 不完整、verdict 覆蓋不完整或證據未知，都必須 fail closed。
- 結構稽核 PASS 不等於音訊、語義或論義驗收 PASS。
