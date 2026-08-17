# Sprint 6A 與 AGY 三方討論結論（2026-08-17）

> 小法 × AGY（Gemini CLI）三方審查。Henry 指令：「你和 agy 討論一下怎麼做比較對」。

## 背景

Sprint 6A 是《入中論善顯密意疏》逐字稿平台的致命 Bug 修復衝刺。小法已完成 M6.0-M6.3，在 commit 前與 AGY 討論執行策略。

## AGY 對 5 個問題的判定

| 問題 | AGY 判定 | 行動 |
|:---|:---|:---|
| M6.2 UI 標示 vs LLM 補 timestamp | ✅ UI 標示 100% 正確；LLM 補 timestamp 屬 Sprint 6B 離線 pipeline | 維持現狀 |
| M6.3 數千 sentence 全 tabindex=0 | 🚨 **Tab Flood 反模式** | 改 Roving Tabindex |
| M6.4/M6.5/M6.6 優先級 | 非致命 Bug，延後 Sprint 6B | 移出 6A |
| 測試策略 | 6A 用 node:test + jsdom；6B 才引 Playwright | 維持 |
| 完成標準 | 必須小檢複驗 + 5 大 DoD | 委派小檢 |

## AGY 額外發現 3 個風險（已修復）

1. **audio.play() 未捕獲 rejection** → 音檔 404 時播放器卡死
   - 修復：新增 `safePlay()` 包裝，catch rejection + toast
2. **location.hash 競態條件** → 快速點擊可能 race condition
   - 修復：新增 `sessionLoading` guard，finally 重置
3. **M6.3 未 commit 的 Tab 陷阱** → 數千 sentence 全 tabindex=0
   - 修復：改 Roving Tabindex（僅首句 tabindex=0，其餘 -1；ArrowDown/Up 導航）

## AGY 整體判斷

**收縮 Sprint 6A 邊界**：只做 M6.0-M6.3（M6.3 改 Roving Tabindex），M6.4-6.6 移到 Sprint 6B。

**執行順序**：
1. ✅ 改 M6.3 為 Roving Tabindex
2. ✅ 補測試（19 pass / 0 fail / 1 skipped）
3. 🔄 委派小檢複驗（進行中）
4. ⏳ 小檢通過後 commit + merge 回 main

## Sprint 6A 5 大 DoD（AGY 定義）

1. 無死鎖：198 個 published session 隨意切換 100% 成功；99B 正確 rollback + toast
2. TOC 點擊防禦：timestamp=0 不崩潰、不跳錯時間、顯示「章節起點待補」
3. 鍵盤導航無陷阱：無 Tab Flood，可順暢遊走 Sidebar/TOC/Transcript/Player
4. 測試全綠：npm test 100% 通過，無 regression
5. 工作區乾淨：無臨時殘留，符合 Git 規範

## 已 commit（sprint-6a 分支）

- `7135957` M6.0: gitignore 工作區隔離
- `526c4a3` M6.1: switchSession() 死鎖修復 + Toast
- `86fec78` M6.2: TOC 時間戳=0 改為 UI 標示「章節起點待補」
- `c5f7a1e` M6.3: a11y 鍵盤導航（Roving Tabindex）+ safePlay + race guard
- `d4e1150` M6.3: 抽出 a11y.js 純函式模組 + a11y 測試改為真 jsdom DOM 行為（小檢 QA 修正）

## 小檢 QA 發現（2026-08-17，已修正）

1. **JSDOM import 但未使用**（a11y 測試是純 regex，非真 DOM 測試）
   - 修正：新增 `src/js/a11y.js` 純函式模組，a11y.test.js 用 jsdom 建立真實 DOM 驗證實際行為
   - 測試 19 → 22（21 pass / 0 fail / 1 skipped）
2. **handleSeekTo/switchSession 無行為測試**
   - 部分修正：safePlay rejection 捕獲、rovingMove 焦點移動已有真 DOM 行為測試
   - 剩餘：handleSeekTo/switchSession 完整行為測試屬 Sprint 6B（需 Playwright）
3. **session_27B.json 存在但未 tracked，course.json 只有 27A**
   - 已知狀態：27B 是否 commit 是 Henry 決策（AGY draft），非 Sprint 6A bug

## 待辦

- [ ] 小檢複驗結果 → 通過後 merge sprint-6a 回 main
- [ ] M6.4/M6.5/M6.6 移到 Sprint 6B（ARIA live region / reduced-motion / landmark+skip-link）
- [ ] LLM 補 TOC timestamp 屬 Sprint 6B 離線 Data Pipeline
- [ ] 27B 是否 commit → 等 Henry 決策
