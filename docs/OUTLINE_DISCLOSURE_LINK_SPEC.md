# 藍圖提綱 ↔ 共學提綱 ↔ 法師開示 三層對照 產出規格

適用於「有藍圖提綱、有每講共學提綱、有法師開示錄影」這類共學課程。
2025《釋量論・第二品》大組共學為第一份實作基準（`courses/2025釋量論第二品大組共學/outline-links/`）。
本規格之目的：使同一產出流程可套用於其他課次／其他法師／其他課程，產出結果可稽核、可重建。

## 一、產出物定義

一次產出包含四個檔案，置於 `courses/<課程slug>/outline-links/`：

| 檔案 | 角色 | 必備 |
|---|---|---|
| `outline-disclose-map.json` | **機器可讀主檔**。所有結構化資料的唯一真實來源 | 是 |
| `提綱與法師開示對照.html` | 對照頁（藍圖提問 → 共學提綱題目 → 法師開示 時間碼連結） | 是 |
| `提綱與法師開示對照.md` | 同上之純文字版，供檢索與 diff | 是 |
| `藍圖提綱三層對照.html` | 藍圖提綱三層（課程提綱／討論提綱／逐字稿）對照 | 視需求 |

**原則**：`outline-disclose-map.json` 是唯一真實來源（single source of truth）。HTML 與 MD 皆為其**衍生渲染產物**，可重新產生，不得手改。任何人要修內容，修 map 後重跑產生器。

## 二、資料模型（`outline-disclose-map.json`）

頂層為 **陣列**，每元素代表一支影片：

```json
{
  "id": "7QA1k4uxxV0",
  "title": "第1講 調整學法的動機（上）｜2025《釋量論・第二品》大組共學",
  "duration": 8879,
  "desc": "影片說明欄全文（原始字串）",
  "outline": [
    {
      "section": "一",
      "heading": "解釋開經偈",
      "questions": [
        {
          "num": 1,
          "body": "題目本文",
          "subs": ["⑴ 選項一", "⑵ 選項二"],
          "segs": [
            {
              "q": 1,
              "subs": [],
              "start": 1897,
              "end": 5364,
              "label": "法師指導 1:29:04",
              "prev_label": "第1題⑵",
              "prev_all": ["第1題⑴", "第1題⑵"],
              "cover": "第1題⑴⑵"
            }
          ]
        }
      ]
    }
  ],
  "segs": [ /* 該影片全部章節，依時間序；欄位同上 */ ]
}
```

### 欄位語意

- `outline[].questions[].body`：共學提綱的題目正文（**逐字**，來自影片說明欄 `desc`）
- `outline[].questions[].subs`：該題的子項／選項（逐字）
- `segs[].start` / `segs[].end`：**秒**（整數），法師開示區間
- `segs[].prev_label`：該開示緊接前一章節的標籤（如「第1題⑵」）
- `segs[].prev_all`：該開示**實際回答的**題目集合（可能跨多個子項）
- `segs[].cover`：`prev_all` 的壓縮顯示形式（「第1題⑴⑵」）
- `segs[].label`：章節原始標籤（「法師指導 1:29:04」），`start` 與 `label` 內時間須一致

### 來源檔對應

| 資料 | 來源 | 抽取方式 |
|---|---|---|
| 共學提綱（題目、選項、章節） | 影片說明欄 `desc` | 解析 `❓共學提綱：` 區塊 |
| 章節時間碼 | 影片說明欄 `desc` | 解析 `🎞️影片段落：` 區塊（`0:06:48 第1題⑴` → 秒） |
| 影片 id / 標題 / 長度 | YouTube | playlist + 影片頁 |
| 藍圖提問 | `courses/<slug>/source_outlines/<SS-NN>.json` 的 `discussionOutline[]` | 逐筆對應後填入 |

## 三、三層對應模型

對照頁呈現三層，缺一不可：

1. **藍圖提問**（source layer）—— `source_outlines/*.json` 的 `discussionOutline`
2. **共學提綱題目**（outline layer）—— `desc` 內 `❓共學提綱：` 的編號題目
3. **法師開示**（disclosure layer）—— 章節時間碼，連回 YouTube `&t=<start>s`

