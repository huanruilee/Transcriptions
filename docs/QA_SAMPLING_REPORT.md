# Transcriptions 系列課程逐字稿多媒體學習平台 — QA 抽樣檢驗報告

> **檢驗日期**：2026-08-12  
> **檢驗者**：獨立 QA（Hermes Agent）  
> **工作區路徑**：`/home/henry/.gx10/xiaofa/workspace/Transcriptions`  
> **部署 URL**：`https://gx10-2887.tail378c21.ts.net:9090/index.html`  
> **Git 最新 commit**：`cddc167` — docs: 更新 TASKS.md 進度（101/106 堂 [95%]）

---

## 1. 即時網頁運作

**評分：5/5**

| 資源路徑 | HTTP 狀態 | 內容類型 | 備註 |
|---|---|---|---|
| `index.html` | 200 | text/html | 標題為「入中論善顯密意疏 逐字稿多媒體學習平台」 |
| `css/main.css` | 200 | text/css | 正常載入 |
| `js/app.js` | 200 | application/javascript | 正常載入 |
| `courses/入中論善顯密意疏/course.json` | 200 | application/json | 正常載入 |
| `courses/入中論善顯密意疏/sessions/session_01.json` | 200 | application/json | 與本地檔案 byte-identical |
| `audio/01.mp3` | 200 | audio/mpeg | 19,729,539 bytes (~19.7 MB)，支援 `Accept-Ranges: bytes` |

**證據**：
```
$ curl -sk -o /dev/null -w "%{http_code}" "https://gx10-2887.tail378c21.ts.net:9090/<path>"
200  index.html
200  css/main.css
200  js/app.js
200  courses/入中論善顯密意疏/course.json
200  courses/入中論善顯密意疏/sessions/session_01.json
200  audio/01.mp3
```

**結論**：所有 6 項資源均正常回應 HTTP 200，音訊檔案內容類型正確且支援 range 請求（可快轉）。

---

## 2. session JSON 數據完整性

**評分：5/5**

抽樣檢查 4 個 session（涵蓋早期、中期、近期、最新）：

| 檔案 | sessionId | 段落數 | 首段句子數 | 頁碼標記 | Schema 符合度 |
|---|---|---|---|---|---|
| `session_01.json` | 01 | 128 | 5 | `[p.63]` | ✅ 完全符合 |
| `session_02A.json` | 02A | 106 | 4 | `[p.63]` | ✅ 完全符合 |
| `session_30A.json` | 30A | 136 | 5 | `[p.100]` | ✅ 完全符合 |
| `session_68A.json` | 68A | 321 | 5 | `[p.204]` | ✅ 完全符合 |

**Schema 驗證細節**（逐項檢查 `DATA_SCHEMA.md` 要求）：

- ✅ 頂層 `sessionId`：全部存在且為 string
- ✅ 頂層 `paragraphs`：全部存在且為 array
- ✅ 段落 `id`、`start`、`end`、`sentences`：全部存在
- ✅ 句子 `start`、`end`、`text`：全部存在且 numeric 正確
- ✅ 句子 `start ≤ end`：全部符合
- ✅ 頁碼標記 `[p.XX]`：全部 101 個 session 皆有（每 session 至少 1 個）

**全域統計**：
- 總 session 數：101
- 有頁碼標記的 session：101（100%）
- 無頁碼標記的 session：0

**結論**：抽樣 session 完全符合 DATA_SCHEMA，全域 101 個 session 皆有頁碼標記。

---

## 3. course.json 一致性

**評分：5/5**

| 項目 | 數量 | 結果 |
|---|---|---|
| `course.json` 中定義的 session 數 | 101 | — |
| `sessions/` 目錄下的實際檔案數 | 101 | — |
| 在 course.json 但不在磁碟 | 0 | ✅ 無缺漏 |
| 在磁碟但不在 course.json | 0 | ✅ 無多餘 |

**course.json 結構驗證**：
- ✅ `courseId`: `"ru-zhong-lun"`
- ✅ `title`: `"入中論善顯密意疏"`
- ✅ `lecturer`: `"見無法師"`
- ✅ `sessions` array 中每個 item 皆有 `sessionId`, `sessionNum`, `subSession`, `date`, `audioUrl`, `jsonUrl`

**結論**：course.json 與實際 session 檔案完全一一對應，無缺漏、無多餘。

