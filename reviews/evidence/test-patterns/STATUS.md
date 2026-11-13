# 測試整理交付

日期：2026-10-23（Asia/Taipei）。分支：`codex/test-patterns-review`。
固定程式版本：`e9551d60a34a8d456573e42ebad4bea6bc1f6a39`。
基準：`df5e27ff5cb2f78e093c24364bab88f86f398d82`。

執行者：兩個 gpt-6-luna worker、一個全新上下文的 gpt-6-luna reviewer，主代理負責整合、最小程式修正與最終驗證。沒有可比較的帳單／Token 計數，因此不宣稱節省比例。本次未執行 ASR／校稿模型推論或人工聽核。

| Gate／命令 | 結果／exit |
| --- | --- |
| 基準 npm test | 654 pass、4 skip、0 fail；0 |
| `PIPELINE_PYTHON=/private/tmp/transcriptions-pipeline-v2-venv/bin/python npm test` | 657 pass、4 skip、0 fail；0 |
| Python 行為契約 | 8/8；0 |
| 6 項故障注入 | 各未變異控制通過、變異後出現 AssertionError；runner 0 |
| `npm run test:v2` | 98/98；0 |
| `npm run summaries:audit` | 301/301 valid；0 |
| `node --test tests/acceptance/goldenStandard.test.js` | 8/8；0 |
| `npm run build:v2` | 通過；0 |
| `git diff --check df5e27f` | 通過；0 |
| `git diff --quiet df5e27f -- courses` | 課程成果零變動；0 |
| 獨立 review | 初審 FAIL，修復 prototype 40 遺漏斷言後，固定程式 SHA 複審 PASS |

全測試曾在 sandbox 因 19091 監聽限制失敗，允許本機監聽後完整通過；沒有修改測試來略過。故障注入及 CLI 只使用暫存複本，實際發布檔未被寫入。兩項程式修正均有先前 RED 原始輸出：36A/36B 明列輸出路徑繞過保護、prompt 句末標點超出字數上限。

後續：CI 尚須在 GitHub 確認。未合併、未部署；待閱校版功能另立任務。低 Token 文件 Draft 與 PR #271 保持原狀。
