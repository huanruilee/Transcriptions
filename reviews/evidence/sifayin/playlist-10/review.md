# 四法印 第10講 稽核紀錄（第10講 四法印第九講：四法印之三：諸法無我）

- 影片：11gEibLNGTM（https://www.youtube.com/watch?v=11gEibLNGTM）
- 音檔：講師官方 MP3，3820.008 秒，sha256:68fb19a8fcf0ced342748eb852a10924cf4da429a6b29f353c27b96d3dbe5b48
- 底本：講師官方整編逐字稿 PDF（sha256:793fdc4e6303c911576fcc2fa910bbc5b96d032ec3534bfb75d3ef3563e2225d），抽取文字 9337 字（courses/四法印/source_text/lecture_10.txt）
- ASR：faster-whisper-large-v3-turbo，1188 段 / 11438 字，RTF 0.10418，尾差 1.7 秒
- 對校：官方提綱 6 段全部成為段落邊界；自動校字 110 處；記錄差異 204 處（{"editorial-divergence": 105, "overlap-skipped": 92, "unattested-homophone": 1, "stale-position": 6}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 2, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0005 | 指 | 執 | glossary-homophone | None |
| seg-0009 | 值 | 執 | glossary-homophone | None |
| seg-0009 | 獻 | 現 | glossary-homophone | None |
| seg-0017 | 孕 | 蘊 | strict-homophone | 0.581 |
| seg-0018 | 孕 | 蘊 | glossary-homophone | None |
| seg-0020 | 孕 | 蘊 | glossary-homophone | None |
| seg-0021 | 孕 | 蘊 | strict-homophone | 0.566 |
| seg-0022 | 孕 | 蘊 | glossary-homophone | None |
| seg-0023 | 孕 | 蘊 | glossary-homophone | None |
| seg-0024 | 孕 | 蘊 | glossary-homophone | None |
| seg-0026 | 孕 | 蘊 | strict-homophone | 0.714 |
| seg-0030 | 佈 | 布 | glossary-homophone | None |
| seg-0031 | 孕 | 蘊 | strict-homophone | 0.583 |
| seg-0036 | 孕 | 蘊 | strict-homophone | 0.625 |
| seg-0058 | 指 | 執 | glossary-homophone | None |
| seg-0076 | 韻 | 蘊 | strict-homophone | 0.571 |
| seg-0196 | 維 | 惟 | glossary-homophone | None |
| seg-0380 | 嗔 | 瞋 | glossary-homophone | None |
| seg-0382 | 直 | 執 | glossary-homophone | None |
| seg-0383 | 直 | 執 | glossary-homophone | None |
| seg-0427 | 靜 | 境 | strict-homophone | 0.571 |
| seg-0441 | 值 | 執 | glossary-homophone | None |
| seg-0442 | 值 | 執 | glossary-homophone | None |
| seg-0443 | 值 | 執 | glossary-homophone | None |
| seg-0446 | 值 | 執 | glossary-homophone | None |
| seg-0447 | 值 | 執 | glossary-homophone | None |
| seg-0449 | 值 | 執 | glossary-homophone | None |
| seg-0454 | 值 | 執 | glossary-homophone | None |
| seg-0485 | 陷 | 現 | glossary-homophone | None |
| seg-0486 | 直 | 執 | glossary-homophone | None |
| seg-0488 | 直 | 執 | glossary-homophone | None |
| seg-0489 | 直 | 執 | glossary-homophone | None |
| seg-0545 | 史 | 始 | glossary-homophone | None |
| seg-0547 | 直 | 執 | glossary-homophone | None |
| seg-0586 | 直 | 執 | strict-homophone | 0.561 |
| seg-0597 | 升 | 生 | glossary-homophone | None |
| seg-0609 | 直 | 執 | glossary-homophone | None |
| seg-0615 | 禮 | 理 | glossary-homophone | None |
| seg-0617 | 升 | 生 | glossary-homophone | None |
| seg-0621 | 禮 | 理 | glossary-homophone | None |
| seg-0626 | 禮 | 理 | glossary-homophone | None |
| seg-0655 | 值 | 執 | glossary-homophone | None |
| seg-0656 | 升 | 生 | strict-homophone | 0.621 |
| seg-0674 | 出 | 除 | glossary-homophone | None |
| seg-0738 | 值 | 執 | glossary-homophone | None |
| seg-0747 | 值 | 執 | strict-homophone | 0.632 |
| seg-0772 | 像 | 想 | glossary-homophone | None |
| seg-0780 | 力 | 立 | strict-homophone | 0.619 |
| seg-0780 | 韻 | 蘊 | strict-homophone | 0.619 |
| seg-0781 | 韻 | 蘊 | glossary-homophone | None |
| seg-0783 | 力 | 立 | strict-homophone | 0.588 |
| seg-0783 | 韻 | 蘊 | glossary-homophone | None |
| seg-0785 | 力 | 立 | glossary-homophone | None |
| seg-0785 | 韻 | 蘊 | glossary-homophone | None |
| seg-0786 | 社 | 攝 | glossary-homophone | None |
| seg-0789 | 力 | 立 | glossary-homophone | None |
| seg-0791 | 韻 | 蘊 | glossary-homophone | None |
| seg-0792 | 力 | 立 | glossary-homophone | None |
| seg-0792 | 韻 | 蘊 | glossary-homophone | None |
| seg-0829 | 粒 | 立 | glossary-homophone | None |
| seg-0830 | 粒 | 立 | glossary-homophone | None |
| seg-0831 | 粒 | 立 | glossary-homophone | None |
| seg-0832 | 粒 | 立 | glossary-homophone | None |
| seg-0835 | 利 | 立 | strict-homophone | 0.553 |
| seg-0859 | 利 | 立 | strict-homophone | 0.55 |
| seg-0860 | 利 | 立 | strict-homophone | 0.55 |
| seg-0871 | 利 | 立 | glossary-homophone | None |
| seg-0872 | 利 | 立 | glossary-homophone | None |
| seg-0884 | 利 | 立 | glossary-homophone | None |
| seg-0885 | 利 | 立 | strict-homophone | 0.553 |
| seg-0891 | 利 | 立 | strict-homophone | 0.609 |
| seg-0904 | 利 | 立 | glossary-homophone | None |
| seg-0904 | 運 | 蘊 | glossary-homophone | None |
| seg-0908 | 值 | 執 | glossary-homophone | None |
| seg-0912 | 值 | 執 | glossary-homophone | None |
| seg-0912 | 陷 | 現 | glossary-homophone | None |
| seg-0920 | 利 | 立 | glossary-homophone | None |
| seg-0921 | 利 | 立 | strict-homophone | 0.578 |
| seg-0925 | 利 | 立 | glossary-homophone | None |
| seg-0926 | 利 | 立 | glossary-homophone | None |
| seg-0927 | 象 | 想 | glossary-homophone | None |
| seg-0931 | 襲 | 習 | glossary-homophone | None |
| seg-1024 | 例 | 立 | glossary-homophone | None |
| seg-1037 | 陷 | 現 | glossary-homophone | None |
| seg-1040 | 陷 | 現 | glossary-homophone | None |
| seg-1043 | 陷 | 現 | glossary-homophone | None |
| seg-1045 | 陷 | 現 | glossary-homophone | None |
| seg-1047 | 陷 | 現 | glossary-homophone | None |
| seg-1065 | 陷 | 現 | glossary-homophone | None |
| seg-1073 | 力 | 立 | glossary-homophone | None |
| seg-1076 | 力 | 立 | glossary-homophone | None |
| seg-1076 | 孕 | 蘊 | glossary-homophone | None |
| seg-1082 | 陷 | 現 | glossary-homophone | None |
| seg-1085 | 力 | 立 | glossary-homophone | None |
| seg-1085 | 孕 | 蘊 | glossary-homophone | None |
| seg-1092 | 陷 | 現 | glossary-homophone | None |
| seg-1105 | 韻 | 蘊 | glossary-homophone | None |
| seg-1106 | 韻 | 蘊 | glossary-homophone | None |
| seg-1107 | 力 | 立 | glossary-homophone | None |
| seg-1110 | 力 | 立 | glossary-homophone | None |
| seg-1110 | 孕 | 蘊 | glossary-homophone | None |
| seg-1127 | 視 | 始 | glossary-homophone | None |
| seg-1134 | 值 | 執 | glossary-homophone | None |
| seg-1135 | 值 | 執 | glossary-homophone | None |
| seg-1137 | 值 | 執 | glossary-homophone | None |
| seg-1143 | 值 | 執 | glossary-homophone | None |
| seg-1160 | 值 | 執 | strict-homophone | 0.615 |
| seg-1160 | 置 | 治 | strict-homophone | 0.615 |
| seg-1163 | 值 | 執 | glossary-homophone | None |
| seg-1163 | 置 | 治 | strict-homophone | 0.627 |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0032 | 的 | 地 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 105 處、標點差異 0 處、正寫法差異 0 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

