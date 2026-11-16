# 三模型校稿路由評測（2026-10-15）

## 結論

本次只驗證「模型能否作為保守候選分類器」，不驗證模型能否獨立完成佛典校稿。三個 provider 在固定 14 案例上都通過最低阻擋門檻；因此可用來減少 Codex 重讀重複候選的 token，但不能取代來源、音訊、原典或人工論義覆核。

| Provider | 模型 | 危險案例阻擋 | 危險誤接受 | 明確安全案例接受 | 回傳字元 |
| --- | --- | ---: | ---: | ---: | ---: |
| GX10 vLLM | Qwen3.8-27B | 8/8 | 0 | 6/6 | 867 |
| MiniMax | MiniMax-M3（requested，actual 未回報） | 8/8 | 0 | 6/6 | 825 |
| Eneural | deepseek-v4.1-flash（actual 回報） | 8/8 | 0 | 6/6 | 931 |

測試資料：`tests/fixtures/transcript-proofreading/multimodel-eval.json`。危險案例取自 `四念住/session_08` 已發現的無來源重建、名相／論義猜測及錯誤整詞替換；安全案例限於純標點、明確同音字或已知名相。

原始結構化結果：`model-reviewer-qwen-2026-10-15.json`、`model-reviewer-minimax-2026-10-15.json`、`model-reviewer-eneural-2026-10-15.json`。Qwen 與 MiniMax 結果由 repository evaluator 直接寫入；Eneural 因憑證只存在私人 GX10，使用同一 fixture／prompt 的 Python 等價呼叫後保存。三份皆不含 API key。

三份 smoke evidence 都保存執行時間、endpoint／route、raw response digest 與可取得的 response ID／actual model。只有 Qwen 額外保存當時 `/v1/models` 的觀測 fingerprint；MiniMax CLI 沒回傳 actual model，Eneural 也沒有 server-attested runtime fingerprint。三份都沒有 provider 可驗證簽章，因此本身不能構成 production quorum。正式 packet 必須另由程式擁有的 provider manifest 綁定每票的模型與實際 runtime fingerprint。

## 可重跑命令

```bash
npm run proofread:reviewer:eval -- --provider=qwen
npm run proofread:reviewer:eval -- --provider=minimax
ENEURAL_API_KEY=... npm run proofread:reviewer:eval -- --provider=eneural
```

Qwen 預設使用 SSH tunnel `127.0.0.1:18001 -> GX10:8001`。Eneural key 只從環境變數讀取，不寫入 repository。每次輸出必須完整覆蓋 fixture IDs，否則評測 fail closed。

## 路由規則

- 任一 provider `reject`：淘汰，不進 Codex packet。
- 三模型一致接受的低風險項目：只有純標點或人工已核定的精確單次映射才是 `eligible`。
- 三模型一致接受的中風險重複映射：聚類為 `review`，預設保留群組首尾兩個代表、全部 member IDs 與 hash-bound 完整 sidecar，等待 Codex／人工核定；不得自動套用。
- 三票固定為 Qwen、MiniMax、Eneural，且必須各一票並綁定 proposal ID、`sourceDigest`、`runId`、模型名稱與 runtime fingerprint；任一身份或綁定異常即不成立 quorum。
- 高風險、provider 分歧或 `uncertain`：逐條保留，不聚類。
- 模型一致不能推翻 deterministic risk，也不能核准論義、引文、數字、否定、跨句搬字或大幅重寫。

## 實際 ledger 壓縮估算

對 `四念住/session_08` 的 169 筆既有 ledger 做不含人工核定詞表的靜態分類：

- high：116（包含既有 `semantic|term|numeric|deletion|quotation` 風險類別、否定／數字變更與其他高風險規則）
- medium novel mapping：39，共 26 個映射群組
- low punctuation-only：14，共 1 個群組
- 若每個 medium 群組之後都取得三模型一致結果，以每群組最多兩個代表計算，保守覆核上限為 148 個閱讀單位，為原始 169 筆的 87.6%（減少 12.4%）。

這是「可能達成的 packet 大小」而不是已完成的三模型結果。若 provider 分歧，相關項目會展開逐條覆核，實際壓縮率會變差，但品質閘門不會放寬。

## 限制

- 14 案例樣本很小，只適合作為回歸／煙霧測試。
- Eneural 本機沒有設定檔，本次由私人 GX10 的既有 Eneural 設定呼叫；API 曾因預設 user-agent 回傳 403，加入固定非瀏覽器 user-agent 後成功。
- GX10 Smart Router 的 4001 端點當時未運行；Qwen 改用 8001 vLLM 直連。
- 尚未對 session_08 全部 169 筆執行三模型 verdict，也未解除既有 `FAIL / DO NOT SCALE`。
- 三模型可能有共同偏誤；固定 14 案例通過仍不代表 production accuracy。
