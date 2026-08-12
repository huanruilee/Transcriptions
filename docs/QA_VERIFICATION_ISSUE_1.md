# Issue #1 修復 QA 複驗報告 — Transcript JSON Timestamp Desync

> **檢驗日期**：2026-08-13
> **檢驗者**：獨立 QA（Hermes Agent subagent）
> **工作區**：`/home/henry/.gx10/xiaofa/workspace/Transcriptions`
> **GitHub Issue**：https://github.com/huanruilee/Transcriptions/issues/1
> **原始 QA 報告**：`docs/QA_SAMPLING_REPORT_69_110.md`（修復前 21/25, 4.2/5）
> **本次定位**：對小法 `scripts/fix_timestamps.py` 修復的**獨立誠實複驗**

---

## 0. 結論先行

| 項目 | 結果 |
|---|---|
| **Issue #1 修復** | ✅ **PASS** — 時間戳 desync 問題已實質解決 |
| **抽樣評分（8 個 session）** | **192/200 (4.8/5)** — 時間戳 32/40，其他 4 項全滿分（扣分項見 §6.1） |
| **全部 137 個 session ratio 對齊** | **137/137 = 100%**（所有 `last_end / actual_audio` ∈ [0.9999, 1.0001]） |
| **`npm test`** | ✅ 5/5 pass / 0 fail（QMS §8.6 證據） |
| **Schema 完整性** | ✅ 所有抽樣 session 段落連續、句子 in para、單調遞增 |
| **內容完整性** | ✅ git diff 顯示純時間戳變更，文字 0 變動 |
| **部署一致性** | ✅ 本地 = live 端，byte-identical（md5 488f69e6...） |
| **未阻擋性問題** | 個別句子的音訊位置**仍為線性均勻分布**（見 §6.1） |

**獨立判定**：小法的 `fix_timestamps.py` **正確完成**了 Issue #1 的核心目標（消除 4–6× 倍時長脫節），但**未從根本解決**前端「點擊特定句子精準跳轉」的需求（線性縮放 ≠ 語音對齊）。

---

## 1. 抽樣清單（8 個 session）

| # | sessionId | 類別 | 日期 | 章節 | 音檔時長 |
|---|---|---|---|---|---|
| 1 | **69A** | 與前次 QA 一致 | 2017-12-23 | 第六現前地 p.204 | 3256.89s |
| 2 | **74B** | 與前次 QA 一致 | 2018-02-03 | 第六現前地 p.223 | 2821.77s |
| 3 | **78B** | 與前次 QA 一致 | 2018-03-24 | 第六現前地 p.240 | 2126.64s |
| 4 | **103A** | 與前次 QA 一致 | 2018-10-20 | 第一極喜地 p.39 | 2907.63s |
| 5 | **110B** | 與前次 QA 一致 | 2018-12-22 | 第五難勝地 p.63 | 3246.71s |
| 6 | **30A** | 新抽樣（早期） | 2017-01-21 | 第六現前地 p.100 | 3082.92s |
| 7 | **60A** | 新抽樣（中期） | 2017-10-21 | 第六現前地 p.186 | 3012.41s |
| 8 | **109B** | 新抽樣（晚期） | 2018-12-15 | 第四燄慧地 p.61 | 2690.25s |

抽樣橫跨 **2017-01 至 2018-12**（22 個月）、**3 個不同章節**（第六現前地 / 第一極喜地 / 第四燄慧地 / 第五難勝地），包含 A/B 兩種 sub-session，具充分代表性。

---

## 2. 修復原理回顧

小法 `scripts/fix_timestamps.py`：

```python
SYNTHETIC_PARAGRAPH_DURATION = 120.0  # 原始合成假設
scale_factor = actual_audio_duration / (n_paragraphs * 120.0)
# 將每個 paragraph.start/end 與 sentence.start/end 乘以 scale_factor
# 末段 end 自動 ≈ 實際音檔時長
```

