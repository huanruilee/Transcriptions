# 三主要道 逐字稿 → Google Doc 管線（SZYD-GDOC-20261123）

把 `sessions/session_{01..24}.json`（既有整編逐字稿）加工成「忠實原話閱讀版」
Markdown／DOCX，再以 rclone import 上傳為**原生 Google Doc**。

## 設計要點

1. **ASR 輸出的是語意片段，不是句子**——逐句強制加標點會得到大量畸形結果。
   標點在**渲染層機械合併**（`build_docx.py: merge_clauses`）：子句以 。？！ 結尾者
   自成句；否則以「，」連接；群末補「。」。只插標點，不增刪任何漢字。
2. **LLM 只做需要跨句語意的工作**：段落切點（segment）＋錯字校正（correct）。
3. **高置信同音錯字先過確定性詞庫**（`run_lecture.py: RULEBOOK`，ledger round 0），
   LLM 雙輪只補長尾。
4. **每筆修正都入 ledger**（`{id, round, before, after, reason, why}`），
   未被接受者不入正文，原始 ASR 保留於 `session_*.json` 的 `rawText`。
5. **透明揭露**：來源檔混入的 AI 摘要句（02/07/11/12/21 五講段0句0）不進正文，
   文末「編輯註記」列出原文；多語 ASR 幻覺雜訊（L09/L14）同樣標記待人工聽核。

## 驗證門檻（build_docx.py verify）

- 正文無全形空白分隔、無句內空格、無簡體殘留
- 逐句全覆蓋（忽略標點與空白差異；AI 摘要句除外）
- **每個渲染行以終止標點結尾**、標點間距 ≤ 40 字
- 稿內含「待閱校」聲明

## 用法

```sh
P=/home/henry/.gx10/projects/szyd-gdoc/.venv/bin/python
$P run_lecture.py --stage all --lecture 3     # 全階段（可續跑）
$P build_doc_json.py 3                         # → sessions_doc/L03.doc.json
$P build_docx.py render 3                      # → out/L03.md
$P build_docx.py verify out/L03.md 3
$P build_docx.py docx out/L03.md out/L03.docx
$P driver.py 1 8                               # 批次 1..8
$P upload.py                                   # 上傳至 HuanruileeDrive
$P build_toc.py                                # 產生總目錄
```

環境變數：`SZYD_THREADS`（並行路數，預設 6）、LLM 端點 `BASE`（預設本機
`http://100.113.144.100:18765`）。

## 上傳目的地

`HuanruileeDrive:如性法師/如性法師課程/`（= huanruilee.us@gmail.com，已用
Drive `about` 實測）。檔名 `三主要道 第NN講 <副題>（待閱校版）.docx`。
`rclone link` 對原生 Doc 回傳 `drive.google.com/open?id=<ID>`，需轉成
`https://docs.google.com/document/d/<ID>/edit`。

## 已知限制

- 成品為**待閱校版**，未經人工逐句聽核。
- 共享 OAuth 客戶端有每分鐘查詢上限（429/403），批次上傳須退避重試。
- 衍生檔不回寫 repo session；正式修正需另開 PR。
