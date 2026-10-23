# 釋量論第二品第 30、31 講原稿重整

## 來源與發布界線

- 正式來源：`courses/釋量論第二品/sessions/session_30.json`、`session_31.json`。
- 文字參考：同課程 `source_text/session_30_official_raw.txt`、`session_31_official_raw.txt`，為官方整編稿，不是原始 ASR。
- 本次發布獨立的 `publications/lecture_30_verbatim_rebuild.html`、`lecture_31_verbatim_rebuild.html` 與 JSON；正式閱讀器新增明確的試閱入口，不替換既有逐字稿。
- 全文未人工逐句聽核；時間沿用原資料，不宣稱重新對齊。個別文字差異待核數為零，不代表所有內容已聽核。

## 完整性與校字

| 講次 | 來源句數 | 主題區塊（含前行） | 文字改動 | 字元數 |
|---|---:|---:|---|---|
| 30 | 546 | 10 | 無；修復連讀與重複標題 | 13,522 → 13,522 |
| 31 | 545 | 14 | 4 個有底本依據的右引號 | 15,316 → 15,320 |

每個來源句的完整原物件保存在 `raw`，ID、順序、時間及其餘欄位保留；閱讀正文僅由這些句子連接，不另行生成講記。空標題繼承前一主題，連續相同標題只顯示一次。底本已有的開頭禮佛與開經偈獨立成前行，不補未錄內容。摘要沿用正式稿，標為 AI 導讀，並重新檢查每項引文與原句匹配。

全篇比對：只去除官方文件前置書目、頁碼、與已知章節標題，以及兩邊的排版空白；其餘文字必須逐字完全相等。此比對可證明與整編文字底本等值，不能證明錄音忠實度。

## 本地模型與人工判斷

私人 GX10 `100.113.144.100` 的模型實測為 `Qwen3.8-27B`、llamacpp、Q4_K Medium，並非假定舊 vLLM runtime 仍在。只透過 SSH loopback tunnel 呼叫，不使用雲端 fallback。

- 30：27,220 input + 1,709 output = 28,929 tokens。
- 31：30,222 input + 944 output = 31,166 tokens。
- 共 2 次呼叫、60,095 本地模型 tokens；Codex 本回合用量沒有可靠獨立計量，記為 unknown，不宣稱整體節省比例。
- 模型回覆是候選，未自動採用。30 的「漏引號」建議實際引號在相鄰句，否決重複補入；原文相同的確認項不算改字。31 的 5 項跨句補全文建議會重複後文，全部拒絕。用詞與官方相同、無獨立證據的疑慮，不藉此改寫法義。
- 真正採用的 4 個右引號來自 Codex 全篇差異檢查，詳見 digest-bound `plan-31.json`；前後文、依據、來源摘要均可重現。
- 原始模型 HTTP 回覆與完整提示輸出留在本地未追蹤檔，不混入發布 commit。

## 重現與交接

Issue #286；分支 `codex/shiliang-30-31-verbatim-rebuild`；隔離 worktree `session37a-efficient-pilot/Transcriptions`。不碰共享 dirty checkout。

```sh
node scripts/shiliang_verbatim_rebuild.mjs
node --test tests/unit/shiliangRebuild.test.js
npm test
npm run test:v2
npm run build:v2
```

先做來源保留契約 RED，再完成生成器達 GREEN。重建會核對正式來源與官方稿 SHA256，或遇任何未知校字 ID、前文不符、全篇不等值時直接停止。回滾方式為 revert 本次功能 commit；正式逐字稿未改，無內容遷移。
