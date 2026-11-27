# 《朝聖前行》課程專屬指導（COURSE_GUIDE）

本文件適用 `courses/朝聖前行課程/`（如性法師主講・2026 年 9 月臺灣授課・2026 印度朝聖前行課程）。

## 1. 課程組成與來源屬性

- 共 **6 節**：第 1～5 講＋**結行指導與問答**（第 6 節）。官方文件明載原設計為五堂課，第 6 節不是「第六講」，一律稱「結行」。
- **底本**：`courses/朝聖前行課程/source_text/lecture_01.txt` ～ `lecture_05.txt`（講師官方**整編校稿**三校稿，已移除校稿者編輯指令，疑義保留在 `reviews/evidence/朝聖前行課程/work/pending_confirmations.json`）。
- **底本角色**：整編校稿是**整編後**的文本，**不是**逐字 gold。佛法名相與引文以底本為準；**時間碼一律以 ASR 為準**，不得依底本字數比例推算。
- **第 6 節（結行）**：`sessionKind: closing`，**沒有逐字底本**，只有官方問答紀要大綱（`reviews/evidence/朝聖前行課程/reference/closing_outline.pdf|txt`，僅作結構線索），正文採 **ASR-primary**。
- **音源**：全部為 GX10 自托管串流（`https://gx10-2887.tail378c21.ts.net/audio/chaosheng-qianxing-2026/CSQX_0N.mp3`），**不得**使用 Google Drive 直連（`Content-Disposition: attachment` 會讓 iOS 拒播）。音檔 sha256 與時長記於 `reviews/evidence/朝聖前行課程/reference/README.md` 與各節 `_meta.audioSource`。

## 2. 發布狀態定位（不可宣稱的事）

- 全課程為 **待閱校版**：`publicationState: candidate-review-required`、`transcriptPublicationState: candidate-review-required`。
- `qualityReview.humanProofread: false`、`qualityReview.humanListened: null`；**不得**填 `humanListened: true`。
- 「與官方底本一致」**不等於**「錄音忠實」；「工程 PASS」**不等於**「內容核定」。三件事分開記錄。
- 校稿者的人工待確認標記（`【待確認：…】`、`校稿者按：…` 等）**不得**原樣進入發布正文，須列入 `work/pending_confirmations.json`。
- **逐講日期為推定值**（依音檔 mtime 與正文互證），來源未逐節公告；發布時須標「推定，待確認」。

## 3. 底本正規化與專名強制對齊

- 匯入或更新 `source_text/lecture_*.txt` 前，必須先做 Unicode NFKC 正規化，並通過 `npm run audit:reading-quality -- courses/朝聖前行課程`。
- 名相對齊優先採用底本專名（如「歡喜欲見／憶念不忘／生戀慕心」「念處、行處、證處、資糧處」），`grounding.json` 為本課程專有名相表（36 條），`learned_corrections.json` 記錄同音誤植對照。
- 同音／近音替換僅接受「保守 guard」：字級近似＋詞庫命中才套用；其餘保留原文並標 `reviewNeeded`，**不臆改**。

## 4. ASR、對齊與章界

- ASR：本機 `whisper-gpu-service:8010`，`faster-whisper-large-v3-turbo`，**600 秒切段**（單檔整段請求有逾時風險），時間碼由 chunk 偏移還原，須通過三層時間驗證。
- **章界（小標）對齊**：底本小標與 ASR 逐字比對（coverage-window），分數 < 0.6 者視為整編稿改寫。此類章界**不得**靜默猜測，改用「模型輔助定錨」（模型只能在前後已落錨章界之間挑選段落），結果記於 `work/heading_alignment.json` 的 `modelAnchors`，**一律需人工回聽確認**。
- `work/heading_alignment.json` 的 `failures` 非空＝Merge Blocker：正式檔不得放猜測時間戳。
- VAD 對唱誦段落的壓縮（例：第 1 講 142–205s 的開經偈只留下「請放掌」）**如實記錄**於 `raw_asr.json` 的 `diagnostics.suspectedNonSpeechSpans`，不得假裝已轉寫；此類缺口須在 COURSE_GUIDE 或待確認清單中揭露。

## 5. 段落切分與品質門檻

- 每句必須有句末標點；段落不得超過 35 句；單句不得過短（避免碎句）。
- 交付與合併前必跑：
  - `node scripts/check_session.mjs --file "courses/朝聖前行課程/sessions/session_0N.json" --strict --base-ref origin/main`
  - `npm run audit:reading-quality -- courses/朝聖前行課程`
  - `npm run summaries:audit`
  - `npm run test:v2` 與 `npm test`

## 6. 課程 metadata 對應

- `course.json`：課程層級狀態、`qualityReview`、`recordingPeriod`（含推定註記）。
- `toc.json`：6 節的 `sessionId`／`title`／`durationSec`／`sessionRef`。
- `audio_map.json`：短 id → 音源 URL（字串值，供前端取用）。
- `grounding.json`：本課程專有名相與參考資料清單。
- `correction-dates.html`：各節最後校訂／更新日期總表；有日期不代表已人工聽核。
