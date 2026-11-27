# 朝聖前行課程 — 參考資料 inventory（Reference inventory）

- 課程：朝聖前行課程（《朝聖前行：從歡喜欲見到依教奉行》）
- 講者：如性法師
- 期間：2026-09-25〜2026-09-28（逐講日期為推定值，見 `COURSE_GUIDE.md`）
- 查找位置：`HuanruileeDrive:2026 印度朝聖/20260925-朝聖前行課程/`（含 `原始音檔及資料/`、`朝聖前行課程文字稿校對/05_三校稿/`）與 `HuanruileeDrive:2026 印度朝聖/朝聖前行課程 - 結行指導與問答.pdf`
- 查找日期：2026-11-27
- 查找者：xiaofa（Hermes）依 `docs/REFERENCE_EVIDENCE_PROTOCOL.md` 執行

## 一句話結論

**三校稿是「整編校稿」，可用於用字與段落線索，不可推論為「一字不差的錄音原話」，亦不可宣稱「已完成人工聽核」。**
本課程**沒有任何 `audio-listened-benchmark`**（查無人工逐句聽核稿），因此成品一律為 `candidate-review-required`（待閱校）。

## 來源清單

### 1. 官方三校稿（edited-text-reference）

| referenceId | 來源檔 | 本地檔 | 來源 SHA256 | 本地 SHA256 | 涵蓋 | 覆核 |
| --- | --- | --- | --- | --- | --- | --- |
| chaosheng-base-5-1 | `05_三校稿/2026臺灣《朝聖前行課程》5-1.docx` | `courses/朝聖前行課程/source_text/lecture_01.txt` | `c47483c8b2461c1eea475bba84c33f3ddd36d65f4ab44dabfefb69496abcafd4` | `2268d33c13792d6aeab6137d605c55ea456c948f594eac958e97c5db2ecee305` | 第一講（9 個編號小標） | verified |
| chaosheng-base-5-2 | `05_三校稿/2026臺灣《朝聖前行課程》5-2.doc` | `courses/朝聖前行課程/source_text/lecture_02.txt` | `3601f498d09c1d57f7f5d18b4a10d007d8e7e25803e5279e29d0c29be8623b44` | `7919f516cc04a3400aa0412670f453d9ea777b00c3e388ba1533b69aecb2678d` | 第二講（8 個） | verified |
| chaosheng-base-5-3 | `05_三校稿/2026臺灣《朝聖前行課程》5-3.docx` | `courses/朝聖前行課程/source_text/lecture_03.txt` | `a2920969a7e00eba37641c48b9f5e1d96f380c689ee6b618a8ff4737750bc816` | `391de4075e09c6e341991b7674251a5ca7fb090f97f374ff85c1280d421896dc` | 第三講（10 個） | verified |
| chaosheng-base-5-4 | `05_三校稿/2026臺灣《朝聖前行課程》5-4.docx` | `courses/朝聖前行課程/source_text/lecture_04.txt` | `48c7ccb9f97a2325c3da996029d8a2d01da512ae81e071bfd3b1aaf8888b32bc` | `befdd7e9be0e57d28e09f944e9117df513770c0198992644187381d9c627ad78` | 第四講（12 個） | verified |
| chaosheng-base-5-5 | `05_三校稿/2026臺灣《朝聖前行課程》5-5.doc` | `courses/朝聖前行課程/source_text/lecture_05.txt` | `db7dc8e9f76b80287ec538aff88da447973dea5a6f51f5dbc0eebb9dcd1e67f2` | `d3a01d09570d8a2080087350271e1aa6fbc283ee7893de2692e335b29b54c87d` | 第五講（10 個） | verified |

- 檔案首行「課程：第N講（…）」自證 5-1↔第一講 … 5-5↔第五講。
- 5-2、5-5 為舊式 `.doc`，以 LibreOffice 轉 `txt:Text (encoded):UTF8`。
- 來源 SHA256 為轉檔前原檔；本地 SHA256 為 `scripts/chaosheng_intake.py` 清理（移除校稿者編輯指令標記）後的 repo 檔。
- **限制**：底本為已潤稿的整編稿，含口語刪節與改寫，且部分段落有重複句（轉檔或編輯殘留）。因此只用於名相校正與段落小標，**不得**用來覆蓋講者口語。

### 2. 結行問答紀要（edited-text-reference，非逐字底本）

