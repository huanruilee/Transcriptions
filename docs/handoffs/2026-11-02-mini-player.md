# MINI-PLAYER-READING 驗證紀錄

基底為正式 main `243704dafc4f3cde9b602a8331d53be4df8aa5f7`，分支 `codex/mini-player-reading-main`。只修改播放器、測試與規格；原工作分支及其未完成的 26B 內容保留，不混入此次提交。

## 行為

- 「🎵 隱藏畫面」與底列「📺 隱藏影片／顯示影片」共用狀態；保留同一 iframe 與 src，不使用 display none 或 visibility hidden。
- 桌面可切至左下角，left 12px、bottom 68px、width 280px。側欄縮窄或收合時仍保留正文避讓空間。
- 隱藏及停駐偏好以 localStorage 保存；重新整理與切講會恢復。
- 延續原有預設浮動模式，未新增自動捲動觸發機制。

## Test-first 與最終結果

在正式 main worktree 套用實作前，新增的 Vitest 5 項及 Node CSS 2 項皆已確認 RED；再套用實作。測試案例與規格見 [Test Patterns](../../TESTING.md#mini-player-test-patterns2026-11-02)。

| 驗證 | 結果 |
| --- | --- |
| 完整 Vitest | 134 passed / 0 failed |
| 完整 npm test | 856 passed / 0 failed / 4 既有 skip；未新增 skip |
| summaries:audit | 302 / 302 valid |
| Golden Standard | 8 passed / 0 failed |
| build:v2 與 Pages base build | exit 0 |
| 既有閱讀器 Playwright desktop/mobile | 48 passed / 0 failed |
| Mini Player Chrome 驗收 | PASS |

Chrome 實測 1025／1280／1440px、側欄展開／收合六組 BoundingBox 交集全為 0，另驗縮窄側欄。隱藏計算值為 opacity 0、pointer-events none、1×1px、display block、visibility visible。重新整理、切講、手機底列及實際 zen-dark／sepia 主題按鈕均通過。

[瀏覽器量測](2026-11-02-mini-player/browser.json) 與 [驗證 manifest](2026-11-02-mini-player/verification.json) 保存來源 SHA-256、執行命令、exit code、既有 skip 及 release asset digest。原始 stdout 保留於本機 `/tmp/mini-player-final-*`。既有 Playwright 案例及斷言未改，只用暫存 config 指定已安裝 Chrome。

## 環境與界線

原 checkout 有大量 macOS dataless 佔位檔，且起始分支含未完成課程資料。因此在獨立 worktree 使用 GitHub 正式 main 的檔案，逐檔核對 Git blob hash，並恢復相同 SHA 的本機 Git 快取；沒有改課程內容或測試門檻。正式 Node suite 允許 localhost 測試伺服器綁定後全綠。

這是本機工程驗收，尚未 push、建立 PR 或部署。瀏覽器測試攔截外部 YouTube 媒體，驗證 iframe 保留與命令／版面，未宣稱實際外部串流已經聽核。
