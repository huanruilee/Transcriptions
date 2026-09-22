# 釋量論第二品 — 全 32 講偈頌標註計畫（M2+ 執行方案）

Status: PLAN (M1 red 已建立；本檔為後續 GREEN 的唯一依據)
Branch: xiaofa/shiliang-all-quality
Baseline: 8d086f4 Merge PR #207: Shiliang first-session regression gates
Red 證據: reviews/evidence/shiliang_all_quality/01_red.log (exit 1, 缺 31 講 manifest)

## 0. 現況盤點（M1 實測）

- `courses/釋量論第二品/course.json`：32 個 session（sessionId "01".."32"）。
- `courses/釋量論第二品/sessions/session_NN.json`：paragraphs[].sentences[]，句 id 為
  `sent-1..sent-N`，**每講各自從 sent-1 重新編號**（碰撞問題見 §5）。
- `courses/釋量論第二品/verse_annotations.json`：schema
  `source-grounded-verse-annotations/v1`，單一頂層 `sessionId:"27"`，共 1 講有資料。
- 根本頌 source: `courses/釋量論第二品/source_text/pramana_chapter2_root_verses.txt`，
  每行格式 `<頌號> <法尊譯頌文>`（例：`01 量謂無欺智 安住能作義 ...`）。
- 前端 `src/App.vue:1259-1266` 只比對 `verseData.sessionId === String(sessionId)`（單講 v1 Shape）。

## 1. 資料格式（manifests + 每講 sessionId）

`verse_annotations.json` 升級為：

```json
{
  "schema": "source-grounded-verse-annotations/v2",
  "course": "釋量論第二品",
  "source": "courses/釋量論第二品/source_text/pramana_chapter2_root_verses.txt",
  "manifests": [
    {
      "sessionId": "01",
      "audioVerification": "UNVERIFIED",
      "annotations": [
        { "sentenceId": "sent-12", "verseId": 1, "quoteText": "量謂無欺智", "status": "source_match" }
      ]
    },
    { "sessionId": "02", "...": "..." }
  ]
}
```

規則：
- `manifests` 恰好 32 條，sessionId 與 course.json 一一對應（字串，允許 "01" 或 "1"，
  比對時以去前導零正規化）。
- 每條 annotation 必要欄：`sentenceId`、`verseId`、`quoteText`、`status`；
  選填 `note`（比對備註）。
- session_27 現有 v1 資料原樣搬進 manifests，不逐條重標。

## 2. source_text grounding

- 唯一頌文來源：`pramana_chapter2_root_verses.txt`。先以脚本解析成
  verseId -> 頌文行（同一頌號可能跨行，如 17 有兩行，須合併），產出
  `reviews/evidence/shiliang_all_quality/verses_index.json` 作為工作産物。
- verseId 以 source 行首編號為準；**不得**從講記逐字稿推想頌號。
- quoteText 必須是 source 頌文的「全句或分句片段」——先切分：依 `、，。` 與空格
  切成候選片段，annotation.quoteText 逐字等於其中一個片段（僅容忍全形/半形標點
  與空白差異）。找不到就退 UNVERIFIED，不得改字湊數。

## 3. quoteText / sentenceId 匹配

對每一講 N：
1. 讀 `sessions/session_NN.json`，取扁平句清單（id、text、start、end）。
2. 對每個 source 片段 quoteText，在該講句 text 做包含比對（先正規化：全形↔半形、
   去標點差異、去空白）。
3. 命中唯一句 -> `status: "source_match"`，寫該句 id 為 sentenceId。
4. 命中多句 -> 全部收錄（同一 quoteText 可對應多個 sentenceId，27 講已有此模式）。
5. 只命中片段的一部分（講記引頌但轉述不完整/語序不同）-> `status: "partial_match"`，
   sentenceId 取最佳重疊句，`note` 記錄差異。
6. 完全找不到 -> 不寫 annotation；於該講 manifest 加
   `"unmatchedVerses": [verseId...]` 並列 `audioVerification: "UNVERIFIED"`。

每講產出後寫 `reviews/evidence/shiliang_all_quality/m2_session_NN.json` 逐講留痕，
最後彙總進 verse_annotations.json。

## 4. status 規則（封閉集合）

| status | 判定 |
|---|---|
| source_match | quoteText 逐字（容忍標點/空白正規化）等於 source 片段，且完整包含於該句 text |
| partial_match | quoteText 來自 source，但講記引文與 source 有缺字/衍字/語序差，需人工覆核 |
| UNVERIFIED | 欄位級：audioVerification；或無法從文字證據判定（只允許出現在 manifest 級與無法匹配頌的清單，不得用作 annotation 級湊數） |

禁止第四種 status。測試以 `{source_match, partial_match, UNVERIFIED}` 驗證。

## 5. 跨講 sentenceId 碰撞

- sentenceId 的 key space 是 **(sessionId, sentenceId)** 二元組——sent-1 在每講都存在。
- 因此 annotation 必須內嵌於所屬 manifest（§1 巢狀結構），前端/任何索引都先以
  sessionId 選 manifest，再在 manifest 內以 sentenceId 建 map。
- 严禁出現頂層跨講共用的 annotations 陣列；严禁把別講的 sentenceId 抄進本講
  （RED 測試第 4 條即捕獲此錯誤：sentenceId 必須存在於本講 session JSON）。

## 6. 前端載入策略

- 目前 App.vue 僅認 v1 頂層 sessionId。GREEN 阶段最小改動：
  `src/App.vue` 載入段改為
  `const manifests = verseData.manifests || [{ sessionId: verseData.sessionId, annotations: verseData.annotations }]; const m = manifests.find(m => canonical(m.sessionId) === canonical(sessionId));`
  之後沿用同一 per-sentenceId map 邏輯，渲染行為不變。
- 找不到本講 manifest 時靜默降級（現有 catch 已備），不得 throw。
- 不改 rawText、sentences[].start/end、paragraph timestamps；本任務只讀 session JSON。

## 7. RED/GREEN 測試命令

```bash
cd /home/henry/.gx10/tasks/shiliang-quality-all/repo
# RED（現況必須失敗）
node --test tests/unit/shiliangVerseCoverage.test.js   # 現 exit 1
# 逐講施工後即時驗證
node --test tests/unit/shiliangVerseCoverage.test.js
# GREEN 門檻（全綠才算完成）
node --test tests/unit/shiliangVerseCoverage.test.js \
  tests/unit/annotation.test.js \
  tests/unit/sourceTextGrounding.test.js \
  tests/unit/sessionInventory.test.js
npm run test   # 全回歸
```

GREEN 定義：shiliangVerseCoverage 4 tests 全 pass（32 manifest 齊、欄位齊、
sentenceId 全部存在於本講），且既有回歸無劣化。

## 8. 硬限制（不可違反）

1. **不可捏造**：不新增虛構 sentenceId、不虛構 quoteText；无法溯源即 UNVERIFIED
   並列入 unmatchedVerses，絕不硬配。
2. **不可改動** session JSON 的 rawText / sentences text / start / end / timestamps，
   亦不可改 source_text 與 course.json；本計畫只動 verse_annotations.json、
   新增 reviews/evidence/shiliang_all_quality/ 下工作産物、以及 §6 的前端載入段。
3. 每一筆 source_match 必須可由 quoteText 在 source 檔與 session 檔雙向重放驗證
   （腳本可重跑，結果冪等）。
4. 部署、push 皆不在 M2 範圍，另行批准。
