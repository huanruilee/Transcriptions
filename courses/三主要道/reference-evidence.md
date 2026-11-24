# 三主要道 reference inventory（SZYD-GDOC-20261123）

查找日期：2026-11-23。依 `docs/REFERENCE_EVIDENCE_PROTOCOL.md` 記錄。

## 任務資訊

- taskId：SZYD-GDOC-20261123
- 課程／講次：三主要道（如性法師，2022-05 研討），第 01–24 講全部
- 來源 commit：`6fe2fc3d`（origin/main，worktree `szyd-doc`）
- 音源：YouTube 播放清單 `PLMngxNMnjFcM41At4494GCubGnQ5OqZC1`，24 支影片 ID 已與 `session_*.json.youtubeVideoId` 逐一比對 **一致**（2026-11-23，`yt-dlp --flat-playlist`）；各講最後句時間碼與影片時長差 <65s，無缺段跡象
- 音檔 digest：未取得（不需 ASR，無下載）

## Reference 清單

| referenceId | 類型 | 標題／內容 | 位置 | 狀態 | 使用角色 |
|---|---|---|---|---|---|
| ref-session-json | 既有整編逐字稿（repo） | `courses/三主要道/sessions/session_{01..24}.json`，26,984 句，含 `text`（部分講次無標點）與 `rawText`（無標點原文） | worktree | verified（schema/句數/時間碼 2026-11-23 抽驗） | edited-text-reference；`rawText` 兼作原始 ASR 保存軌 |
| ref-learned-corrections | 勘誤詞庫 | `courses/三主要道/learned_corrections.json`：`global_terms` 31 筆（含 reasoning）＋`context_rules`；`_metadata` 明示「套用前須確認語境」 | worktree | verified（2026-11-23 讀取） | terminology-reference；僅作 adjudicate 候選，非盲套 |
| ref-style-jingangjing | 同站已上線閱讀版樣本 | 金剛經 1999、釋量論第二品 等 courses 的段落/標點風格 | repo | verified（上線中） | edited-text-reference（風格） |
| ref-rufa-keben | 講者出版講記 PDF | `HuanruileeDrive:如性法師/如性法師課程/`：`略論講記第三冊副本.pdf`、`入行論釋佛子正道講記（第一/二冊）.pdf`、`2018南印《釋量論・第二品》（上）01～16.pdf` | huanruilee.us@gmail.com Drive（目錄 2026-11-23 `rclone lsd` 核實） | **unverified**（僅見檔名，內容未取樣） | edited-text-reference（分段/標點風格）；T6 前取樣 |
| ref-lectern-quotes | 講中引書 | 第 01 講提及《略論講記第一冊》p.123 等頁碼 | 逐字稿內文 | unverified（未逐頁核對） | asr-cross-check（引文處抽核） |
| ref-youtube-desc | 影片說明欄 | 各講 YouTube 描述欄（提綱/法本附件） | YouTube | **查無**：未逐講檢查；待 T6 前抽 3 講確認有無官方提綱 | 待定位 |

## 查無／限制記錄

- 無官方課本對應三主要道研討（站上僅見《菩提道次第略論》講記為引用來源）。
- 未逐句回聽；本任務產物為待閱校版。
- 允許的 LLM provider：MiniMax（校字用途）；本地模型 100.113.144.100:18765。音訊/全文不外傳其他雲端。

## 樣本 ASR 訛字（第 05/17 講抽樣，2026-11-23）

鼎禮→頂禮｜力士造論→立誓造論｜依止善之事→依止善知識｜報次第的一師之禮→（待核：禮讚次第、依師之禮？）｜圓著→緣著｜常識閉關→長期閉關｜選擇常識→選擇長期