| referenceId | 來源 | 本地檔 | SHA256 | 內容 | 覆核 |
| --- | --- | --- | --- | --- | --- |
| chaosheng-closing-outline | `2026 印度朝聖/朝聖前行課程 - 結行指導與問答.pdf` | `reviews/evidence/朝聖前行課程/reference/closing_outline.txt`（PDF 同目錄 `closing_outline.pdf`） | txt `1ff3b9e1b76053a34f2201e6ab1f6a5d19d63c7dff427df3760b6c5f40afd50d`；pdf `8ef381ab4cabd7f88fc58c83c5d156ad983868ae321ee386d8e49d7db0bb6a21` | 4 頁、去空白 4,874 字、5 組【學員提問】／【法師回答】＋【結語】 | verified |

- 密度僅 44 字/分鐘（五講三校稿約 150 字/分鐘）→ 是**提綱式問答紀要**，不是逐字稿。
- 因此第 6 節走 **ASR-primary**：正文為 ASR 轉寫＋名相校正，紀要只作 5 組問答的結構錨點。

### 3. 原始音檔（audio-source）

| referenceId | 來源檔 | 本地（不入版控） | 長度 (s) | SHA256 |
| --- | --- | --- | --- | --- |
| chaosheng-audio-01 | `原始音檔及資料/朝聖前行課程第1講.mp3` | `/var/www/remote-audio/chaosheng-qianxing-2026/CSQX_01.mp3` | 5265.144 | `eaf81ae33f5d5b03e51a0cafc8efbfa3a3dda1a500ae6c87c77bb63030970e50` |
| chaosheng-audio-02 | `…第2講.mp3` | `…/CSQX_02.mp3` | 5137.560 | `d06fcf0a0e27ad1550ac253390bda826f3c62e660b583151113efdb64df013bd` |
| chaosheng-audio-03 | `…第3講.mp3` | `…/CSQX_03.mp3` | 5831.088 | `a26f12638321c9fce41cbe826db2ed110a4951ff3e8269ca02e5ece166e112c4` |
| chaosheng-audio-04 | `…第4講.mp3` | `…/CSQX_04.mp3` | 5019.168 | `2ce2b49140911954b31c018b45a7cb942a82bfb306f21dcc893a77c06d627fd2` |
| chaosheng-audio-05 | `…第5講.mp3` | `…/CSQX_05.mp3` | 3776.544 | `147ee34cb36fd586db4762e19b6d578061efb2cacaaabf14d3eafc619f816f5d` |
| chaosheng-audio-06 | `…結行指導與問答.mp3` | `…/CSQX_06.mp3` | 6635.760 | `65c396c5a7ca54716a06a59e8825cff297bd4f29f71c84885ea6192f805a7d2e` |

- 全部 48 kbps mp3；合計 31,665 s ≈ 8.8 小時。
- 音檔不入 Git、不上傳 Drive 副本；只由 GX10 自托管串流（`Accept-Ranges: bytes`、`audio/mpeg`、無 `Content-Disposition: attachment`）。

### 4. 其他來源（查核但未採為底本）

| 類別 | 路徑 | 用途 | 狀態 |
| --- | --- | --- | --- |
| 整理稿 | `原始音檔及資料/朝聖前行課程第N講整理.pdf/.md` | 交叉比對；PDF 內有零星 `[mm:ss]` 章錨 | verified，不作時間軸 |
| 舊字幕檔 | `原始音檔及資料/朝聖前行課程第N講.md` | 交叉比對 | **mismatch**：888–1049 段，但最後時間碼一律 59:5x（只到 60 分鐘），與 mp3 長度不符 → 不採用為時間碼來源 |
| 校稿分工表 | `朝聖前行課程校稿分工與時程.xlsx` | 歷程留痕 | verified |
| 中間校稿 | `02_文字稿/`、`03_一校稿/`、`04_二校稿/` | 歷程留痕，不進 repo | verified |
| 人工聽核稿 | — | benchmark | **查無** |

## 使用角色總結

- 三校稿 5 份＝`edited-text-reference`（名相與段落骨架）
- 結行紀要＝`edited-text-reference`（僅結構線索）
- 音檔 6 檔＝`audio-source`（時間碼唯一權威）
- **無** `audio-listened-benchmark`

## 待確認項目

見 `reviews/evidence/朝聖前行課程/work/pending_confirmations.json`（5 筆：3 筆讀音／標點指令、1 筆音檔干擾缺錄、1 筆用字說明）。
