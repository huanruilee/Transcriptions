# 四念住 · 參考資料庫（Reference Inventory）

> 依 [docs/REFERENCE_EVIDENCE_PROTOCOL.md](../../../docs/REFERENCE_EVIDENCE_PROTOCOL.md) 的
> 「Reference inventory 必填資訊」與 [docs/TRANSCRIPTION_WORKFLOW.md](../../../docs/TRANSCRIPTION_WORKFLOW.md)
> §3「前置研讀、參考資料與基礎概念學習（Domain Grounding）」建立。
>
> **任何接手本課程校對的 Agent，開工前必須先讀本檔。**

## 一、這是什麼

四念住逐字稿是 **玅境長老 1996 年在美國法雲寺佛學院**宣講的 YouTube ASR 稿。
同一場演講另有 **整編定稿《四念住講記》**（玅境老和尚 口述、助手整理，32 頁）。

**講記是本課程的權威比對基準。** 名相、經文引句、段落結構有歧義時，
先查講記，再查原典（《俱舍論》《瑜伽師地論》《大般若經》）。

> ⚠️ 不要用「派 LLM 猜原文」的方式重建亂碼句 —— 講記本身就是同一場演講的原話整理，
> 直接抄比猜可靠得多。2026-11-16 這輪用講記一口氣找出 209 句規則對照表抓不到的亂碼。

## 二、來源清單

| referenceId | 類型 | 標題 | 位置 | 核對狀態 |
|---|---|---|---|---|
| `jiangji` | `edited-text-reference` | 《四念住講記》玅境老和尚 | `reference/jiangji_sinianzhu_jiangji_full.md`（+ `.json`）| ✅ verified |
| `youtube-series` | `asr-cross-check` | 玅境長老主講四念住01–08（YouTube `vairucana002`）| 影片 ID 見 `grounding.json` | ✅ verified |
| `qinxiufuhui` | `terminology-reference` | 勤修福慧《四念住講記》 | https://qinxiufuhui.github.io/posts/53223.html | ✅ verified |

### 線上來源

- 講記全文：<http://www.book853.com/show.aspx?id=1626&cid=12>（共 32 頁，`&page=N`）
- 影片：<https://www.youtube.com/playlist?list=PLwxMZvasISWyWiuSaZiuN1mhJ3Rsohn8X>

### 本機副本

```
reviews/evidence/sinianzhu/reference/
├── jiangji_sinianzhu_jiangji_full.md      357,043 B   講記全文（Markdown，分頁）
├── jiangji_sinianzhu_jiangji_full.json    362,336 B   同上（JSON，供程式讀）
└── fetch_jiangji.py                         2,972 B   抓取腳本（需瀏覽器 User-Agent）
```

SHA256（講記全文）：
```
c76f4ced1fc4cb66255634b471af646c7875b0187784f62754002f05278e02fe
```

### 重新抓取

```bash
python3 reviews/evidence/sinianzhu/reference/fetch_jiangji.py
# 寫到 /Users/henry/.hermes/cache/scratch/jiangji_full.md + .json
# 抓完請覆蓋 reference/ 下的副本並更新本檔的 SHA256
```

## 三、講記章節 ↔ 逐字稿講次對照

| 講記章節 | 頁 | 對應講次 |
|---|---|---|
| 前言 + 第一章 念住品 | p1–10 | s01、s02 |
| **第二章 骨鎖觀** | p11–13 | **s04** |
| **第三章 不淨所緣**（含尋思品）| p14–19 | **s03、s05、s07** |
| 第四章 四念住 | p20–30 | s06、s08 |
| 結語 / 後記 | p31–32 | — |

完整對照（含每頁標題）見 `courses/四念住/grounding.json` → `entities.textbook.chapter_map`。

## 四、工具

### 1. 找「講記裡找不到對應」的句子（找亂碼最有效）

```bash
python3 tools/sinianzhu_align_jiangji.py            # 全 8 講
python3 tools/sinianzhu_align_jiangji.py --report 04 # 印出可疑句
```

**原理**：講記全文建成 3-gram 索引（57,016 條），對逐字稿每句算命中率。
覆蓋率為 0 → 該句在講記中完全沒有對應 → 多半是 ASR 亂碼。

**閾值經 ground truth 校準**：正確句 0.33–1.00｜亂碼句 0.00–0.17。
N=3 時 13,075 句中僅 209 句為 0（可人工處理）；N≥4 會暴增到 32%+。

輸出 `/tmp/jj_nomatch.json`（格式：`{"03": [{sentenceId, text, coverage, reason}], ...}`）。

