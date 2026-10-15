# 四念住第 8 講 production review 狀態

日期：2026-10-15（Asia/Taipei）

## 結論

**IN PROGRESS / CONTENT FAIL 尚未解除 / 不得套用至 `courses/`。**

既有 169 筆候選已保持原 `sourceDigest` 與 `runId`，完成 GX10 Qwen 與 MiniMax-M3 的逐項判決。Eneural 固定 14 案例評測通過，但 169 筆可能含未公開內容；目前沒有足以涵蓋外部 Eneural 雲端傳輸的明確授權，因此 production 批次未執行，manifest 明確標示 `not-run`。

## 證據

- Qwen：169/169，實際模型 `Qwen3.8-27B`，有 `/v1/models` runtime fingerprint，`quorum-eligible`。
- MiniMax-M3：169/169，API 未回報 actual model／runtime fingerprint，僅 `advisory`。
- Eneural：production `not-run`；固定安全評測為危險案例 8/8 阻擋、安全案例 6/6 接受。
- Qwen 批次驗證 exact ID coverage。MiniMax 的一次較大批次曾回傳 23/20，舊 runner 當場 fail closed，該失敗回應未納入最終 artifact；改以 10 筆批次後完成 169/169。現行 runner 已把 coverage mismatch 二分重試抽成具 deterministic test 的共用函式，後續成功證據會保存每次 attempt。
- compact packet：總數 169、納入人工覆核 169。因缺少有效三方 quorum，沒有任何候選可被自動接受或拒絕；模型 reject 只供排序參考，不能排除人工判定。
- 正式 `courses/` 修改：0。

## 品質邊界

- `null` runtime fingerprint 絕不因兩邊同為 `null` 而算作有效綁定。
- 缺少 Eneural production 票時沒有三模型 quorum，任何項目都不得自動 eligible。
- 缺少完整有效 quorum 時，任何風險層級的模型 reject 都保留在人工 review packet，以免犧牲校稿召回率。
- 本檔僅證明模型分流與證據綁定完成，不證明文字、音訊或論義正確。

## 下一步

1. Codex 逐項裁決 169 筆，先處理模型分歧、法義敏感、整詞重建與修改後仍不通的項目。
2. 對純標點與重複、唯一對應的名相修正做群組抽查；任何異常即展開全組。
3. 無法從文字唯一判定者保留 `audio-required`，不得推測核准。
4. 重建本堂 ledger／review queue 證據，重跑 evidence audit、聚焦測試、完整測試與 build。
5. 本堂內容 gate 通過前，不得開始 302 堂全庫批次。
