# Stage 3 — Issue #11 獨立 QA（小檢）

你是獨立 Reviewer。**不要大量探索**：寫一個 Python 腳本一次跑完，再寫報告。

## 方法（重要）
你是文字模型，無法真正「聽」音檔。Issue #11 的「實聽 QA」以
**獨立 ASR 交叉驗證**實現：用第二個 ASR 引擎（faster-whisper small, int8, zh,
word_timestamps=True）独立重轉 5 個區段，與 published 文字 + Stage 2 對齊結果
交叉比對。這是可量化、可重現的獨立複驗。

## 每堂 5 區段（60s 每段，ffmpeg 切 16kHz wav）
- head: [0, 60]
- middle: 用 Stage 2 的 clip（01: [1202.8,1262.8], 69A: [1598.4,1658.4], 110B: [1593.4,1653.4]）
- tail: [duration-60, duration]
- dense_buddhist: 用 published 文字找佛學術語最密集的 60s 窗口（龍樹/波羅蜜/中觀/空性/二諦/般若）
- difficult: 找 published 文字中「嗯/啊/對吧」口頭禪最密集的 60s 窗口

音檔：`audio/<sid>.mp3`（symlink，用 os.path.realpath）
時長：01=2465.67s, 69A=3256.89s, 110B=3246.71s

切法：`ffmpeg -y -ss <s> -i <audio> -t 60 -ar 16000 -ac 1 -c:a pcm_s16le /tmp/q3_<sid>_<region>.wav`

## 每區段計算
1. faster-whisper small int8 zh 轉錄（word_timestamps=True）
2. 取該窗口的 published 句子（`courses/入中論善顯密意疏/sessions/session_<sid>.json`，
   sentence.start/end 在窗口內的），文字去掉 `[p.NN]` 與空白
3. **text_cer**: 獨立轉錄 vs published 文字（去標點空白後 Levenshtein / max(len)）
4. **timestamp_median / p95**: 獨立轉錄各句首字 start 時間（相對窗口開頭）vs
   published 句子 start（相對窗口開頭）的 |diff|
5. **terminology_errors**: published 文字中以下詞若被獨立轉錄成錯字，記錄：
   龍樹 般若 波羅蜜 中觀 空性 二諦 世俗諦 勝義諦 現前地 離垢地 善顯 密意 歸敬 頌
6. **needs_review_verdict**: text_cer<0.05 → reasonable; <0.15 → too_pessimistic 可能(標記); ≥0.15 → too_optimistic 不成立(問題)

## 產出
1. `qa_27B/stage3_review_xiaojian.json`：
   `{verdict, sessions: [{sessionId, regions: [{region, window, text_cer, ts_median, ts_p95, terminology_errors, verdict, sample_text}]}], key_findings, blocking_issues}`
2. `qa_27B/stage3_review_xiaojian.md`：人讀報告（表格 + 結論）

## Verdict 規則
- 任一區段 text_cer ≥ 0.30 → **STOP**
- 任一區段 text_cer ≥ 0.15 或 timestamp_median ≥ 30s → **ADJUST**
- 全部 text_cer < 0.15 且 timestamp_median < 15s → **GO**
- 中間情況 → **ADJUST** 並說明

## 禁止
- 不要重跑 Stage 2（stage2_calibration.py）
- 不要修改 session JSON / cron / 其他檔案（除了上面兩個產出）
- 不要美化結果。CER 高就報高。

## 時間預算
faster-whisper small int8 CPU 轉 60s 音檔約 20-40s。15 段 ≤ 10 分鐘。
若單段 > 3 分鐘，改用 tiny model 並在報告標記 model 降級。
