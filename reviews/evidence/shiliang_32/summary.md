# Shiliang 32 — 全 32 講科判編號 + 段落邊界修復總結

## 結果
**GREEN** ✅

| 項目 | 數值 |
|---|---|
| 處理會期（sessions） | 32 / 32 |
| 科判編號 heading 變更 | 1250 |
| 段落邊界合併（merges） | 59 |
| toc 子項缺漏 | 1（session_01：四、學習佛法應該保持懷疑） |
| 修改的 session JSON 檔 | 32 |
| 新增／修改測試斷言 | 11（含 5 個既有 session_27 fixture + 6 個新加全 32 講斷言） |
| 修改的 PIPELINE.md 段落 | 段落邊界完整性規則 + 新增「科判編號一致性規則」 |

## 變更摘要

### A. 科判編號
- 全部 32 講 `paragraphs[].heading` 從「`【分類】標題`」改寫為「`【原分類】<序位>、標題`」格式，序位來自 `toc.json` 對應 `section` 的 `children[]` 位置。
- 同一講重複出現的同一段標題，沿用第一次指派的序位，不重新計算。
- `<原分類>` 完全沿用既有 heading 中 `【…】` 標籤（`法義深探`、`名相辨析`、`破邪顯正`、`正理修持`、`教誡結語`、`科判導讀`、`根本頌釋`、`重點總結` 等），未改寫。
- 標題文字一律沿用現存 heading 文字，**未做 Unicode 異體統一**（session_19 的 `今` vs `㉃今`、`下` vs `㆘` 等差異保留）。
- **缺漏紀錄**：session_01 的 toc sec-1-4「四、學習佛法應該保持懷疑」找不到任何 matching paragraph；evidence 已留下 `missingTocOrdinals=["四"]`，未憑空補序位。

### B. 段落邊界
- 修復 59 處明確 mid-word / mid-quote 錯斷：
  - 條件：上一段（必須有 heading）末句長度 ≤ 14 字元、無句末標點（`[。！？…」』]`）、不以子句收束常見字元（`的是了不在也都就還又但而之`）結尾；下一段（必須無 heading）首字不在常見新句起首集合（`所這那一二三四五六七八九十某何為並另再接下不此外然雖當如果即就或乃豈寧`）內。
  - 修復手段：把 `paragraphs[i+1].sentences` 原順序併入 `paragraphs[i].sentences`，更新 `paragraphs[i].end` 為合併前最末句 `end`；刪除 `paragraphs[i+1]`。
  - 禁止事項：未改任何 `sentence.id`、`text`、`start`、`end`、`rawText`；未合併兩句為一句；未新增空白 placeholder；未改後續 paragraph 的 `id`、內容或順序。
- 涵蓋 sentence id 跨多講（如 `sent-256`+`sent-257`、`sent-278`+`sent-279`、`sent-400`+`sent-401`、`sent-531`+`sent-532` 等），含已知 fixture `session_27 sent-400 / sent-401` 的 `他是在無` + `漏蘊體的聚合體及續流上假立而有。` 合併。

### C. 測試
- `tests/unit/paragraphBoundaryIntegrity.test.js` 從 5 個斷言擴充為 11 個斷言：
  1. session_27 sent-400 / sent-401 必須屬於同一個 paragraph（既有）
  2. 拼接後必須包含「他是在無漏蘊體的聚合體及續流上假立而有」（既有）
  3. sent-400 / sent-401 的禁改欄位必須非空且語意合理（既有）
  4. session_27 paragraph 內的 sentence 時間戳必須單調遞增（既有）
  5. session_27 句子總數應等於 paragraph 內 sentence 加總（既有）
  6. **全 32 講 paragraph.heading 必須符合【分類】<ordinal>、標題 格式**（新）
  7. **每講重複出現的相同 paragraph.title 必須使用同一 ordinal**（新）
  8. **全 32 講 paragraph 內的 sentence 時間戳必須單調遞增**（新）
  9. **全 32 講 sentence id 不可重複**（新）
  10. **全 32 講 sentence 禁改欄位健全性**（新）
  11. **全 32 講 paragraph 自己的 end 必須等於最末句 end（合併後無殘留）**（新）

