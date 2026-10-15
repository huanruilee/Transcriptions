# 四念住第 8 講 production review 狀態

日期：2026-10-16（Asia/Taipei）

## 結論

**IN PROGRESS / CONTENT FAIL 尚未解除 / 不得套用至 `courses/`。**

既有 169 筆候選已保持原 `sourceDigest` 與 `runId`，完成 GX10 Qwen、MiniMax-M3、Whisper 音訊片段與兩輪整句檢查。Eneural 固定 14 案例評測通過，但 169 筆可能含未公開內容；目前沒有足以涵蓋外部 Eneural 雲端傳輸的明確授權，因此 production 批次未執行，manifest 明確標示 `not-run`。

## 證據

- Qwen：169/169，實際模型 `Qwen3.8-27B`，有 `/v1/models` runtime fingerprint，`quorum-eligible`。
- MiniMax-M3：169/169，API 未回報 actual model／runtime fingerprint，僅 `advisory`。
- Eneural：production `not-run`；固定安全評測為危險案例 8/8 阻擋、安全案例 6/6 接受。
- Qwen 批次驗證 exact ID coverage。MiniMax 的一次較大批次曾回傳 23/20，舊 runner 當場 fail closed，該失敗回應未納入最終 artifact；改以 10 筆批次後完成 169/169。現行 runner 已把 coverage mismatch 二分重試抽成具 deterministic test 的共用函式，後續成功證據會保存每次 attempt。
- compact packet：總數 169、納入人工覆核 169。因缺少有效三方 quorum，沒有任何候選可被自動接受或拒絕；模型 reject 只供排序參考，不能排除人工判定。
- 音訊：Whisper 169/169；runner 每次從指定 YouTube URL 全新下載暫存音檔，直接以該 bytes 產生音檔 SHA-256 與全部片段，完成後刪除暫存檔。YouTube video ID、來源 URL、yt-dlp 版本、下載命令、metadata digest、來源／音檔時長均寫入 acquisition evidence。音訊 ASR 只作近似讀音證據，不直接證明漢字。
- Qwen 裁決：實際模型與 runtime fingerprint 已 attested；一般輪為 approve 37／audio-required 90／reject 42，整句輪為 approve 105／audio-required 39／reject 25。
- MiniMax-M3 裁決：保留為 advisory；一般輪為 approve 33／audio-required 105／reject 31，整句輪為 approve 34／audio-required 102／reject 33。Runner 要求明示 external-data authorization，artifact 保存本次授權 scope。
- 每筆裁決均綁定 `packetDigest`、完整輸入 `inputDigest`、`audioSha256` 與片段 response digest。`session_08.production-manifest.json` 再以 byte digest 綁定 8 份 production artifacts；`npm run proofread:evidence:audit` 為 12 個 pilot manifests + 1 個 production manifest 全數 valid。
- 正式 `courses/` 修改：0。

## 品質邊界

- `null` runtime fingerprint 絕不因兩邊同為 `null` 而算作有效綁定。
- 缺少 Eneural production 票時沒有三模型 quorum，任何項目都不得自動 eligible。
- 缺少完整有效 quorum 時，任何風險層級的模型 reject 都保留在人工 review packet，以免犧牲校稿召回率。
- 本檔僅證明模型分流與證據綁定完成，不證明文字、音訊或論義正確。

## 下一步

1. Codex 逐項裁決 169 筆，先處理模型分歧、法義敏感、整詞重建與修改後仍不通的項目；整句輪已辨認 `after` 仍殘留錯字的案例，不能只套用局部差異。
2. 對純標點與重複、唯一對應的名相修正做群組抽查；任何異常即展開全組。
3. 無法從文字唯一判定者保留 `audio-required`，不得推測核准。
4. 重建本堂 ledger／review queue 證據，重跑 evidence audit、聚焦測試、完整測試與 build。
5. 本堂內容 gate 通過前，不得開始 302 堂全庫批次。

## 2026-10-16 獨立 review 修復

獨立 reviewer 曾判定 DO NOT APPLY，指出裁決未綁定候選文字、空模型目錄可能被誤認為 attested、音訊來源證據不足、MiniMax 缺明示授權 gate、production evidence 未納入 audit，以及 audio producer 未比對 exact ID set。上述機械與 provenance 缺口已全部修復並由 45 個聚焦測試與 production audit 覆蓋。這只解除 evidence-chain blocker；內容本身仍未完成裁決，因此本檔結論仍是不得套用。

完整 Node suite 在允許測試寫入暫存檔與開啟本機測試 port 的環境下為 622 tests／618 pass／0 fail／4 skip；sandbox 內先前的 2 個失敗分別是 `EPERM` 寫入測試暫存檔與無法啟動 local sync test port，非產品回歸。
