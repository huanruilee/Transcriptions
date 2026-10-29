# 三主要道（佛法實修．系列一）逐字稿專案 — 執行規劃

**提案日期**：2026-10-29
**提案者**：小法（xiaofa）
**狀態**：待 Henry 拍板 → 批次 0（第 01 講）已放行

---

## 一、專案定位

| 項目 | 值 | 來源（已驗證） |
|------|-----|--------------|
| 正式名稱 | 佛法實修．系列一：《三主要道》 | yt-dlp `playlist_title` |
| 頻道 | 如來法性影音頻道 `UCcL81Q7idwmC-AIFGtKt8Pg` | yt-dlp metadata |
| 講師 | **如性法師** | 頻道 SoundCloud `rulaifaxing`；同頻道釋量論 32 系列同一講師；Telegram 群組「學習如性法師法教」 |
| Playlist | `PLMngxNMnjFcM41At4494GCubGnQ5OqZC1` | Henry 提供 |
| 講次 | 21 講（2025-02-28 → 2026-10-26） | upload_date |
| 性質 | **無底本**（no base text）— 純 ASR + 校正 | 比照四念住 `sourceVerification` |
| 授課形式 | 演講式（非問答式）→ 不做 `discussionQuestions`，改做**段落主題切分** | 三主要道各講 description 僅有「課程提綱」無提問 |

### 講次對照（21 講全表，已抓官方提綱）

```
idx id            drive_id                             標題                            時長   提綱條目
01  eergIaUzRQg  1wEBvqv70G31vcKZm3tEynbaAGRk03YQU   調整學法的動機（一）            3740s  7
02  BZkpvdw15Sg  1MOmJD6Z_IJkc2AiQl5uZlkABCQUEIxco   調整學法的動機（二）            3383s  5
03  vFVStS4UnTs  1ow7YYVT78BEofPLO_APZiiVcAmFVXhsS   略述三主要道                    4061s  6
04  DojUaSGp3tQ  1HOjz6xDG_fJRDcu3tIFi2FeG27DoKcTT   禮讚文與依師之理                4684s  5
05  lE9Foe299LM  1EaAal4WyvX_mOM99fAY_CHdRwN8tuWMd   多方剖析依師之理                4316s  4
06  kR32kesP4LI  1x2n7wni2wWri3V8ILwjmaSsYq7XfxSpR   總攝依師之理                    2683s  3
07  SA6AVpiIXgg  1FiV503nYdboxsXXYoySD1ef_sFG5XFSO   說明立誓造論                    2165s  3
08  q41UaaKd7CI  1wNdSxLVG0EVkS0B6UcfepEJzE-I4b5C-   說明勸請聽聞                    2958s  7
09  HHljkdhfs_8 18VJ1ZE0wMTr8Q0zGsUYhintFsnsyfWNo   為何必須生起出離心              3486s  7
10  hBzMeEvlCf0 1ersCQ80xnIf0kj0ImgjcyFFB8ATjSNHN   探究苦集二諦與捨棄現世          4671s  5
11  h4jG2l3svxM 1UxvFqCaVUK9wtVBzXUUK2qbShDRn7zIZ   探討暇滿與信心的內涵            4072s  7
12  T6Qj-5WFJsQ 1-Xlw6W7gtzFdIC602oPQaOa_m3uB9suE   探討死亡無常的內涵              3802s  7
13  Eka0gW_x49A 1mcpRdgu_0dwZsgPnER_qw7OluXLzx92U   多方思惟輪迴之苦                3952s  9
14  zM8vtzNFD9c 1otsRCIjSADYco3XHO6xLWLbP8gqGLi2t   說明如何取蘊與把握臨終          3689s  7
15  NunuDjAVHQU 1okjRtsm8Kaq6S10O-2mNEtPY_3fiUNgb   為何必須生起菩提心              2611s  5
16  N7fXqx_IVog 1DmQT7a7WzMSaKo11bs1n7GrvqAHYIfVe   如何生起大悲心                  4110s  5
17  eTnhDkJG8qQ 1Nd-Mc0rHKszHo6N8YQ9QDUaXowCpnje_   探究大悲心與諸法無我            4803s  6
18  Ek8Ob51uQTQ 191dcHruqZXHJoMdUKW7r5v-gmWrckJMX   苦諦四種行相與外道主張的我      2943s  6
19  De-bVwA0DJA 1gOAiCQKqhideHnZxmg3MciFBVEij45WL   探究遍計與俱生兩種我執          3022s  4
20  e6JSWoyAdvc 1bZ0MxOJ00YwFsabcWJaz5AhlXjuyUAa2   課程統整與結行迴向              1323s  3
21  5MZ2aU64570 1Z6YQ0jUNIEE6d8uH4HT6vj6GJtYFzSD8   介紹佛法所說的苦（補講）        2306s  6
```

**總時長**：71,041 秒 ≈ 19.7 小時

---

## 二、標準依據

沿用 repo 現行最新標準（origin/main `c8dc2c2`）+ 四念住先例（`si-nian-zhu`）。

| 層 | 產出物 | 契約 |
|----|--------|------|
| **L1 證據** | `reviews/evidence/sanzhuyaodao/playlist-NN/` | `raw_asr.json`、`candidate.json`、`content_review.json`、`run_manifest.json`、`review.md`、`content_review_manifest.json` |
| **L2 逐字稿** | `courses/三主要道/sessions/session_NN.json` | `paragraphs[].heading` + `sentences[]`（`id`/`start`/`end`/`rawText`/`text`/`reviewNeeded`）、`contentOverview`（schemaVersion 1）、`_meta` |
| **L3 候選** | `courses/三主要道/sessions/session_NN/candidate.json` | 四念住同款：`segments[]`（含 `sectionTitle`/`sectionType`）+ `stats` + `correctionsApplied` |
| **L4 課程** | `courses/三主要道/course.json`、`toc.json`、`learned_corrections.json` | `sourcePlaylist`、`pipelineType: video/youtube`、`publicationState`、`sourceVerification` |
| **L5 註冊** | `courses/catalog.json` | 新增一筆 course entry |
| **L6 驗收** | `npm test` + `npm run summaries:audit` | 新增對應 test 契約 |

