# 逐字稿整理與網頁呈現重構執行手冊

## 狀態與目的

- 狀態：`SPECIFIED`，尚未開始正式實作。
- 第一個適用課程：`courses/釋量論第二品/`。
- 目的：把逐字稿品質判斷、決策套用、回歸測試與網頁呈現拆成可重跑、可審查、可回退的流程。
- 原則：保留現有 session JSON 契約，先增加 detector、decision ledger、deterministic applier 與 frontend adapter，不全面改寫 schema。

完成的證據鏈為：

```text
SPECIFIED -> RED -> IMPLEMENTED -> GREEN -> REVIEWED -> INTEGRATED -> DEPLOYED -> ACCEPTED
```

任何一關證據不足，都停留在前一狀態，不得以測試數量、Agent 摘要或網站可開啟代替內容驗收。

## 範圍

### 納入

- 佛學名相與來源文字校對。
- 中文標點與 sentence 邊界候選偵測。
- paragraph 語意邊界候選偵測與修正。
- 科判、偈頌標註、session isolation 與前端呈現。
- 小法工作切片、decision ledger、套用器、回歸測試及證據整理。

### 暫不納入

- 全面更換現有 session、TOC 或 course schema。
- 無音檔或來源證據支持的 timestamp 重算。
- 在同一工作包內重做完整 ASR、內容校訂、前端改版與部署。
- 刪除歷史 evidence。過期或失敗紀錄只移入 `runs/` 分類。

## 不可變條件

一般文字校訂與 paragraph 合併不得改動 sentence 的：

- `id`
- `rawText`
- `start`
- `end`
- `sourceSegmentId`（存在時）

若確實需要拆分 sentence，必須另立音檔對齊工作包，提供音檔 identity、片段 hash、切點時間與獨立解碼證據。沒有這些證據時標記 `UNVERIFIED`，不得猜測 timestamp。

## 目標資料流

```text
session/source/audio
        |
        v
deterministic detectors
        |
        v
bounded candidate manifest (每批 5-10 筆)
        |
        v
小法判斷 decision ledger
        |
        v
deterministic idempotent applier
        |
        v
targeted regression + independent review
        |
        v
frontend adapter + browser acceptance
```

## 角色與責任

### Orchestrator（Codex）

- 定義 scope、不可變條件、RED/GREEN 命令與停止條件。
- 只讀取 compact summary，不把完整逐字稿輸出到對話。
- 驗證實際 diff、hash、測試及網頁成果。
- 管理 branch、commit、PR 與部署驗收。

### 小法

- 每次只處理一份已凍結的 candidate manifest。
- 每批最多 10 筆，預設 5 筆。
- 只輸出 `PASS`、`MERGE`、`SPLIT`、`CORRECT` 或 `UNVERIFIED`。
- 不重新探索 repo，不自行擴大 scope，不負責批准自己的成果。

### Independent reviewer

- 使用獨立唯讀環境，檢查 commit blob、ledger、diff 與抽樣內容。
- 回傳 `PASS`、`FAIL` 或 `BLOCKED`，並列出 evidence path。
- 不修改資料、不部署。

## Decision Ledger 契約

每個決策至少包含：

```json
{
  "schema": "transcript-decision-ledger/v1",
  "course": "釋量論第二品",
  "baselineCommit": "<sha>",
  "inputManifestSha256": "<sha256>",
  "decisions": [
    {
      "sessionId": "05",
      "operation": "MERGE",
      "targetParagraphId": "p_33",
      "sourceParagraphId": "p_34",
      "lastSentenceId": "sent-269",
      "firstSentenceId": "sent-270",
      "confidence": "CONFIRMED",
      "reason": "word or discourse unit is split across paragraph boundary",
      "evidence": ["<source path or timestamped audio evidence>"]
    }
  ]
}
```

規則：

- `CONFIRMED` 才可自動套用。
- `LIKELY` 與 `UNCERTAIN` 只能進 review queue。
- `UNVERIFIED` 不得修改 published data。
- 每筆決策都必須綁定 baseline commit 與 input manifest hash。

## Detector 規格

四類 detector 分開執行與報告，不合併成單一品質分數。

### D1：文字與佛學名相

- 已知 ASR 同音錯字與繁簡異常。
- source text 精確或可追溯命中。
- 每條自動規則需要一個 positive fixture 與一個 false-positive fixture。

### D2：標點與 sentence 邊界

- 實質句子沒有結尾標點。
- 一個 acoustic sentence 內出現明顯的新問答或新論證單元。
- 只產生候選；涉及 timestamp 的拆句不得自動套用。

### D3：paragraph 語意邊界

- 前段末尾與後段開頭拼接成同一詞語或句子。
- 後段以明顯承接殘片起始，如「的、來、程、債」，且上下文可拼接。
- paragraph 長度分布只用於找異常，不直接決定 merge/split。
- 合掌、放掌、休息及下課等儀軌/行政句不視為異常。

### D4：科判、偈頌與網頁映射

