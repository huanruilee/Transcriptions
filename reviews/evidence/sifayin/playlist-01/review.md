# 四法印 第1講 稽核紀錄（第01講 導論：法師的教學藍圖與建議）

- 影片：dAyrtR6hQik（https://www.youtube.com/watch?v=dAyrtR6hQik）
- 音檔：講師官方 MP3，2177.52 秒，sha256:63f0a9305efa5e5dea0c0fa17d8fae09bb4b337bfd477bfde08c9486ad079afc
- 底本：講師官方整編逐字稿 PDF（sha256:78b6fa41b283c139afd5ef707f3badcf1939376f6cb16539546ba801b4bcc537），抽取文字 5665 字（courses/四法印/source_text/lecture_01.txt）
- ASR：faster-whisper-large-v3-turbo，551 段 / 6143 字，RTF 0.06824，尾差 15.39 秒
- 對校：官方提綱 3 段全部成為段落邊界；自動校字 46 處；記錄差異 120 處（{"editorial-divergence": 95, "overlap-skipped": 23, "orthographic-variant": 1, "stale-position": 1}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 2, "discussionTopics": 2, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0014 | 適 | 釋 | strict-homophone | 0.571 |
| seg-0014 | 地 | 諦 | strict-homophone | 0.571 |
| seg-0019 | 地 | 諦 | strict-homophone | 0.643 |
| seg-0019 | 地 | 諦 | strict-homophone | 0.643 |
| seg-0021 | 適 | 釋 | glossary-homophone | None |
| seg-0022 | 適 | 釋 | glossary-homophone | None |
| seg-0024 | 適 | 釋 | glossary-homophone | None |
| seg-0026 | 事 | 世 | strict-homophone | 0.583 |
| seg-0035 | 設 | 攝 | strict-homophone | 0.652 |
| seg-0053 | 元 | 緣 | strict-homophone | 0.677 |
| seg-0055 | 元 | 緣 | strict-homophone | 0.55 |
| seg-0057 | 設 | 攝 | strict-homophone | 0.676 |
| seg-0069 | 諦 | 地 | glossary-homophone | None |
| seg-0077 | 諜 | 地 | near-homophone-term | 0.585 |
| seg-0092 | 升 | 生 | glossary-homophone | None |
| seg-0094 | 升 | 生 | glossary-homophone | None |
| seg-0096 | 世 | 士 | strict-homophone | 0.55 |
| seg-0097 | 世 | 士 | strict-homophone | 0.565 |
| seg-0102 | 升 | 生 | glossary-homophone | None |
| seg-0116 | 維 | 惟 | glossary-homophone | None |
| seg-0153 | 地 | 諦 | strict-homophone | 0.583 |
| seg-0176 | 地 | 諦 | glossary-homophone | None |
| seg-0202 | 社 | 攝 | glossary-homophone | None |
| seg-0215 | 社 | 攝 | glossary-homophone | None |
| seg-0217 | 社 | 攝 | glossary-homophone | None |
| seg-0229 | 社 | 攝 | glossary-homophone | None |
| seg-0230 | 社 | 攝 | glossary-homophone | None |
| seg-0233 | 靜 | 境 | glossary-homophone | None |
| seg-0235 | 維 | 惟 | glossary-homophone | None |
| seg-0249 | 社 | 攝 | glossary-homophone | None |
| seg-0281 | 升 | 生 | glossary-homophone | None |
| seg-0296 | 地 | 諦 | glossary-homophone | None |
| seg-0305 | 四 | 寺 | strict-homophone | 0.591 |
| seg-0311 | 社 | 攝 | glossary-homophone | None |
| seg-0324 | 社 | 攝 | strict-homophone | 0.571 |
| seg-0327 | 升 | 生 | glossary-homophone | None |
| seg-0329 | 升 | 生 | glossary-homophone | None |
| seg-0341 | 升 | 生 | glossary-homophone | None |
| seg-0344 | 升 | 生 | glossary-homophone | None |
| seg-0355 | 值 | 執 | glossary-homophone | None |
| seg-0358 | 值 | 執 | glossary-homophone | None |
| seg-0360 | 升 | 生 | glossary-homophone | None |
| seg-0361 | 值 | 執 | glossary-homophone | None |
| seg-0387 | 升 | 生 | glossary-homophone | None |
| seg-0456 | 社 | 攝 | glossary-homophone | None |
| seg-0484 | 去 | 趣 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

（無）

- 整段口語刪節／改寫（editorial-divergence）共 95 處、標點差異 0 處、正寫法差異 1 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

