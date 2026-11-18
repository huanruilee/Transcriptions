# 四法印 第7講 稽核紀錄（第07講 四法印第六講：四法印之二：有漏皆苦）

- 影片：LQjIiEGKjH0（https://www.youtube.com/watch?v=LQjIiEGKjH0）
- 音檔：講師官方 MP3，5338.176 秒，sha256:bcdda56989ffcb9c824632c7795fed7d25e3558cc460986e3747a6e96cef5f65
- 底本：講師官方整編逐字稿 PDF（sha256:d447f0d1baaf32637095be58524d09f4b11b7a44a22cb1b1e84b44b44e1b7b54），抽取文字 14039 字（courses/四法印/source_text/lecture_07.txt）
- ASR：faster-whisper-large-v3-turbo，1628 段 / 16407 字，RTF 0.30183，尾差 9.66 秒
- 對校：官方提綱 10 段全部成為段落邊界；自動校字 79 處；記錄差異 278 處（{"stale-position": 10, "editorial-divergence": 173, "unattested-homophone": 4, "orthographic-variant": 1, "overlap-skipped": 90}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 1, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0053 | 升 | 生 | glossary-homophone | None |
| seg-0336 | 英 | 陰 | near-homophone-term | 0.591 |
| seg-0337 | 腹 | 父 | glossary-homophone | None |
| seg-0350 | 維 | 惟 | glossary-homophone | None |
| seg-0360 | 維 | 惟 | glossary-homophone | None |
| seg-0407 | 月 | 悅 | glossary-homophone | None |
| seg-0440 | 夜 | 業 | glossary-homophone | None |
| seg-0471 | 帶 | 待 | glossary-homophone | None |
| seg-0475 | 進 | 近 | glossary-homophone | None |
| seg-0477 | 進 | 近 | glossary-homophone | None |
| seg-0478 | 聚 | 俱 | glossary-homophone | None |
| seg-0509 | 月 | 悅 | strict-homophone | 0.64 |
| seg-0511 | 月 | 悅 | glossary-homophone | None |
| seg-0515 | 月 | 悅 | strict-homophone | 0.577 |
| seg-0515 | 月 | 悅 | strict-homophone | 0.577 |
| seg-0536 | 世 | 士 | strict-homophone | 0.642 |
| seg-0537 | 英 | 陰 | near-homophone-term | 0.64 |
| seg-0553 | 越 | 悅 | glossary-homophone | None |
| seg-0566 | 息 | 習 | glossary-homophone | None |
| seg-0585 | 英 | 陰 | near-homophone-term | 0.558 |
| seg-0594 | 靜 | 境 | strict-homophone | 0.565 |
| seg-0605 | 靜 | 境 | strict-homophone | 0.591 |
| seg-0608 | 英 | 陰 | near-homophone-term | 0.615 |
| seg-0611 | 合 | 和 | strict-homophone | 0.577 |
| seg-0611 | 腹筋 | 父精 | near-homophone-term | 0.577 |
| seg-0616 | 的 | 地 | near-homophone-term | 0.597 |
| seg-0616 | 合 | 和 | strict-homophone | 0.597 |
| seg-0616 | 腹筋 | 父精 | near-homophone-term | 0.597 |
| seg-0616 | 澆 | 膠 | strict-homophone | 0.597 |
| seg-0628 | 靜 | 境 | glossary-homophone | None |
| seg-0628 | 靜 | 境 | glossary-homophone | None |
| seg-0650 | 焦 | 膠 | strict-homophone | 0.558 |
| seg-0654 | 焦 | 膠 | glossary-homophone | None |
| seg-0660 | 焦 | 膠 | strict-homophone | 0.55 |
| seg-0661 | 焦 | 膠 | glossary-homophone | None |
| seg-0676 | 焦 | 膠 | glossary-homophone | None |
| seg-0717 | 襲 | 習 | strict-homophone | 0.55 |
| seg-0718 | 襲 | 習 | strict-homophone | 0.55 |
| seg-0733 | 澆 | 膠 | glossary-homophone | None |
| seg-0738 | 襲 | 習 | glossary-homophone | None |
| seg-0739 | 林 | 臨 | glossary-homophone | None |
| seg-0744 | 林 | 臨 | glossary-homophone | None |
| seg-0747 | 林 | 臨 | glossary-homophone | None |
| seg-0769 | 林 | 臨 | glossary-homophone | None |
| seg-0770 | 夜 | 業 | glossary-homophone | None |
| seg-0771 | 夜 | 業 | glossary-homophone | None |
| seg-0775 | 澆 | 膠 | glossary-homophone | None |
| seg-0775 | 夜 | 業 | glossary-homophone | None |
| seg-0786 | 夜 | 業 | glossary-homophone | None |
| seg-0790 | 夜 | 業 | glossary-homophone | None |
| seg-0792 | 夜 | 業 | glossary-homophone | None |
| seg-0795 | 夜 | 業 | glossary-homophone | None |
| seg-0805 | 夜 | 業 | glossary-homophone | None |
| seg-0814 | 夜 | 業 | strict-homophone | 0.609 |
| seg-0818 | 夜 | 業 | glossary-homophone | None |
| seg-0821 | 夜 | 業 | glossary-homophone | None |
| seg-0843 | 孕 | 蘊 | glossary-homophone | None |
| seg-0855 | 地 | 諦 | strict-homophone | 0.591 |
| seg-0857 | 夜 | 業 | strict-homophone | 0.591 |
| seg-0858 | 夜 | 業 | strict-homophone | 0.612 |
| seg-0860 | 夜 | 業 | glossary-homophone | None |
| seg-0862 | 夜 | 業 | strict-homophone | 0.64 |
| seg-1134 | 維 | 惟 | glossary-homophone | None |
| seg-1136 | 維 | 惟 | glossary-homophone | None |
| seg-1141 | 維 | 惟 | glossary-homophone | None |
| seg-1145 | 維 | 惟 | glossary-homophone | None |
| seg-1164 | 維 | 惟 | glossary-homophone | None |
| seg-1180 | 維 | 惟 | glossary-homophone | None |
| seg-1182 | 維 | 惟 | glossary-homophone | None |
| seg-1219 | 維 | 惟 | glossary-homophone | None |
| seg-1242 | 去 | 趣 | glossary-homophone | None |
| seg-1289 | 維 | 惟 | glossary-homophone | None |
| seg-1463 | 升 | 生 | glossary-homophone | None |
| seg-1483 | 靜 | 境 | strict-homophone | 0.55 |
| seg-1493 | 維 | 惟 | glossary-homophone | None |
| seg-1516 | 進 | 近 | strict-homophone | 0.55 |
| seg-1521 | 甚 | 什 | glossary-homophone | None |
| seg-1538 | 甚 | 什 | glossary-homophone | None |
| seg-1555 | 甚 | 什 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0271 | 的 | 地 | unattested-homophone |
| seg-0272 | 的 | 地 | unattested-homophone |
| seg-0679 | 的 | 地 | unattested-homophone |
| seg-0842 | 時 | 始 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 173 處、標點差異 0 處、正寫法差異 1 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

