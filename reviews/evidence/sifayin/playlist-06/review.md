# 四法印 第6講 稽核紀錄（第06講 四法印第五講：探討心的作用與有無造物主）

- 影片：oCQU-3ggipM（https://www.youtube.com/watch?v=oCQU-3ggipM）
- 音檔：講師官方 MP3，5208.696 秒，sha256:c595dd8670e81d3f6408857e37bb91f41bcb81961f7d78a04867c9bf4eaea215
- 底本：講師官方整編逐字稿 PDF（sha256:da401b224779aeb445f4575af96addc07f0c2d03876322b5545473163d1f272b），抽取文字 13588 字（courses/四法印/source_text/lecture_06.txt）
- ASR：faster-whisper-large-v3-turbo，1548 段 / 16448 字，RTF 0.14764，尾差 -3.95 秒
- 對校：官方提綱 8 段全部成為段落邊界；自動校字 113 處；記錄差異 339 處（{"editorial-divergence": 255, "overlap-skipped": 67, "stale-position": 9, "punctuation-gap": 3, "orthographic-variant": 5}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 2, "discussionTopics": 2, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0010 | 進 | 近 | strict-homophone | 0.591 |
| seg-0012 | 進 | 近 | glossary-homophone | None |
| seg-0014 | 進 | 近 | glossary-homophone | None |
| seg-0015 | 聚 | 俱 | glossary-homophone | None |
| seg-0016 | 進 | 近 | strict-homophone | 0.609 |
| seg-0020 | 巨 | 俱 | strict-homophone | 0.654 |
| seg-0023 | 進 | 近 | glossary-homophone | None |
| seg-0024 | 進 | 近 | strict-homophone | 0.697 |
| seg-0026 | 進 | 近 | strict-homophone | 0.618 |
| seg-0027 | 巨 | 俱 | glossary-homophone | None |
| seg-0028 | 進 | 近 | strict-homophone | 0.771 |
| seg-0041 | 進 | 近 | strict-homophone | 0.565 |
| seg-0046 | 席 | 習 | glossary-homophone | None |
| seg-0047 | 席 | 習 | glossary-homophone | None |
| seg-0060 | 席 | 習 | glossary-homophone | None |
| seg-0061 | 席 | 習 | glossary-homophone | None |
| seg-0063 | 席 | 習 | strict-homophone | 0.621 |
| seg-0074 | 席 | 習 | glossary-homophone | None |
| seg-0095 | 席 | 習 | glossary-homophone | None |
| seg-0099 | 陷 | 現 | strict-homophone | 0.596 |
| seg-0103 | 席 | 習 | glossary-homophone | None |
| seg-0106 | 陷 | 現 | glossary-homophone | None |
| seg-0107 | 席 | 習 | strict-homophone | 0.675 |
| seg-0108 | 席 | 習 | strict-homophone | 0.619 |
| seg-0108 | 有 | 由 | strict-homophone | 0.619 |
| seg-0133 | 精油 | 經由 | strict-homophone | 0.591 |
| seg-0162 | 維 | 惟 | glossary-homophone | None |
| seg-0165 | 維 | 惟 | glossary-homophone | None |
| seg-0166 | 維 | 惟 | glossary-homophone | None |
| seg-0167 | 維 | 惟 | glossary-homophone | None |
| seg-0168 | 維 | 惟 | glossary-homophone | None |
| seg-0169 | 維 | 惟 | glossary-homophone | None |
| seg-0171 | 維 | 惟 | glossary-homophone | None |
| seg-0171 | 維 | 惟 | glossary-homophone | None |
| seg-0172 | 維 | 惟 | glossary-homophone | None |
| seg-0172 | 維 | 惟 | glossary-homophone | None |
| seg-0182 | 維 | 惟 | glossary-homophone | None |
| seg-0194 | 席 | 習 | glossary-homophone | None |
| seg-0226 | 靖 | 境 | glossary-homophone | None |
| seg-0228 | 靖 | 境 | glossary-homophone | None |
| seg-0304 | 席 | 習 | glossary-homophone | None |
| seg-0318 | 陷 | 現 | glossary-homophone | None |
| seg-0323 | 陷 | 現 | glossary-homophone | None |
| seg-0326 | 席 | 習 | glossary-homophone | None |
| seg-0327 | 席 | 習 | glossary-homophone | None |
| seg-0331 | 席 | 習 | glossary-homophone | None |
| seg-0347 | 席 | 習 | glossary-homophone | None |
| seg-0351 | 席 | 習 | glossary-homophone | None |
| seg-0369 | 嗔 | 瞋 | glossary-homophone | None |
| seg-0375 | 席 | 習 | glossary-homophone | None |
| seg-0378 | 席 | 習 | glossary-homophone | None |
| seg-0399 | 席 | 習 | glossary-homophone | None |
| seg-0400 | 席 | 習 | glossary-homophone | None |
| seg-0407 | 席 | 習 | glossary-homophone | None |
| seg-0409 | 維 | 惟 | glossary-homophone | None |
| seg-0411 | 席 | 習 | glossary-homophone | None |
| seg-0420 | 席 | 習 | glossary-homophone | None |
| seg-0428 | 伏 | 符 | strict-homophone | 0.55 |
| seg-0432 | 席 | 習 | glossary-homophone | None |
| seg-0433 | 席 | 習 | glossary-homophone | None |
| seg-0434 | 席 | 習 | glossary-homophone | None |
| seg-0442 | 席 | 習 | strict-homophone | 0.64 |
| seg-0443 | 席 | 習 | glossary-homophone | None |
| seg-0451 | 嗔 | 瞋 | glossary-homophone | None |
| seg-0451 | 陷 | 現 | glossary-homophone | None |
| seg-0452 | 直 | 執 | glossary-homophone | None |
| seg-0455 | 席 | 習 | glossary-homophone | None |
| seg-0457 | 席 | 習 | glossary-homophone | None |
| seg-0462 | 直 | 執 | glossary-homophone | None |
| seg-0475 | 嗔 | 瞋 | strict-homophone | 0.55 |
| seg-0480 | 席 | 習 | glossary-homophone | None |
| seg-0489 | 進 | 近 | strict-homophone | 0.578 |
| seg-0538 | 進 | 近 | glossary-homophone | None |
| seg-0539 | 違 | 為 | strict-homophone | 0.606 |
| seg-0541 | 帶 | 待 | glossary-homophone | None |
| seg-0543 | 進 | 近 | glossary-homophone | None |
| seg-0573 | 維 | 惟 | glossary-homophone | None |
| seg-0574 | 維 | 惟 | glossary-homophone | None |
| seg-0577 | 維 | 惟 | glossary-homophone | None |
| seg-0723 | 藝 | 義 | glossary-homophone | None |
| seg-0801 | 關 | 觀 | glossary-homophone | None |
| seg-0802 | 關帶 | 觀待 | strict-homophone | 0.553 |
| seg-0807 | 綜 | 宗 | glossary-homophone | None |
| seg-0897 | 適 | 釋 | glossary-homophone | None |
| seg-0920 | 綜 | 宗 | glossary-homophone | None |
| seg-0930 | 綜 | 宗 | glossary-homophone | None |
| seg-0942 | 適 | 釋 | glossary-homophone | None |
| seg-0953 | 元 | 緣 | glossary-homophone | None |
| seg-0956 | 元 | 緣 | glossary-homophone | None |
| seg-0957 | 元 | 緣 | glossary-homophone | None |
| seg-0974 | 元 | 緣 | glossary-homophone | None |
| seg-0979 | 元 | 緣 | glossary-homophone | None |
| seg-0983 | 元 | 緣 | glossary-homophone | None |
| seg-0992 | 元 | 緣 | glossary-homophone | None |
| seg-1014 | 違 | 為 | strict-homophone | 0.558 |
| seg-1017 | 元 | 緣 | glossary-homophone | None |
| seg-1019 | 違 | 為 | strict-homophone | 0.577 |
| seg-1029 | 賢 | 咸 | glossary-homophone | None |
| seg-1030 | 賢 | 咸 | strict-homophone | 0.558 |
| seg-1038 | 試 | 釋 | strict-homophone | 0.625 |
| seg-1042 | 試 | 釋 | glossary-homophone | None |
| seg-1084 | 升 | 生 | glossary-homophone | None |
| seg-1093 | 音 | 陰 | glossary-homophone | None |
| seg-1096 | 音 | 陰 | glossary-homophone | None |
| seg-1123 | 音 | 陰 | glossary-homophone | None |
| seg-1124 | 去 | 趣 | glossary-homophone | None |
| seg-1125 | 音 | 陰 | glossary-homophone | None |
| seg-1127 | 音 | 陰 | glossary-homophone | None |
| seg-1179 | 音 | 陰 | strict-homophone | 0.571 |
| seg-1185 | 音 | 陰 | strict-homophone | 0.591 |
| seg-1354 | 息 | 習 | glossary-homophone | None |
| seg-1354 | 遊 | 由 | glossary-homophone | None |
| seg-1360 | 升 | 生 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

（無）

- 整段口語刪節／改寫（editorial-divergence）共 255 處、標點差異 3 處、正寫法差異 5 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

