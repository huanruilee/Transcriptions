# Agent 交接與全流程執行手冊（GitHub Handoff Playbook）

本文件為本儲存庫（`huanruilee/Transcriptions`）**任何新進 Agent 讀取 GitHub 即可直接開工** 的單一實戰交接手冊。所有規則與腳本皆已合入 `main`，請依下列順序執行，勿再依賴過期對話記憶或重複踩坑。

---

## 一、開工必查（5 條鐵則）

1. **獨立 Worktree 隔離開發**：嚴禁直接在 `main` 修改或混用別人未提交的 dirty 檔（例如 `correction-dates.html`、`player_*.json`）。一律從最新 `origin/main` 建立獨立 worktree：
   ```sh
   git fetch origin main
   git worktree add .worktrees/<task-slug> -b feat/<task-slug> origin/main
   ln -s "$(pwd)/node_modules" ".worktrees/<task-slug>/node_modules"
   ```
2. **Pre-flight 鎖定講次檢查（必查）**：執行任何批次改稿前，先檢查 [locked-sessions.json](../config/locked-sessions.json)。目前已鎖定不可修改之講次：
   - `courses/2025釋量論第二品大組共學/sessions/session_01.json`（`tests/unit/studyGroupSession01RemoteReviewBundle.test.js`）
   - `courses/四念住/sessions/session_08.json`（`tests/unit/session08Promotion.test.js`）
   - 任何新寫腳本皆須匯入 `isLockedSession()`（位於 [transcriptGuards.mjs](../scripts/lib/transcriptGuards.mjs)）自動跳過。
3. **Step 0 實體與典據奠基（Grounding Probe）**：開校任何課程前，強制先以聯網搜尋確認「講者、道場/佛學院、年代、核心依止論典、常見同音誤植表」，寫入該課程目錄之 `grounding.json`（參考 [四念住/grounding.json](../courses/四念住/grounding.json)）。
4. **低 Token 漏斗架構（最小差異輸出 `fixes + breaks`）**：
   - **禁止**將整篇逐字稿送給高階雲端模型重寫或整段吐回。
   - **標準做法**：以共用模組 [eneuralClient.mjs](../scripts/lib/eneuralClient.mjs) 透過 **Node IPv4 SSE 串流** 直連 `eNeural / glm53-flash`（`family: 4`、`stream: true`、`reasoning_effort: 'none'`、`response_format: { type: 'json_object' }`），避開 `hermes chat` CLI 的 `state.db` 鎖定與 IPv6 卡頓。
   - 每批送 60～80 句（`id|text`），要求模型**僅回傳需要修改的句子 `fixes` 與段落/小標起點 `breaks`**，節省 >85% 輸出 Token 並確保不漏句、不改動 `id / start / end / rawText`。
   - 所有批次回應快取於 `/tmp/`，支援斷點續跑；先跑 **1 講試點 → 抽查修正腳本 → 分波推展全課**。
   - **語音時間密度異常預檢（防片頭／合唱漏辨）**：改版前必跑 `findLowDensitySegments()`（位於 [transcriptGuards.mjs](../scripts/lib/transcriptGuards.mjs)）；凡單句時長 `> 20 秒` 且字速 `< 1.0 字/秒`（常見於《開經偈》合唱遭 ASR 壓縮且官方底本未收錄儀軌），必須切音訊送 GX10 Whisper 重聽還原，不得僅依文字底本跳過。
5. **待閱校狀態誠實標示**：
   - 未經人工逐句聽核時，課程 `publicationState` 維持 `"candidate-review-required"`，不得填入 `humanListened: true`。
   - **重要 UX 準則**：整講待閱校由頂部 `publicationState` 呈現即可，**切勿將全講 100% 句子都標成 `reviewNeeded: true`**（會導致閱讀頁每句後方出現橘色 `🔍 待核定` 膠囊干擾閱讀）；`reviewNeeded: true` 僅保留給低信心存疑句。

---

## 二、共用基礎建設清單

