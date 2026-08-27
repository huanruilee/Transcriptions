# TOC Remediation Plan

## 目的

本計畫只處理 `Transcriptions` 的科判章節目錄（TOC）體驗與資料契約。現階段先建立可審核的問題定義與紅燈測試，不直接修正式行為，避免與其他 agent 的 ASR、逐字稿、session 補轉譯工作互相踩線。

## Scope

Codex TOC Agent 負責：

- `src/js/toc.js`
- `src/js/app.js` 中 TOC 初始化、session 切換、TOC 高亮與 seek 的小範圍邏輯
- `courses/入中論善顯密意疏/toc.json`
- TOC 專用 unit / acceptance tests
- TOC audit script 或 QA report

非本計畫範圍：

- ASR 重新轉錄
- 逐字稿內容校正
- 非 TOC 的播放器、搜尋、annotation、course overview 功能
- 未經 Henry 或領域專家確認的義理科判內容定案

## 已觀察問題

1. TOC DOM nesting 不正確：child `<ul>` 目前不是父 `<li>` 的子元素，造成視覺與語意層級不可信。
2. 初始載入時 TOC 尚未知道 active session，`本課科判` 實際會顯示全書節點。
3. `toc.json` 同時承載全書科判、課次關聯、播放時間戳，資料模型混雜。
4. 細科判節點的 `sessionIds` 出現大跨度混掛，例如早期課次與 108-110 課次被掛在同一節點。
5. 多個節點 `timestamp: 0`，UI 已將其視為章節起點待補，但資料層仍把它們呈現成可導航節點。
6. 部分 published sessions 沒有 leaf-level timed TOC anchor，也沒有明確的 exemption 或 needs-review 註記。
7. `docs/QA_REPORT_79_102.md` 已指出 79-110 科判歸屬需要領域專家複審，但目前測試沒有將這個狀態納入驗收。

## 測試優先策略

第一階段只新增會暴露現狀問題的測試：

- `toc.js` 渲染出的 nested tree 必須保持 DOM 階層：child `<ul>` 必須在父 `<li>` 裡。
- `renderTOC()` 必須能用 active session 做初始過濾，避免本課科判顯示全書。
- `timestamp: 0` 不可呈現為精準 seek link，必須以 pending / disabled 狀態呈現。
- 細科判節點若 `sessionIds` 跨度過大，必須標示 `needs_review` 或等效 review status。
- published session 若沒有可用 TOC anchor，必須出現在明確的 coverage exemption / needs-review 清單，而不是靜默缺失。

這些測試在目前 repo 狀態下預期失敗；失敗結果就是後續修復工作的 baseline。

## Baseline Test Result

2026-08-27 在 `codex/toc-remediation-tests` 執行：

```bash
node --test tests/unit/tocRemediation.test.js
```

結果：5 tests, 0 pass, 5 fail。

失敗項目：

- `TOC remediation: nested children render inside their parent list item`
- `TOC remediation: initial course scope can render only the active session`
- `TOC remediation: timestamp=0 nodes are pending anchors, not precise seek links`
- `TOC remediation: broad sessionIds spans must be marked for review`
- `TOC remediation: published sessions without TOC anchors require explicit coverage status`

## M2 Rendering Fix Result

2026-08-27 在 `codex/toc-m2-rendering-fix` 執行：

```bash
node --test tests/unit/tocRemediation.test.js
```

結果：5 tests, 3 pass, 2 fail。

已轉綠的 M2 rendering 契約：

- `TOC remediation: nested children render inside their parent list item`
- `TOC remediation: initial course scope can render only the active session`
- `TOC remediation: timestamp=0 nodes are pending anchors, not precise seek links`

保留給後續 milestones 的紅燈：

- `TOC remediation: broad sessionIds spans must be marked for review`（M3 / M4）
- `TOC remediation: published sessions without TOC anchors require explicit coverage status`（M3 / M4）

既有回歸測試：

```bash
node --test tests/unit/toc.test.js tests/unit/a11y.test.js tests/acceptance/completion.test.js
```

結果：15 tests, 15 pass。

## 建議資料模型方向

後續實作時，建議把三種概念拆開：

- `bookOutline`: 全書科判義理結構。
- `sessionAnchors`: 某堂課在何時講到哪個科判節點。
- `reviewStatus`: `verified`、`needs_review`、`inferred`、`missing_timestamp`。

如此可避免把「全書科判」與「課堂播放位置」硬塞進同一個 `sessionIds` 陣列。

## GitHub 協作規則

- Branch: `codex/toc-remediation-tests`
- Commit author: `Codex TOC Agent <huanruilee.us+codex@gmail.com>`
- Commit message prefix: `codex(toc):`
- Branch / PR 是 proposal，不是 approved baseline；只有 Henry review 後 merge 到 `main` 才算接受。
