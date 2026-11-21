# 《四法印》課程專屬指導（COURSE_GUIDE）

本文件適用 `courses/四法印/`（如性法師主講・2020 臺灣營隊・如來法性影音頻道）。

## 1. 來源與底本屬性（`noBaseText: false`）
- **官方底本**：每講 YouTube 說明欄皆附官方整編文字檔 PDF 與官方音檔，已收錄於 `courses/四法印/source_text/lecture_01.txt` ～ `lecture_11.txt` 及 `grounding.json`。
- **權威分工**：佛法名相與引文以官方底本為準；時間碼一律以 ASR 為準。

## 2. 底本正規化與專名強制對齊
- 匯入或更新 `source_text/lecture_*.txt` 前，必須先執行 **Unicode NFKC 正規化**（清除 PDF 擷取殘留之康熙／CJK 相容字元，如 `教㈻藍圖㆗` → `教學藍圖中`），並通過 `npm run audit:reading-quality -- courses/四法印` 之 NFKC 檢查。
- 必須以官方底本專名優先對齊 ASR，嚴防高頻同音誤植（如：`二地→二諦`、`四地→四諦`、`三歸一→三皈依`、`十六形象→十六行相`、`四聖地→四聖諦`）。

## 3. 段落切分與品質門檻
- YouTube 說明欄提綱僅作**一級章節大標**；單章節超過 150～350 字（約 15～20 句）時，必須細分為**二級自然段**並加上編號義理小標。
- 交付與合併前必跑：`npm run audit:reading-quality -- courses/四法印` 與 `npm run summaries:audit`。
