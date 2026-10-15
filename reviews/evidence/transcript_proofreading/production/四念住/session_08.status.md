# 四念住第 8 講完整校稿狀態

日期：2026-10-16（Asia/Taipei）

## 結論

**IN PROGRESS / immutable candidate ready / 尚未套用至 `courses/`。**

目前 hash-bound 候選為 runId `9e1c7764-b6dc-4ec6-b62b-86e8e48cc825`，不可覆寫快照位於：

`reviews/evidence/transcript_proofreading/production/四念住/runs/9e1c7764-b6dc-4ec6-b62b-86e8e48cc825/`

這一講以公開正式講記、完整音訊 ASR、GX10 Qwen3.8-27B、MiniMax-M3 與獨立 reviewer 交叉處理。模型只提供候選或排序；正式講記、音訊、digest、程式門檻與獨立抽查才是採納依據。

## 現況

- 來源句數：2,136；ID、順序、時間戳與非文字 metadata 保持不變。
- 候選已套用：1,460 句；尚留 unresolved：222 項。
- 52/52 聚焦測試通過；成對標點、ledger、source digest、禁錯詞與 immutable snapshot gate 均通過。
- 最近完整驗證：Node 631 tests／627 pass／0 fail／4 skip；前端 93/93；Vite production build 成功；evidence audit 12 manifests + 1 production manifest valid。
- 第八輪獨立 reviewer 正逐項檢查 222 個 unresolved；未取得 PASS 前不得升級正式逐字稿。
- `courses/` 修改：0。

## 關鍵證據

- 正式 PDF SHA-256：`sha256:4f9033175f6d5635f7fbbe47438265edf1112c35fe9e37b5f75581526099d6ba`
- 正式 PDF 抽取文字 SHA-256：`sha256:6d6c09ba1bcdb4febc63b4ed35bbf7c4db8e6c05546ef272a3187bbcab15e07e`
- 原始逐字稿檔案 SHA-256：`sha256:a2b41bba0b5613196004c252c7ad2d5aeb081478c84942c2cde20170dd104860`
- 音訊 SHA-256：`sha256:72b8d87d74b8ba7164555e1879758fae60156b469e8345f2ce94440182203f86`
- GX10 Qwen runtime fingerprint：`sha256:4ecd3da1ec720103df2825333dab42518df6d78e4accd2d321c7d81d60e7c400`
- MiniMax 證據保持 advisory；未宣稱為 attested quorum。

## 品質邊界

- `rawText` 保留原始 ASR 作追溯；品質掃描只判定發布用 `text`。
- 模型結論不能直接覆蓋 transcript；不確定項目保留 unresolved。
- 任何新 run 必須寫入 `runs/<runId>/`；不得只依會被覆寫的 latest 檔驗收。
- 不得把相鄰句內容搬入本句；跨句 guard 保留在同段落前後兩句範圍，避免遠處重複佛典術語造成假陽性。

## 下一個 gate

1. 收回第八輪 unresolved 全檢結果；若 FAIL，只增量修正精確 ID 並建立新 immutable run。
2. 取得 hash-bound 獨立 PASS 後，將該 run 的 candidate 升級為 `courses/四念住/sessions/session_08.json`。
3. 建立 promotion manifest，綁定原來源、候選、ledger、review queue、獨立 review 與升級後 digest。
4. 重跑聚焦、完整 Node、前端、build、evidence audit；再 commit/push 更新 PR。
