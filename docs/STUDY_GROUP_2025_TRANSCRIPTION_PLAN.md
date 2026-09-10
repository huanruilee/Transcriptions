# 2025 釋量論大組共學逐字稿執行計畫

## Scope

來源是 YouTube 播放清單：

`https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh`

目前 manifest 顯示 44 個項目，其中 42 個可取得來源，2 個不可播放。不可播放項目不得猜測、補造或進入轉寫批次。

## Gates

1. **來源 Gate**：`playlist_inventory.json` 通過 contract test；每部影片有穩定 ID、標題、時長與可播放狀態。
2. **Prototype Gate**：先完成一部影片，產出 raw ASR、校訂稿、時間戳、問題索引與法師開示摘要；由獨立 reviewer 只讀檢查。
3. **Batch Gate**：每批最多兩部影片；每部完成後先產生 evidence，再由 reviewer 回傳 `PASS|FAIL|BLOCKED`，不得以 Agent 自評代替驗收。
4. **Publish Gate**：只有通過 reviewer、回歸測試與瀏覽器檢查的講次，才註冊到正式 course manifest 並推送 GitHub。

## Content contract

- 保留可追溯的原始 ASR 與來源影片 ID。
- 逐字稿必須保留時間戳，文字、段落與音訊可互相定位。
- 討論問題作為 TOC 索引；每題結尾整理法師開示為條列摘要，摘要不連結音檔。
- 不把人名參考名單公開到網站；只作為 Agent 的內部校正提示。
- 不可播放或講次無法可靠判定的項目標記 `BLOCKED` 或 `UNRESOLVED`，不可自行補號。

## Current source facts

- Playlist title: `2025《釋量論．第二品》大組共學`
- Channel: `如理作意`
- Playlist items: `44`
- Executable items: `42`
- Unavailable/private items: `2`
- One executable review entry has no lecture number and remains unnumbered.
- The visible numbering jumps from lecture 17 to lecture 23; lectures 18–22 are not present in this playlist manifest and must remain an explicit gap.

## Agent instructions

GX10 Agent receives a frozen manifest slice and an isolated write scope. It may read remote media and write only the assigned candidate/evidence paths. It must not edit tests, other sessions, course registration, or published data. The coordinator integrates only after independent read-only review.
