# 研討資料（study-groups）

本目錄存放**依課程官方公開素材自動產生**的研討索引頁，例如
「討論提綱 ↔ 法師開示對照表」。

與各課程 `publications/` 的分工：

| 位置 | 性質 |
|---|---|
| `courses/<課程>/publications/` | 依本站逐字稿產出的學習報告（lecture_XX_study_guide 等） |
| `courses/study-groups/<課程>/` | 依 YouTube 官方說明欄／章節整理的研討索引 |

## 使用規則

1. **不要手改產出檔**（`*.html`）。它們由 `build.py` 產生，手改會在下一次
   重新產生時被覆蓋。
2. **更新內容**：進入該課程目錄，執行

   ```bash
   cd courses/study-groups/<課程目錄>
   python3 build.py \
     --playlist <PLAYLIST_ID> \
     --out outline-disclosure-table.html \
     --cache desc_cache.json \
     --title <課程名稱>
   ```

   `--cache` 記住已抓取的影片說明欄，之後更新只抓新增的影片。

3. **新增課程**：建 `courses/study-groups/<課程目錄>/`，把 `build.py`
   複製過去（或直接引用既有腳本），以新的 `--playlist` 與 `--title` 執行。
   產生器不寫死任何課程字串，全由參數傳入。

4. **發布**：`courses/` 底下所有路徑會由 deploy workflow
   （`cp -r courses _site/courses`）自動部署到 GitHub Pages，
   走 PR → CI → merge 流程即可，不需改 workflow。

## 可用性偵測（私有轉公開、漏收的公開講次）

播放清單裡常有影片先設**私有**、日後才轉公開；`--flat-playlist` 会把私有条目
一起列出且 `availability: null`，所以**只看 snapshot 看不出来**。2025 釋量論大組
共學即因此漏收第29講（下）（`IQxfpRRoDNE`，2026-11-15 轉公開，站上的
`reference_inventory.json` 停在 2026-11-13 的私有紀錄）。

偵測由 repo 根目錄執行：

```bash
python3 scripts/check_study_group_availability.py --write
```

會刷新 `playlist-snapshot.jsonl`、逐支 probe 未收的影片、寫出
`reviews/evidence/<course>/availability_check_<date>.json`，並以**不重排格式**的
方式更新 `reference_inventory.json` 的 `checkedAt`、
`coverageGapsIdentified.privateOrUnavailableInPlaylist` 與
`availabilityTransitions` 日誌（`missingPublicVideos` 保留為歷史紀錄，不改）。

出口碼：`0` 已同步、`2` 有待辦（公開但未收／私有轉公開/站上多餘）、
`3` probe 失敗或寫回失敗（不可當成已檢查）。`--self-test` 為免網路的邏輯驗證。

## 校對說明（各課程通用）

對照表中的時間碼與題號取自**官方 YouTube 章節**（影片說明欄「影片段落」），
非人工逐段聽核。標示「此題該講未討論（他日如再論）」者，依官方章節即無開示
段落。需要人工聽核版須另做一輪校對。