- TOC session reference、timestamp range 與 session isolation。
- 偈頌 annotation 必須同時命中來源與本講 sentence。
- 沒有偈頌的導入講次可為空，但必須有明確理由。
- legacy/v2 差異只由 frontend adapter 處理。

## Deterministic Applier 契約

套用器必須：

1. 驗證 ledger schema、baseline 與 manifest hash。
2. 驗證目標 session、paragraph 與 sentence ID 存在。
3. 驗證 merge 的 paragraph 相鄰且 sentence 順序相符。
4. 已套用的決策安全略過，重跑不產生第二次修改。
5. 保留 sentence 不可變欄位。
6. 合併後把 paragraph `end` 設為最後 sentence 的 `end`。
7. 寫出 changed-file list、before/after hash、applied/skipped/blocked 數量。
8. 任一斷言失敗即停止，不寫入後續 session。

## Evidence 目錄

新流程使用：

```text
reviews/evidence/transcript_web_refactor/
  runs/          # 單次執行、失敗與環境紀錄
  decisions/     # 經確認且可重放的 ledger
  acceptance/    # commit、tests、build、browser 驗收
  fixtures/      # 永久 regression 案例
```

stdout 只輸出 compact completion card；完整候選、逐字稿片段及 logs 寫入 evidence，不貼入 orchestrator 對話。

## Milestones

### M0：Baseline 與 inventory

輸入：目前 Git commit 與 `釋量論第二品` 全部資料。

產出：

- 工作區、branch、commit、dirty status。
- session、TOC、verse manifest 與 frontend loader inventory。
- 全部 session JSON 及 sentence immutable-field hash。
- 現有 scripts/tests/evidence ownership map。

驗收：baseline 可由另一個 checkout 重算並得到相同 hash。

### M1：先重構 Test Foundation

目的：先建立穩定、可共用的測試基礎；本階段不修改 production data，也不追求把現有測試全部改寫。

目前已知問題：

- `paragraphBoundaryIntegrity.test.js` 與 `shiliangAllSessionsPatterns.test.js` 重複載入 32 講並檢查相近 invariants。
- 現有「禁改欄位」只檢查欄位存在與非空，不能證明套用前後沒有改變。
- `shiliangVerseCoverage.test.js` 以 regex 搜尋 `App.vue` 實作文字，容易在等價 refactor 後誤報。
- paragraph 測試主要驗證 schema、時間與已知案例，不能推論所有語意邊界均正確。
- detector、ledger 與 applier 尚無共用 fixtures、contract tests 與 fail-closed tests。

本階段產出：

1. `tests/helpers/shiliangFixtures.js`：集中載入 course、TOC、session、sentence index 與 canonical session ID。
2. `tests/fixtures/transcript_web_refactor/`：保存最小化正反案例，不複製完整逐字稿。
3. immutable baseline manifest：只 hash `id/rawText/start/end/sourceSegmentId`；`text` 為 published editorial layer，不列入永久 immutable 欄位。
4. frontend annotation selector 抽成純函式，以輸入輸出測試取代 `App.vue` regex。
5. 現有 tests 先保留；新 helper 與 behavior tests 綠燈後，再逐項刪除重複 assertions。

驗收：

- 新 helper 有自己的 unit tests。
- baseline hash 可重算且欄位順序不影響結果。
- 一個刻意修改 `rawText` 或 timestamp 的 fixture 必須失敗。
- 一個只修改 published `text` 的 fixture 必須通過 immutable gate。
- legacy/v2 annotation selector 使用相同 behavior contract。
- 測試重構前後，既有 production data 的判定結果一致。

### M2：先寫 Detector RED tests

先建立 fixture，再寫 detector。至少覆蓋：

- 應 merge 的跨 paragraph 斷詞。
- 不應 merge 的自然新段落。
- 需要音檔才能 split 的 sentence，結果必須為 `UNVERIFIED`。
- 偈頌 source/session 雙重命中與 cross-session negative case。

驗收：RED test 在尚未實作 detector 時，因預期契約失敗。

### M3：實作四類 detectors

產出 machine-readable candidates；不得直接修改 session JSON。

驗收：

- fixtures 全綠。
- 全課程掃描可重跑。
- 相同 baseline 產生相同 candidate hash。
- 每個 candidate 都含 rule ID、位置、短 context 與 reason。

### M4：小法 bounded review

將 candidates 固定為每批 5 筆，必要時最多 10 筆。每批先完成並落盤，再啟動下一批。

停止條件：

- workspace 或 baseline 不符。
- 沒有 terminal event 或 evidence file。
- Agent 只回摘要、沒有 decision ledger。
- 出現 scope 外修改。

### M5：先寫 Applier RED tests，再實作

測試 idempotency、部分已套用、非相鄰 paragraph、stale baseline、immutable hash 與 fail-closed behavior。

驗收：同一 ledger 執行兩次，第二次 `applied=0` 且 git diff 不變。

### M6：整合品質 gates

最低命令：