### 2. 查講記原文

```bash
python3 - << 'EOF'
import re
t = open("reviews/evidence/sinianzhu/reference/jiangji_sinianzhu_jiangji_full.md", encoding="utf-8").read()
i = t.find("骨鎖")
print(t[i-300:i+500])
EOF
```

**不要把整份講記讀進 context**（357KB）—— 用腳本分段檢索。

### 3. 法相詞頻對齊（驗證整體是否貼合講記）

比「逐句比對」有效。講記是整理稿（補標點、合句、去贅詞），
逐句完全吻合率僅 2.7%（只有經文引句會 100% 對上）——**這不是缺陷**。

```python
jiangji = norm(講記全文)
ours    = sum(s["text"].count(term) for 所有 session 的所有句子)
```

修正完成後的實測（2026-11-16）：

| 法相 | 講記 | 逐字稿 | | 法相 | 講記 | 逐字稿 |
|---|---|---|---|---|---|---|
| 不淨觀 | 233 | 226 | | 繫心 | 37 | 34 |
| 對治 | 103 | 105 | | 作意 | 68 | 68 |
| 勝解 | 110 | 98 | | 波羅蜜 | 39 | 39 |
| 骨鎖 | 95 | 63 | | 障道因緣 | 4 | 4 |
| 青瘀 | 49 | 40 | | 隨好 | 14 | 17 |
| 奢摩他 | 59 | 54 | | 其相 | 10 | 10 |

**若某法相講記 10 次、我們 0 次 → 該處漏改。**

## 五、名相對照表

完整版在 `courses/四念住/grounding.json` → `high_frequency_dubrinal_terms`
（21 條，含 ASR 錯寫群）。

| 正確 | 常見錯寫 |
|---|---|
| 不淨觀 | 不靜觀、不盡觀、不進觀、不敬觀、不盡管 |
| 對治 | 對峙 |
| 骨鎖 | 骨所、骨朔、骨索、古所、古說、鼓說、古人 |
| 勝解 | 聖節、聖潔、聖結、聖誡、聖別 |
| 繫心 | 細心、續心 |
| 青瘀 | 清淤、清餘、輕於、輕鬱、清慾、清雨 |
| 超作意 | 操作意味、超作義 |
| 初習業 / 已熟修 | 以書修 |
| 隨好 / 其相 | 誰好、水好 / 氣象 |
| 障道因緣 | 藏道姻緣、藏道理解 |
| 輕安 | 清安、情安、靖安 |
| 欲界定 | 預計定 |

### ⚠️ 不可機械替換的陷阱

- **`清慾`** 在某些句子是**正確的**（講者談「對治欲」不是青瘀觀屍）
- **`細心`** 在「細心地去讀」是**正確現代中文**，不是「繫心」
- **`遍滿所緣`** 是**合法經文用語**，只有相鄰完全重複的那筆才是幻覺
- **`以書修` → 已熟修**（不是初習業），依俱舍論頌文上下文判定

## 六、接手本課程的標準動作

1. 讀 `courses/四念住/grounding.json`（實體庫、名相表、講記章節對照）
2. 讀本檔（來源、工具、陷阱）
3. 跑 `tools/sinianzhu_align_jiangji.py` 取得候選
4. 對每個候選 → 查講記原文 → 決定：改寫 / 刪除（幻覺）/ 保留（無法還原）
5. 改動後同步 `contentOverview` 的 `evidence.quote` 並重算 `sourceDigest`
6. 自驗：
   ```bash
   node --test tests/unit/asrIntegrityGate.test.js   # → 8 pass / 0 fail
   npm run summaries:audit                            # → 353 valid / complete true
   ```

## 七、發布閘門現況（2026-11-16）

`npm run test:sinianzhu:release` + `npm run audit:sinianzhu` 三區塊：

| 區塊 | 狀態 | 備註 |
|---|---|---|
| structure | ✅ 8/8 PASS | 段落/時間戳/標題/無空句 |
| audio | ⛔ 0/8 | gate 的 regex 只認 mp3，但本課程用 YouTube iframe 播放（`mediaType: video/youtube`）；已上線的三主要道同樣過不了 → **gate 規格與 YouTube 架構不符** |
| semantic | ⛔ 0/8 | 每句 `reviewNeeded: true` + `publicationState: candidate-review-required`，需語意簽核 |

`audioAvailable: false` / `_meta.audioDeleted: true` 指的是**當初 ASR 用的本地下載音檔已刪**，
**不是音檔不存在** —— 播放器用 `youtubeVideoId` 串流。