藍圖提問在對照頁中以 `.bp` 區塊呈現，附 `(來源 SS-NN 第N題｜信心 confidence)` 出處標記。
**沒有對應共學題目的藍圖提問亦須呈現**，標為 `unmatched`，不得靜默丟棄 —— 未討論的問題本身就是重要資訊。

## 四、對應品質判定

每筆對應在 `source_outlines/*.json` 的 `mappings[]` 中留下可稽核紀錄：

```json
{
  "sourceQuestionNo": 2,
  "sessionId": "01",
  "sessionQuestionId": "q-21-02",
  "confidence": "medium",
  "status": "confirmed",
  "evidence": "藍圖提問：…
對應共學提綱：第1講…第2題
提綱原文：…
判定：teaching（語意相似度 0.77）
法師開示：1:40:46–1:54:41｜URL
對應開示問答：…",
  "outlineRef": {
    "videoId": "7QA1k4uxxV0",
    "section": "二",
    "questionNo": 2,
    "videoTitle": "第1講 調整學法的動機（上）｜…"
  }
}
```

### confidence 定義（**保守，不得灌水**）

| 值 | 判定條件 | 允許依據 |
|---|---|---|
| `high` | 藍圖提問與共學題目**語意同一**，且講者意圖、涵蓋範圍一致 | 語意相似度 ≥ 0.90 |
| `medium` | 語意高度相關，但講者角度或切入點有調整 | 語意相似度 0.70–0.89 |
| `low` | 主題相關但非同一命題，屬延伸或背景 | 語意相似度 0.50–0.69 |
| `unmatched` | 該講未以此命題提問 | 無 |

**規則**：
- `high` 必須附語意相似度數值與理由；不得僅憑關鍵詞重疊判 `high`
- `low` 與 `unmatched` 必須在對照頁上**視覺區隔**，不得與 `high`/`medium` 混同
- **`high` 門檻的實測必要性**：首份基準資料（2025 大組共學）實測發現 27 筆標為 `high` 的對應，其 evidence 內附相似度低於 0.90（最低 0.64），顯示 confidence 存在系統性灌水。本契約 C6 正是為攔截此類情形而立，**門檻不得下修**。
- `evidence` 必須含：藍圖提問原文、共學提綱原文、判定依據、法師開示時間碼與連結
- 不得因「看起來有關」就升級 confidence

### status 定義

| 值 | 意義 | 可否發布 |
|---|---|---|
| `confirmed` | 對應成立且已核 | 可 |
| `candidate` | 初步對應成立，但**關聯逐字稿尚未轉寫完成**，待補入對應句號 | 可，但須於頁面標示 |
| `unmatched` | 該講無對應命題 | 可（須呈現） |
| `pending` | 待人工判定 | **否** |

`candidate` 為實務上必要的中間狀：藍圖提問已對應到共學題目，但該講逐字稿尚未完成，無法補入法師開示的具體對應句。此類對應**不得標為 `confirmed`**。

## 五、對應產出流程（可重現）

### 步驟 1：取得原始資料
1. 由課程 playlist 取得全部影片 id、標題、長度
2. 逐片取得說明欄全文 → 存入 `desc`
3. 解析 `desc` 中 `❓共學提綱：` 與 `🎞️影片段落：` 區塊

### 步驟 2：建構 outline 與 segs
- 依 `❓共學提綱：` 的 `一、二、三…` 切 section，依 `1. 2. 3.` 切 question，倚 `⑴⑵⑶⑷` 切 sub
- 依 `🎞️影片段落：` 逐行解析章節標籤與起點秒數
- 章節的**結束時間**取下一章節的起點；末章節取影片長度
- 標為「法師指導」或「法師開示」的章節才產生 `segs` 對應關係

### 步驟 3：對應藍圖提問
- 依 `source_outlines/<SS-NN>.json` 的 `sessionIds` 決定該藍圖提問對應哪些講次
- 逐筆以語意比對，產出 `mappings[]`，寫入 evidence
- 依第 四 節規則判定 confidence 與 status

### 步驟 4：渲染
- 由 `outline-disclose-map.json` 渲染 HTML 與 MD
- **不得手改 HTML/MD**；改動一律回到 map

### 步驟 5：稽核
- 執行 `scripts/audit_outline_links.py`（見第六節）
- 稽核不通過不得發布

## 六、稽核契約

