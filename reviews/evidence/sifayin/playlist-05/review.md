# 四法印 第5講 稽核紀錄（第05講 四法印第四講：探索生命的起源）

- 影片：FARWbQZPAcw（https://www.youtube.com/watch?v=FARWbQZPAcw）
- 音檔：講師官方 MP3，3814.8 秒，sha256:02ac9cdf885289bef0e2c966dee23810bafd6f95c4d939afde34df93238faaf8
- 底本：講師官方整編逐字稿 PDF（sha256:cb2aa26001dc816b0af4287d51428575d3d8ee5321d8f822cf976c8c54a918cb），抽取文字 10224 字（courses/四法印/source_text/lecture_05.txt）
- ASR：faster-whisper-large-v3-turbo，609 段 / 11020 字，RTF 0.04357，尾差 4.6 秒
- 對校：官方提綱 7 段全部成為段落邊界；自動校字 72 處；記錄差異 539 處（{"editorial-divergence": 436, "orthographic-variant": 4, "stale-position": 4, "unattested-homophone": 12, "punctuation-gap": 25, "overlap-skipped": 58}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 1, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0002 | 和 | 合 | strict-homophone | 0.794 |
| seg-0003 | 和 | 合 | strict-homophone | 0.779 |
| seg-0007 | 合 | 和 | strict-homophone | 0.72 |
| seg-0007 | 違 | 為 | strict-homophone | 0.72 |
| seg-0009 | 留 | 流 | glossary-homophone | None |
| seg-0009 | 升 | 生 | strict-homophone | 0.728 |
| seg-0009 | 戴 | 待 | glossary-homophone | None |
| seg-0010 | 賢 | 咸 | strict-homophone | 0.717 |
| seg-0010 | 河 | 合 | glossary-homophone | None |
| seg-0010 | 消 | 銷 | strict-homophone | 0.717 |
| seg-0010 | 祭誦 | 偈頌 | strict-homophone | 0.717 |
| seg-0011 | 民生 | 名聲 | near-homophone-term | 0.833 |
| seg-0011 | 民 | 名 | near-homophone-term | 0.833 |
| seg-0011 | 民生 | 名聲 | near-homophone-term | 0.833 |
| seg-0012 | 近 | 境 | near-homophone-term | 0.755 |
| seg-0012 | 近 | 境 | near-homophone-term | 0.755 |
| seg-0012 | 近 | 境 | near-homophone-term | 0.755 |
| seg-0013 | 升 | 生 | strict-homophone | 0.711 |
| seg-0013 | 嗔 | 瞋 | strict-homophone | 0.711 |
| seg-0013 | 靜 | 境 | strict-homophone | 0.711 |
| seg-0014 | 靜 | 境 | strict-homophone | 0.824 |
| seg-0014 | 靜 | 境 | strict-homophone | 0.824 |
| seg-0015 | 靜 | 境 | strict-homophone | 0.805 |
| seg-0015 | 靜 | 境 | strict-homophone | 0.805 |
| seg-0015 | 靜 | 境 | glossary-homophone | None |
| seg-0015 | 靜 | 境 | strict-homophone | 0.805 |
| seg-0016 | 嗔 | 瞋 | glossary-homophone | None |
| seg-0016 | 嗔 | 瞋 | strict-homophone | 0.761 |
| seg-0017 | 嗔 | 瞋 | glossary-homophone | None |
| seg-0017 | 升 | 生 | strict-homophone | 0.747 |
| seg-0017 | 式 | 時 | glossary-homophone | None |
| seg-0017 | 嗔 | 瞋 | strict-homophone | 0.747 |
| seg-0017 | 升 | 生 | strict-homophone | 0.747 |
| seg-0017 | 嗔 | 瞋 | strict-homophone | 0.747 |
| seg-0017 | 升 | 生 | strict-homophone | 0.747 |
| seg-0018 | 知 | 執 | glossary-homophone | None |
| seg-0020 | 賢 | 咸 | strict-homophone | 0.825 |
| seg-0027 | 限 | 線 | strict-homophone | 0.725 |
| seg-0028 | 升 | 生 | glossary-homophone | None |
| seg-0028 | 去 | 趣 | strict-homophone | 0.823 |
| seg-0029 | 去 | 趣 | strict-homophone | 0.862 |
| seg-0030 | 升 | 生 | strict-homophone | 0.667 |
| seg-0030 | 去 | 趣 | strict-homophone | 0.667 |
| seg-0030 | 去 | 趣 | glossary-homophone | None |
| seg-0030 | 去 | 趣 | strict-homophone | 0.667 |
| seg-0038 | 灼 | 拙 | strict-homophone | 0.723 |
| seg-0043 | 事 | 世 | strict-homophone | 0.78 |
| seg-0044 | 經 | 禁 | near-homophone-term | 0.874 |
| seg-0048 | 身 | 生 | near-homophone-term | 0.796 |
| seg-0053 | 力 | 理 | glossary-homophone | None |
| seg-0093 | 進 | 近 | glossary-homophone | None |
| seg-0097 | 進 | 近 | glossary-homophone | None |
| seg-0103 | 巨 | 俱 | glossary-homophone | None |
| seg-0133 | 進 | 近 | glossary-homophone | None |
| seg-0158 | 進 | 近 | glossary-homophone | None |
| seg-0160 | 進 | 近 | glossary-homophone | None |
| seg-0161 | 聚 | 俱 | glossary-homophone | None |
| seg-0165 | 進 | 近 | glossary-homophone | None |
| seg-0166 | 聚 | 俱 | glossary-homophone | None |
| seg-0167 | 聚 | 俱 | glossary-homophone | None |
| seg-0168 | 進 | 近 | glossary-homophone | None |
| seg-0169 | 進 | 近 | glossary-homophone | None |
| seg-0170 | 進 | 近 | strict-homophone | 0.588 |
| seg-0175 | 進 | 近 | glossary-homophone | None |
| seg-0191 | 進 | 近 | glossary-homophone | None |
| seg-0210 | 身 | 生 | near-homophone-term | 0.55 |
| seg-0252 | 事 | 世 | strict-homophone | 0.604 |
| seg-0279 | 進 | 近 | glossary-homophone | None |
| seg-0281 | 進 | 近 | glossary-homophone | None |
| seg-0304 | 遊 | 由 | glossary-homophone | None |
| seg-0345 | 維 | 惟 | glossary-homophone | None |
| seg-0580 | 姻 | 因 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0005 | 的 | 得 | unattested-homophone |
| seg-0011 | 利 | 力 | unattested-homophone |
| seg-0014 | 靜 | 境 | unattested-homophone |
| seg-0019 | 撐 | 瞋 | unattested-homophone |
| seg-0020 | 祭送禮 | 偈頌裡 | unattested-homophone |
| seg-0031 | 設 | 使 | unattested-homophone |
| seg-0033 | 的 | 地 | unattested-homophone |
| seg-0037 | 試集 | 示寂 | unattested-homophone |
| seg-0043 | 新 | 心 | unattested-homophone |
| seg-0043 | 新 | 心 | unattested-homophone |
| seg-0050 | 新 | 心 | unattested-homophone |
| seg-0432 | 時 | 始 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 436 處、標點差異 25 處、正寫法差異 4 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

