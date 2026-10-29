# Repo 狀態快照 — Transcriptions GitHub 專案

**快照時間**：2026-10-16 18:35 CST  
**作者**：小法（xiaofa）  
**基於**：origin/main `38b4b1eb`，working tree 已同步、無 WIP

---

## 1. 程式碼健康

| 指標 | 數值 | 證據 |
|---|---|---|
| HEAD | `38b4b1eb7e6cd9d088050e669f7b17401ccc285c` | Merge pull request #248 from huanruilee/codex/transcript-overview-summary |
| npm test | 577 / 573 pass / 0 fail / 4 skipped | origin/main clone + `npm install` 後跑 `npm test` |
| CI Completion Acceptance | success | GH Actions run on `38b4b1eb` |
| Working tree | clean | `git status` |
| 與 origin/main 差距 | 0 落後 / 0 領先 | `git rev-list --left-right --count origin/main...HEAD` |

## 2. 課程版圖（4 門）

| Course ID | 標題 | Sessions | 狀態 |
|---|---|---|---|
| `2025釋量論第二品大組共學` | 2025《釋量論・第二品》大組共學 | 42 | ? |
| `入中論善顯密意疏` | 入中論善顯密意疏 | 219 | ? |
| `四念住` | 四念住 | 0 | candidate-review-required |
| `釋量論第二品` | 釋量論第二品 | 32 | ? |
| **總計** | | **293** | |


## 3. Issue 統計

**Open issues：10 個**

| # | 建立 | Labels | 標題 |
|---|---|---|---|
| #130 | 2026-08-27 | `status:blocked` | Session 01 grounded proofreading and independent r |
| #13 | 2026-08-27 | `status:needs-review` | TOC remediation: separate book outline, session an |
| #11 | 2026-08-17 | `enhancement` | [ASR Quality v2] 建立可追溯的文字校正、音檔實聽 QA 與 Forced Align |
| #10 | 2026-08-17 | `bug,needs-triage` | [Critical][Live Preview] 應用程式未初始化：課程清單、逐字稿與音檔皆未載入 |
| #9 | 2026-08-17 | `bug,needs-triage` | [Bug][P2] 側欄快速搜尋未套用過濾結果 |
| #6 | 2026-08-13 | `enhancement` | [ENHANCEMENT] 句級 ASR 強制對齊 (WhisperX Word-Level Tim |
| #5 | 2026-08-13 | `enhancement,needs-triage` | [FEAT] 音訊播放快捷鍵支援 (Keyboard Shortcuts for Audio Con |
| #4 | 2026-08-13 | `enhancement,needs-triage` | [FEAT] 播放進度自動續播記憶 (Resume Playback Progress & Book |
| #3 | 2026-08-13 | `enhancement,needs-triage` | [FEAT] 搜尋結果計數與上下跳轉導航 (Search Result Count & Hit Na |
| #2 | 2026-08-13 | `enhancement,needs-triage` | [FEAT] 新增播放速度倍速控制 (Playback Speed Control 0.75x -  |


## 4. PR 統計

- **Open PRs：13 個**（9 dependabot + 4 真正功能 PR）
- **Closed PRs：100 個**（merged 93 / closed-not-merged 7）
- **合併率**：93%（近 100 個 PR 樣本）

### 真正功能 Open PR（4 個）

| PR | 建立 | 範圍 | 標題 |
|---|---|---|---|
| #252 | 2026-10-14 | +243138/-0 (82 files) | Add guarded transcript proofreading pipeline |
| #246 | 2026-09-28 | +90453/-16255 (63 files) | fix: restore 四念住 readability and harden sentence r |
| #226 | 2026-09-24 | +347/-1 (6 files) | Add fail-closed content approval contract |
| #225 | 2026-09-22 | +278/-2 (2 files) | Refine course chooser experience |


## 5. 開發動能（過去 30 天）

- **Commits**：86 個
- **作者分布**（近 30 天）：
  - GX10 Xiaofa Agent: 32
  - Codex Agent: 19
  - huanruilee: 2


## 6. 本機 workspace 同步狀態

- 同步前：本地 `HEAD` 落後 origin/main **301 commits / 1035 檔案 / +932 萬行**
- WIP 備份：30 modified + 22 untracked（全部已被雲端合併）
- 同步模式：`git reset --hard origin/main` + clean（Henry 2026-10-15 確認）
- WIP 備份分支：backup/wip-20260905

## 7. 已知紅旗（QA 風險）

1. **Issue #10** [Critical][Live Preview] 應用程式未初始化 — Issue 仍 open，target commit 早過 301 commits，疑似已修但缺 live verification 關 issue
2. **Issue #130** [status:blocked] Session 01 grounded proofreading — 入中論 session_01 未到 content review 階段
3. **Issue #13** [status:needs-review] TOC remediation — 需獨立 reviewer 簽核
4. **PR #252** [Draft/checkpoint] Guarded transcript proofreading pipeline — 仍在 12 堂試點，**未允許處理全庫 302 堂**
5. **PR #246** 修四念住可讀性 + sentence review triage — 候選稿狀態，+90K/-16K 行（63 檔案），需獨立 review
6. **依賴** Issue #6 / #11 v2 forced alignment pilot — enhancement 等級，未排程

## 8. 不在本快照範圍的東西

- 個別 session JSON 的內容品質（npm test 通過不代表 ASR 內容正確）
- 部署端 live URL 行為（Issue #10 待驗）
- Tailscale Funnel / GX10 ports 維運
- LLM pipeline（AGY 配額、本地 vLLM 狀態）

## 9. 配套文件

- `.notes/transcriptions-completion-plan.md` — 本次評估提案
- `docs/PHASE_2_ROADMAP.md` — Phase 2 路線圖（撰寫中）

---

**驗證命令**（任何人可重跑驗證本快照）：

```bash
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
git rev-parse HEAD
git status
npm install && npm test 2>&1 | tail -8
gh issue list --repo huanruilee/Transcriptions --state open --limit 20 --json number,state,createdAt
gh pr list --repo huanruilee/Transcriptions --state open --limit 30
gh api repos/huanruilee/Transcriptions/pulls?state=closed | jq '[.[] | select(.merged_at!=null)] | length'
```

**作者聲明**：本快照為機器 audit 結果，npm test 0 fail 不等於內容正確；每個 open issue/PR 仍需人類決策。
