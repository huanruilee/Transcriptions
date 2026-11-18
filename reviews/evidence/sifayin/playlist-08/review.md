# 四法印 第8講 稽核紀錄（第08講 四法印第七講：探索痛苦的根源）

- 影片：ucXdxJYUO8s（https://www.youtube.com/watch?v=ucXdxJYUO8s）
- 音檔：講師官方 MP3，3851.76 秒，sha256:9d3593c35e9663c37abeefe8369b08bcf60533bd59fe4f765b17548e138be2eb
- 底本：講師官方整編逐字稿 PDF（sha256:4aa37073f216bf7cb331e88e2595a1455bad04469e0398dd2921c4e6a576c55b），抽取文字 10003 字（courses/四法印/source_text/lecture_08.txt）
- ASR：faster-whisper-large-v3-turbo，1247 段 / 11854 字，RTF 0.38768，尾差 9.49 秒
- 對校：官方提綱 6 段全部成為段落邊界；自動校字 119 處；記錄差異 257 處（{"editorial-divergence": 106, "orthographic-variant": 3, "overlap-skipped": 144, "unattested-homophone": 1, "stale-position": 3}）
- 摘要：glm53-flash 生成＋獨立證據審查，{"mainPoints": 2, "discussionTopics": 2, "referenceViews": 2}，逐字回查不通過 0 條
- 狀態：candidate-review-required（尚未逐句人工聽核）

## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）

