# 待改進建議工作表（Improvement Backlog）

> 來源：2026-11-12 對 Phase 1–3 執行做法的自我檢討。狀態：**全部待辦**，擇期處理。
> 規則：只記錄已驗證的事實；完成後請改狀態並附 PR 連結。

| # | 優先 | 項目 | 說明／驗收標準 | 狀態 |
|---|---|---|---|---|
| 1 | 高 | 補處理 PR #285 的 4 則 Codex review | 逐則回覆或修正；30 講補上「待閱校／未逐句聽核」讀者提示，並檢討 `qualityReview.status: verified` 與「原聲完整保存」標示是否與事實相符。目前這 4 則是被直接標為 Resolved、並未真正處理 | 待辦 |
| 2 | 高 | 確認 `verbatim_30.json` 的 speaker 標註 | 本次提交將 p_13、p_14、p_16、p_17、p_27、p_47、p_52 中「（學員：…」數句的 speaker 由「學員」改為「如性法師」。需對照音檔確認是否正確（老師複述 vs. 學員原話） | 待辦 |
| 3 | 高 | 修復 repo 健康 | ① `git gc` 持續報 `bad tree object 0eface…`，先備份後以 `git fsck` 診斷修復 ② 清理工作目錄中大量 `xxx 2.*` 重複檔（疑似雲端同步衝突），逐一確認為重複後刪除，並加入 `.gitignore` 規則防再發 | 待辦 |
| 4 | 中 | 讓 `scripts/upgrade_session_pipeline.mjs` 名實相符 | 目前只呼叫渲染並計算抽屜數。需整合：簡體字檢查、禁用同音字、時間單調性、抽屜覆蓋率與時間錨點；任一失敗即非零退出。檔頭註解同步更正 | 待辦 |
| 5 | 中 | 真正的研讀講記雙向聯動 | 目前抽屜只是 iframe：① 以 `postMessage` 同步播放進度（講記段落高亮）與跳轉（講記時間按鈕控制主播放器）② 只在該講有研讀講記時顯示「📖 研讀講記」按鈕（現在沒有講記的講次會 404）③ `L` 循環鍵尚未接上 `App.vue` handler | 待辦 |
| 6 | 中 | 完成安全清理 | `npm audit` 仍剩 6 個漏洞（1 高、5 中）；happy-dom 升到 21.x 會讓 `mediaRoutingIntegration`、`playbackRegression` 兩個測試失敗，需修測試再升級；逐一核對已關閉的 Dependabot PR（#298、#274、#267）版本確實已涵蓋 | 待辦 |
| 7 | 低 | 穩定 CI | `apt` 鏡像常逾時導致重跑；改用快取或 Playwright 官方 container | 待辦 |
| 8 | 低 | 路線圖誠實化 | 以「完成／部分完成／未開始」三態更新 `transcriptions_improvement_roadmap`：Phase 1.3（流程文件併入 START_HERE 與 CI）與 Phase 4 尚未開始；Phase 3 的「釋量論 1–29、32 講批次升級」尚未執行 | 待辦 |

## 備註
- 第 1、2 項涉及內容正確性與審查完整性，建議最先處理。
- 修改 `session_30.json`／`session_31.json` 會使簽核摘要（`sourceDigest`）失效，須同步走重新簽核流程，不可直接改檔。
