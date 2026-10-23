# 測試模式整理與驗收

日期：2026-10-23。基準：`df5e27ff5cb2f78e093c24364bab88f86f398d82`。
工作分支：`codex/test-patterns-review`。低 Token 流程文件維持原工作區 Draft。

## 範圍與結果

| 需求 | 測試／證據 | 層級 |
| --- | --- | --- |
| 底本視窗、名相與 prompt 長度 | `tests/python/test_pipeline_behavior.py` | 離線行為 |
| 超過 28 字不硬切、靜音分句 | 同上，51 字輸入與靜音正例 | 離線行為 |
| LLM 批次失敗二分、保序、最後標記待審 | 同上，mock 回應，不連模型 | 離線行為 |
| 逐字軌重複、自我修正、既有講者與兩位小數時間 | 同上 | 離線行為 |
| 已發布 36A/36B 防覆寫 | 同上，暫存複本 CLI；含明列路徑、跨講次、相對路徑與符號連結 | 離線整合 |
| 繁體與禁同音字規則 | `tests/unit/transcriptQualityPolicy.test.js` | 規則單元 |
| 全講次文字與 Golden Standard | 原有兩個 consumer，沿用各自範圍 | 語料稽核 |
| prototype 原始證據保全 | `tests/unit/studyGroupPrototype.test.js`，47 個同名案例 | 證據整合 |
| 摘要來源與 digest | `npm run summaries:audit` | 語料稽核 |
| 前端互動 | `npm run test:v2` | UI |
| 音訊真實性與終稿改善 | 人工回聽／指定 GPU 評測 | 本次不執行 |

prototype 13–39 共通斷言資料化，特殊案例仍獨立，既有句數、比例、ID、時間與逐句文字檢查保留。移除 npm test 已去重的冗餘檔案參數；不宣稱因此減少執行次數。原 T2–T5 原始碼名稱檢查改為 Python 行為契約；T1 詞庫內容契約保留。

測試實際重現兩項錯誤後才修正：明列 `--out` 可繞過已發布檔案保護；prompt 句末標點使字元數超過上限。只修改這兩項行為，未套用 PR #271 或變更任何課程成果。

## 品質規則範圍

共用模組只抽取原有 Traditional Purity 與 Golden Standard 規則，保留兩個 profile。Traditional Purity 包含「后／传／罗／萨」，且 consumer 排除 `rawText`；Golden profile 字集較窄，consumer 原本包含 `rawText`。不得取聯集或把兩者宣稱為完整漢字辨識器。

ASR blacklist、27B opt-in quality 與各課程專用規則維持原範圍。27B 中「政治」「正義」等普通詞及自證立場正則具有語境風險，需先補語境正反例才考慮升格共用；本次不擴大阻擋範圍。時間分布變化僅能抓可疑合成時間，不能證明已完成聲學對齊。

## 驗證方式

```sh
python3 -m venv /tmp/transcriptions-pattern-tests
/tmp/transcriptions-pattern-tests/bin/python -m pip install -r tests/python/requirements.txt
PIPELINE_PYTHON=/tmp/transcriptions-pattern-tests/bin/python npm test
npm run test:v2
npm run summaries:audit
node --test tests/acceptance/goldenStandard.test.js
npm run build:v2
```

CI 建立獨立 Python venv；缺少依賴會失敗，不靜默略過。測試不呼叫 GX10 或外部模型。Node 完整測試需要本機測試伺服器監聽權限。新 Python 測試透過一個 Node wrapper 執行，Node 數量不能當成 Python 案例數量。

基準 Node：654 通過、4 略過、0 失敗，約 5.22 秒；首次完整修改版：657 通過、4 略過、0 失敗，約 6.33 秒。這是單次本機觀測，未達成或宣稱執行時間改善。4 項略過為既有 27B opt-in 品管、browser smoke、兩項四念住 release gate。原有略過不代表已驗收。

詳細 RED、GREEN、重複入口實驗與故障注入證據位於 `reviews/evidence/test-patterns/`。故障注入只操作暫存複本；不能由測試通過推論所有實詞皆與音訊一致。

## 後續分開處理

1. 待閱校發布狀態、UI／下載標示與閱讀校正追溯，另立功能任務。
2. PR #271 的 20 案例另審依賴及兩條詞庫修正，不連帶納入音訊實驗。
3. 本次不更換 npm test 相容入口、不將 GPU 評測加入一般 CI。
4. 已發布內容的固定 hash／句數繼續保留。下一次移除測試前，先證明其需求已由行為測試覆蓋。