| sentenceId | ASR | 底本 | 規則 | 句相似度 |
|---|---|---|---|---|
| seg-0002 | 夜 | 業 | strict-homophone | 0.713 |
| seg-0003 | 運 | 蘊 | glossary-homophone | None |
| seg-0003 | 夜 | 業 | strict-homophone | 0.636 |
| seg-0004 | 運 | 蘊 | strict-homophone | 0.625 |
| seg-0004 | 運 | 蘊 | strict-homophone | 0.625 |
| seg-0005 | 夜 | 業 | strict-homophone | 0.753 |
| seg-0006 | 運 | 蘊 | strict-homophone | 0.625 |
| seg-0050 | 夜 | 業 | glossary-homophone | None |
| seg-0051 | 夜 | 業 | glossary-homophone | None |
| seg-0057 | 夜 | 業 | strict-homophone | 0.609 |
| seg-0058 | 運 | 蘊 | glossary-homophone | None |
| seg-0060 | 運 | 蘊 | glossary-homophone | None |
| seg-0069 | 夜 | 業 | glossary-homophone | None |
| seg-0070 | 運 | 蘊 | glossary-homophone | None |
| seg-0071 | 運 | 蘊 | glossary-homophone | None |
| seg-0080 | 運 | 蘊 | glossary-homophone | None |
| seg-0093 | 運 | 蘊 | glossary-homophone | None |
| seg-0094 | 運 | 蘊 | glossary-homophone | None |
| seg-0119 | 運 | 蘊 | glossary-homophone | None |
| seg-0124 | 運 | 蘊 | glossary-homophone | None |
| seg-0129 | 運 | 蘊 | glossary-homophone | None |
| seg-0139 | 維 | 惟 | glossary-homophone | None |
| seg-0140 | 維 | 惟 | glossary-homophone | None |
| seg-0143 | 維 | 惟 | glossary-homophone | None |
| seg-0144 | 維 | 惟 | glossary-homophone | None |
| seg-0146 | 維 | 惟 | glossary-homophone | None |
| seg-0151 | 維 | 惟 | glossary-homophone | None |
| seg-0155 | 維 | 惟 | glossary-homophone | None |
| seg-0156 | 維 | 惟 | glossary-homophone | None |
| seg-0157 | 維 | 惟 | glossary-homophone | None |
| seg-0158 | 維 | 惟 | glossary-homophone | None |
| seg-0159 | 維 | 惟 | glossary-homophone | None |
| seg-0161 | 韻 | 蘊 | glossary-homophone | None |
| seg-0162 | 韻 | 蘊 | glossary-homophone | None |
| seg-0163 | 韻 | 蘊 | glossary-homophone | None |
| seg-0164 | 韻 | 蘊 | strict-homophone | 0.55 |
| seg-0168 | 韻 | 蘊 | strict-homophone | 0.591 |
| seg-0170 | 韻 | 蘊 | glossary-homophone | None |
| seg-0171 | 夜 | 業 | glossary-homophone | None |
| seg-0172 | 夜 | 業 | strict-homophone | 0.625 |
| seg-0175 | 夜 | 業 | strict-homophone | 0.571 |
| seg-0182 | 維 | 惟 | glossary-homophone | None |
| seg-0184 | 式 | 世 | glossary-homophone | None |
| seg-0186 | 式 | 世 | glossary-homophone | None |
| seg-0188 | 維 | 惟 | glossary-homophone | None |
| seg-0189 | 韻 | 蘊 | glossary-homophone | None |
| seg-0190 | 韻 | 蘊 | glossary-homophone | None |
| seg-0191 | 韻 | 蘊 | glossary-homophone | None |
| seg-0194 | 韻 | 蘊 | glossary-homophone | None |
| seg-0195 | 韻 | 蘊 | glossary-homophone | None |
| seg-0197 | 夜 | 業 | glossary-homophone | None |
| seg-0198 | 韻 | 蘊 | glossary-homophone | None |
| seg-0199 | 韻 | 蘊 | glossary-homophone | None |
| seg-0201 | 韻 | 蘊 | glossary-homophone | None |
| seg-0207 | 韻 | 蘊 | glossary-homophone | None |
| seg-0213 | 韻 | 蘊 | glossary-homophone | None |
| seg-0225 | 維 | 惟 | glossary-homophone | None |
| seg-0243 | 韻 | 蘊 | glossary-homophone | None |
| seg-0244 | 韻 | 蘊 | glossary-homophone | None |
| seg-0255 | 孕 | 蘊 | glossary-homophone | None |
| seg-0256 | 孕 | 蘊 | glossary-homophone | None |
| seg-0259 | 孕 | 蘊 | glossary-homophone | None |
| seg-0264 | 孕 | 蘊 | glossary-homophone | None |
| seg-0267 | 孕 | 蘊 | glossary-homophone | None |
| seg-0269 | 孕 | 蘊 | glossary-homophone | None |
| seg-0273 | 孕 | 蘊 | glossary-homophone | None |
| seg-0277 | 孕 | 蘊 | glossary-homophone | None |
| seg-0312 | 升 | 生 | glossary-homophone | None |
| seg-0316 | 孕 | 蘊 | glossary-homophone | None |
| seg-0317 | 孕 | 蘊 | glossary-homophone | None |
| seg-0424 | 直 | 執 | glossary-homophone | None |
| seg-0425 | 直 | 執 | glossary-homophone | None |
| seg-0430 | 直 | 執 | glossary-homophone | None |
| seg-0451 | 澆 | 膠 | strict-homophone | 0.591 |
| seg-0459 | 澆 | 膠 | glossary-homophone | None |
| seg-0512 | 值 | 執 | glossary-homophone | None |
| seg-0629 | 質 | 執 | glossary-homophone | None |
| seg-0630 | 質 | 執 | glossary-homophone | None |
| seg-0631 | 質 | 執 | glossary-homophone | None |
| seg-0634 | 質 | 執 | glossary-homophone | None |
| seg-0689 | 升 | 生 | strict-homophone | 0.591 |
| seg-0707 | 例 | 立 | glossary-homophone | None |
| seg-0709 | 例 | 立 | glossary-homophone | None |
| seg-0713 | 例 | 立 | strict-homophone | 0.558 |
| seg-0717 | 例 | 立 | glossary-homophone | None |
| seg-0718 | 例 | 立 | glossary-homophone | None |
| seg-0722 | 例 | 立 | glossary-homophone | None |
| seg-0724 | 地 | 諦 | glossary-homophone | None |
| seg-0735 | 靜 | 境 | glossary-homophone | None |
| seg-0747 | 利 | 立 | strict-homophone | 0.553 |
| seg-0761 | 維 | 惟 | glossary-homophone | None |
| seg-0827 | 佈 | 布 | glossary-homophone | None |
| seg-0856 | 孕 | 蘊 | glossary-homophone | None |
| seg-0857 | 孕 | 蘊 | glossary-homophone | None |
| seg-0862 | 孕 | 蘊 | glossary-homophone | None |
| seg-0863 | 孕 | 蘊 | glossary-homophone | None |
| seg-0874 | 孕 | 蘊 | glossary-homophone | None |
| seg-0881 | 孕 | 蘊 | strict-homophone | 0.625 |
| seg-0889 | 孕 | 蘊 | strict-homophone | 0.571 |
| seg-1004 | 值 | 執 | glossary-homophone | None |
| seg-1006 | 值 | 執 | glossary-homophone | None |
| seg-1009 | 孕 | 蘊 | glossary-homophone | None |
| seg-1029 | 值 | 執 | glossary-homophone | None |
| seg-1185 | 值 | 執 | glossary-homophone | None |
| seg-1188 | 值 | 執 | glossary-homophone | None |
| seg-1190 | 值 | 執 | glossary-homophone | None |
| seg-1191 | 值 | 執 | glossary-homophone | None |
| seg-1192 | 指 | 執 | glossary-homophone | None |
| seg-1198 | 值 | 執 | glossary-homophone | None |
| seg-1202 | 值 | 執 | glossary-homophone | None |
| seg-1219 | 值 | 執 | glossary-homophone | None |
| seg-1220 | 值 | 執 | glossary-homophone | None |
| seg-1221 | 值 | 執 | glossary-homophone | None |
| seg-1222 | 值 | 執 | glossary-homophone | None |
| seg-1224 | 值 | 執 | glossary-homophone | None |
| seg-1225 | 值 | 執 | glossary-homophone | None |
| seg-1229 | 值 | 執 | glossary-homophone | None |
| seg-1230 | 值 | 執 | glossary-homophone | None |
| seg-1231 | 值 | 執 | glossary-homophone | None |

## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）

| sentenceId | ASR | 底本 | 原因 |
|---|---|---|---|
| seg-0367 | 是 | 事 | unattested-homophone |

- 整段口語刪節／改寫（editorial-divergence）共 106 處、標點差異 0 處、正寫法差異 3 處：一律保留 ASR 原樣，完整清單見 `correction_candidates.json`。