本質：**線性縮放**（linear rescale）。所有時間戳以同一比例 `actual/synthetic_total` 重新分配。

---

## 3. 抽樣評分表（5 項 × 8 sessions）

### 3.1 評分彙總

| Session | Schema | 內容 | 時間戳 | 頁碼 | 音檔 | 小計 |
|---|---|---|---|---|---|---|
| 69A   | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 74B   | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 78B   | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 103A  | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 110B  | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 30A   | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 60A   | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| 109B  | 5/5 | 5/5 | **4/5** | 5/5 | 5/5 | 24/25 |
| **總計** | **40/40** | **40/40** | **32/40** | **40/40** | **40/40** | **192/200** |

**抽樣總計 192/200 = 4.8/5**（時間戳項扣 8 分 = 1 分/每 session，理由見 §6.1）。

### 3.2 修復前後評分對比

| 評分項目 | 修復前（5 sessions）| 修復後（8 sessions）| 改變 |
|---|---|---|---|
| Schema 符合度 | 5.0/5 | 5.0/5 | = |
| 內容品質 | 5.0/5 | 5.0/5 | = |
| **時間戳** | **1.0/5** | **4.0/5** | **+3.0** ⬆ |
| 頁碼標註 | 5.0/5 | 5.0/5 | = |
| 音檔對應 | 5.0/5 | 5.0/5 | = |
| **總計** | **21/25 (4.2/5)** | **24/25 (4.8/5)** | **+0.6** |

**時間戳從 1/5 提升至 4/5** — 達到 Issue #1 的驗收目標。

---

## 4. 詳細檢驗證據

### 4.1 Schema 符合度

| 檢驗項 | 8/8 結果 |
|---|---|
| `sessionId` 存在 | ✅ |
| `paragraphs[]` 存在且為 list | ✅ |
| 段落 `start ≤ end` | ✅ |
| 句子 `start ≤ end` | ✅ |
| 段落連續：`para[i+1].start == para[i].end`（gap = 0.0000s）| ✅ |
| 句子起點單調遞增 | ✅（8/8 全部 True） |
| 末段末句 `end` ≈ 音檔時長（<0.01s 誤差） | ✅（8/8 全部 True） |

### 4.2 內容品質

用 Python 比對 JSON 文字與 Obsidian 校正稿（`20171223-A ..._agyRAG校正.txt` 等）：

| Session | 校正稿 | 字符重合率 |
|---|---|---|
| 69A | 20171223-A 入中論善顯密意疏-第六現前地p204(69)_agyRAG校正.txt | 100% |
| 74B | 20180203-B ...p223(74)_agyRAG校正.txt | 100% |
| 78B | 20180324-B ...p240(78)_agyRAG校正.txt | 100% |
| 103A | 20181020-A ...p39(103)_agyRAG校正.txt | 100% |
| 110B | 20181222-B ...p63(110)-圓滿_agyRAG校正.txt | 100% |
| 30A | 20170121-A ...p100(30)_agyRAG校正.txt | 100% |
| 60A | 20171021-A ...p186(60)_agyRAG校正.txt | 100% |
| 109B | 20181215-B ...p61(109)_agyRAG校正.txt | 100% |

**文字總字元**（修復後未變，與原始 QA 報告一致）：
- 69A: 13,459 / 74B: 9,275 / 78B: 8,508 / 103A: 10,358
- 110B: 13,046 / 30A: 12,305 / 60A: 12,590 / 109B: 10,748

`git diff` 確認：純時間戳變更，**文字 0 變動**。

### 4.3 時間戳真實性（核心）

