# 全 32 講偈頌 manifest 生成摘要（M2 manifests GREEN）

Date: 2026-09-08 (CST)
Branch: xiaofa/shiliang-all-quality
Task: 將 verse_annotations.json 升級為 manifests 陣列（32 個 sessionId），全綠通過
      tests/unit/shiliangVerseCoverage.test.js（4 pass / 0 fail，見 manifest_green.log，exit=0）。

## 方法（零捏造原則）

- 頌文唯一來源：courses/釋量論第二品/source_text/pramana_chapter2_root_verses.txt。
  解析行首頌號（同頌號跨行合併，忽略純頁碼行），依 `、，。` 與空白切出長度 ≥4 的片段。
- 對每講 session_NN.json 的扁平句清單做**精確子字串**包含比對（正規化：無；
  quoteText 逐字命中句 text 才標 source_match；同句若同時命中多個片段，只保留最長者）。
- 無法精確命中者一律不寫 annotation，該講列 audioVerification: "UNVERIFIED"，
  未命中頌列入 manifest.unmatchedVerses，notes 標明 UNVERIFIED 原因。
- 第 27 講：v1 的 24 筆 annotations 原樣搬入 manifests（逐筆核驗為 session_27
  sentence text 的精確子字串，24/24 通過）；不逐條重標，故其 unmatchedVerses
  依既有 quoteText 與 source 頌文回溯比對得出。
- 未改動任何 session JSON、App.vue、測試檔；僅修改 verse_annotations.json 與本目錄 evidence 檔。

## 來源 hash

- source_text/pramana_chapter2_root_verses.txt
  sha256 = f8ac26b9bdec8d2e8ee5ff12b110ed8316da4be84139b7519038f8bc3155bbf3
- verse_annotations.json（改寫前 v1）
  sha256 = 0773b4bf6dc2e71600a0290e68c372765dadf3fe6c7359a786d7b05ac1aaa463
- verse_annotations.json（改寫後 v2 manifests）
  sha256 = dc15e77bef156ffd7ed4755cdadb7d760bb7462a5d5722416c3a6fe16feba3e9

## 每講統計（annotations = source_match 筆數；unresolved = 該講 unmatchedVerses 頌數）

| sessionId | annotations | unresolved |
|---|---|---|
| 01 | 0  | 286 |
| 02 | 0  | 286 |
| 03 | 16 | 282 |
| 04 | 8  | 285 |
| 05 | 48 | 280 |
| 06 | 65 | 279 |
| 07 | 22 | 280 |
| 08 | 60 | 278 |
| 09 | 17 | 280 |
| 10 | 34 | 281 |
| 11 | 3  | 283 |
| 12 | 6  | 285 |
| 13 | 35 | 281 |
| 14 | 18 | 281 |
| 15 | 74 | 276 |
| 16 | 80 | 271 |
| 17 | 14 | 285 |
| 18 | 44 | 280 |
| 19 | 51 | 278 |
| 20 | 79 | 277 |
| 21 | 40 | 280 |
| 22 | 33 | 281 |
| 23 | 60 | 273 |
| 24 | 42 | 278 |
| 25 | 44 | 277 |
| 26 | 38 | 279 |
| 27 | 24 | 281 |  ← v1 原樣保留（24/24 精確子字串核驗通過）
| 28 | 61 | 273 |
| 29 | 84 | 274 |
| 30 | 77 | 273 |
| 31 | 83 | 272 |
| 32 | 40 | 279 |

- manifests 條數：32（與 course.json sessionId "01".."32" 一一對應）
- annotations 總數：1300（全部 status=source_match；無 partial_match；UNVERIFIED 僅出現在
  manifest 級 audioVerification 與 notes，符合 02_plan.md §4 封閉集合規則）
- 第 1、2 講經逐字比對無任何根本頌片段精確命中講記句子，依規則保留空 annotations 並
  以 UNVERIFIED 標記，未硬配、未捏造。

## 驗證

- node --test tests/unit/shiliangVerseCoverage.test.js → 4 pass / 0 fail（exit 0），
  完整輸出：reviews/evidence/shiliang_all_quality/manifest_green.log
- 額外重放驗證：全部 1300 筆 source_match 的 quoteText 均為其同講 session sentence
  text 的精確子字串（腳本斷言全數通過）；sentenceId 全部存在於本講 session JSON。
