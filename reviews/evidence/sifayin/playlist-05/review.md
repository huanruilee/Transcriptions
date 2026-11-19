# 四法印 第5講 稽核紀錄（第05講 四法印第四講：探索生命的起源）

- 影片：FARWbQZPAcw（https://www.youtube.com/watch?v=FARWbQZPAcw）
- 音檔：講師官方 MP3，3814.8 秒，sha256:02ac9cdf885289bef0e2c966dee23810bafd6f95c4d939afde34df93238faaf8
- 底本：講師官方整編逐字稿 PDF（sha256:cb2aa26001dc816b0af4287d51428575d3d8ee5321d8f822cf976c8c54a918cb），抽取文字 10224 字（courses/四法印/source_text/lecture_05.txt）
- ASR：faster-whisper-large-v3-turbo，609 段 / 11020 字，RTF 0.04357，尾差 4.6 秒
- 對校：官方提綱 7 段全部成為段落邊界；自動校字 86 處；記錄差異 0 處（{}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 2, "referenceViews": 2}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 |
|---|---|---|---|
| seg-0002-3 | 和 | 合 | same-length-homophone |
| seg-0003 | 和 | 合 | same-length-homophone |
| seg-0005 | 的 | 得 | same-length-homophone |
| seg-0007-3 | 違 | 為 | same-length-homophone |
| seg-0007-3 | 合 | 和 | same-length-homophone |
| seg-0008-3 | 關戴 | 觀待 | same-length-homophone |
| seg-0009 | 升 | 生 | same-length-homophone |
| seg-0009 | 蓄留 | 續流 | same-length-homophone |
| seg-0009-2 | 祭誦 | 偈頌 | same-length-homophone |
| seg-0009-2 | 消 | 銷 | same-length-homophone |
| seg-0009-2 | 惠河 | 會合 | same-length-homophone |
| seg-0011 | 利 | 力 | same-length-homophone |
| seg-0012-3 | 靜 | 境 | same-length-homophone |
| seg-0013 | 嗔 | 瞋 | same-length-homophone |
| seg-0013 | 升 | 生 | same-length-homophone |
| seg-0013-4 | 靜 | 境 | glossary-homophone |
| seg-0014 | 靜 | 境 | same-length-homophone |
| seg-0014-2 | 靜 | 境 | same-length-homophone |
| seg-0014-2 | 靜 | 境 | same-length-homophone |
| seg-0014-2 | 靜 | 境 | glossary-homophone |
| seg-0015 | 靜 | 境 | same-length-homophone |
| seg-0015-2 | 靜 | 境 | same-length-homophone |
| seg-0015-2 | 靜 | 境 | glossary-homophone |
| seg-0015-2 | 越易 | 悅意 | bigram-homophone |
| seg-0015-2 | 靜 | 境 | single-char-attestation |
| seg-0015-4 | 靜 | 境 | same-length-homophone |
| seg-0016 | 嗔 | 瞋 | same-length-homophone |
| seg-0016-2 | 嗔 | 瞋 | glossary-homophone |
| seg-0016-3 | 升 | 生 | same-length-homophone |
| seg-0016-3 | 嗔 | 瞋 | same-length-homophone |
| seg-0017 | 升 | 生 | same-length-homophone |
| seg-0017 | 嗔 | 瞋 | same-length-homophone |
| seg-0017-2 | 隻 | 只 | same-length-homophone |
| seg-0017-3 | 升 | 生 | same-length-homophone |
| seg-0017-3 | 嗔 | 瞋 | glossary-homophone |
| seg-0018-2 | 靜 | 境 | glossary-homophone |
| seg-0020-6 | 祭送禮 | 偈頌裡 | same-length-homophone |
| seg-0027 | 限 | 線 | same-length-homophone |
| seg-0028-2 | 去 | 趣 | same-length-homophone |
| seg-0028-2 | 升 | 生 | same-length-homophone |
| seg-0029-3 | 去 | 趣 | same-length-homophone |
| seg-0030 | 去 | 趣 | same-length-homophone |
| seg-0030 | 去 | 趣 | same-length-homophone |
| seg-0030 | 升 | 生 | same-length-homophone |
| seg-0030 | 去 | 趣 | glossary-homophone |
| seg-0032-2 | 未 | 位 | glossary-homophone |
| seg-0036 | 死 | 思 | glossary-homophone |
| seg-0036-2 | 試集 | 示寂 | same-length-homophone |
| seg-0038 | 灼 | 拙 | same-length-homophone |
| seg-0038 | 秘 | 祕 | same-length-homophone |
| seg-0043-2 | 新 | 心 | same-length-homophone |
| seg-0043-2 | 新 | 心 | same-length-homophone |
| seg-0050-4 | 新 | 心 | same-length-homophone |
| seg-0051-3 | 粒 | 例 | glossary-homophone |
| seg-0053-4 | 力 | 理 | glossary-homophone |
| seg-0054 | 體 | 提 | glossary-homophone |
| seg-0084 | 巨生 | 俱生 | bigram-homophone |
| seg-0084 | 源 | 緣 | single-char-attestation |
| seg-0091 | 進 | 近 | same-length-homophone |
| seg-0093 | 進 | 近 | same-length-homophone |
| seg-0093 | 巨 | 俱 | same-length-homophone |
| seg-0093 | 源 | 緣 | same-length-homophone |
| seg-0125 | 合 | 和 | same-length-homophone |
| seg-0125 | 進 | 近 | same-length-homophone |
| seg-0148 | 進 | 近 | same-length-homophone |
| seg-0158 | 進 | 近 | same-length-homophone |
| seg-0158 | 聚 | 俱 | same-length-homophone |
| seg-0158 | 生源 | 生緣 | bigram-homophone |
| seg-0162 | 進 | 近 | same-length-homophone |
| seg-0162 | 聚 | 俱 | same-length-homophone |
| seg-0162 | 源 | 緣 | same-length-homophone |
| seg-0162 | 聚 | 俱 | same-length-homophone |
| seg-0162 | 進 | 近 | glossary-homophone |
| seg-0162 | 進 | 近 | glossary-homophone |
| seg-0162 | 生源 | 生緣 | bigram-homophone |
| seg-0169 | 進 | 近 | same-length-homophone |
| seg-0172 | 進 | 近 | same-length-homophone |
| seg-0187 | 進 | 近 | same-length-homophone |
| seg-0234 | 正 | 證 | same-length-homophone |
| seg-0234 | 正 | 證 | same-length-homophone |
| seg-0234 | 正 | 證 | same-length-homophone |
| seg-0277 | 進 | 近 | same-length-homophone |
| seg-0279 | 進 | 近 | same-length-homophone |
| seg-0302 | 遊 | 由 | same-length-homophone |
| seg-0344 | 維 | 惟 | glossary-homophone |
| seg-0576 | 姻 | 因 | same-length-homophone |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

（無）

- 整段口語刪節／改寫（editorial-divergence）共 0 處、標點差異 0 處、正寫法差異 0 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