### C1 抽屜完整性
每一筆 `mappings[]` 對應到的法師開示區間，必須在對應頁上可見。不得有藍圖提問被丟失。

### C2 時間碼自洽
- `segs[].start` < `segs[].end` ≤ 影片長度
- `segs[].label` 內嵌時間與 `start` 一致
- 同一部影片的 segs 依 `start` 遞增且不重疊

### C3 連結可用
每個法師開示連結為 `https://www.youtube.com/watch?v=<id>&t=<start>s`，且 `<id>` 存在於該課程 playlist。

### C4 逐字忠實
- `body` 與 `subs` 與 `desc` 中對應文字**逐字相同**（正規化僅限統一空白與全形標點）
- `desc` 本身不得被改寫

### C5 對應有據
每筆 `mappings[]` 的 `evidence` 非空，且能辨識出**藍圖提問原文**與**共學提綱原文**。

evidence 的**首行格式**為 `藍圖提問：…`，其後逐行記錄 `對應共學提綱：`、`提綱原文：`、`判定：`、`法師開示：`。
若對應來源非本規格所定義之藍圖提綱（例如改用逐字稿對照稿），evidence 格式可另立，**但必須同樣能指出「藍圖提問」與「共學提綱」兩側的原文**，否則視為 C5 不通過。

**實務基準**：`status=candidate` 之對應，其 evidence 允許以「待 XXX 轉寫完成後補入對應句號」結尾（此時無對應句可引），但仍須指出所對應的講次、章節與題號。

### C6 confidence 保守
- `high` 必須含相似度數值
- 相似度 < 0.70 者不得標 `high`
- `unmatched` 必須有說明文字

### C7 產物可重建
`outline-disclose-map.json` 重新渲染後，HTML/MD 內容不變。

## 七、發布與版控規則

1. **產物必入版控**：`outline-links/` 四檔案須與課程本體同 PR 提交，不得滯留 untracked
2. **map 與產物同 PR**：避免 map 與 HTML 不同步
3. **簽核保護**：若 `source_outlines/*.json` 的某筆已有獨立審查簽核，對應產物不得逕行改寫該筆語意；須走受控變更
4. **不得冒稱**：未完成對應者標 `pending`，不得在頁面上宣稱已完成對照

## 八、套用另一門課的檢查清單

### 8.1 前置條件（必須齊備，缺一則該課不適用本規格）

| # | 前置條件 | 判定方式 |
|---|---|---|
| P1 | 有**藍圖提綱**（研討問題清單） | `source_outlines/*.json` 的 `discussionOutline` 非空 |
| P2 | 有**每講共學提綱**（逐講的題目與選項） | 影片說明欄含 `❓共學提綱：` 區塊，或有等價之逐講提綱來源 |
| P3 | 有**法師開示的時間碼** | 影片說明欄含 `🎞️影片段落：` 區塊，或 YouTube 章節可取得 |
| P4 | 提綱與開示**可在同一時間軸上對位** | 兩者同屬一支影片或同一講次 |

**P2/P3 不成立時**，本規格的「三層對照」退化為「藍圖提綱 ↔ 逐字稿」兩層對照，
應改用 `docs/REFERENCE_EVIDENCE_PROTOCOL.md` 的證據對照流程，**不得硬套本規格**。

### 8.2 資料模型變體

**已知第二實例（入中論善顯密意疏）的實測結果見第九節。**

同一規格在不同課程可能有下列變體，**須在該課程的 `outline-links/` 內以 `SCHEMA.md` 記錄**：

| 變體 | 2025 釋量論第二品大組共學 | 入中論善顯密意疏 |
|---|---|---|
| `sourceId` 命名 | `SS-NN`（如 `32-01`） | `NN` / `NNA` / `NNB`（如 `01`、`29A`、`36A`） |
| `discussionOutline` 元素 | 純字串陣列 | 純字串陣列 |
| `mappings[]` | 已建立（232 筆） | **空**（尚未做對應） |
| 開示來源 | 影片說明欄章節 + YouTube | 逐字稿 session（無影片章節） |

**`sourceId` 命名不影響稽核器**（稽核器以檔名與內容為準，不解析 `SS-NN`），
但 `sessionIds` 必須能對應到 `course.json` 的 `sessions[].sessionId`，此點為硬性要求。