| 元件 | 路徑 | 職責 |
| :--- | :--- | :--- |
| 鎖定講次清冊 | [config/locked-sessions.json](../config/locked-sessions.json) | 集中宣告 SHA-256 合約鎖定講次，供批次腳本預檢跳過 |
| eNeural 串流客戶端 | [scripts/lib/eneuralClient.mjs](../scripts/lib/eneuralClient.mjs) | IPv4 SSE 串流呼叫 `glm53-flash`、重試、`extractJsonObject`、快取與並發池 |
| 逐字稿安全護欄 | [scripts/lib/transcriptGuards.mjs](../scripts/lib/transcriptGuards.mjs) | `isLockedSession`、`maskUrls`/`unmaskUrls`、`assertRawTextPreserved`、`syncContentOverview` |
| 紅黃燈品質稽核與雷達裁決 | [audit_reading_quality.mjs](../scripts/audit_reading_quality.mjs) & [radarAdjudicator.mjs](../scripts/lib/radarAdjudicator.mjs) | 紅燈（R1–R4）自動阻擋合併；黃燈（Y1–Y4）輸出精簡小卡交由 `glm53-flash` 低價模型批量裁決並同步 `sourceDigest` |
| 導讀摘要與 Digest | [scripts/content_overview_pipeline.mjs](../scripts/content_overview_pipeline.mjs) | 任何句子增刪改後重新對齊四個 `evidence[]` 與重算 `sourceDigest` |
| 大組共學工作流範本 | [docs/STUDY_GROUP_WORKFLOW_V3.md](STUDY_GROUP_WORKFLOW_V3.md) & [upgrade_study_group_course.mjs](../scripts/upgrade_study_group_course.mjs) | 共學問答型（討論題收斂 3–7 題、`【法師】`/`【學員】`、講記 `.md`/`.html` 原話抽屜） |
| 單人講經工作流範本 | [upgrade_sinianzhu_course.mjs](../scripts/upgrade_sinianzhu_course.mjs) | 單人講經型（`fixes + breaks` 最小差異校字、150–350 字自然段重組與編號小標） |

---

## 三、全系統 6 課程現況與後續接手路線圖

| 課程 ID | 講次數 | 目前狀態 | 下一步建議動作 |
| :--- | :---: | :--- | :--- |
| `shi-liang-lun-study-group-2025`（2025 釋量論大組共學） | 47 | 已於 `main` 完成 Workflow v3 升級上線 | 維持現況；若有局部勘誤直接改單講並重跑 `render_study_guide_html.py` |
| `si-nian-zhu`（四念住） | 8 | 第 1–7 講已完成奠基校字、自然段重組與 `sourceDigest` 同步上線（第 8 講鎖定） | 後續可做視覺精修：將非疑義句的 `reviewNeeded: true` 降為只標存疑句，並視需要生成講記 |
| `san-zhu-yao-dao`（三主要道） | 21 | `published`；0 發語詞殘留，但 21 講合計僅 27 個小標 | **第一優先（輕量）**：每講僅需補齊 6–10 個編號義理小標並重算 `sourceDigest` |
| `shi-liang-lun-er`（釋量論第二品） | 32 | 段落結構穩定（平均 194 字/段），僅 8 講共 10 段殘留零星發語詞 | **第一優先（輕量）**：清除 10 段發語詞並同步 `sourceDigest` |
| `pusa-jiu-shi-zhe-yang-cheng-fo`（菩薩就是這樣成佛） | 26 | 段落密度佳（平均 178 字/段、362 小標），15 講共 26 段含零星發語詞 | **第二優先（中量）**：確認 `grounding.json`、清除 26 段發語詞與對照底本名相 |
| `ru-zhong-lun`（入中論善顯密意疏） | 219（含 220 檔） | 段落偏碎（平均 57 字/段），176 講（1,741 段）仍含發語詞 | **第三優先（大體量分波）**：套用 `eneuralClient` + `fixes + breaks` 以每波 25–30 講分波整併自然段與清零發語詞 |

---

## 四、上線驗收標準 SOP（Commit → PR → GitHub Pages → 實頁抽查）

1. **本地四道驗證全綠（缺一不可）**：
   ```sh
   npm run summaries:audit   # 必須 complete: true, invalid: 0
   npm run test:v2
   npm test
   npm run build:v2
   ```
2. **明確暫存與 PR 合併**：只 `git add` 本次明確變更檔，建立 PR 後等 GitHub Actions 全綠，使用 Merge commit 合併（禁止 squash/rebase）：
   ```sh
   gh pr checks <PR> --watch
   gh pr merge <PR> --merge
   ```
3. **追蹤 `main` 部署（避開 `skipped` 假警報）**：
   - PR 合併後，GitHub Actions 會先為舊 commit 產生一筆 `skipped` 的 `deploy.yml`，屬正常現象。
   - 先用 `gh run list --branch=main --limit=3 --json databaseId,workflowName,status,headSha` 找到新 merge commit SHA 的 `Completion Acceptance`（Run A）並 `gh run watch <RunA>`；待 Run A 成功後，再 watch 同一 SHA 觸發的 `Deploy to GitHub Pages`（Run B）至 `conclusion: success`。
4. **線上實頁抽查**：在瀏覽器開啟 `https://huanruilee.github.io/Transcriptions/?course=<courseId>#session-<sid>`，確認最後更新日期、段落小標、無 `\ufffd` 破字與 0 JS 執行期錯誤後，才可回報完成。