**校對模型**：`scripts/grounded_correct_sinianzhu.py` 模式（propose + independent adjudicate 兩階段，字元數/改動比例防幻覺）。

---

## 三、管線（每講 6 階段）

```
S1 取得   curl drive uc?export=download&id=<drive_id> → audio.mp3
          + sha256sum + ffprobe → run_manifest
S2 ASR    POST 127.0.0.1:8010 /v1/audio/transcriptions
          beam_size=10, temperature=0, vad_filter=true, no_speech_threshold=0.6
          ★ 絕不關 condition_on_previous_text（實測關掉術語會錯）
S3 合併   merge_units: target_chars=90 / max_seconds=32 → seg-NNNN
          OpenCC s2twp 簡→繁
S4 校對   本地 Qwen3.8-27B (8001, enable_thinking=false) propose
          → independent adjudicate → 只接受兩者一致者
          → 疑點交 AGY 判讀（帶完整語境）
S5 結構   官方提綱（每講 description 的「課程提綱」）→ 段落邊界 + heading
          ★ 不造 discussionQuestions（演講式）
S6 摘要   contentOverview: mainPoints 2-4 / discussionTopics 1-4 / referenceViews 1-4
          每條必帶 evidence[].sentenceId
```

### 三引擎分工（已實測）

| 引擎 | 端點 | 角色 | 實測結果 |
|------|------|------|---------|
| 本地 Qwen3.8-27B | `127.0.0.1:8001/v1` | 量產校正 | 235 tok/片段，繁體原生，`enable_thinking=false` 必要 |
| AGY (Gemini CLI 1.4.9) | `agy -p` | 判讀層（疑點裁定） | **帶語境才準**：無語境猜「營隊/請方丈」錯；帶語境答「研討/請放掌」對 |
| codex-cli 0.162.1 | `codex exec` | 抽樣複核 10% | 可用；⚠️ 需 PTY，bg terminal 會 exit 2（skill §48） |
| ENEURAL `glm53-flash` | `agents.eneural.ai` | 備援 | ⚠️ config 寫的 `DeepSeek-V4.1-Flash-1017` **已下架**（該 key 只剩 glm53-flash）→ 另開 Kanban 卡，不混在專案 |

---

## 四、風險與對策

| 風險 | 證據 | 對策 |
|------|------|------|
| **內容遺漏**（最嚴重） | 服務端第21講 2305s → 僅 6,039 字；且開經偈段缺「請放掌」 | **新增 gate**：`音檔秒數 × 3.5 字/秒` vs 實際字數，比率 <0.6 阻擋發布。第 01 講做**雙切段交叉 ASR**（60s 窗 vs 150s 窗）實測校準係數 |
| **YouTube SABR 擋下載** | f18/140/251 皆取不到 URL | 改用官方 Google Drive 直鏈（21 講全部實測可用） |
| **校正失真** | LLM 可能「潤稿」而非「校對」 | 逐句輸出 + 字元數限制 + 改動比例 ≤4 字 + 獨立 adjudicate + 抽樣複核 |
| **單卡 GPU 競爭** | whisper 與 llama 同卡 | 階段分離：ASR 全批跑完才啟 LLM（skill §28） |
| **術語字典缺口** | 入中論詞庫 151 條，`出離/菩提/大悲/空正見/四諦/行苦/依師/禮讚/研討/放掌` **全部 0 命中** | 建 `三主要道` 專屬 `learned_corrections.json`，初始從 ASR 疑點 + AGY 判讀結果累積 |
| **AGY token 限制** | Henry 已提醒 | 判讀層限量、批次化；每批結束回報用量 |
| **repo 落後 186 commit** | main 落後 origin/main | 先 `git fetch` + 讀 origin/main 現況開工，不 rebase 破壞其他 agent 工作 |

---

## 五、執行批次

```
批次 0（樣板）  第 01 講 → 完整 L1-L6 + MD/HTML 可讀版 → 部署 → Henry 驗品質
批次 1          第 02-08 講
批次 2          第 09-15 講
批次 3          第 16-21 講
```

**預估**（實測後修正）：ASR 19.7h 音檔 × rtf 0.07 ≈ 1.4h；校正 ≈ 4h；結構/摘要 ≈ 1h。**合計約 6-7 小時**。

---

## 六、治理遵循

- 提案先寫 `.notes/`（本檔），Henry 確認後才動正式檔（skill §58）
- commit 帶 Task ID + 語意化 type
- 交付前 `npm test` 0 fail 為證據（QMS §8.6）
- commit 只 stage 本批次產出路徑（skill §69）
- §42/44 誠實聲明：AI 無耳朵 → 產出 `needs_human_review` queue，最終 GO 由人耳 review

---

## 七、待決事項

| # | 事項 | 狀態 |
|---|------|------|
| 1 | `eneural` provider 指向已下架模型 | **另開 Kanban 卡**（不混本專案） |
| 2 | 校準強度 | 先走方案甲（本地全量 + AGY 判讀 + codex 抽樣 10%）；第 01 講後若疑點率 >15% 則升乙 |
| 3 | MD/HTML 可讀版 | **含**（Henry 2026-10-29 確認） |
| 4 | 第 21 講（2026-10-26 補講） | 附在最後，標註「補講」 |
