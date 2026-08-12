# Transcriptions 專案進度報告

**時間**: 2026-08-13 01:56 CST

## 📊 語料進度

| 指標 | 數值 |
|------|------|
| course.json sessions | **128** |
| session JSON 檔案 | **128** |
| agyRAG 校正稿 | 163 |
| 進度 | **128/106 堂 [121%]** |

## 📡 部署狀態

| 端點 | 狀態 |
|------|------|
| 9090 HTTPS 伺服器 | ✅ 運行中 |
| session_105A.json | 200 |
| audio/106A.mp3 | 200 |

## 🧪 測試

- **npm test**: 5/5 passing ✅

## 📝 Git

- 工作區: clean
- 最新 commits:
  - `c134637` feat: 新增 sessions 105A, 105B, 106A (128/106 堂 [121%])

## ⏰ 持續處理

- **手動執行 batch 10**（PID 524965，sessions 106B, 107A, 107B）
- **cron 善顯共學批次轉譯** (34f9f24d51ef) 每 30 分鐘自動執行

## 📋 剩餘待轉譯（9 堂）

| 範圍 | 數量 | 狀態 |
|------|------|------|
| sessions 79-102 | 24 堂 | ⚠️ 本地無音檔，需從官方下載 |
| sessions 106B-110B | 9 堂 | 本地有音檔，batch 10+ 處理中 |

## 🔗 預覽連結

https://gx10-2887.tail378c21.ts.net:9090/index.html#session-106A