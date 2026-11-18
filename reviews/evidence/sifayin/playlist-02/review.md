# 四法印 第2講 稽核紀錄（第02講 四法印第一講：學習態度與四法印簡介）

- 影片：tLSvZzazrbM（https://www.youtube.com/watch?v=tLSvZzazrbM）
- 音檔：講師官方 MP3，3938.376 秒，sha256:00abbc8f9ed22bf80646e232ab684b6146b9b085ab19be1ace4ae957eacb344e
- 底本：講師官方整編逐字稿 PDF（sha256:faa3d8545a018a91d70a2c2e23f528a5c49b485efa37279cbc545835ac711d0d），抽取文字 10669 字（courses/四法印/source_text/lecture_02.txt）
- ASR：faster-whisper-large-v3-turbo，1356 段 / 11900 字，RTF 0.12896，尾差 9.47 秒
- 對校：官方提綱 8 段全部成為段落邊界；自動校字 49 處；記錄差異 95 處（{"editorial-divergence": 72, "punctuation-gap": 2, "overlap-skipped": 18, "stale-position": 2, "orthographic-variant": 1}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 1, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0002 | 元啟戰 | 緣起讚 | near-homophone-term | 0.745 |
| seg-0002 | 地 | 諦 | strict-homophone | 0.745 |
| seg-0003 | 記 | 偈 | strict-homophone | 0.783 |
| seg-0003 | 維 | 惟 | strict-homophone | 0.783 |
| seg-0003 | 記 | 偈 | strict-homophone | 0.783 |
| seg-0006 | 升 | 生 | strict-homophone | 0.882 |
| seg-0006 | 文 | 聞 | strict-homophone | 0.882 |
| seg-0006 | 文 | 聞 | strict-homophone | 0.882 |
| seg-0006 | 測 | 策 | strict-homophone | 0.882 |
| seg-0007 | 測 | 策 | strict-homophone | 0.765 |
| seg-0009 | 記 | 偈 | glossary-homophone | None |
| seg-0010 | 式 | 事 | glossary-homophone | None |
| seg-0017 | 文 | 聞 | strict-homophone | 0.656 |
| seg-0026 | 信 | 心 | glossary-homophone | None |
| seg-0043 | 文 | 聞 | strict-homophone | 0.609 |
| seg-0044 | 記 | 偈 | glossary-homophone | None |
| seg-0047 | 記 | 偈 | glossary-homophone | None |
| seg-0078 | 社 | 攝 | glossary-homophone | None |
| seg-0095 | 維 | 惟 | glossary-homophone | None |
| seg-0108 | 健 | 見 | glossary-homophone | None |
| seg-0128 | 正 | 證 | strict-homophone | 0.565 |
| seg-0143 | 陷 | 現 | glossary-homophone | None |
| seg-0146 | 維 | 惟 | glossary-homophone | None |
| seg-0167 | 文 | 聞 | glossary-homophone | None |
| seg-0213 | 維 | 惟 | glossary-homophone | None |
| seg-0296 | 升 | 生 | glossary-homophone | None |
| seg-0402 | 息 | 習 | glossary-homophone | None |
| seg-0402 | 遊 | 由 | glossary-homophone | None |
| seg-0453 | 維 | 惟 | glossary-homophone | None |
| seg-0472 | 維 | 惟 | glossary-homophone | None |
| seg-0739 | 社 | 攝 | glossary-homophone | None |
| seg-0846 | 維 | 惟 | glossary-homophone | None |
| seg-0856 | 維 | 惟 | glossary-homophone | None |
| seg-0863 | 維 | 惟 | glossary-homophone | None |
| seg-0880 | 涉 | 攝 | glossary-homophone | None |
| seg-1017 | 即 | 寂 | glossary-homophone | None |
| seg-1132 | 維 | 惟 | glossary-homophone | None |
| seg-1135 | 維 | 惟 | glossary-homophone | None |
| seg-1159 | 地 | 諦 | glossary-homophone | None |
| seg-1160 | 地 | 諦 | glossary-homophone | None |
| seg-1254 | 適 | 釋 | strict-homophone | 0.655 |
| seg-1259 | 息 | 習 | glossary-homophone | None |
| seg-1262 | 息 | 習 | glossary-homophone | None |
| seg-1270 | 息 | 習 | glossary-homophone | None |
| seg-1296 | 息 | 習 | glossary-homophone | None |
| seg-1298 | 限 | 現 | glossary-homophone | None |
| seg-1314 | 息 | 習 | glossary-homophone | None |
| seg-1324 | 記 | 偈 | glossary-homophone | None |
| seg-1339 | 陷 | 現 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

（無）

- 整段口語刪節／改寫（editorial-divergence）共 72 處、標點差異 2 處、正寫法差異 1 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

