# 交接事項：轉寫流水線升級（以 36A/36B 為黃金樣本）

> **歷史升級任務，非現行執行入口。** 先讀 [最新版逐字稿流程](../TRANSCRIPTION_WORKFLOW.md)；T1–T5 已有基礎實作，實驗與 PR 須另查狀態。原固定 CER 下降 40% 目標已由使用者改為 ASR＋LLM 終稿穩定改善，不追溯改寫歷史實驗結果。

> 建立日期：2026-10-21　狀態：**待實作**　負責：下一位 Agent

## 背景
36A/36B 的現行成果（精煉講記 + 逐字忠實課堂原話 + 深層科判）是靠大量人工與 AI 事後對照底本救回來的。直接用現行腳本從原始音檔重跑，只能達到約 60–70% 品質。目標：升級流水線，使任何一講從原始音檔重跑即可接近 36A 現行水準。

黃金樣本：
- `courses/入中論善顯密意疏/verbatim/verbatim_36A.json`、`verbatim_36B.json`（逐字忠實原話）
- `courses/入中論善顯密意疏/publications/lecture_36A_study_guide.md`、`lecture_36B_study_guide.md`（精煉講記）
- `courses/入中論善顯密意疏/toc.json`（36A/36B 深層科判與時間戳）

## 五大根因
| # | 位置 | 問題 |
|---|------|------|
| 1 | `scripts/run_whisper_gpu.py`、`batch_convert_all.py` step1 | 使用 `large-v3-turbo` + int8（解碼器僅 4 層）；`initial_prompt` 固定通用詞，未注入當講底本詞彙；VAD 0.6s 硬切 + `condition_on_previous_text=False` 造成碎句與上下文斷裂 |
| 2 | `batch_convert_all.py::get_session_source_text`、`llm_deep_calibrate_session.py::extract_source_pages` | 底本視窗過窄（只載 pageRange 或 ±2 頁），漏掉格西回顧前文（如 36A 開頭翻回 p.104） |
| 3 | `batch_convert_all.py::step2_pre_polish` | 累積 ≥28 字即強制斷句加句號，切壞語意 |
| 4 | `batch_convert_all.py::step3_llm_proofread` | 批次句數不符時**靜默退回未校對原文**；max_tokens 2048 不足 |
| 5 | 全流程 | 無「讀誦原典 / 口語講解 / 學員提問」區分；單軌輸出，未分逐字原話與精煉講記 |

## 實作任務（依優先序）

### T1 錯字詞庫補強（最快見效）
將 36A/36B 已驗證的同音錯字寫入 `courses/入中論善顯密意疏/learned_corrections.json`（遵循既有 schema：`corrected`/`category`/`reasoning`/`safe_regex`）：
`一百年事業→一百零四頁`、`臥行→苦行`、`另一方面的中庸→定方面的中庸`、`會方面的中庸→慧方面的中庸`、`蓄留異弊→續流亦必`、`無少億→無少益`、`樹說→數說`、`色有四面→設有是念`、`應非理的種別生→應非離種別生`、`雙鋪耳邊→雙破二邊`、`看人觀察→堪忍觀察`、`七款/棄狂/七狂→欺誑`、`必知如必喜→棄之如敝屣`、`總道是/中道是沒有這樣→宗大師沒有這樣`、`志向有→自相有`、`聖意/勝儀→勝義`、`明言→名言`、`限量→現量`、`秩序→自續`。
注意 `safe_regex` 要避免誤傷（例如「明言」只在佛學語境替換）。

### T2 ASR 動態 Prompt 與參數
- 新增 `scripts/lib/session_prompt.py`：依 pageRange 擴大視窗（往前 10 頁、往後 3 頁）讀 `source_text/page_XXX.txt`，抽取書名號/引號內詞、科判標題、高頻四字格，組成 ≤ 220 tokens 的當講 `initial_prompt`。
- `run_whisper_gpu.py` 與 `batch_convert_all.py` step1 改用此 prompt；模型改為可設定（`WHISPER_MODEL`，預設建議 `large-v3` 非 turbo，保留 turbo 作快速模式）；開啟 `word_timestamps=True`；VAD `min_silence_duration_ms` 調為可設定並以 36A 實測比較 600/900/1200。
- 須維持 `tests/` 中 Whisper Parameter Contract 測試通過（必要時同步更新合約）。

### T3 斷句改造
`step2_pre_polish`：移除 28 字硬切，改以「靜音 gap ≥ 1.1s」或「句末語氣詞/問句詞」或「≥ 60 字且遇逗號類停頓」斷句；詞級時間戳可用時以詞邊界切。

### T4 LLM 校對防靜默退回
- 句數不符時：先將批次對半重試，再退到單句重試；仍失敗才保留原文並標記 `reviewNeeded: true, uncertainty: "LLM 句數不符，未校對"`。
- `max_tokens` 依輸入長度動態計算（約輸入字數 × 2.5，上限 8000）。
- 底本視窗與 T2 共用。

### T5 雙軌輸出
新增 `scripts/build_verbatim_track.py`：輸入校對後原話句，產出 `verbatim/verbatim_<SID>.json`（schema 同 36A：`{sessionId, paragraphs: {p_k: [{id,start,end,speaker,text}]}}`）。規則（**不可違反**）：
- 不刪減、不改寫任何實詞、重複與自我修正；只改同音錯字、去除純語氣詞（嗯/啊/呃/哎呦）、補標點與原典引號、標註 `格西`/`學員`。
- 段落歸屬依精煉講記段落時間範圍對齊。
- 之後以 `scripts/sync_study_guide_to_session.py <SID>` 與 `scripts/render_study_guide_html.py` 同步。

### T6 原典讀誦對齊（可選，加分）
以拼音/字元模糊比對（Levenshtein）找出格西讀誦底本的句段，將對應疏文行附入 LLM 校對上下文，並在原話中加 `「…」`。

### T7 深層科判
從底本抽取天干地支科判（巳/午/未/申…），寫回 `toc.json` 時保留完整祖先鏈；與 `src/js/toc.js`、`TOCAccordion.vue` 現行遞迴渲染相容。

## 驗收標準
1. 以 36A 原始音檔跑新流水線，產出的逐字原話與 `verbatim_36A.json` 比較：字元錯誤率（CER，以黃金樣本為參考）較現行流水線**下降 ≥ 40%**；附比較報告於 PR。
2. 零簡體字、零 `FORBIDDEN_HOMOPHONES`（`tests/acceptance/goldenStandard.test.js`）。
3. 全測試通過：`npm run test:v2`、`npm test`、`npm run summaries:audit`、`node --test tests/acceptance/goldenStandard.test.js`、`npm run build:v2`。
4. **不得覆寫** 36A/36B 已發佈的黃金樣本檔；實驗輸出放 `tmp/pipeline_v2/36A/`。

## 操作注意
- GPU/LLM 在 GX10（Whisper 8010、vLLM 8001、Smart Router 4001）；Mac 端可經 SSH tunnel（14001/18001）。若無法連線，先完成 T1/T3/T4/T5 的程式與單元測試，ASR 實跑留待有 GPU 時。
- `gh pr create` 一律加 `--base main --head <branch> --body-file <file>`，避免互動式選單卡住；本 repo 不允許 squash，合併用 `--merge`。
- 全部內容須為繁體中文（台灣正體）。