| Session | 音檔時長 | 末段 `end` | ratio | scale_factor | 段時長 stdev | 句間距 stdev |
|---|---|---|---|---|---|---|
| 69A  | 3256.89s | 3256.89s | **1.0000** | 0.2300 | 0.0027s | 7.97s |
| 74B  | 2821.77s | 2821.77s | **1.0000** | 0.2375 | 0.0045s | 7.94s |
| 78B  | 2126.64s | 2126.64s | **1.0000** | 0.1865 | 0.0050s | 6.55s |
| 103A | 2907.63s | 2907.63s | **1.0000** | 0.2330 | 0.0040s | 7.73s |
| 110B | 3246.71s | 3246.71s | **1.0000** | 0.2081 | 0.0050s | 7.14s |
| 30A  | 3082.92s | 3082.92s | **1.0000** | 0.1889 | 0.0036s | 6.36s |
| 60A  | 3012.41s | 3012.41s | **1.0000** | 0.1902 | 0.0034s | 6.28s |
| 109B | 2690.25s | 2690.25s | **1.0000** | 0.2038 | 0.0047s | 6.85s |

**關鍵指標**：
- **末段 end ratio = 1.0000**（所有 8 個 session）— Issue #1 核心問題已解決
- **段時長 stdev < 0.01s** — 線性縮放使段時長幾乎完全均勻（每段皆為 `120 × scale`）
- **句間距 stdev > 6s** — 句子間距不再是嚴格 8s 等距（末句會延伸至段尾，產生變化）

### 4.4 全部 137 個 session 全域驗證

```python
# 全部 137 個 session 的 ratio 統計
ratio_min   = 1.0000
ratio_max   = 1.0000
ratio_mean  = 1.0000
ratio_median= 1.0000
in_range    = 137/137 (100.0%)  # ratio ∈ [0.99, 1.01]
abnormal    = 0                  # ratio > 1% off
no_audio    = 0
```

**全 137 個 session 100% 對齊實際音檔時長**。

### 4.5 頁碼標註

每個 session 在首句有 1 個 `[p.XX]` 標記，與 `course.json` 的 `pageRange` 一致：

| Session | 頁碼 |
|---|---|
| 69A  | [p.204] |
| 74B  | [p.223] |
| 78B  | [p.240] |
| 103A | [p.39] |
| 110B | [p.63] |
| 30A  | [p.100] |
| 60A  | [p.186] |
| 109B | [p.61] |

（每 session 仍僅 1 個頁碼標記 — 為既有模式，**非本修復引入的新問題**，與前次 QA 一致。）

### 4.6 音檔對應

所有 8 個 session 音檔皆存在、有效 MP3，且為 symlink 指向 `/home/henry/gdrive/善顯共學/音檔/...`：

| Session | 大小 | symlink 目標 |
|---|---|---|
| 69A  | 24.9 MB | `20171223-A ...p204(69).MP3` |
| 74B  | 21.5 MB | `20180203-B ...p223(74).mp3` |
| 78B  | 16.2 MB | `20180324-B ...p240(78).MP3` |
| 103A | 22.2 MB | `20181020-A ...p39(103).MP3` |
| 110B | 24.8 MB | `20181222-B ...p63(110)-圓滿.mp3` |
| 30A  | 23.5 MB | `20170121-A ...p100(30).MP3` |
| 60A  | 23.0 MB | `20171021-A ...p186(60).MP3` |
| 109B | 20.5 MB | `20181215-B ...p61(109).MP3` |

### 4.7 npm test 證據（QMS §8.6）

```bash
$ npm test
ok 1 - ...
ok 2 - ...
ok 3 - ...
ok 4 - segmentSentences breaks paragraphs on pause >= 1.5s
ok 5 - findSentenceIndexByTime finds correct index using O(log N) binary search
# tests 5
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 39.361271
```

**5/5 通過，0 失敗** — 修復未破壞任何既有測試。

### 4.8 部署一致性

| 端點 | HTTP | 大小 | MD5 |
|---|---|---|---|
| 本地 `session_69A.json` | n/a | 103,787 bytes | `488f69e65133bb51...` |
| Live `https://gx10-2887.tail378c21.ts.net:9090/.../session_69A.json` | **200** | 103,787 bytes | `488f69e65133bb51...` |

