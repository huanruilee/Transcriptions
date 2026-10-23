# 38A 忠實原話待閱校版

Task ID：SESSION38A-FAITHFUL-01。依 `TRANSCRIPTION_WORKFLOW.md` v1.0 執行，範圍只限 38A 與必要的閱讀頁支援。

來源 commit：`01d5171d4017593b556af2f1d5df2a762020f66f`。工作分支：`codex/session38a-faithful-reading`。來源檔、SHA-256、逐項計畫及修改帳本皆在 `reviews/evidence/session38a-faithful/`。來源是既有機器校對稿，不是原始 ASR。

## 本次交付

- 完整保留 329 段、657 句的順序、時間與原有欄位；34 句有局部修改。37 筆修改提案展開為 49 筆帳本，另含一筆移除無據迴向標題的修正；沒有重寫整段或刪掉口語重複。
- 241 句保留待核原因，包括宗派分歧、複合誤辨及原有疑義。「中觀自續派」與新 ASR 的「應成派」有分歧，保留來源而不憑教義改稿。
- `sessions/`、`verbatim/`、獨立 HTML、Markdown、TXT 都標明待閱校。閱讀頁下載也顯示提醒。舊模型插入的兩處 REVIEW 註記移出正文，原文與疑點仍在來源及帳本。
- 五個當講科判以來源句時間及底本 p.119–120 建立局部投影；排除後續僅在綱目中提到的章節，不改寫全書 `toc.json`。時間尚未人工聽核。
- 六點既有 AI 導讀保留原生成者，由 GX10 Qwen 實際重新審查引用。最終局部撤回及標點修整均記錄重新綁定原因。

## 原音與模型證據

官方完整 MP3 未提交；完整解碼時長 4491.7028125 秒，檔頭只有 4470.648 秒。檔案 URL、hash、解碼方法與 HTTP 記錄見 `audio-source.json`。只提交原音 4460–4491.7028125 秒的末段節錄（254257 bytes），供末句覆核；來源範圍與 hash 見 `publications/audio_38A_review/manifest.json`。

GX10 8010 實跑 Whisper large-v3-turbo，2608 個片段；8001 實際 runtime 是 llama.cpp Q4_K Medium，模型別名 Qwen3.8-27B，不能稱為 vLLM。模型審查使用 13275 tokens；輸入、完整回應、裁定與 runtime 記錄均留存。沒有外傳至新的第三方 provider。

`audio-advisory.json` 為 657 句提供時間重疊的 ASR 輔助索引；重疊不代表精確對齊。末段有一筆 ASR 超過完整解碼尾端約 0.187 秒，原始回應保留並標記異常，不截掉後冒稱正確。沒有人工完整聽校，也沒有獨立人工黃金稿，因此不計算或宣稱 CER 改善。

## 重建與驗證

```sh
node scripts/audit_session38a_audio.mjs
node scripts/publish_session38a_reading.mjs
npm run test:v2
npm test
npm run summaries:audit
node --test tests/acceptance/goldenStandard.test.js
npm run build:v2
```

產生器檢查來源 digest、原文字面及出現次數、原文位置不重疊，並阻擋已發表內容的未知分歧。重建用已審查計畫；不重新呼叫模型。測試包含保真、同句多處修改、待核與局部校字並存、逐字軌、下載格式、短音檔完整解碼與科判不跨講洩漏。`ffmpeg`／`ffprobe` 是音訊測試依賴，CI 已安裝。

自動測試通過不等於人工聽核。尚待使用者閱讀校正的重點：241 句疑義、宗派詞分歧、口語漏辨與新科判時間；原有其他生成標題未逐一核定。低 Token 流程與 PR #271／#281 繼續維持 Draft，未併入本次預設流程。
