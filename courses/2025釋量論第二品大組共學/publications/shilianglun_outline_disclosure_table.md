# 《釋量論・第二品》大組共學 — 討論提綱與法師開示對照

一份可攜帶的單頁對照表：每一講的**共學提綱**，每一題附**法師開示的 YouTube
直接連結**（點擊即跳到該段開示）。

- 線上版本：<https://huanruilee.github.io/Transcriptions/courses/2025%E9%87%8B%E9%87%8F%E8%AB%96%E7%AC%AC%E4%BA%8C%E5%93%81%E5%A4%A7%E7%B5%84%E5%85%B1%E5%AD%B8/publications/shilianglun_outline_disclosure_table.html>
- 頁面本體：`shilianglun_outline_disclosure_table.html`（完全自足，inline CSS + JS，無外部相依）

## 內容

| 項目 | 數量 |
|---|---|
| 講次 | 47 |
| 題目 | 130 |
| 開示連結 | 160 |
| 有開示的題 | 116 |
| 未討論的題 | 14 |

資料來源為 2025《釋量論．第二品》大組共學 YouTube 播放清單
`PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh`（共 51 支，其中 4 支為私人影片，
說明欄無法取得，未列入本頁）。

## 頁面功能

- **側邊目錄**（47 講）＋捲動時自動標示目前講次
- **全文搜尋**：即時標示命中片段、顯示命中筆數、Esc 或 ✕ 清除
- **行動版**：目錄改為可展開抽屜
- **列印樣式**：白底、去除導覽與操作元件
- **「這個頁面怎麼來的」**：頁面底部內嵌本頁的產生方法說明

## 資料更新

本頁**不是手寫的 HTML**，而是由 `shilianglun_table_build.py` 產生。
要新增或更新內容，修改產生器後重新執行：

```bash
python3 shilianglun_table_build.py \
  --playlist PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh \
  --out shilianglun_outline_disclosure_table.html \
  --cache shilianglun_desc_cache.json
```

`--cache` 會記住已抓取的影片說明欄，之後更新只抓新增的影片。

### 資料來源

1. **播放清單**（決定有哪些講、順序、影片 ID）

   ```bash
   yt-dlp --flat-playlist --dump-json \
     'https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh'
   ```

2. **每支影片的「共學提綱」與「影片段落」**（決定題目與開示時間碼）

   ```bash
   yt-dlp --dump-json --skip-download 'https://www.youtube.com/watch?v=<VIDEO_ID>'
   ```

   取 `description` 欄位中的兩段：
   - `❓共學提綱：` —— 節標題（一、二、三…）＋ 題號＋題幹＋子題⑴⑵… → 提綱卡片
   - `🎞️影片段落：` —— 章節時間碼與章節名 → 開示連結

### 開示時間碼的對應規則

官方章節結構：

```
0:06:48 第1題⑴            ← 主持人讀題
0:17:43 第1題⑵            ← 同一題的下一個子題
0:31:37 法師指導 1:29:04   ← 法師開示（起點在此，括號為結束時間）
```

- **開示起點** = 該題的「法師指導」章節時間
- **開示終點** = 下一個章節的時間（使區間涵蓋整段開示而不切斷）
- 一題有多個讀題章節時（如 `第1題⑴`、`第1題⑵`），其後的第一個「法師指導」
  即為該題開示，標籤合併為 `第1題⑴⑵`
- 該講沒有「法師指導」章節 → 標示「此題該講未討論（他日再論）」

### 附帶檔案

| 檔案 | 內容 |
|---|---|
| `shilianglun_table_build.py` | 產生器腳本（單檔，內含樣式與解析邏輯） |
| `shilianglun_desc_cache.json` | 已抓取的影片說明欄快取 |
| `shilianglun_playlist_snapshot.jsonl` | 產生當下的播放清單快照 |

## 校對說明

本表的**時間碼與題號對應取自官方 YouTube 章節**（影片說明欄「影片段落」），
不是人工逐段聽核。標示為「此題該講未討論（他日再論）」者，依官方章節即無開示
段落。