- 執行結果：`node --test tests/unit/paragraphBoundaryIntegrity.test.js` → **11/11 pass**（exit code 0）

### D. PIPELINE.md
- 既有「段落邊界完整性規則」第 2 點補上「mid-word / mid-quote 錯斷的嚴格條件」與具體例子。
- 既有第 4 點改為「覆蓋全部 32 講」並列出全 32 講的具體斷言項。
- 新增「🏷️ 科判編號（Heading Ordinal）一致性規則」章節，明列權威來源、格式、重複段處理、缺漏處理、可重現驗收。

## 計數對照

| 會期 | toc 子項 | 編號 heading 變更 | 合併 | 缺漏序位 |
|---:|---:|---:|---:|---|
| session_01 | 5 | 23 | 1 | 四 |
| session_02 | 6 | 29 | 5 | – |
| session_03 | 7 | 29 | 3 | – |
| session_04 | 6 | 40 | 4 | – |
| session_05 | 10 | 36 | 4 | – |
| session_06 | 8 | 40 | 2 | – |
| session_07 | 4 | 31 | 2 | – |
| session_08 | 7 | 35 | 3 | – |
| session_09 | 6 | 47 | 2 | – |
| session_10 | 9 | 39 | 2 | – |
| session_11 | 10 | 44 | 2 | – |
| session_12 | 7 | 40 | 1 | – |
| session_13 | 9 | 48 | 1 | – |
| session_14 | 7 | 37 | 0 | – |
| session_15 | 10 | 41 | 3 | – |
| session_16 | 7 | 40 | 1 | – |
| session_17 | 9 | 37 | 0 | – |
| session_18 | 12 | 43 | 2 | – |
| session_19 | 10 | 41 | 2 | – |
| session_20 | 8 | 38 | 3 | – |
| session_21 | 8 | 36 | 2 | – |
| session_22 | 7 | 32 | 0 | – |
| session_23 | 13 | 48 | 1 | – |
| session_24 | 13 | 49 | 4 | – |
| session_25 | 8 | 41 | 3 | – |
| session_26 | 8 | 41 | 1 | – |
| session_27 | 9 | 39 | 2 | – |
| session_28 | 12 | 49 | 0 | – |
| session_29 | 10 | 37 | 1 | – |
| session_30 | 9 | 40 | 1 | – |
| session_31 | 13 | 49 | 0 | – |
| session_32 | 7 | 31 | 1 | – |
| **合計** | – | **1250** | **59** | **1** |

每會期詳細 paragraph/sentence 計數、heading 變更清單、merge 詳情、sha256 before/after、missing toc ordinal 見 `upgrade_evidence.json`。

## 修改檔案
1. `courses/釋量論第二品/sessions/session_NN.json` × 32 — heading 編號與段落邊界合併
2. `PIPELINE.md` — 段落邊界規則 + 新增科判編號規則
3. `tests/unit/paragraphBoundaryIntegrity.test.js` — 擴充為 11 個全 32 講斷言
4. `scripts/upgrade_shiliang_32.mjs` — 全自動升級腳本（科判編號 + 段落邊界）
5. `reviews/evidence/shiliang_32/upgrade_evidence.json` — 結構化 32 講對照
6. `reviews/evidence/shiliang_32/numbering.json` — 1250 個編號結果
7. `reviews/evidence/shiliang_32/boundary_decisions.json` — 59 個合併紀錄
8. `reviews/evidence/shiliang_32/summary.md` — 本檔
9. `reviews/evidence/shiliang_32/commands.log` — 全部執行指令與 exit code

## 邊界與守則
- 未動 raw text、未動 timestamps、未動 sentence 順序
- 未新增任何 sentence、未合併任何 sentence 文字
- 未改寫任何講法文字（含 Unicode 異體）
- 未 commit / push / 部署 / 重啟服務
- 未改動 source_text、audio、其他 session、其他課程
- 未把 toc 沒有的標題強加序位（session_01 四、學習佛法應該保持懷疑 列為缺漏，待底本確認後再修）
