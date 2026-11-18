# 四法印 第11講 稽核紀錄（第11講 四法印第十講：四法印之四：涅槃寂靜）

- 影片：s8hZpRQm9BY（https://www.youtube.com/watch?v=s8hZpRQm9BY）
- 音檔：講師官方 MP3，3489.048 秒，sha256:1772bca26d6eb1785658bfbe7ebeb0287bf82ffc70aaa61be2d7a38c29e0a004
- 底本：講師官方整編逐字稿 PDF（sha256:6a8edadcb02681ae73485480ece9741b8d959022dc78957cc2fc13fc074938b2），抽取文字 8639 字（courses/四法印/source_text/lecture_11.txt）
- ASR：faster-whisper-large-v3-turbo，1089 段 / 10196 字，RTF 0.0837，尾差 9.03 秒
- 對校：官方提綱 8 段全部成為段落邊界；自動校字 196 處；記錄差異 278 處（{"editorial-divergence": 68, "stale-position": 4, "unattested-homophone": 2, "overlap-skipped": 204}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 3, "discussionTopics": 1, "referenceViews": 1}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0003 | 五 | 我 | near-homophone-term | 0.592 |
| seg-0004 | 關戴 | 觀待 | strict-homophone | 0.691 |
| seg-0005 | 關戴 | 觀待 | strict-homophone | 0.638 |
| seg-0005 | 五 | 我 | near-homophone-term | 0.638 |
| seg-0006 | 值 | 執 | glossary-homophone | None |
| seg-0007 | 關戴 | 觀待 | strict-homophone | 0.725 |
| seg-0010 | 利 | 立 | glossary-homophone | None |
| seg-0011 | 孕 | 蘊 | glossary-homophone | None |
| seg-0011 | 孕 | 蘊 | glossary-homophone | None |
| seg-0014 | 孕 | 蘊 | strict-homophone | 0.6 |
| seg-0024 | 利 | 立 | glossary-homophone | None |
| seg-0027 | 陷 | 現 | glossary-homophone | None |
| seg-0032 | 石 | 實 | strict-homophone | 0.63 |
| seg-0032 | 關戴 | 觀待 | strict-homophone | 0.63 |
| seg-0032 | 行程 | 形成 | strict-homophone | 0.63 |
| seg-0033 | 質 | 執 | strict-homophone | 0.591 |
| seg-0034 | 質 | 執 | glossary-homophone | None |
| seg-0035 | 質 | 執 | glossary-homophone | None |
| seg-0037 | 質 | 執 | glossary-homophone | None |
| seg-0038 | 質 | 執 | glossary-homophone | None |
| seg-0040 | 質 | 執 | glossary-homophone | None |
| seg-0041 | 質 | 執 | glossary-homophone | None |
| seg-0044 | 質 | 執 | glossary-homophone | None |
| seg-0044 | 質 | 執 | glossary-homophone | None |
| seg-0045 | 石 | 實 | glossary-homophone | None |
| seg-0047 | 質 | 執 | glossary-homophone | None |
| seg-0049 | 質 | 執 | glossary-homophone | None |
| seg-0050 | 質 | 執 | glossary-homophone | None |
| seg-0053 | 洗 | 習 | glossary-homophone | None |
| seg-0054 | 質 | 執 | glossary-homophone | None |
| seg-0055 | 質 | 執 | glossary-homophone | None |
| seg-0056 | 石 | 實 | glossary-homophone | None |
| seg-0056 | 質 | 執 | glossary-homophone | None |
| seg-0059 | 石 | 實 | glossary-homophone | None |
| seg-0097 | 直 | 執 | glossary-homophone | None |
| seg-0097 | 直 | 執 | glossary-homophone | None |
| seg-0100 | 直 | 執 | glossary-homophone | None |
| seg-0102 | 直 | 執 | glossary-homophone | None |
| seg-0117 | 韻 | 蘊 | glossary-homophone | None |
| seg-0118 | 韻 | 蘊 | glossary-homophone | None |
| seg-0119 | 韻 | 蘊 | glossary-homophone | None |
| seg-0123 | 韻 | 蘊 | glossary-homophone | None |
| seg-0124 | 韻 | 蘊 | glossary-homophone | None |
| seg-0129 | 韻 | 蘊 | glossary-homophone | None |
| seg-0133 | 韻 | 蘊 | glossary-homophone | None |
| seg-0134 | 韻 | 蘊 | glossary-homophone | None |
| seg-0136 | 韻 | 蘊 | glossary-homophone | None |
| seg-0139 | 韻 | 蘊 | glossary-homophone | None |
| seg-0144 | 韻 | 蘊 | glossary-homophone | None |
| seg-0146 | 韻 | 蘊 | glossary-homophone | None |
| seg-0150 | 韻 | 蘊 | glossary-homophone | None |
| seg-0154 | 韻 | 蘊 | glossary-homophone | None |
| seg-0158 | 韻 | 蘊 | glossary-homophone | None |
| seg-0170 | 韻 | 蘊 | glossary-homophone | None |
| seg-0173 | 韻 | 蘊 | glossary-homophone | None |
| seg-0176 | 韻 | 蘊 | glossary-homophone | None |
| seg-0180 | 社 | 攝 | glossary-homophone | None |
| seg-0185 | 韻 | 蘊 | glossary-homophone | None |
| seg-0197 | 韻 | 蘊 | glossary-homophone | None |
| seg-0206 | 韻 | 蘊 | glossary-homophone | None |
| seg-0218 | 迫 | 破 | glossary-homophone | None |
| seg-0224 | 迫 | 破 | glossary-homophone | None |
| seg-0235 | 迫 | 破 | strict-homophone | 0.55 |
| seg-0238 | 迫 | 破 | glossary-homophone | None |
| seg-0242 | 值 | 執 | glossary-homophone | None |
| seg-0246 | 迫 | 破 | glossary-homophone | None |
| seg-0247 | 迫 | 破 | glossary-homophone | None |
| seg-0249 | 迫 | 破 | glossary-homophone | None |
| seg-0251 | 值 | 執 | glossary-homophone | None |
| seg-0264 | 迫 | 破 | glossary-homophone | None |
| seg-0266 | 值 | 執 | strict-homophone | 0.583 |
| seg-0281 | 值 | 執 | glossary-homophone | None |
| seg-0290 | 值 | 執 | strict-homophone | 0.654 |
| seg-0294 | 迫 | 破 | strict-homophone | 0.55 |
| seg-0299 | 迫 | 破 | glossary-homophone | None |
| seg-0300 | 值 | 執 | glossary-homophone | None |
| seg-0351 | 質 | 執 | glossary-homophone | None |
| seg-0353 | 質 | 執 | glossary-homophone | None |
| seg-0355 | 質 | 執 | glossary-homophone | None |
| seg-0358 | 質 | 執 | glossary-homophone | None |
| seg-0362 | 質 | 執 | glossary-homophone | None |
| seg-0376 | 質 | 執 | glossary-homophone | None |
| seg-0386 | 質 | 執 | glossary-homophone | None |
| seg-0392 | 質 | 執 | glossary-homophone | None |
| seg-0397 | 質 | 執 | glossary-homophone | None |
| seg-0400 | 質 | 執 | glossary-homophone | None |
| seg-0406 | 質 | 執 | glossary-homophone | None |
| seg-0408 | 升 | 生 | glossary-homophone | None |
| seg-0410 | 質 | 執 | strict-homophone | 0.647 |
| seg-0414 | 質 | 執 | glossary-homophone | None |
| seg-0416 | 質 | 執 | glossary-homophone | None |
| seg-0416 | 陷 | 現 | glossary-homophone | None |
| seg-0417 | 質 | 執 | glossary-homophone | None |
| seg-0425 | 地 | 諦 | glossary-homophone | None |
| seg-0432 | 升 | 生 | strict-homophone | 0.571 |
| seg-0433 | 升 | 生 | glossary-homophone | None |
| seg-0483 | 維 | 惟 | glossary-homophone | None |
| seg-0506 | 維 | 惟 | glossary-homophone | None |
| seg-0507 | 維 | 惟 | glossary-homophone | None |
| seg-0516 | 維 | 惟 | glossary-homophone | None |
| seg-0517 | 維 | 惟 | strict-homophone | 0.571 |
| seg-0518 | 維 | 惟 | glossary-homophone | None |
| seg-0520 | 維 | 惟 | glossary-homophone | None |
| seg-0522 | 孕 | 蘊 | strict-homophone | 0.579 |
| seg-0523 | 孕 | 蘊 | strict-homophone | 0.552 |
| seg-0528 | 運 | 蘊 | glossary-homophone | None |
| seg-0529 | 運 | 蘊 | glossary-homophone | None |
| seg-0530 | 維 | 惟 | glossary-homophone | None |
| seg-0532 | 維 | 惟 | glossary-homophone | None |
| seg-0535 | 維 | 惟 | glossary-homophone | None |
| seg-0539 | 維 | 惟 | glossary-homophone | None |
| seg-0540 | 維 | 惟 | glossary-homophone | None |
| seg-0546 | 孕 | 蘊 | strict-homophone | 0.591 |
| seg-0555 | 維 | 惟 | glossary-homophone | None |
| seg-0569 | 孕 | 蘊 | glossary-homophone | None |
| seg-0571 | 維 | 惟 | glossary-homophone | None |
| seg-0573 | 注 | 著 | glossary-homophone | None |
| seg-0580 | 維 | 惟 | glossary-homophone | None |
| seg-0589 | 孕 | 蘊 | glossary-homophone | None |
| seg-0590 | 孕 | 蘊 | strict-homophone | 0.655 |
| seg-0591 | 維 | 惟 | glossary-homophone | None |
| seg-0592 | 維 | 惟 | glossary-homophone | None |
| seg-0593 | 孕 | 蘊 | strict-homophone | 0.591 |
| seg-0595 | 孕 | 蘊 | strict-homophone | 0.565 |
| seg-0597 | 孕 | 蘊 | strict-homophone | 0.577 |
| seg-0599 | 孕 | 蘊 | glossary-homophone | None |
| seg-0600 | 液 | 業 | glossary-homophone | None |
| seg-0607 | 值 | 執 | glossary-homophone | None |
| seg-0608 | 值 | 執 | glossary-homophone | None |
| seg-0612 | 維 | 惟 | glossary-homophone | None |
| seg-0613 | 孕 | 蘊 | glossary-homophone | None |
| seg-0615 | 值 | 執 | glossary-homophone | None |
| seg-0618 | 維 | 惟 | glossary-homophone | None |
| seg-0628 | 孕 | 蘊 | glossary-homophone | None |
| seg-0631 | 適 | 釋 | glossary-homophone | None |
| seg-0647 | 值 | 執 | glossary-homophone | None |
| seg-0650 | 值 | 執 | glossary-homophone | None |
| seg-0653 | 值 | 執 | strict-homophone | 0.609 |
| seg-0654 | 值 | 執 | strict-homophone | 0.643 |
| seg-0654 | 值 | 執 | glossary-homophone | None |
| seg-0657 | 陷 | 現 | glossary-homophone | None |
| seg-0662 | 值 | 執 | glossary-homophone | None |
| seg-0679 | 值 | 執 | glossary-homophone | None |
| seg-0687 | 噎 | 業 | strict-homophone | 0.625 |
| seg-0689 | 值 | 執 | glossary-homophone | None |
| seg-0692 | 值 | 執 | glossary-homophone | None |
| seg-0694 | 值 | 執 | glossary-homophone | None |
| seg-0701 | 值 | 執 | glossary-homophone | None |
| seg-0703 | 值 | 執 | glossary-homophone | None |
| seg-0704 | 值 | 執 | glossary-homophone | None |
| seg-0706 | 值 | 執 | glossary-homophone | None |
| seg-0709 | 值 | 執 | glossary-homophone | None |
| seg-0719 | 墨 | 末 | glossary-homophone | None |
| seg-0720 | 墨 | 末 | glossary-homophone | None |
| seg-0721 | 墨 | 末 | glossary-homophone | None |
| seg-0723 | 墨 | 末 | glossary-homophone | None |
| seg-0727 | 墨 | 末 | glossary-homophone | None |
| seg-0729 | 值 | 執 | glossary-homophone | None |
| seg-0773 | 值 | 執 | glossary-homophone | None |
| seg-0776 | 值 | 執 | glossary-homophone | None |
| seg-0786 | 值 | 執 | glossary-homophone | None |
| seg-0791 | 適 | 釋 | glossary-homophone | None |
| seg-0801 | 維 | 惟 | glossary-homophone | None |
| seg-0807 | 維 | 惟 | glossary-homophone | None |
| seg-0808 | 維 | 惟 | glossary-homophone | None |
| seg-0812 | 維 | 惟 | glossary-homophone | None |
| seg-0813 | 職 | 執 | glossary-homophone | None |
| seg-0828 | 運 | 蘊 | glossary-homophone | None |
| seg-0831 | 運 | 蘊 | glossary-homophone | None |
| seg-0832 | 運 | 蘊 | glossary-homophone | None |
| seg-0834 | 運 | 蘊 | glossary-homophone | None |
| seg-0837 | 運 | 蘊 | glossary-homophone | None |
| seg-0844 | 運 | 蘊 | glossary-homophone | None |
| seg-0846 | 運 | 蘊 | strict-homophone | 0.556 |
| seg-0849 | 運 | 蘊 | strict-homophone | 0.55 |
| seg-0852 | 運 | 蘊 | strict-homophone | 0.6 |
| seg-0853 | 運 | 蘊 | glossary-homophone | None |
| seg-0854 | 運 | 蘊 | glossary-homophone | None |
| seg-0886 | 運 | 蘊 | glossary-homophone | None |
| seg-0887 | 運 | 蘊 | glossary-homophone | None |
| seg-0891 | 運 | 蘊 | glossary-homophone | None |
| seg-0895 | 液 | 業 | glossary-homophone | None |
| seg-0917 | 質 | 執 | glossary-homophone | None |
| seg-0918 | 質 | 執 | glossary-homophone | None |
| seg-0919 | 質 | 執 | glossary-homophone | None |
| seg-0926 | 即 | 寂 | glossary-homophone | None |
| seg-0928 | 質 | 執 | glossary-homophone | None |
| seg-0933 | 到 | 道 | glossary-homophone | None |
| seg-0939 | 即 | 寂 | glossary-homophone | None |
| seg-0980 | 值 | 執 | glossary-homophone | None |
| seg-0982 | 值 | 執 | glossary-homophone | None |
| seg-0982 | 陷 | 現 | glossary-homophone | None |
| seg-0983 | 值 | 執 | glossary-homophone | None |
| seg-1029 | 嗔 | 瞋 | glossary-homophone | None |
| seg-1071 | 維 | 惟 | glossary-homophone | None |
| seg-1085 | 漸 | 見 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0527 | 意 | 業 | unattested-homophone |
| seg-0595 | 重 | 眾 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 68 處、標點差異 0 處、正寫法差異 0 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

