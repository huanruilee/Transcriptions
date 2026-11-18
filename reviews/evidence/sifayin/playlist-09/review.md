# 四法印 第9講 稽核紀錄（第09講 四法印第八講：探討我們心中所想的我）

- 影片：bAuJq_T43S4（https://www.youtube.com/watch?v=bAuJq_T43S4）
- 音檔：講師官方 MP3，4259.616 秒，sha256:a9ae8f736cab9a26648c27b370a443b25b60101d2d9f13a896f13b5aab55941f
- 底本：講師官方整編逐字稿 PDF（sha256:f778a821acae06520cd8d6d2b35f00c2229efc5fde7e729b496c629c04e80e30），抽取文字 9343 字（courses/四法印/source_text/lecture_09.txt）
- ASR：faster-whisper-large-v3-turbo，1441 段 / 11154 字，RTF 0.16062，尾差 9.08 秒
- 對校：官方提綱 4 段全部成為段落邊界；自動校字 46 處；記錄差異 177 處（{"punctuation-gap": 3, "editorial-divergence": 101, "stale-position": 9, "unattested-homophone": 2, "orthographic-variant": 3, "overlap-skipped": 59}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 2, "referenceViews": 2}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0002 | 夜 | 業 | glossary-homophone | None |
| seg-0002 | 運 | 蘊 | strict-homophone | 0.734 |
| seg-0002 | 夜 | 業 | strict-homophone | 0.734 |
| seg-0002 | 夜 | 業 | strict-homophone | 0.734 |
| seg-0002 | 夜 | 業 | strict-homophone | 0.734 |
| seg-0003 | 運 | 蘊 | glossary-homophone | None |
| seg-0003 | 運 | 蘊 | glossary-homophone | None |
| seg-0003 | 運 | 蘊 | glossary-homophone | None |
| seg-0004 | 勁 | 境 | near-homophone-term | 0.565 |
| seg-0007 | 運 | 蘊 | glossary-homophone | None |
| seg-0007 | 夜 | 業 | strict-homophone | 0.688 |
| seg-0007 | 勁 | 境 | near-homophone-term | 0.688 |
| seg-0007 | 運 | 蘊 | strict-homophone | 0.688 |
| seg-0008 | 運 | 蘊 | strict-homophone | 0.822 |
| seg-0009 | 五 | 我 | near-homophone-term | 0.817 |
| seg-0009 | 勁 | 境 | near-homophone-term | 0.817 |
| seg-0009 | 五 | 我 | near-homophone-term | 0.817 |
| seg-0012 | 映 | 應 | strict-homophone | 0.783 |
| seg-0012 | 綜藝 | 宗義 | strict-homophone | 0.783 |
| seg-0023 | 維 | 惟 | glossary-homophone | None |
| seg-0024 | 維 | 惟 | glossary-homophone | None |
| seg-0043 | 孕 | 蘊 | strict-homophone | 0.571 |
| seg-0044 | 孕 | 蘊 | strict-homophone | 0.583 |
| seg-0067 | 孕 | 蘊 | strict-homophone | 0.591 |
| seg-0068 | 孕 | 蘊 | glossary-homophone | None |
| seg-0081 | 陷 | 現 | glossary-homophone | None |
| seg-0090 | 孕 | 蘊 | glossary-homophone | None |
| seg-0099 | 孕 | 蘊 | glossary-homophone | None |
| seg-0110 | 孕 | 蘊 | strict-homophone | 0.556 |
| seg-0121 | 佈 | 布 | glossary-homophone | None |
| seg-0172 | 佈 | 布 | glossary-homophone | None |
| seg-0181 | 運 | 蘊 | glossary-homophone | None |
| seg-0186 | 佈 | 布 | glossary-homophone | None |
| seg-0188 | 運 | 蘊 | strict-homophone | 0.591 |
| seg-0190 | 運 | 蘊 | glossary-homophone | None |
| seg-0483 | 佈 | 布 | glossary-homophone | None |
| seg-0484 | 佈 | 布 | glossary-homophone | None |
| seg-0527 | 佈 | 布 | glossary-homophone | None |
| seg-0537 | 佈 | 布 | glossary-homophone | None |
| seg-0678 | 直 | 執 | glossary-homophone | None |
| seg-0688 | 韻 | 蘊 | strict-homophone | 0.571 |
| seg-0691 | 佈 | 布 | glossary-homophone | None |
| seg-0722 | 韻 | 蘊 | strict-homophone | 0.571 |
| seg-0773 | 支 | 知 | glossary-homophone | None |
| seg-1215 | 韻 | 蘊 | glossary-homophone | None |
| seg-1245 | 掌 | 長 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0009 | 的 | 地 | unattested-homophone |
| seg-0009 | 的 | 地 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 101 處、標點差異 3 處、正寫法差異 3 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

