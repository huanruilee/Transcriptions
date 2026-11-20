# 《三主要道》課程專屬指導（COURSE_GUIDE）

本文件適用 `courses/三主要道/`（如性法師主講・佛法實修系列一・如來法性影音頻道）。

## 1. 來源與底本屬性（`noBaseText: true`）
- **官方播放清單**：https://www.youtube.com/playlist?list=PLMngxNMnjFcM41At4494GCubGnQ5OqZC1
- **音訊來源**：每講 YouTube 說明欄均附官方 Google Drive 聲音檔下載連結與完整時間碼課程提綱；本系列未提供官方整編文字檔 PDF，採「無底本 ASR ＋ 領域詞庫校讀 ＋ 提綱切段」路徑。
- **講師歸屬**：所有 `referenceViews`、`course.json` 與導讀引述之主講者一律標註為「如性法師」。

## 2. 段落切分與閱讀品質
- YouTube 說明欄課程提綱作為**一級章節大標**；章節過長時（超過 150～350 字／約 20 句），須於 Stage 4 執行**二級語意自然段切分**。
- 常見同音防呆：比照同講師《四法印》與《釋量論》名相慣例（如 `二諦`、`四諦`、`三皈依`、`非理作意`、`無明我執`、`支分緣起`、`因果緣起`），並於校對後更新 `learned_corrections.json` 與 `grounding.json`。
- 交付與合併前必跑：`npm run audit:reading-quality -- courses/三主要道` 與 `npm run summaries:audit`。
