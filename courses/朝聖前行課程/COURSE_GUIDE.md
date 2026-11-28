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

## 7. 第二輪精準校對（full large-v3 複辨＋AGY 裁決）

- 對象：第一輪機器層校字後仍標 `reviewNeeded` 的全部 274 句（六節合計 60／48／28／53／20／65）。
- 流程：先裁出每句前後 2–4 秒音窗（`recheck/windows/`），以 `faster-whisper large-v3`（**`int8_float16`**、`vad_filter=false`；GB10 上 float16 會 CUDA OOM）複辨，再由 AGY 對照「現文／原始 ASR／large-v3 複辨」逐句裁決，輸出 `KEEP`／`CORRECT`／`NEEDS_AUDIO`。
- 套用規則（`scripts/chaosheng_apply_adjudication.py`）：只套用有依據者——01–05 以官方整編校稿的名相寫法為依據，06 僅接受 large-v3 明確支持或全篇一致性的法相專名；**僅憑語意臆測一律不套用**。人工否決（如「分別智」不得改成「分別知」）以明確清單表達並留痕。
- 結果：套用 166 句、機器判定原文無誤 78 句、仍待人工聽核 30 句；逐筆稽核見 `reviews/evidence/朝聖前行課程/work/adjudication_v3.json`。
- 待人工聽核清單見 `courses/朝聖前行課程/PENDING_REVIEW.md`（含校稿者原留 5 筆人工確認事項與 AGY 建議）。**該清單不得併入發布正文。**
- 本輪仍**未做人工逐句聽核**，`humanListened` 一律維持 `false`，成品維持待閱校版。

## 8. 第三輪全稿複審（MiniMax-M3.1-Flash）

- 對象：六節**全部**已發布句（2,878 句），非只挑 `reviewNeeded`。切成 45 句區塊（67 個）交 MiniMax-M3.1-Flash 逐句審閱。
- 約束：只允許提出「句內局部替換或刪除」，禁止改句界、整句重寫或跨句合併；口語互動、問答、雙關語一律視為原話。
- 驗證：每筆發現須通過「現文完全一致」與「find 在句中唯一」才計入（233 筆原始 → 211 筆有效）；套用前另有數字不變、簡體字、句末標點、長度變動 ≤6 字四道護欄。
- 證據分級：01–05 以官方整編校稿（底本）為據；06 無底本，只接受課內用語一致或語意唯一者。本輪當時**未做**新的 full large-v3 複辨（`strata-qwen38` 佔用 GPU，載入 large-v3 即 CUDA OOM），先以 large-v3-turbo（`vad_filter=false`）對 104 個候選音窗做旁證；**GPU 空出後已補做 full large-v3，見第 9 節**。
- 結果：套用 86 筆局部修正、明確否決 19 筆、新增 13 項待人工聽核；逐筆見 `reviews/evidence/朝聖前行課程/work/minimax_review/applied_ledger.json`。
- 已否決的重點：`座間`（座上修／座間修為標準用語）、《辨了不了義善說藏論》書名、`會跟／慧根`雙關、`心類學`、`攝類學 2.0`。
- 本輪同樣**未做人工聽核**，`humanListened` 維持 `false`；「已套用」僅表示機器與文獻層一致，不代表音訊忠實度已確認。

## 9. 第三輪音訊複核（full large-v3，178 音窗）

- 觸發：第 8 節只做到 large-v3-turbo 旁證（GPU 被 `strata-qwen38` 佔滿，載入 large-v3 即 CUDA OOM）。GPU 空出後補做獨立複辨，把「已套用」從文獻層推到音訊層。
- 做法：對第 8 節送審時抽出的 178 個音窗（`m01_0014` … `m06_0539`，每窗含原句前後約 2 秒）以容器內 large-v3 重新轉寫（本地 snapshot、`int8_float16`、`vad_filter=false`、`language=zh`、`beam_size=1`）；模型載入 4.4 秒、單窗 1.5–4 秒，全批約 5 分鐘，輸出 `recheck/asr_v3_out/`。
- 覆蓋：86 筆套用修正中 83 筆有對應音窗（01 缺 3 筆：希求信／勝解信／希求信，該三句已由底本直接確認）。
- 判讀原則：ASR **只用來判斷「音訊更接近哪一版」，不直接改稿**；同音字（諦/地、寺/四、啟/起、弘/同、涅槃/寧、依止力/一指力、皈依/歸一）不能當反證。有底本者以底本為最終依據；06 無底本者需 large-v3 與 turbo 兩次一致。
- 結果：**回退 8 筆過度修正**（全部改回與底本或雙 ASR 一致的讀法），逐筆見 `reviews/evidence/朝聖前行課程/work/asr_v3_fixes.json`：

| 節／句 | 第三輪誤改 | 回退為 | 依據 |
| --- | --- | --- | --- |
| 02/125 | 只要我們學法的心態 | 那只要我們學法的心態 | 底本 5-2 |
| 02/271 | 用在請佛住世 | 用在請佛住世上 | 底本 5-2 |
| 03/167 | 進入境地的範疇 | 進入**集諦**的範疇 | 底本 5-3「這就要進入集諦的範疇」 |
| 04/130 | 因果、四諦、**五蘊** | 因果、四諦、**無我** | 底本 5-2「因果、四諦、無我」 |
| 04/161 | 在按部就班的執行 | 在按部計畫的執行 | 底本 5-4「我在按部計畫地執行嗎，按部就班地執行嗎」 |
| 05/178 | 去聽了一期共學 | 去聽了一組的共學 | 底本 5-5 |
| 06/131 | 用那個**比例**去衡量 | 用那個**比重**去衡量 | large-v3 與 turbo 兩次均作「比重」 |
| 06/516 | 因果、四諦、**五蘊** | 因果、四諦、**無我** | large-v3「無我」＋04 底本法類三句 |

- 教訓：MiniMax 傾向把口語「改通順」（五我→五蘊、極地→境地、比例化），看起來更漂亮卻偏離原話；**同音誤聽的還原要靠底本與法類系統，不能靠語感**（「因果、四諦、無我」是三法類固定組合）。
- 本輪仍**未做人工聽核**：`_meta.asrVerifyRecord.humanListened` 一律 `false`，成品維持待閱校版。
