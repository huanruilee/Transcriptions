# 37A 從課堂原話重做

2026-10-23（Asia/Taipei）。使用者指出舊試閱第12段與原話不符，明確要求整講從原話校字重做。本次不再採用舊講記作為生成來源。

## 實作契約與結果

- 唯一正文來源：原 `session_37A.json` 的406筆 `verbatimSentences`；全30段、ID、順序、時間、講者及完整原物件保留。
- 明確錯字透過逐項、指定ID與預期匹配次數的校字清單套用；每筆記錄before、after、依據，底本只核字，不補入整段未讀出的原文。原始ASR永遠獨立保存。
- 閱讀版嚴格等於該段校字後原話逐句串接，沒有另一個自由改寫講記欄位；加法、遺忘、瓶口瓶腹、蒙古漢語、天授等例子保留，口頭語、重複及自我修正不刪。
- 本輪146句有詞字或標點紀錄（非146句全是詞字修改），48句明示待核；其餘也不冒稱人工聽核。核心宗派、否定或難解語音不憑教義猜改。
- 人工音訊覆核、獨立內容接受與正式promotion均未完成，維持候選。正式session、舊講記及原話檔不覆寫。
- 舊試閱頁加醒目撤回通知並導向原話重整版，舊supported判決不再當放行依據。

## 產物與驗證

- `reviews/evidence/session37a-verbatim-rebuild/plan.json`：校字、待核與6項有來源ID的導讀。導讀是AI摘要，與原話清楚分開。
- `scripts/session37a_verbatim_rebuild.mjs`：保守校字、對照、JSON ledger、Markdown及HTML產生器。
- `courses/入中論善顯密意疏/publications/lecture_37A_verbatim_rebuild.{json,md,html}`：候選輸出。
- `tests/unit/session37aVerbatimRebuild.test.js`：先RED（缺少模組），再GREEN；驗原物件完整、閱讀版逐字來自校字後原話、待核不冒充聽核、p12不得混入四宗舊講記、錯配fail closed、HTML escaping。

獨立review在3d6709d提出P2：p4-v5至v7是找詞試說，不應統一成枝葉末節。新增RED測試重現後，撤回三處詞字替換、保留原辨識並加待核，45增為48；原始三句、重複與自我修正均保留。補標點仍有紀錄。固定詞只作疑點建議，不當已聽核正字。

```bash
node --test tests/unit/session37aVerbatimRebuild.test.js tests/unit/session37aPreview.test.js
node scripts/session37a_verbatim_rebuild.mjs
node scripts/render_session37a_preview.mjs
```

原始字元10685、校字及標點後10664，含標點按Unicode字元計數；字數變動來自有紀錄的逐項校字與空格標點，不代表刪段。所有406筆原話可完整還原。發布只針對候選與舊頁撤回，回復用新revert PR，不能覆寫歷史或force-push。
