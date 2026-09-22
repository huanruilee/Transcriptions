# 釋量論第二品 32 講持續品質計畫

## 目標

完成 32 講逐字稿、科判、偈頌標註、時間碼與網頁呈現的可追溯驗收，並將流程固化為下一門課可重複使用的標準。

品質優先於速度與 token 成本。GitHub 是唯一進度與交付依據；Agent 對話摘要不是驗收證據。

## 證據狀態鏈

```text
SPECIFIED -> RED -> IMPLEMENTED -> GREEN -> REVIEWED -> INTEGRATED -> DEPLOYED -> ACCEPTED
```

任一關證據不足時停留在前一狀態。不得用「大多通過」、HTTP 200、Agent 自述或舊的例外清單代替驗收。

## 角色

- Codex orchestrator：定義 contract、審查 compact evidence、抽樣、管理 GitHub、最終驗收與部署。
- GX10 小法：在獨立 workspace 處理全文掃描、局部音檔核聽、修正與 evidence ledger。
- GX10 reviewer：獨立、唯讀、不沿用小法結論，輸出 `PASS|FAIL|BLOCKED`。

## 批次

| 批次 | 講次 | 目的 |
|---|---|---|
| B1 | 01–04 | 核心規則校正，高密度學習 |
| B2 | 05–08 | 重複檢查與誤判壓測 |
| B3 | 09–12 | 問答、括號與分段 |
| B4 | 13–16 | 名相與長段落 |
| B5 | 17–20 | 偈頌片段與語意邊界 |
| B6 | 21–24 | 辯論問答與来源對齊 |
| B7 | 25–28 | 時間碼、偈頌與已知高風險案例 |
| B8 | 29–32 | 跨頌號片段、結課與全課回歸 |

## 每講循環

1. `SCAN`：程式輸出句子 ID、問題類型、時間區間與候選數，不輸出全文。
2. `GROUND`：小法以官方文字稿、根本頌或局部音檔確定依據。
3. `RED`：新型態先有 positive/negative fixture 與失敗測試。
4. `FIX`：只套用 `CONFIRMED` 決策；`LIKELY/UNCERTAIN` 留在 review queue。
5. `GREEN`：該講 targeted tests 與全課 hard gates 通過。
6. `LEARN`：將新模式分類為單講 regression、全課 hard gate 或 heuristic review candidate。

Agent 工作拆成 `PREPARE -> ADJUDICATE -> APPLY -> VERIFY` 四張小卡；較弱模型
只判讀已凍結的 manifest，不同時探索 repo、改檔和設計測試。若文字順序與 raw
ASR 時間順序不一致，直接進人工音檔 queue，不以可通過測試的時間值硬配。

## Hard Gates 與 Heuristics

Hard gate 必須掃過全部 32 講並為綠燈：

- 宣告講次、session JSON、官方稿、TOC 與影音身分一致。
- sentence ID 唯一，起訖時間有效且不倒退。
- 時間單調必須跨 paragraph 邊界檢查，不得以「已知例外」跳過。
- paragraph 起訖對齊句子，科判編號、順序與 TOC 一致。
- 講者括號全講成對、不倒置。
- 每筆 `source_match` 偈頌同時存在於指定句子與指定頌號。
- frontend 僅將已確認片段著色，不洩漏到其他講次。

Heuristic 不得以「候選為零」當 hard gate：

- 短偈頌片段、通用佛學名詞、語意分段、無音檔證據的時間切點。
- 候選必須人工或 Agent 判定，並保留接受/拒絕理由。

## 批次 Evidence Contract

每批儲存在 `reviews/evidence/shiliang_32_continuous/B<N>/`：

- `input_manifest.json`：baseline commit、檔案/hash、講次、允許路徑。
- `scan_summary.json`：問題計數與 ID，完整 context 只留在檔案。
- `decision_ledger.json`：每筆決策、置信度、來源與修正前後。
- `red.txt` / `green.txt`：命令、exit code 與完整輸出。
- `worker.json`：workspace、branch、commit、changed files。
- `worker.json` 另須記錄有效的 profile home、provider/model 與 fallback 狀態。
- `review.json`：獨立 reviewer 結果與抽樣。

## 學習與更新規則

每批完成後必須審查：

- 新問題是否可由 deterministic detector 發現。
- 是否有反例，會將講解語誤當偈頌或將自然分段誤判為斷裂。
- 需要更新的 script、test、fixture、runbook 與 `.agents/skills/`。
- 新規則必須先通過已完成批次的回歸，才能應用到後續批次。

## 停止條件

- workspace、branch 或 baseline hash 不符。
- 需要修改 raw ASR、無音檔證據的 timestamp 或 scope 外檔案。
- Agent 沒有產生持久 evidence、只回傳摘要或自行擴大任務。
- reviewer 與 worker 結論不同，且尚未以更強來源解決。
- targeted 或 full regression 不為全綠。

## 最終驗收

1. B1–B8 皆有完整 evidence 與獨立 reviewer `PASS`。
2. `npm test`、`npm run test:v2`、`npm run build:v2` 全綠。
3. 開頭、中間、結尾及所有新型態至少各抽查一處。
4. PR 包含基線、RED/GREEN、批次紀錄、風險與 rollback。
5. CI 通過後合併，觀察 Pages 部署，以線上 commit 進行桌面與手機驗收。
6. Henry review 後才標記 `ACCEPTED`。

## 下一門課複用

複製此計畫與 progress schema，替換 `courseId`、講次清單、官方來源、偈頌來源與 browser 抽查矩陣。不複製本課的句子 ID、頌號或已知例外。
