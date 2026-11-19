# 四法印 第1講 稽核紀錄（第01講 導論：法師的教學藍圖與建議）

- 影片：dAyrtR6hQik（https://www.youtube.com/watch?v=dAyrtR6hQik）
- 音檔：講師官方 MP3，2177.52 秒，sha256:63f0a9305efa5e5dea0c0fa17d8fae09bb4b337bfd477bfde08c9486ad079afc
- 底本：講師官方整編逐字稿 PDF（sha256:78b6fa41b283c139afd5ef707f3badcf1939376f6cb16539546ba801b4bcc537），抽取文字 5665 字（courses/四法印/source_text/lecture_01.txt）
- ASR：faster-whisper-large-v3-turbo，551 段 / 6143 字，RTF 0.06824，尾差 15.39 秒
- 對校：官方提綱 3 段全部成為段落邊界；自動校字 68 處；記錄差異 0 處（{}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 2, "discussionTopics": 2, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 |
|---|---|---|---|
| seg-0014 | 地 | 諦 | same-length-homophone |
| seg-0014 | 適 | 釋 | same-length-homophone |
| seg-0017 | 地 | 諦 | same-length-homophone |
| seg-0017 | 地 | 諦 | same-length-homophone |
| seg-0019 | 地 | 諦 | same-length-homophone |
| seg-0019 | 地 | 諦 | same-length-homophone |
| seg-0021 | 適 | 釋 | glossary-homophone |
| seg-0022 | 社 | 攝 | same-length-homophone |
| seg-0022 | 適 | 釋 | glossary-homophone |
| seg-0024 | 適 | 釋 | glossary-homophone |
| seg-0033 | 身 | 深 | same-length-homophone |
| seg-0034 | 設 | 攝 | same-length-homophone |
| seg-0053 | 元 | 緣 | same-length-homophone |
| seg-0055 | 元 | 緣 | same-length-homophone |
| seg-0056 | 射 | 攝 | same-length-homophone |
| seg-0057 | 設 | 攝 | same-length-homophone |
| seg-0059 | 衣術 | 意疏 | same-length-homophone |
| seg-0061 | 社 | 攝 | same-length-homophone |
| seg-0070 | 羞 | 修 | glossary-homophone |
| seg-0084 | 羞恥 | 修持 | same-length-homophone |
| seg-0090 | 世 | 士 | same-length-homophone |
| seg-0091 | 升 | 生 | same-length-homophone |
| seg-0094 | 升 | 生 | same-length-homophone |
| seg-0096 | 世 | 士 | same-length-homophone |
| seg-0097 | 世 | 士 | same-length-homophone |
| seg-0102 | 升 | 生 | glossary-homophone |
| seg-0114 | 世 | 士 | same-length-homophone |
| seg-0114 | 維 | 惟 | same-length-homophone |
| seg-0114 | 及 | 集 | same-length-homophone |
| seg-0137 | 世 | 士 | same-length-homophone |
| seg-0137 | 世 | 士 | same-length-homophone |
| seg-0152 | 地 | 諦 | same-length-homophone |
| seg-0152 | 地 | 諦 | same-length-homophone |
| seg-0152 | 地 | 諦 | same-length-homophone |
| seg-0152 | 歸一 | 皈依 | same-length-homophone |
| seg-0172 | 地 | 諦 | same-length-homophone |
| seg-0177 | 理 | 力 | same-length-homophone |
| seg-0201 | 社 | 攝 | glossary-homophone |
| seg-0214 | 社 | 攝 | same-length-homophone |
| seg-0214 | 社 | 攝 | glossary-homophone |
| seg-0225 | 維 | 惟 | same-length-homophone |
| seg-0228 | 社 | 攝 | glossary-homophone |
| seg-0230 | 靜 | 境 | same-length-homophone |
| seg-0230 | 靜 | 境 | same-length-homophone |
| seg-0230 | 社 | 攝 | glossary-homophone |
| seg-0235 | 維 | 惟 | same-length-homophone |
| seg-0243 | 關 | 觀 | same-length-homophone |
| seg-0243 | 佈 | 布 | same-length-homophone |
| seg-0249 | 社 | 攝 | same-length-homophone |
| seg-0249 | 關 | 觀 | same-length-homophone |
| seg-0280 | 升 | 生 | same-length-homophone |
| seg-0294 | 地 | 諦 | glossary-homophone |
| seg-0305 | 四 | 寺 | same-length-homophone |
| seg-0307 | 四 | 寺 | same-length-homophone |
| seg-0310 | 社 | 攝 | same-length-homophone |
| seg-0323 | 社 | 攝 | same-length-homophone |
| seg-0327 | 升 | 生 | same-length-homophone |
| seg-0329 | 升 | 生 | same-length-homophone |
| seg-0341 | 升 | 生 | same-length-homophone |
| seg-0341 | 升 | 生 | same-length-homophone |
| seg-0354 | 值 | 執 | glossary-homophone |
| seg-0356 | 值 | 執 | same-length-homophone |
| seg-0359 | 升 | 生 | same-length-homophone |
| seg-0359 | 值 | 執 | glossary-homophone |
| seg-0387 | 升 | 生 | glossary-homophone |
| seg-0406 | 隻 | 指 | glossary-homophone |
| seg-0453 | 社 | 攝 | same-length-homophone |
| seg-0483 | 去 | 趣 | same-length-homophone |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

（無）

- 整段口語刪節／改寫（editorial-divergence）共 0 處、標點差異 0 處、正寫法差異 0 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

