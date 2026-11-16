# 逐字稿流程 v1.0 交付驗證

Task：WF-STANDARD-01。日期：2026-10-23（Asia/Taipei）。
基準：`398fe24`（PR #279 合併後的 GitHub main）。
固定文件審查版本：`5ab54c411ae698d9dbd3a670744bf85cdd09e948`。
分支：`codex/transcription-workflow-standard`。

## 驗證

| 項目 | 結果 |
| --- | --- |
| `npm test` | 662 pass、4 既有 skip、0 fail，exit 0 |
| `npm run test:v2` | 98/98，exit 0 |
| `npm run summaries:audit` | 301/301 valid，exit 0 |
| `node --test tests/acceptance/goldenStandard.test.js` | 8/8，exit 0 |
| `npm run build:v2` | 通過，exit 0 |
| 新增本機 Markdown 連結 | 11 份變更文件共 16 個連結均可解析 |
| `git diff --check 398fe24` | 通過 |
| courses／scripts／src／tests diff | 零變更 |
| 獨立文件 review | gpt-6-luna，獨立乾淨 checkout，固定 SHA PASS |

純文件工作未製造 RED，不修改測試或程式；標準描述的是執行規則，未新增 UI 狀態機、後端修訂系統或自動聽核。原工作區的低 Token Draft 保留不動，PR #271／#281 不在本次合併範圍。

reviewer 使用系統 Python 檢查 batch `--help` 時缺 requests；主代理以既有具 requests 的隔離 Python env 補驗通過，沒有為文件任務安裝或呼叫模型。sync／verbatim CLI 參數亦已核對。

GitHub CI／合併狀態以本任務 PR 的固定 HEAD 及 merge SHA 為準；本文件不預先聲稱部署成功。完整測試摘要與獨立 review 保存於 `reviews/evidence/workflow-standard/`。