**Byte-identical** — 部署版本與 repo working tree 一致。

---

## 5. 與前次 QA 報告對比（核心指標）

| 指標 | 修復前 | 修復後 | 改變 |
|---|---|---|---|
| 69A 末段 end | 14160s | **3256.89s** | -77% |
| 74B 末段 end | 11880s | **2821.77s** | -76% |
| 78B 末段 end | 11400s | **2126.64s** | -81% |
| 103A 末段 end | 12480s | **2907.63s** | -77% |
| 110B 末段 end | 15600s | **3246.71s** | -79% |
| **超標倍數** | **4.2–5.4×** | **1.0×** | ✅ **完全消除** |
| 時間戳評分 | 1/5 | **4/5** | +3 |

**核心驗收標準（Issue #1）：末段 end 與實際音檔時長對齊 — 100% 達成。**

---

## 6. 誠實保留的問題（非阻擋）

### 6.1 ⚠ 線性縮放 ≠ 語音對齊（時間戳 4/5 原因）

**雖然末段 end 完美對齊音檔時長，但個別句子的「真實音訊位置」未對齊。**

線性縮放後：
- 每段時長變為 `120 × scale`（高度均勻）
- 句間距原為嚴格 8s × scale，但末句會延伸至段尾，導致 stdev > 6s

**這意味著**：
- ✅ `findSentenceIndexByTime(audio.currentTime)` 在「播放高亮」場景下能大致定位（前後幾句內）— Issue #1 報告的核心功能修復
- ⚠ 點擊特定句子跳轉到 `audio.currentTime = sentence.start` 仍可能落空（落點仍在該段範圍內，但非該句實際語音處）

**結論**：此問題**無法在現有資料基礎上**用「線性縮放」根本解決。需要 ASR word-level 時間戳對齊（如 audio-cpp 的 `output_format=verbose_json`），這是另一個獨立工程任務。

**為何仍給 4/5 而非 5/5**：Issue #1 標題是 "timestamp desync"，字面理解為「時長脫節」 — 修復後末段 end 完全脫節被消除。但 Issue 描述中提到的「點擊跳轉」與「播放高亮」**部分功能**（精確度）仍受限制，故給 4/5。

### 6.2 修復尚未 commit/push

```
$ git status
您的分支與上游分支 'origin/main' 一致。
尚未暫存以備提交的變更：
	修改：     courses/入中論善顯密意疏/sessions/session_01.json ... session_110B.json (137 files)
未追蹤的檔案：
	scripts/fix_timestamps.py
```

**137 個 session JSON 全部 modified，但 `git log` 沒有這個 fix 的 commit**。Live server 之所以看到修復後的資料，應是 TailServe 監聽 working tree（而非 git HEAD）所致。

**建議**：小法應在 QMS §8.5.2 可追溯性原則下，補上一個 GGF 語意化 commit，例如：
```
fix: re-scale all 137 session JSON timestamps to actual audio duration (Issue #1)
```
並 push 至 main 分支。此為 commit hygiene 問題，不阻擋功能驗收。

### 6.3 一致的 `stdev < 0.01s` 段時長分布（殘留合成結構）

修復後每段時長仍幾乎完全均勻（stdev < 0.01s），證明是純線性縮放、未做語音邊界偵測。這與前次 QA 報告的「合成時間戳」問題的根因（`SEGMENT_SECONDS = 120` 注入邏輯）**未被根除** — 只是把整個序列壓縮進了實際時長。

**影響**：段落邊界與實際語音停頓位置無關。**但**前端 `app.js` 似乎只用段/句級的 start/end 來跳轉，段落邊界失準不會直接破壞用戶體驗（段落通常對應主題切換，視覺上仍能辨識）。

### 6.4 每 session 仍僅 1 個頁碼標記

與前次 QA 報告相同，非本修復引入的新問題。

