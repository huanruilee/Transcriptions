# 36A 雙軌品質試點與交接

日期：2026-10-22（Asia/Taipei）。目標：完成整體改進計劃，以 36A 供使用者在線上驗收。此文件為工作紀錄，不是完成聲明。

## 範圍與來源

- 分支 `codex/session36a-quality-pilot`，隔離 worktree `/Users/henry/.codex/worktrees/session36a-quality-pilot/Transcriptions`。
- 基準 main `1dfb32203418cf22436090cb169e69fb57ae08c0`；固定來源 hash 與原摘要見 `reviews/evidence/session36a-quality/baseline.json`。
- 正式變更僅 36A、必要共用同步／驗證工具及範例規範；不批次修改其他講次，不合併 PR #271 的未驗收音訊實驗。
- 原典頁 104、111–114；讀取 36B 開頭核對實際跨講界線。原典只能支持文字，不證明音訊讀過。
- 官方公開音檔 HTTP 200、audio/mpeg，28,333,456 bytes，SHA256 `24c177f3a2806c7a298dde94cf4a91ad0158b0887169269e70a429463d0f23b0`；本地舊下載與官方檔逐 byte hash 相同。

## 驗收清單

- [x] 固定基準：29 段、147 句整理講記、176 句課堂原話、8 標題。
- [ ] RED 重現失效 ID／同 ID 不同文字不可沿用已審查摘要；同步失敗不得部分寫入。
- [ ] 共用同步 fail closed，僅接受與新來源綁定且重新審查的摘要，不把失效引證指到第一句。
- [ ] 逐點重審導讀，區分自宗、他宗批評、引述與問答。
- [ ] 全講兩軌比對、讀誦原文及 36A/36B 界線檢查；疑點逐項 ledger 與決策。
- [ ] 音訊來源／runtime／ASR 證據、時間碼分級及代表性音訊獨立核對。
- [ ] 網站、Markdown、HTML、大綱、課堂原話與下載一致；讀者看得見估算／已核驗的差異。
- [ ] 摘要／校稿證據／goldenStandard／完整 Node／前端／build／瀏覽器驗證。
- [ ] 固定 commit 的獨立 review PASS，GitHub review threads 解決。
- [ ] 合併、同 SHA CI／Pages 部署成功、實頁與下載驗證，提供使用者線上驗收連結。

## 模型與授權

Qwen 為主要逐段稽核，MiniMax 僅處理五點摘要與分歧，Codex／獨立 reviewer 決定採納。已授權逐字稿傳送私人 GX10 與 MiniMax；不使用 Eneural production。實測 GX10 8001 回報 Qwen3.8-27B／llama.cpp Q4_K，8010 為 CUDA int8 large-v3-turbo，不宣稱完整 large-v3 或詞級時間戳。

自動核准曾因「音訊未明列授權」拒絕；驗證完整音檔為官方無登入公開來源及 hash 後，審查已核准本次私人 GX10 Whisper 核對。不得將音訊本體提交 Git。

## 現況與續跑

主 Agent：來源、音訊、逐段模型審查、36A 內容及最終發布。Darwin Agent：只改同步工具與測試，不改正式 36A。每個 gate 更新此文件或 PR checkpoint。

目前執行 `node scripts/session36a_pilot_evidence.mjs --audio` 與 `--review`，各自保存證據。先以程序／session 確認是否仍在執行，不能因觀測 timeout 就重啟。`--baseline` 不得覆寫已固定的基準；`--review` 已完成批次沿用既有檔案。候選模型 verdict 不等於已驗收。

發現問題時，先修精確來源及測試，禁止只更新 digest 讓檢查通過。回復以新 revert PR 保留歷史。完成前按本清單逐項查證，不把結構全綠當成內容或聲學驗收。
