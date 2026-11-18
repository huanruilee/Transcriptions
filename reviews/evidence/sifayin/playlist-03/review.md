# 四法印 第3講 稽核紀錄（第03講 四法印第二講：四法印之一：諸行無常）

- 影片：SPovYO1r4ss（https://www.youtube.com/watch?v=SPovYO1r4ss）
- 音檔：講師官方 MP3，4367.784 秒，sha256:74afb9909b6475482f74e3e986f6b890cde9e6786facd05c9b71891fae089f46
- 底本：講師官方整編逐字稿 PDF（sha256:28569016ebdcd20edfdebfb8fc03a2e3e87afa9eb82e73e0ffa2a6544e9656e7），抽取文字 11602 字（courses/四法印/source_text/lecture_03.txt）
- ASR：faster-whisper-large-v3-turbo，1441 段 / 13135 字，RTF 0.13461，尾差 9.22 秒
- 對校：官方提綱 7 段全部成為段落邊界；自動校字 41 處；記錄差異 173 處（{"editorial-divergence": 105, "overlap-skipped": 60, "orthographic-variant": 1, "stale-position": 3, "unattested-homophone": 4}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 1, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0005 | 違 | 為 | strict-homophone | 0.697 |
| seg-0008 | 違 | 為 | strict-homophone | 0.667 |
| seg-0009 | 合 | 和 | strict-homophone | 0.607 |
| seg-0012 | 帶 | 待 | glossary-homophone | None |
| seg-0012 | 違 | 為 | strict-homophone | 0.582 |
| seg-0016 | 帶 | 待 | glossary-homophone | None |
| seg-0016 | 關 | 觀 | glossary-homophone | None |
| seg-0024 | 帶 | 待 | glossary-homophone | None |
| seg-0026 | 帶 | 待 | glossary-homophone | None |
| seg-0092 | 織 | 支 | glossary-homophone | None |
| seg-0094 | 維 | 惟 | glossary-homophone | None |
| seg-0101 | 例 | 立 | glossary-homophone | None |
| seg-0102 | 例 | 立 | glossary-homophone | None |
| seg-0108 | 程 | 成 | glossary-homophone | None |
| seg-0112 | 帶 | 待 | glossary-homophone | None |
| seg-0119 | 帶 | 待 | glossary-homophone | None |
| seg-0141 | 違 | 為 | strict-homophone | 0.571 |
| seg-0143 | 帶 | 待 | glossary-homophone | None |
| seg-0143 | 程 | 成 | glossary-homophone | None |
| seg-0210 | 留 | 流 | glossary-homophone | None |
| seg-0240 | 序 | 續 | glossary-homophone | None |
| seg-0241 | 序 | 續 | glossary-homophone | None |
| seg-0292 | 序 | 續 | glossary-homophone | None |
| seg-0296 | 序 | 續 | glossary-homophone | None |
| seg-0297 | 序 | 續 | glossary-homophone | None |
| seg-0513 | 戴 | 待 | glossary-homophone | None |
| seg-0527 | 和 | 合 | strict-homophone | 0.71 |
| seg-0555 | 維 | 惟 | glossary-homophone | None |
| seg-0561 | 蓄 | 續 | glossary-homophone | None |
| seg-0839 | 和 | 合 | strict-homophone | 0.591 |
| seg-0854 | 和 | 合 | strict-homophone | 0.591 |
| seg-0898 | 序 | 續 | glossary-homophone | None |
| seg-0905 | 序 | 續 | glossary-homophone | None |
| seg-0908 | 消 | 銷 | glossary-homophone | None |
| seg-0911 | 賢 | 咸 | glossary-homophone | None |
| seg-0917 | 消 | 銷 | glossary-homophone | None |
| seg-0919 | 賢 | 咸 | glossary-homophone | None |
| seg-0927 | 違 | 為 | strict-homophone | 0.55 |
| seg-0941 | 消 | 銷 | glossary-homophone | None |
| seg-1427 | 消 | 銷 | glossary-homophone | None |
| seg-1438 | 消 | 銷 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0189 | 的 | 地 | unattested-homophone |
| seg-0192 | 的 | 地 | unattested-homophone |
| seg-0193 | 的 | 地 | unattested-homophone |
| seg-0200 | 的 | 地 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 105 處、標點差異 0 處、正寫法差異 1 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

