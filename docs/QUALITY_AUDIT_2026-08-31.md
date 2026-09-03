# 《入中論善顯密意疏》逐字稿品質回歸審計

審計日期：2026-08-31（Asia/Taipei）
範圍：`course.json` 登錄的 199 堂；主檔為 `courses/入中論善顯密意疏/sessions/session_<id>.json`。

## 結論

以 29A Golden Benchmark 的七項靜態門檻逐堂掃描：**198 堂通過，1 堂待升級**。

| 項目 | 結果 |
|---|---:|
| 課程登錄講次 | 199 |
| 可解析 canonical session JSON | 199 |
| 29A Golden（七項全通過） | 198 |
| Legacy Draft（至少一項未通過） | 1：`03A` |
| 官方 Flyday 音檔映射 | 199/199 |
| 底本頁檔 | 285/285 |

七項 pattern 的通過數：Pattern 1 元數據 199/199；Pattern 2 官方串流 199/199；Pattern 3 語意小標題 198/199；Pattern 4 法學名相禁用錯音 199/199；Pattern 5 時間戳單調性 199/199；Pattern 6 繁體字 199/199；Pattern 7 聲學自然變異 199/199。

## 完整審計矩陣

矩陣以 `course.json` 的 199 個 canonical ID 為母集合；每一列均檢查七項 pattern 及其底本頁碼存在性。除下列一列外，其餘 **198 列均為 `G G G G G G G`**：

| 講次 | 善顯底本頁 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | 分類 |
|---|---|---|---|---|---|---|---|---|---|
| `03A` | p.66 | G | G | **L** | G | G | G | G | Legacy Draft |

因此，除 `03A` 外的完整 ID 母集合即為 29A Golden：`course.json.sessions` 中所有 `sessionId`（共 199）扣除 `03A`。掃描同時發現 sessions 目錄有兩個未列入 `course.json` 的額外檔案：`session_18A_anchored.json`、`session_27B.json`；它們不計入 canonical 199 堂，應另行決定是否封存或註冊。

## 典型缺陷診斷

| 優先級 | 講次 | 頁碼 | 主要缺陷 | 證據／錯音診斷 |
|---|---|---|---|---|
| P0 | `03A` | p.66 | Pattern 3 不足 | 137 個段落、600 句，但只有 1 個 `【本講開示】...` 標題；應依 p.66 的「辛二、可說深義法器」及後續空性法器問答等論義轉折補足至少 6 個 `【主題】說明` 標題。 |

`03A` 並未命中目前規範列出的禁用錯音，且其元數據、Flyday URL、時間戳、繁體字和頁碼掛載均通過；這是結構升級缺口，不是已證實的音義錯誤。底本 p.66 的真值內容包含「可說深義法器」、空性聞法者之機、損減／增益二邊及「真性器」等關鍵科判與術語，應作為補標題及後續人工對讀的基準。

## 三堂內容抽檢與 regression 充分性

抽檢 `01`、`29A`、`03A` 的開頭／中段／結尾句、標題、時間軸、底本關鍵詞與錯音掃描，結果如下：

| 講次 | 靜態 regression 結果 | 內容抽檢觀察 |
|---|---|---|
| `01` | 通過；10 個標題、346 句、時間戳無回溯 | 已知卷首詞「普為世間不請友」可在底本 p.6 找到；但目前只驗詞／頁存在，不驗整段偈頌逐句吻合。 |
| `29A` | 通過；10 個標題、586 句、時間戳無回溯 | 「飛蚊症」等已知修正詞存在；但現有門檻沒有抽取 p.97--p.98 引文並逐句對底本的測試。 |
| `03A` | Legacy；僅 1 個標題、600 句、時間戳無回溯 | 第 2 段仍有「可說生意法器」，p.66 底本為「可說深義法器」；現行禁用錯音字典與 Golden regression 均漏報。 |

此外，`python3 scripts/quality_scorer.py --session 03A` 會因 `stem.endswith(args.session)` 同時掃到 `session_103A.json`，因此單講結果不是精確結果。

**判定：目前 regression 不足以單獨產出「內容品質已通過」的證據。** 它足以作為 schema、URL、標題數量／格式、時間戳形式、繁體字與已知錯音的第一層 gate；但不足以證明音訊聲學吻合、底本引文逐句正確、科判標題語義正確，且已被 `03A` 的漏報實例直接證明。

## 測試與工具可重現性

使用者指定的 `scripts/audit_session_regression.js` 在本工作樹不存在，`package.json` 亦沒有 `audit:session` script；本次以等價唯讀掃描重建矩陣。單獨執行 `goldenStandard.test.js` 結果為 **8 pass / 0 fail**。

完整 `npm test` 未能形成可接受的全綠證據：實際結果為 **155 pass / 0 fail / 7 cancelled / 2 skipped**；被取消項目因瀏覽器／非同步事件等待逾時，browser smoke 並明示 Chrome `127.0.0.1:9222` 不可達。故不應引用 `TESTING.md` 中的「149 tests 100% 通過」作為本次現況結論。

## 升級建議

1. **P0：先升級 `03A`（p.66）**。保留現有 Whisper 時間戳與文字，僅依底本科判重跑結構分析；完成至少 6 個標題後再重跑 Golden gate。
2. **P1：清理孤兒／衍生檔**。確認 `session_18A_anchored.json` 與 `session_27B.json` 的用途；若為衍生證據，移至明確的 QA 目錄或在 manifest 標記，避免被未來全量工具誤算。
3. **P1：修復審計入口**。補回 `scripts/audit_session_regression.js` 與 `npm run audit:session -- <sessionId>`，把本報告的 canonical 母集合、七項 pattern、頁碼映射和 orphan 檢查固定化。
4. **P2：按底本科判批次回歸**。先處理 p.66 的極喜地／深義法器段落，再按 `course.json.pageRange` 的連續頁碼批次抽查；每批同時保留 JSON SHA、底本頁碼、音檔 URL 和測試輸出。
5. **P2：補做聲學與語義真值抽驗**。本次 Pattern 7 是時間分布的靜態反合成檢查，Pattern 7 及頁碼存在性不能等同於 15 段音訊盲測或逐句文義 100% 對讀；恢復 Chrome／音訊環境後，仍需執行 `verify_audio_sync.py` 與人工聽讀抽樣。