---

## 7. 抽樣檢驗範圍與限制

| 項目 | 說明 |
|---|---|
| 抽樣比例 | 8 / 137 = 5.84%（達 5/5 + 3/3 任務要求）|
| 章節覆蓋 | 第六現前地 / 第一極喜地 / 第四燄慧地 / 第五難勝地（4/6 個地）|
| 時間覆蓋 | 2017-01-21 ~ 2018-12-22（22 個月）|
| sub-session 覆蓋 | A 與 B 皆有 |
| 全部 session ratio 對齊 | 137/137（100%）|
| 測試執行 | `npm test` 5/5 通過 |
| 部署驗證 | 1 個 session（69A）byte-identical 比對 |
| 音訊真實性測試 | 1 個 session（69A）做 silencedetect 確認音訊連續 |
| **未執行** | 未做 word-level 語音對齊驗證（需 ASR 重跑）|
| **未執行** | 未重跑任何轉譯 pipeline、未 commit/push |

---

## 8. 複驗程序透明性

執行的腳本（一次性，未污染 repo）：

- `/tmp/qa_issue1/verify.py` — 主檢驗（schema/內容/時間戳/頁碼/音檔）
- `/tmp/qa_issue1/deep_check.py` — 深層（段時長/句間距分布、單調性）
- `/tmp/qa_issue1/sanity_check.py` — 健全性（句子在段內、段連續、末句 end）
- `/tmp/qa_issue1/audio_realism_test.py` — silencedetect 確認音訊連續
- `/tmp/qa_issue1/results.json` — 結構化結果

**全程只讀**：未修改任何 session JSON、未動 cron、未 push、未 commit。

---

## 9. 給小法（xiaofa）與 Henry 的後續建議

1. **（必要）補 GGF 語意化 commit**：
   ```
   fix: re-scale all 137 session JSON timestamps to actual audio duration [Issue #1]
   ```
   並 push 至 main（QMS §8.5.2 可追溯性）。

2. **（建議）更新 Issue #1 為 Closed**：
   - 引用 `docs/QA_VERIFICATION_ISSUE_1.md` 作為修復證據
   - 標註殘留限制（線性縮放 ≠ 語音對齊）作為已知限制

3. **（可選，未來）如要「點擊精準跳轉」**：
   - 需重跑 ASR 取得 word-level timestamp（如 `audio-cpp` 的 `output_format=verbose_json` + `word_timestamps=true`）
   - 預估工時：137 個 session × ~5 分鐘/段 = 約 10-15 小時
   - 不在本次 Issue #1 範圍內

4. **（可選，nice-to-have）`timeAligner.js` 的 `timeScaleRatio` 層**：
   - 修復後 ratio ≈ 1.0，該層已無實質作用
   - 但保留也無害（避免移除後引入 regression）
   - 可加一個 comment 說明「自 Issue #1 修復後，ratio 期望為 1.0」

---

## 10. 結論

**Issue #1「Transcript JSON timestamp desync」修復通過 QA 複驗。**

- ✅ 末段 end 從 4.2-5.4× 超標降至 1.0×（137/137 完美對齊）
- ✅ 全部 5 項評分中 4 項滿分
- ✅ 抽樣 8 個 session 全部通過 schema/內容/頁碼/音檔檢驗
- ✅ `npm test` 5/5 通過
- ✅ 部署 byte-identical 一致
- ⚠ 唯一扣分：時間戳 4/5（線性縮放本質，非真實語音對齊 — 屬已知限制）
- ⚠ 修復未 commit/push（commit hygiene 問題，非功能問題）

**判定**：可標記 Issue #1 為 Resolved 並合併至 main。

---

*報告產出時間：2026-08-13*
*QA 過程：純只讀驗證，未修改任何資料、未 push、未 commit*
*產出檔案：`docs/QA_VERIFICATION_ISSUE_1.md`（本檔）*