---

## 4. toc.json 科判結構

**評分：5/5**

| 項目 | 結果 |
|---|---|
| 合法 JSON | ✅ 可正常解析 |
| 頂層 `courseId` | `"ru-zhong-lun"` ✅ |
| 頂層 `sections` | 3 個頂層節點 ✅ |
| 總節點數 | 28 |
| 有 `sessionId` 的節點 | 28/28（100%）✅ |
| 有 `timestamp` 的節點 | 28/28（100%）✅ |
| 有 `title` 的節點 | 28/28（100%）✅ |

**科判層級分佈**：

| 層級 | 數量 | 說明 |
|---|---|---|
| 甲 | 3 | 甲一 歸敬頌、甲二 造論宗旨、甲三 正釋論體 |
| 乙 | 3 | 嵌套於甲之下 |
| 丙 | 10 | 嵌套於乙之下 |
| 丁 | 6 | 葉節點，含 sessionId 與 timestamp |

**頂層 sections 樣本**：
```
甲一 歸敬頌 | sid=01 | ts=0
甲二 造論宗旨 | sid=02A | ts=0
甲三 正釋論體 | sid=02B | ts=0
```

**結論**：toc.json 為合法 JSON，具有完整的甲/乙/丙/丁 四層嵌套科判結構，所有 28 個節點皆含 sessionId 與 timestamp。

---

## 5. npm test

**評分：5/5**

```
$ npm test

> transcriptions-platform@1.0.0 test
> node --test tests/unit/*.test.js

TAP version 13
# Subtest: Verify course.json schema integrity
ok 1 - Verify course.json schema integrity
# Subtest: Verify toc.json schema integrity
ok 2 - Verify toc.json schema integrity
# Subtest: Verify session_02A.json schema integrity
ok 3 - Verify session_02A.json schema integrity
# Subtest: segmentSentences breaks paragraphs on pause >= 1.5s
ok 4 - segmentSentences breaks paragraphs on pause >= 1.5s
# Subtest: findSentenceIndexByTime finds correct index using O(log N) binary search
ok 5 - findSentenceIndexByTime finds correct index using O(log N) binary search
1..5
# tests 5
# pass 5
# fail 0
# cancelled 0
# skipped 0
# duration_ms 50.967838
```

**結論**：5/5 測試全部通過，無失敗、無跳過。

---

## 總評

| 檢驗項目 | 評分 | 備註 |
|---|---|---|
| 1. 即時網頁運作 | 5/5 | 6/6 資源 HTTP 200，音訊內容正確 |
| 2. session JSON 數據完整性 | 5/5 | 抽樣 4/4 完全符合 Schema，全域 101/101 有頁碼 |
| 3. course.json 一致性 | 5/5 | 101/101 完全對應，無缺漏多餘 |
| 4. toc.json 科判結構 | 5/5 | 合法 JSON，甲/乙/丙/丁 四層完整，28/28 節點含 sessionId+timestamp |
| 5. npm test | 5/5 | 5/5 全部通過 |
| **總計** | **5/5** | **25/25** |

---

## 發現的次要問題（非阻塞）

| # | 問題 | 嚴重度 | 建議 |
|---|---|---|---|
| 1 | `src/courses/` 為空目錄但未被 `.gitignore` 排除，git status 顯示 `?? src/courses` | 低 | 若為殘留目錄可刪除；若有意使用則加入 `.gitignore` 或放入 `.gitkeep` |
| 2 | 每個 session 僅有 1 個 `[p.XX]` 頁碼標記（全域 101 個 session 各 1 個） | 資訊 | 若逐字稿跨越多頁，應確認是否所有頁碼都有標記；目前看來每堂課只標記起始頁 |

---

## 檢驗範圍與限制

- **網頁檢驗**：使用 `curl -sk` 驗證 HTTP 狀態碼與內容類型，未測試瀏覽器端 JavaScript 渲染
- **session 抽樣**：4/101 個 session 抽樣（涵蓋最早、次早、中期、最新），全域頁碼標記統計已覆蓋全部 101 個
- **course.json 一致性**：全域 101/101 比對
- **toc.json**：全域 28 個節點完整遍歷
- **npm test**：全域執行，5/5 通過

---

*報告產出時間：2026-08-12*  
*檢驗過程未修改任何專案檔案、未動 cron、未 push*