### 8.3 執行步驟

- [ ] 確認 P1–P4 齊備；不齊備則改走其他流程
- [ ] 確認說明欄格式（`❓共學提綱：`、`🎞️影片段落：`）與本規格一致；格式不同者需改寫解析器並將差異記錄於本規格
- [ ] 確認 `source_outlines/*.json` 的 `sessionIds` 能對應 `course.json` 的 `sessions[].sessionId`
- [ ] 產出 `outline-disclose-map.json`（欄位依第二節；變體差異記於 `outline-links/SCHEMA.md`）
- [ ] 逐筆填 `mappings[]`：判定 confidence 與 status，寫入 evidence（依第三、四節）
- [ ] 由 map 渲染 HTML 與 MD（不得手改產物）
- [ ] 跑 `scripts/audit_outline_links.py --course <課程slug>`，C1–C7 全 PASS
- [ ] 產物入版控，與 map 同 PR 提交
- [ ] 於課程說明頁標示對照頁入口

### 8.4 產出工具的最低要求

規格不強制特定實作，但**產生器必須滿足**：

1. **單一來源**：只讀 `outline-disclose-map.json`，輸出 HTML 與 MD
2. **冪等**：同一 map 重跑，產物位元組相同（C7 可驗）
3. **可指定課程**：`--course <slug>` 或等價參數，不得寫死單一課程路徑
4. **產物可見變更差異**：重跑若有差異，須能列出差異（供版控審查）

## 九、基準實測結果（2025 釋量論第二品大組共學）

以 `scripts/audit_outline_links.py` 稽核首份實作資料，結果如下。**此為基準線，其他課程套用時應優於或至少持平**：

| 契約 | 結果 | 說明 |
|---|---|---|
| C1 抽屜完整性 | PASS | 232 筆映射（unmatched 148、candidate 12），可見 segs 159，缺 0 |
| C2 時間碼自洽 | PASS | 163 段、0 違例 |
| C3 連結可用 | PASS | 324 筆連結、45 支影片，0 違例 |
| C4 逐字忠實 | PASS | 469 處題目與選項與說明欄逐字相符 |
| C5 對應有據 | **FAIL** | 32-27.json 的 6 筆 evidence 未標示藍圖提問原文 |
| C6 confidence 保守 | **FAIL** | 27 筆標 `high` 之相似度低於 0.90（最低 0.64） |
| C7 產物可重建 | 部分 FAIL | HTML `.bp` 區塊 68 個，低於對應數上限 84 |

**結論**：資料結構與時間碼層面（C1/C2/C3/C4）健全；**對應判定層面（C5/C6/C7）存在實質缺陷**，正是本規格要攔截的對象。C5 的 6 筆與 C6 的 27 筆需人工補完與降級。

**另一課程的適用性實測（入中論善顯密意疏）**：

| 前置條件 | 結果 |
|---|---|
| P1 有藍圖提綱 | 30/30 檔 `discussionOutline` 非空 |
| P4 `sessionIds` 可對應 `course.json` | 30/30 檔可對應，**零例外**（sessions + pendingSessions 合計 219 支） |
| P2/P3 | **不成立** —— 入中論為逐字稿型，無「影片說明欄共學提綱 + 章節時間碼」 |

**判定**：入中論**不適用本規格的三層對照**，應改走 `docs/REFERENCE_EVIDENCE_PROTOCOL.md` 的兩層證據對照流程。其 `source_outlines/` 已具備 `discussionOutline` 與 `sessionIds`，**未來若補上對應作業，可直接沿用本規格的 confidence / status / evidence 契約**（僅須省去 C1、C2、C3 的開示時間碼部分）。

## 十、已知限制

1. **無全自動對應**：藍圖提問與共學題目需語意判斷，工具產出為結構化骨架 + 人工/LLM 判定，confidence 保守化是防止灌水的關鍵
2. **章節時間碼精度**：章節起點由影片說明欄提供，粒度為章節級（通常 1–10 分鐘），非逐句
3. **說明欄格式依賴**：若原始說明欄未採 `❓共學提綱：`/`🎞️影片段落：` 格式，需先做格式轉換並記錄
4. **藍圖提問數 ≠ 題目數**：藍圖提問可能多於或少於該講實際提問數，`unmatched` 為正常狀態
