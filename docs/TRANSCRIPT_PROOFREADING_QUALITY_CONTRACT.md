# 全庫逐字稿出版級校稿品質契約

## 目標與界線

本契約將使用者提供的出版級《四法印》逐字稿與臺灣繁體中文用字規範，轉化為可重跑、可稽核、保守不改義的全庫校稿流程。模型輸出只能成為候選修改，不能直接成為正式逐字稿。

參考文件留在使用者本機，不提交 Git：

- `2020臺灣《四法印》10-01.pdf`，SHA-256 `faa3d8545a018a91d70a2c2e23f528a5c49b485efa37279cbc545835ac711d0d`
- `錯別字或常用字 2026.pdf`，SHA-256 `fc181dee415706d5ef05e11caf3de56a8593f1bc6660e8cec20e5b8abca5b439`

## 四層驗收

1. **結構完整性**：句子 ID、順序、時間戳、講者、段落及原始 digest 不得漂移。
2. **文字與用字**：臺灣繁體、標點、常用字和語法符合規範；多義用法不得全域盲目替換。
3. **音訊一致性**：同音詞、缺字、數字、引文、刪句與講者自我修正需有音訊證據。
4. **論義正確性**：佛學名相、科判、原典引文及否定關係需由原典或人工審查支持。

任一層未通過，都不得宣稱出版級完成。結構 PASS 不代表音訊或論義 PASS。

## 不可破壞條件

- 原始 session 檔在候選階段保持不變。
- 每一處修改都有 `before`、`after`、理由、證據、信心值和 `reviewRequired`。
- ledger 的 `sourceDigest` 必須等於目前來源；來源變更後舊候選自動失效。
- 不得漏句、增句、重排、改 ID、改時間戳或改講者。
- 不得因追求書面流暢而改變否定、數字、因果、宗義或講者立場。
- 有意義的重複原則上保留；只有音訊與編輯政策共同支持時才能刪除。

## 三級處理

### A. 確定性規則

只處理不依上下文也不改義的字形與標點。規則列於 `config/transcript-proofreading-style-rules.json`，必須具備虛構正例、反例與冪等測試。

### B. 本地／私有模型候選與交叉審查

- 候選產生以使用者私人 GX10 的 Qwen3.8-27B 為主；MiniMax-M3 與 Eneural 模型可作獨立分類器。
- Qwen 使用 `enable_thinking=false`；各模型皆採小批量、固定 JSON schema、短理由代碼，保留必要前後文。
- 只回傳結構化候選，不得合併、刪除或重排句子。
- 看不清楚就維持原文並標記 `reviewRequired=true`。
- 原典、課程詞庫和既有人工核定詞優先於模型直覺。
- 模型彼此一致不等於事實正確；三模型只能協助拒絕、排序與聚類，不能核准新名相、整詞重建或論義修改。

### C. 低 token 覆核路由

1. 先用確定性規則驗證 digest、句子邊界及不可破壞欄位，不把已失效候選送入模型。
2. 固定的 Qwen、MiniMax、Eneural 三個 provider 各自只回傳 `accept|reject|uncertain` 與短理由代碼；每票必須對照程式擁有的 provider manifest，綁定 proposal ID、`sourceDigest`、`runId`、模型名稱與 runtime fingerprint。未知、重複、缺少或綁定不符皆不成立 quorum。任一有效 `reject` 即淘汰候選，但另存完整 rejected sidecar 與 ID 稽核索引。
3. 只有「純標點」或人工已核定的精確單次映射，且三模型一致接受，才可成為低風險 eligible；正式套用仍須通過 ledger 與來源稽核。
4. 三模型一致的中風險重複映射可合併成覆核群組；預設至少看群組首尾兩個代表、保留全部 member IDs，並另存 hash-bound sidecar（每位成員的 before/after、風險與三票證據）。只能由 Codex／人工明確核定映射後，再讓每位成員重新通過 deterministic exclusions。
5. 高風險、模型分歧、`uncertain`、未知證據及 digest 不符一律逐條覆核或 fail closed。
6. Codex 優先讀高風險、分歧與群組代表，不重讀模型已處理的整份逐字稿；但模型輸出不能替代音訊、原典與人工論義判斷。

### D. 音訊／人工覆核

以下類別不得自動核准：佛學名相、數字、否定詞、引文、人名、梵藏音譯、刪句、大幅縮短、語意補字、講者自我修正，以及任何模型低信心項目。

## 試點與全庫放行

1. 固定分層選取四門課各首、中、末三堂，共 12 堂。
2. 先產生候選 ledger 與覆核佇列，不改正式 session。
3. 程式化檢查 12/12 結構與 digest；Codex 抽查所有高風險修改；需要時回聽音訊。
4. 試點通過才分片處理全庫 302 堂；失敗的 session 隔離，不阻塞其他分片。
5. 全庫候選完成後，所有自動核准項目通過規則與冪等檢查，所有高風險項目保留人工決策狀態。
6. 正式套用、PR、合併與部署是後續獨立閘門。

## 可續跑與證據一致性

- checkpoint 綁定來源 digest、prompt 版本、endpoint、模型、穩定 runtime fingerprint、有效輸出上限與 batch size。
- 續跑前逐批重算 batch ID，重驗句數、proposal／uncertain 邊界與唯一性；不能只信任 batch index。
- 每堂同時只能有一個工作者；lock 記錄 PID、主機與時間，無存活程序的 stale lock 可安全回收。
- ledger、review queue、model responses 共用 `runId`，最後才寫入含三份 digest 的 completion manifest。沒有有效 manifest 不算完成。
- `pilot/` 與 `full/` 證據目錄分離。試點通過後，才使用 `--all` 進入 302 堂全庫候選生成。
