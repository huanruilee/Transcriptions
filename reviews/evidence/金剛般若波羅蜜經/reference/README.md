# Reference Inventory — 玅境長老 1999《金剛般若波羅蜜經》12 講

SHA256（本目錄檔案）：
- jingangjing_text.html: 19693611601691f6478ae4341e74a072eba96d3905edad32927ed3b38e4a7f96
- jiangji_full.txt: aeb0ddbb6af4cb57dca55adb0dcefaae5593d7e4da2e82138476d723c9764e02
- 音源逐檔 SHA256：`/home/henry/.gx10/projects/jjj1999/audio/sha256sums.txt`（音檔不入 repo；R06d_012.mp3 = 9478ea1955f39c2bc915b3b81c02ef9d1547c3b0bf758a2c1d071854c89e5bec）

- taskId: jjj1999（session 20261114_102402_bb08b81a）
- 課程/講次：玅境長老 1999 年台灣埔里法雲講堂《金剛般若波羅蜜經》共 12 講
- 來源 commit：origin/main @ 3ba39a85（worktree /home/henry/.gx10/xiaofa/worktrees/jjj1999）
- 音源：http://ccubk14.brinkster.net/greatbook/R06d/R06d_001..012.mp3 — 12 檔共 62,678s（17.41h），SHA256 見 audio/sha256sums.txt；下載日期 2026-11-20
- 內容驗證：L01 chunk_000 ASR 抽查＝講《金剛經》題解/般若義，講者脈絡吻合（verified 2026-11-20）

| referenceId | 類型 | 標題 | 取得 | 狀態 | 角色 |
| --- | --- | --- | --- | --- | --- |
| REF-1 | 經文（鳩摩羅什譯，江味農校勘） | 金剛般若波羅蜜經 | 同站 D00/06185.htm → evidence/jingangjing_text.html（72KB）| verified：內容抽驗含「如是我聞…」「金剛般若」| terminology-reference／引文核對 |
| REF-2 | 出版整編文字（前輯＝1999 埔里宣講） | 金剛般若波羅密經講記（玅境老和尚） | book853 show.aspx?id=1628 60 頁 → evidence/jiangji853/jiangji_full.txt（371,831 字）| verified：內文含「一九九九年台灣埔里法雲講堂…分前後輯」前輯說明；與音源同系列 | terminology-reference／edited-text-reference（**非逐字 gold**，不可替換原話）|
| REF-3 | 科判彙總 | 金剛般若波羅蜜經講記[科判汇总] kepanhuizong.org | 搜尋結果頁（未逐頁核對）| unverified | toc 章節骨架候選 |
| REF-4 | 影音版筆錄 | YouTube〈金剛般若波羅蜜經（新版）1999年法雲講堂〉＋fayun.org 筆錄 | 僅搜尋結果（未取得筆錄全文）| unverified | asr-cross-check 候選；未放入提示 |

不採用/未使用：
- R06E（1999 共 53 檔有視訊）與 R06F（1996 禪十四 14 檔）：不同切片/系列，不作本課程音源或逐字底本。
- 三芦书屋 53 篇版：內容同 REF-2 之另一排版，不重複抓取。

使用方式：REF-1/REF-2 用於（a）whisper initial_prompt 名相表（REF-1/2 高頻名相）；（b）deterministic lexicon sweep 的術語白名單；（c）分歧定位回聽候選。均不逐句替換 ASR 原話。
