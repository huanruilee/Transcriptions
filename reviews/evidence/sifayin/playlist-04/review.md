# 四法印 第4講 稽核紀錄（第04講 四法印第三講：死亡不是人生的終點）

- 影片：BdOVte3o6kc（https://www.youtube.com/watch?v=BdOVte3o6kc）
- 音檔：講師官方 MP3，5174.616 秒，sha256:0d3937db28da67f128656a884c34632c9bce00429408330b2fcf71ebb14302ea
- 底本：講師官方整編逐字稿 PDF（sha256:f2662173a2bb98f49b5e097a6b733d59e9d70adabd1e4390d47f301b040dc8fe），抽取文字 13370 字（courses/四法印/source_text/lecture_04.txt）
- ASR：faster-whisper-large-v3-turbo，1630 段 / 14958 字，RTF 0.04884，尾差 8.65 秒
- 對校：官方提綱 10 段全部成為段落邊界；自動校字 49 處；記錄差異 197 處（{"editorial-divergence": 131, "stale-position": 5, "unattested-homophone": 2, "orthographic-variant": 3, "overlap-skipped": 56}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 2, "discussionTopics": 2, "referenceViews": 2}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0002 | 消 | 銷 | glossary-homophone | None |
| seg-0023 | 裡 | 離 | glossary-homophone | None |
| seg-0028 | 淫 | 營 | near-homophone-term | 0.658 |
| seg-0035 | 賢 | 咸 | glossary-homophone | None |
| seg-0038 | 賢 | 咸 | glossary-homophone | None |
| seg-0039 | 蘇 | 酥 | strict-homophone | 0.596 |
| seg-0039 | 蘇 | 酥 | strict-homophone | 0.596 |
| seg-0040 | 蘇 | 酥 | strict-homophone | 0.591 |
| seg-0247 | 升 | 生 | glossary-homophone | None |
| seg-0248 | 去 | 趣 | glossary-homophone | None |
| seg-0254 | 去 | 趣 | glossary-homophone | None |
| seg-0256 | 去 | 趣 | glossary-homophone | None |
| seg-0272 | 升 | 生 | glossary-homophone | None |
| seg-0273 | 升 | 生 | glossary-homophone | None |
| seg-0277 | 升 | 生 | glossary-homophone | None |
| seg-0290 | 升 | 生 | glossary-homophone | None |
| seg-0308 | 升 | 生 | glossary-homophone | None |
| seg-0416 | 式 | 事 | glossary-homophone | None |
| seg-0417 | 式 | 事 | glossary-homophone | None |
| seg-0442 | 式 | 事 | glossary-homophone | None |
| seg-0456 | 維 | 惟 | glossary-homophone | None |
| seg-0457 | 維 | 惟 | glossary-homophone | None |
| seg-0457 | 維 | 惟 | glossary-homophone | None |
| seg-0458 | 維 | 惟 | glossary-homophone | None |
| seg-0460 | 升 | 生 | glossary-homophone | None |
| seg-0470 | 升 | 生 | glossary-homophone | None |
| seg-0482 | 升 | 生 | glossary-homophone | None |
| seg-0483 | 維 | 惟 | strict-homophone | 0.591 |
| seg-0484 | 維 | 惟 | glossary-homophone | None |
| seg-0518 | 維 | 惟 | glossary-homophone | None |
| seg-0520 | 維 | 惟 | strict-homophone | 0.558 |
| seg-0521 | 維 | 惟 | glossary-homophone | None |
| seg-0603 | 的 | 地 | near-homophone-term | 0.55 |
| seg-0628 | 升 | 生 | glossary-homophone | None |
| seg-0632 | 升 | 生 | glossary-homophone | None |
| seg-0650 | 維 | 惟 | glossary-homophone | None |
| seg-0669 | 升 | 生 | glossary-homophone | None |
| seg-0699 | 月 | 悅 | glossary-homophone | None |
| seg-0797 | 維 | 惟 | glossary-homophone | None |
| seg-0867 | 劃 | 畫 | strict-homophone | 0.571 |
| seg-0964 | 適 | 釋 | glossary-homophone | None |
| seg-1125 | 瘦 | 受 | glossary-homophone | None |
| seg-1126 | 瘦 | 受 | glossary-homophone | None |
| seg-1398 | 濕 | 屍 | glossary-homophone | None |
| seg-1401 | 濕 | 屍 | glossary-homophone | None |
| seg-1444 | 到 | 道 | glossary-homophone | None |
| seg-1551 | 適 | 釋 | glossary-homophone | None |
| seg-1555 | 事 | 世 | strict-homophone | 0.647 |
| seg-1558 | 適 | 釋 | strict-homophone | 0.607 |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0162 | 毛 | 茅 | unattested-homophone |
| seg-1350 | 漂 | 飄 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 131 處、標點差異 0 處、正寫法差異 3 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

