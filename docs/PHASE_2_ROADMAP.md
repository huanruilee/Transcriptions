# Transcriptions Phase 2 Roadmap

**日期**：2026-10-16  
**作者**：小法（xiaofa）  
**基於**：origin/main `38b4b1e`  
**狀態**：草案，待 Henry 決策 + AGY review（可選）

---

## 1. 目標

把 Transcriptions 從「npm test 0 fail + 4 門課程 published」推進到「所有 priority issue 關閉 + 主要功能 PR merge」。

### 成功定義
1. ✅ npm test 仍 0 fail（不退步）
2. ✅ 所有 `status:blocked` 與 `status:needs-review` issue 解開或重新分類
3. ✅ 至少 1 個 high-priority 內容 issue（#130 / #13）有具體 progress
4. ✅ 4 個真正功能 PR（#225 #226 #246 #252）至少有 reviewer comment

---

## 2. 問題分組

### 🚨 Group A：紅旗（必處理）

| ID | 標題 | 阻擋 |
|---|---|---|
| Issue #10 | Live Preview 應用程式未初始化 | 部署端用戶可能看不到課程 |
| Issue #130 | Session 01 grounded proofreading | status:blocked，跨 sprint 卡關 |
| PR #252 | Guarded transcript proofreading | checkpoint 階段，全庫推動前的 Gate 未明 |

### ⚠️ Group B：中度（建議處理）

| ID | 標題 | 影響 |
|---|---|---|
| Issue #13 | TOC remediation | needs-review 等獨立 reviewer |
| PR #246 | 修四念住可讀性 | 候選稿待 review，63 檔大 diff |
| PR #225 | Course chooser polish | 輕量 UI，可快速 merge |
| PR #226 | Fail-closed content approval contract | 治理類，影響後續 workflow |
| Issue #9 | 側欄搜尋過濾 P2 | bug 級 |

### 📝 Group C：enhancement backlog（不急）

| ID | 標題 |
|---|---|
| Issue #2 | 播放速度倍速控制 |
| Issue #3 | 搜尋結果計數 |
| Issue #4 | 播放進度續播記憶 |
| Issue #5 | 音訊播放快捷鍵 |
| Issue #6 | WhisperX 句級對齊 |
| Issue #11 | ASR Quality v2 全流程 |

---

## 3. 執行路徑

### 路徑 X — 觀察收尾（保守，1-2 天）

```
[ A. 觀察收尾 5 項 ] + [ C. 計畫文件 1 項 ] + [ D. 留給 Henry ]
```

- 完成 A-1/A-2/A-3/A-4/A-5 + C-1（本文件）
- 0 個 src/ 改動
- 4 個 GitHub comment（issue + PR）
- **預估成本**：小法 30 分鐘
- **產出**：repo 治理記錄 + 開啟對話

### 路徑 Y — 修 2 bug + 觀察 enhancement（平衡，1 週）

```
[ 路徑 X 全部 ] + [ 修 Issue #9 ] + [ 修 Issue #10 ]
```

- 修 Issue #9 側欄搜尋（小法 + 獨立 QA）
- 修 Issue #10 Live Preview（小法 + Live URL 驗證 + 關 issue）
- 跑全套 npm test
- 派小檢（xiaojian）做 QA
- **預估成本**：小法 2-3 小時、Henry Live 驗證 30 分鐘
- **產出**：2 個 bug fix + 2 個 issue closed

### 路徑 Z — 完整收尾（激進，2 週）

```
[ 路徑 Y 全部 ] + [ 修 Group B enhancement ] + [ Review PR #252/#246 ]
```

- 修 Issue #2 #3 #4 #5（播放器功能，4 個小 sprint）
- 派小檢 QA 每個 fix
- 對 #252 #246 貼獨立 review comment
- 提 PR comment 詢問「推到全庫的 Gate」
- **預估成本**：小法 8-10 小時、Henry review 1-2 小時
- **產出**：6 個 issue fix + 2 個 PR 進 review queue

### 路徑 W — 分階段（混合，推薦）

```
Phase 1（本週）：路徑 X
Phase 2（下週）：選 1-2 個 Group B issue 修
Phase 3（下下週）：Group C enhancement
```

- 每次 phase 結束前跑 npm test + 派小檢 QA
- 每個 phase 結束回報 Henry 決策下個 phase scope
- **預估成本**：每 phase 2-3 小時 × 3 = 6-9 小時
- **產出**：漸進式完成，決策歸屬清晰

---

## 4. AGY Review 預留（可選）

若 Henry 同意，C-1 完成後派 AGY 獨立 review 評分：
- 完整性：路線圖是否涵蓋所有 Group A/B
- 優先級：AGY 認為應該先動哪個
- 可行性：工時估算合理性
- GGF/QMS 合規：commit 含 Task ID、npm test 證據

**AGY 評分章節**（執行後填入）：  
- 完整性：___/5  
- 優先級：___/5  
- 可行性：___/5  
- GGF/QMS：___/5  
- 總分：___/5

---

## 5. 風險評估

### Risk 1：Live URL 環境無法驗證
- 小法無 dev server、無瀏覽器實測
- 修 Issue #10 必須 Henry 提供 live URL 或部署環境
- 對策：Y/Z 必須 Henry 配合 30-60 分鐘驗證

### Risk 2：PR #252 「12 堂 → 302 堂」推動 Gate 未明
- 該 PR body 自陳「Draft / 可交接 checkpoint」
- 若直接 merge，可能未達「全庫處理」標準
- 對策：先在 PR 內 comment 詢問 Henry 與原作者意圖

### Risk 3：course.json 與 sessions/ 同步
- 目前 4 門課程，301 sessions
- Working tree 與 origin/main 0 差距
- 任何 sprint 工作前**必須** `git fetch` + 確認

### Risk 4：AGY 配額
- 27B / 28A sprint 教訓：AGY 有 5 小時 reset window
- 對策：派 AGY review 前先確認配額狀態

### Risk 5：依賴衝突
- PR #226（fail-closed contract）會改 governance
- PR #252 會改 transcript 處理 pipeline
- 兩個 PR 同時 merge 可能衝突
- 對策：先 merge #225（無 conflict），再 review #226，最後處理 #252

---

## 6. 待 Henry 決策

### 必答
1. **路徑選擇**：X / Y / Z / W 哪一個？
2. **Issue #10 修法**：小法改 source + Henry live 驗證 OR 全部由 Henry 處理？
3. **AGY review 必要嗎**：要派嗎？

### 選答
4. **Issue #130 解 blocked 方式**：是 course 安排問題、還是 QA 配額問題？
5. **PR #225 / #226**：要小法寫 review comment、還是直接等 Henry merge？
6. **Phase 2 結束定義**：4 個 PR 都有 reviewer comment 算結束？還是全部 merge？

---

## 7. 不在這次路線圖的東西

- 4 法印（4 Seals of Dharma）新課程
- 善顯共學 sessions 79-102 補轉譯（已標 unavailable，等 flyday 上線）
- LLM pipeline 改寫（AGY → 本地 model 全面替換）
- Tailscale Funnel 維運
- 部署端 CDN / 快取策略

---

## 8. 配套文件

- `.notes/transcriptions-completion-plan.md` — 本次評估提案
- `docs/REPO_STATUS_2026-10-16.md` — Repo 狀態快照
- `docs/TASKS.md` — Task 追蹤（未變更，等本 roadmap 決策後更新）

---

**作者聲明**：本路線圖是「提案」性質，不進 git commit。決策後才正式 commit + 啟動 sprint。