```bash
node --test tests/unit/paragraphBoundaryIntegrity.test.js
node --test tests/unit/shiliangAllSessionsPatterns.test.js
node --test tests/unit/shiliangVerseCoverage.test.js
node --test tests/unit/tocTranscriptAlignment.test.js
npm run build:v2
```

若 `npm test` 有與本工作無關的既有失敗，必須逐項列出，不得把 targeted GREEN 宣稱為全 repo GREEN。

### M7：Frontend adapter

- 集中處理 legacy/v2 annotation shape。
- 所有 lookup 都要求 active `sessionId`。
- UI component 不直接理解來源檔 schema。
- TOC、paragraph 與偈頌共享同一 session context。

驗收：unit tests、build 及 cross-session negative case 全綠。

### M8：Independent review 與 browser acceptance

唯讀 reviewer 檢查 exact commit 與 evidence。瀏覽器至少抽查 session `01`、`05`、`22`、`27`、`32`：

- paragraph 實際換段。
- 科判位置與 session isolation。
- 偈頌顏色及非偈頌文字不誤標。
- 桌面與手機 viewport。
- console 無新增錯誤。

### M9：GitHub integration 與部署

- 使用 `codex/` branch 與可辨識 commit author。
- PR 必須附 RED/GREEN、evidence、review result、風險與 rollback。
- CI 通過後才 merge。
- 部署後以 exact commit SHA 做 browser acceptance。
- Henry review 後才標記 `ACCEPTED`。

## GitHub 工作規則

- 實作 branch：`codex/transcript-web-refactor`。
- Commit author：`Codex Agent <huanruilee.us+codex@gmail.com>`。
- 每個 Milestone 原則上獨立 commit；不得混入無關變更。
- 小法只在隔離 workspace 產生 decision/evidence 或 scoped implementation。
- PR 是 proposal；merge 與部署不是自動授權。

## Rollback 與 escalation

- M0 與 M1 不修改 production data，因此回復方式只需 revert 對應的獨立 commit。
- M2 之後每次套用前都保存 baseline commit、輸入 hash 與 changed-file list；回復使用可審查的 `git revert <commit>`，不得以 reset 覆蓋歷史。
- 若 manifest 已過期、不可變欄位改動、decision 找不到目標、Agent 擴大 scope 或獨立 reviewer 判定失敗，立即停止該批次並標記 `BLOCKED`。
- 若修正需要重切 sentence 或改 timestamp，升級為獨立的音檔對齊工作包，不在本流程中猜測或順手修改。
- 部署後驗收失敗時，先保存失敗畫面、console 與 deployed SHA，再回退該部署；不得把本機 GREEN 當成已恢復證據。

## 第一個可執行工作包

開始 M0 時只做 inventory 與 baseline，不修改 production data：

```text
Allowed outputs:
- reviews/evidence/transcript_web_refactor/runs/m0_baseline.json
- reviews/evidence/transcript_web_refactor/runs/m0_inventory.json

Required facts:
- repo root, branch, commit, dirty status
- hashes for course.json, toc.json, verse_annotations.json
- per-session file hash and immutable sentence-field hash
- relevant script/test/evidence paths

Forbidden:
- session JSON mutation
- TOC/manifest/frontend mutation
- Agent dispatch
- commit, push, merge, deploy
```

M0 完成並人工檢查後，才進入 M1 Test Foundation；M1 綠燈後才建立 Detector RED tests。

## Test Pattern 目標矩陣

| 層級 | 必測內容 | 目前狀態 | 重構目標 |
|---|---|---|---|
| Unit | normalization、hash、candidate rule、ledger validation | 部分 | 純函式與正反 fixtures |
| Contract | session/TOC/verse schema、immutable fields | 部分 | 共用 loader、before/after hash |
| Transformation | merge/split/correct 套用與 idempotency | 缺少 | applier contract suite |
| Integration | detector -> ledger -> applier -> regression | 缺少 | fixture-driven pipeline test |
| Frontend | legacy/v2 selector、session isolation | 部分且脆弱 | behavior test，不讀 source regex |
| Browser | paragraph、TOC、verse color、mobile/desktop | 人工零散 | 固定五講 acceptance matrix |
| Content | 名相、標點、語意分段、來源 grounding | 部分 | 分類 gate，不合成單一分數 |

測試重構的邊界：

- 不一次重寫所有舊 tests。
- 不以 snapshot 取代重要的欄位與行為 assertions。
- 不把 LLM 判斷直接寫進 deterministic unit test；只把已核准決策轉成 fixture。
- 不以平均段落長度或標點規則宣稱語意正確。
- 測試本身的變更與 production data 修正分開 commit，避免測試配合實作一起漂移。

## 完成定義

只有以下條件全部成立才算重構完成：

- 四類 detector 與 fixtures 完成。
- 小法可透過固定 manifest 產生可重放 ledger。
- applier idempotent 且 immutable-field gate 通過。
- targeted 與 full regression 狀態均被如實記錄。
- independent reviewer 通過。
- 五個代表 session 的桌面與手機 browser acceptance 通過。
- GitHub PR、CI、merge commit 與部署 commit 可追溯。
- Henry 完成最終 review。
