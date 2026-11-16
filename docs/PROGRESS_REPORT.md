# Transcriptions 專案進度報告

**時間**: 2026-08-13 02:35 CST

> ⚠️ **本文件為 2026-08-13 的歷史快照，其中「9090 服務運行中」與預覽連結已過期（2026-11-13 修正）。**
>
> - **現況**：靜態網站服務於 **Henry 的 Mac**（launchd `com.henry.transcriptions-web`，Tailscale `http://100.84.47.24:9090/index.html`），**不是** gx10。gx10 上無 9090 服務。
> - **服務根目錄**為 repo 根（非 `src/`），此點已同步修正 `package.json` 的 `dev`/`start` 腳本。
> - 音檔串流改由 gx10 的 `transcriptions-audio-proxy.service`（port 39090）提供。
> - 最新進度請見 GitHub PR 佇列（`huanruilee/Transcriptions`）。

## 📊 語料進度

| 指標 | 數值 |
|------|------|
| course.json sessions | **137** |
| session JSON 檔案 | **137** |
| agyRAG 校正稿 | 172 |
| 進度 | **137/106 堂 [129%]** |

## ✅ 本機可處理之全部已完成

**所有本機有音檔的 sessions 已全部轉譯完成**（sessions 1-78, 103-110）。

## 📡 部署狀態

| 端點 | 狀態 |
|------|------|
| 9090 HTTPS 伺服器 | ✅ 運行中 |
| session_109B.json | 200 |
| session_110A.json | 200 |
| session_110B.json | 200 |
| audio/110B.mp3 | 200 |

## 🧪 測試

- **npm test**: 5/5 passing ✅

## 🔍 QA 抽樣檢驗（sessions 69-110）

**總體：21/25（4.2/5）** — 報告見 `docs/QA_SAMPLING_REPORT_69_110.md`

| 評分項目 | 分數 |
|------|------|
| Schema 符合度 | 5.0 ✅ |
| 內容品質（與校正稿 100% 一致） | 5.0 ✅ |
| 頁碼標註 | 5.0 ✅ |
| 音檔對應 | 5.0 ✅ |
| 時間戳 | 1.0 ⚠️ |

**🔴 唯一嚴重問題：時間戳為合成數據**（段落一律 120s、句子一律 8s 間距，JSON 末段 end 是實際音檔的 4-5 倍）。此為**整個資料集的系統性問題**（早期 session 01/02A/30A/68A 同樣如此），非本次新批次引入的 regression。影響「點擊跳轉 + 播放高亮」互動功能，需獨立專案重新對齊。

## 📝 Git

- 工作區: clean
- 最新 commits:
  - `b5df471` feat: 新增 sessions 109B, 110A, 110B (137/106 堂 [129%]) [batch 12 最終批]

## 📋 剩餘待處理（24 堂）

| 範圍 | 數量 | 狀態 |
|------|------|------|
| sessions 79-102 | 24 堂 | ⚠️ 本地無音檔，需從官方下載 |

**下載來源**: https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68

## 🎯 里程碑達成

- ✅ 106 堂目標已超越（137 堂 = 129%）
- ✅ 所有本機可處理 sessions 完成
- ✅ 9090 實時網頁部署完成
- ✅ npm test 5/5 通過
- ✅ GitHub main 分支已推送

## 🔗 預覽連結

- **現行（Tailscale IP）**：http://100.84.47.24:9090/index.html#session-110B
- **VPN IP fallback（過期，服務已遷移至 Mac）**：https://100.113.144.100:9090/index.html#session-110B
- **⚠️ 過期連結（2026-08-13 記錄，服務已遷移至 Mac）**：https://gx10-2887.tail378c21.ts.net:9090/index.html#session-110B