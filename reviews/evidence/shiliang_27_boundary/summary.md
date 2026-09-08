# Shiliang Session 27 Paragraph Boundary Repair — Summary

## 結果
**GREEN** ✅

sent-400 與 sent-401 已被合併到同一個 paragraph（`p_59`）。後續 paragraph id 與 sentence 計數完全不變；所有 sentence 欄位（`id` / `text` / `start` / `end` / `rawText`）與 `HEAD` 完全一致（0 mismatches）。

## 變更摘要
- `p_60` 整段被併入 `p_59`（sentences 原順序：sent-401, sent-402, sent-403 接到 p_59 後面）
- `p_59.end` 由 `4136.7` 更新為 `4164.3`（原 p_60 的 end）
- `p_60` 自 `paragraphs` 陣列中移除
- 後續所有 paragraph 與 sentence 的 `id`、內容、順序皆未變動

## 計數對照
| 指標 | baseline | after |
|---|---|---|
| paragraphs | 73 | 72 |
| sentences | 466 | 466 |
| sent-400 屬 paragraph | p_59 | p_59 |
| sent-401 屬 paragraph | p_60 | p_59 |
| p_59.end | 4136.7 | 4164.3 |
| file sha256 (canonical JSON) | `fdc322469ebec703…` | `4c070d48d501f4ca…` |
| file sha256 (磁碟位元) | n/a | `77b0e4f2abe9691e…` |

## 拼接驗證
- sent-400.text = `他是在無`
- sent-401.text = `漏蘊體的聚合體及續流上假立而有。`
- 拼接 = `他是在無漏蘊體的聚合體及續流上假立而有。` ✅
- 包含目標子字串 `他是在無漏蘊體的聚合體及續流上假立而有` ✅

## 修復後 frozen 欄位差異
`frozen_field_mismatches: []`（0 筆）

代表 466 句中每一句的 `id` / `text` / `start` / `end` / `rawText` 都與 `HEAD` 完全相等。

## 修改檔案
1. `courses/釋量論第二品/sessions/session_27.json` — 段落邊界合併（p_60 → p_59）
2. `PIPELINE.md` — 新增「段落邊界（Paragraph Boundary）完整性規則」段落
3. `tests/unit/paragraphBoundaryIntegrity.test.js` — 新增 5 個 node:test 斷言
4. `reviews/evidence/shiliang_27_boundary/summary.md` — 本檔
5. `reviews/evidence/shiliang_27_boundary/before_after.json` — 結構化對照
6. `reviews/evidence/shiliang_27_boundary/commands.log` — 全部執行指令與 exit code

## 測試
`node --test tests/unit/paragraphBoundaryIntegrity.test.js` → **5/5 pass**（exit code 0）

涵蓋：
1. sent-400 / sent-401 必須落在同一個 paragraph
2. 拼接後必須包含「他是在無漏蘊體的聚合體及續流上假立而有」
3. sent-400 / sent-401 禁改欄位健全性
4. session_27 全段 paragraph 內 sentence 時間戳單調遞增
5. session_27 句子總數 = 466（與 HEAD 一致；無孤兒 sentence）

## 邊界與守則
- 未動 raw text、未動 timestamps
- 未新增任何 sentence、未合併任何 sentence 文字
- 未改寫任何講法文字
- 未 commit / push / 部署 / 重啟服務
- 未改動 source_text、audio、其他 session
- 未動其他課程或其他 session
