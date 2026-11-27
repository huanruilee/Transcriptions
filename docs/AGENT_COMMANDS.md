# Agent 一句話指令執行劇本（SSOT Playbook）

當使用者對任何 Agent（`gx10-xiaofa`、`gx10-xiaomin`、Antigravity 等）下達 **「Review 第 X 講」** 或 **「建立新逐字稿」** 指令時，一律依本頁固定劇本執行，**禁止臨場自創 Prompt 或跳過驗收門檻**。

**預設交付終點為「正式上線並附上線上閱讀連結」**（讓使用者直接在 `github.io` 確認）：
- **由主控 AGY 直接執行時**：完成測試 → 開 PR → 等 CI 全綠 → `--merge` 合併至 `main` → 等 `Deploy to GitHub Pages` 成功並實測線上頁面 → 回報直接閱讀連結。
- **由 GX10 Worker Agent（如 `gx10-xiaofa`）執行時**：完成測試後開 PR，**交由 AGY 做最後一次獨立 Review**；由 AGY 複驗 diff／`--strict`／開場結尾後執行 `--merge` 合併與線上部署驗證，再回報直接閱讀連結。

---

## 前置共通紀律
1. **同步最新基準並開隔離工作樹（Fail-Closed）**：
   ```bash
   git fetch origin
   # 若 git fetch 失敗，必須立刻回報 BLOCKED；嚴禁退回使用落後的本地舊 main 或重造輪子
   # 嚴禁直接修改 main 或共用的 dirty workspace
   git worktree add -b <feat/branch-name> <isolated-worktree-path> origin/main
   ```
2. **禁止修改鎖定講次**：開工前必查 [config/locked-sessions.json](../config/locked-sessions.json)（例如《釋量論》`session_01.json`、`四念住` `session_08.json` 嚴禁改動）。
3. **遠端派工通道**：透過 Hermes 派工且需收回結果時，一律使用 `hermes peer run <peer> --idempotency-key <key>`，避免 `hermes peer dm` 被開啟中的 Bot Chat 攔截回訊。
4. **防 Compress 與 Context 衛生紀律**：
   - 執行 `npm test`、`npm run test:v2` 等長輸出指令時，導向 `/tmp/*.log` 只看尾部摘要，避免塞爆主對話。
   - 重度排查、跨檔比對或反覆除錯改交由 `delegate_task`（Subagent）隔離執行；主對話只收精煉結論。
   - Review 講次直接跑 `scripts/onepass_proofread.py`，**禁止開瀏覽器截圖**、**禁止自寫合句腳本**。

---

## 指令 A：Review ／ 翻修既有講次（例如「Review 第 2 講」）

1. **檢查現況與奠基**：
   - 讀取 `courses/<課程名>/grounding.json` 與 `courses/<課程名>/COURSE_GUIDE.md`（若存在）。
   - 先跑基準檢查：`node scripts/check_session.mjs --file courses/<課程名>/sessions/session_XX.json --strict`。
2. **執行標準化單趟校對 CLI（MiniMax 優先）**：
   ```bash
   python3 scripts/onepass_proofread.py \
     --course <課程名> \
     --session <XX> \
     --provider minimax \
     --apply \
     --allow-warnings
   ```
   - 腳本會自動套用版控雙層 Prompt（`prompts/onepass_proofread_v2.md`）、確定性防呆（`speaker` 枚舉、`<=35` 句拆段、簡轉正、`lastUpdated` 時分戳）、`study_group_preflight.mjs`、`contentOverview` 引文與 `sourceDigest` 同步，以及 `check_session.mjs --strict`。
   - 若 GX10 Router 上的 MiniMax 在冷卻期，`auto-cloud` 會自動備援至 `DeepSeek-V4.1-Flash` / `Gemini`。
3. **Stage 5 定向人工／高階覆核**：
   - 若 `--strict` 仍有違規（例如 `possibleNameLeaks > 0`），只針對標記句子進行去識別化（`學員1`、`學員2`……）。
   - 必檢重點：開場保留「`禮敬法師`」（不誤改為 `如性法師`）、開場與結尾迴向歸屬 `主持`、經典偈頌與佛法專名正字（如 `伺意知`、`迴向`）。
4. **全套驗收（全綠才准開 PR）**：
   ```bash
   node scripts/check_session.mjs --file courses/<課程名>/sessions/session_XX.json --strict
   npm run summaries:audit   # 必須 complete: true, invalid: 0
   npm run test:v2
   npm test
   ```
5. **AGY 最後 Review、合併與直接上線**：
   - 確認 `git -c core.quotePath=false status --short` 僅含目標檔案，推上分支並以 `gh pr create` 開 PR。
   - 若為 GX10 Worker 執行，於此處交由 **AGY 做最後一次獨立 Review**；AGY 複驗通過且 PR CI 全綠後，執行 `gh pr merge <PR> --merge --delete-branch`，等候 `Deploy to GitHub Pages` 完成並實測線上 JSON／頁面 `HTTP 200`。
   - 最終回報須附：**線上直接閱讀連結（`https://huanruilee.github.io/Transcriptions/?course=<courseId>#session-<XX>`）、PR URL、`check_session --strict` 與 `summaries:audit` 結果、開場前 3 句與結尾後 3 句摘錄**。

---

## 指令 B：建立全新講次逐字稿（例如「建立第 50 講，YouTube URL」）

1. **Step 0 實體奠基**：確認課程 `grounding.json`、`COURSE_GUIDE.md`、YouTube 影片 ID／時間碼提綱，並於 `source_outlines/` 建立提綱或 `pending` 檔。
2. **Step 1 GX10 本地 Whisper 轉寫**：下載音訊至 GX10 暫存（嚴禁提交至 GitHub），呼叫 GX10 Whisper（`127.0.0.1:8010`）產生帶時間戳的原始段落，建立初始 `sessions/session_XX.json`（完整保留 `rawText`）。
3. **Step 2 執行標準單趟校對 CLI**：同指令 A 第 2～3 步（`python3 scripts/onepass_proofread.py --course <課程名> --session <XX> --provider minimax --apply`），完成合句、去冗詞、分段、標點與 `--strict` 清零。
4. **Step 3～4 產出講記與註冊清單**：
   - 補齊 `discussionQuestions`（3～7 題，`？` 結尾）、`teacherSummary`、`contentOverview`（自動重算 `sourceDigest`）。
   - 若課程含研讀講記，產出 `publications/lecture_XX_study_guide.md` 並執行 `python3 scripts/render_study_guide_html.py` 產生 `.html` 與 `.txt`。
   - 同步更新 `course.json`、`toc.json`、`courses/catalog.json` 及相關講次總數單元測試斷言。
5. **Step 5 驗收、AGY 最後 Review 與直接上線**：
   - 跑完指令 A 第 4 步全套驗證＋`npm run build:v2`，開 PR；若為 GX10 Worker 執行，交由 **AGY 做最後一次獨立 Review**。
   - PR CI 全綠後由 AGY 以 `--merge` 合併至 `main`，等候 `Deploy to GitHub Pages` 成功並實測 `https://huanruilee.github.io/Transcriptions/?course=<courseId>#session-<XX>` 回傳 `HTTP 200` 且新講次已生效，再將直接閱讀連結回報給使用者確認。
