# 《入中論善顯密意疏》講記校勘與研讀導讀 Agent 標準作業程序 (SOP)
> **文件版本**：v1.0 (2026-10-19)  
> **標竿基準**：如性法師《釋量論·成量品》第 29 講範本規範 ＆ 第 29A 講實踐標準  
> **適用對象**：小法 (gx10 Agent)、Antigravity AI、Codex 及後續接手維護之工程師與校對員

---

## 一、 背景與標準定位

本專案致力於將見悲青增格西講授之《入中論善顯密意疏》（全 219 講）原始語音轉寫稿，升級為具備**深度義理引導、底本精確錨定、閱讀美學排版、隨選隨聽播放**的高水準研讀版講記。

### 1. 傳統 ASR 逐字稿的痛點
- **句子過度碎裂**：原始 Whisper 依語氣停頓切片，每句僅 5～15 字，段落缺乏哲學論辯脈絡。
- **充滿口語贅詞**：夾雜大量「我這個書是97頁...」、「OK嗎對不對」、「該怎麼講」等無效口頭禪。
- **與經論原典脫節**：聽寫同音錯字（如「他身」應為「他生」、「2D」應為「二諦」、「事事師」應為「實事師」），缺乏底本頌文與科判對應。

### 2. 標竿規格四大要素
以如性法師《釋量論·成量品》第 29 講為標準：
1. **課前導讀與研讀大綱**：置於篇首，結構化提煉宗旨提要、科判定位、核心論辯綱要、重點法相辨析、課後研討問題。
2. **內容驅動分段 (Content-driven Paragraphs)**：依因明與中觀義理推演進程重新整合為 20～30 個核心段落（平均每段句子數控制在 `1.5 <= avgSentences <= 8.0`），徹底去除贅詞，完整保留課堂問答啟發。
3. **段首精確跳轉時間戳 (`[▶ mm:ss]`)**：段首保留時間標記，點擊直接連線官方 MP3 音訊跳轉播放。
4. **【鐵則】經論底本課文 100% 完整保留與錨定**：
   - **凡是在課程逐字稿中，格西有讀誦或引用的《入中論》頌文與《善顯密意疏》課文原文，課文本身必須一字不漏、原封不動地完整保留於講記正文中（以粗體引號 `「**……**」` 標示）**，絕對不可僅用白話摘要取代或省略課文！因為整堂課的講授脈絡完全是為了消釋與解析《善顯》本文。
   - **跨頁回看必查**：若格西在課堂中請學員翻回前面或後面的頁碼（例如在講 p.109 時翻回 p.104 核對文句），必須同步查閱對應的 `source_text/page_XXX.txt`，將所引課文一併完整錄入。
   - **嚴禁超前幻覺**：若讀誦者剛唸出下一科判標題即被學員提問打斷、格西當堂未實際講授該段課文（留待下一講次才講），必須忠於錄音事實，嚴禁自行拿底本超前杜撰講記。

---

## 二、 29A 與 35A/35B 實踐復盤 (Review & Lessons Learned)

### 1. 做得好的地方 (Strengths)
- **義理深度與經論校驗**：
  精準對齊宗大師《善顯密意疏》原典，透徹釐清應成派自宗 vs 自續派在「正倒世俗」與「破他生無世間妨難」上的本質歧異，以及格西獨到的現代譬喻（如洗眼鏡喻、六道魚缸之囿、全方位大圓鏡智、破除錄音機與播音器迷思）。
- **雙重交付形態**：
  既在主網站提供互動式閱讀與播放，又產出獨立美觀的離線發布版 HTML（自帶常駐 HTML5 播放器）。
- **CI/CD 自動化守門**：
  嚴格通過 577+ 項單元與驗收測試、301 篇逐字稿摘要一致性審計（`npm run summaries:audit`）。

### 2. 可以做得更好的地方 (Lessons Learned & Gotchas)
- **⚠️ 核心教訓一：《善顯》課文原文不可省略**
  講記若只寫格西的白話解釋而省略格西當場所讀誦的《善顯密意疏》原文，讀者將失去消文對照的根據。
  *處方*：**只要格西在錄音中有引用或讀誦《善顯》課文，該段課文必須 100% 逐字保留在對應段落中**。
- **⚠️ 核心教訓二：交付標的脫節**
  在初次交付時，校正文字僅寫入 `publications/lecture_29A_study_guide.md` 與頂部大綱 `source_outlines/29A.json`，而主網頁讀取的 `sessions/session_29A.json` 仍維持原始口語碎片，導致使用者看見「大綱新、內文舊」。
  *處方*：必須嚴格執行「一體化雙向同步」，產出 Markdown 後立即寫入 `session_XXX.json`。
- **⚠️ CI 檢查相依性失誤**：
  - `_meta` 欄位中的 `total_paragraphs` 與 `total_sentences` 必須與實際段落句子數一致，且平均每段句數須符合 `1.5 <= avgSentences <= 8.0`，否則 `tests/acceptance/goldenStandard.test.js` 會直接拋出斷言失敗。
  - `contentOverview` 摘要中的 `sourceDigest` 與 `evidence` 引用句，必須與更新後的句子完全同步，否則 `npm run summaries:audit` 阻擋合併。
- **⚠️ 環境相依性 (macOS iCloud 檔案鎖定)**：
  本地主要工作區位於 iCloud 監控資料夾時，大檔 Git 操作易觸發 `fatal: mmap failed: Operation timed out`。
  *處方*：高頻 Git push 或大型建置可在 `/tmp/` 乾淨 Worktree 目錄下執行。

---

## 三、 三位一體核心檔案架構

每次校正一個講次（例如 `29B`、`35A`、`35B`），必須同步維護以下 3 處核心檔案：

| 檔案路徑 | 作用 | 格式 / 欄位規範 |
| :--- | :--- | :--- |
| `courses/入中論善顯密意疏/source_outlines/{SID}.json` | **網頁頂部大綱卡片** | 包含 `title`, `sections` (宗旨、科判、綱要、法相), `discussionQuestions` |
| `courses/入中論善顯密意疏/sessions/session_{SID}.json` | **網頁正文閱讀器資料源** | 包含精校段落 `paragraphs`、句級時間戳、`_meta` (統計數據)、`contentOverview` |
| `courses/入中論善顯密意疏/publications/lecture_{SID}_study_guide.*` | **獨立發布版講記 (.md / .html)** | Markdown 原稿與具備底部播放器的獨立高質感 HTML |

---

## 四、 5 步標準作業流程 (Standard Workflow for Agents)

### Step 1: 【底本與音檔定位】
1. 查閱 `courses/入中論善顯密意疏/course.json` 中該講次對應的頁碼範圍。
2. 讀取 `courses/入中論善顯密意疏/source_text/page_XXX.txt` 提取原典頌文與釋論脈絡（若課堂中有跨頁回看，亦須一併調閱對應頁碼）。
3. 讀取 `courses/入中論善顯密意疏/sessions/session_{SID}.json` 獲取原始時間戳與開示內容，並核對下一講開頭以確認本講實際結束之科判位置。

### Step 2: 【撰寫研讀版講記 Markdown】
於 `courses/入中論善顯密意疏/publications/lecture_{SID}_study_guide.md` 撰寫講記：
- 依範本結構撰寫【本講導讀與研讀大綱】：
  - 一、本講宗旨提要
  - 二、義理研讀綱要
  - 三、重點法相與宗義辨析
  - 四、課後思考與研討問題
- 撰寫【正文講記】：
  - 每個段落開頭標註精確時間戳：`[▶ mm:ss](官方音檔網址#t=秒數)`
  - **【強制規定】保留《善顯》課文原文**：凡格西在逐字稿中讀誦或引用的《入中論》頌文與《善顯密意疏》課文，必須對照 `source_text/page_XXX.txt` **逐字完整保留**（以 `「**……**」` 粗體標示），再緊接格西的消文與闡釋，絕不可刪減或僅以大意帶過。
  - 徹底清除口頭贅詞，依因明與中觀義理進行流暢書面化修訂，並完整保留學員提問與格西答疑的思辨過程。

### Step 3: 【一鍵自動化雙向同步】
直接執行專屬輔助腳本，將 Markdown 正文與大綱自動轉寫同步至主系統：
```bash
python3 scripts/sync_study_guide_to_session.py {SID}
# 例如：python3 scripts/sync_study_guide_to_session.py 29B
```
> **腳本自動完成事項**：
> 1. 自動拆解句子並按字數比例平滑分配時間戳。
> 2. 自動產出 `source_outlines/{SID}.json`。
> 3. 自動更新 `session_{SID}.json` 的 `paragraphs`。
> 4. 自動重算 `_meta.total_paragraphs` 與 `_meta.total_sentences`。
> 5. 自動重新計算 `contentOverview.sourceDigest` 並校準 `evidence` 引句。

### Step 4: 【渲染獨立播放網頁】
執行渲染腳本生成帶播放器的獨立 HTML：
```bash
python3 scripts/render_study_guide_html.py courses/入中論善顯密意疏/publications/lecture_{SID}_study_guide.md
```

### Step 5: 【本地合約前置預檢 (Pre-flight Gate)】
在開 PR 之前，必須在本地跑通以下 3 道審計閘門（保證 100% 通過）：
```bash
# 1. 摘要與引用一致性審計 (301/301 篇必須全數有效)
node scripts/content_overview_pipeline.mjs --audit

# 2. 黃金標準中繼資料與音訊單調性檢驗 (8/8 測試必須全數通過)
node --test tests/acceptance/goldenStandard.test.js

# 3. 人工審核封包語意檢查
python3 scripts/build_human_review_package.py --check
```

---

## 五、 GitHub PR 與 Pages 部署注意事項

1. **分支規範**：
   - 建立新分支，如 `git checkout -b update-{SID}-study-guide`。
   - 提交語意化 Commit：`feat(ru-zhong-lun): calibrate session {SID} and add study guide`。
2. **PR 與審核討論串處置**：
   - 若 GitHub 機器人（如 Codex）提出建議，審閱後若已在代碼中落實，使用 GraphQL 解除 thread 鎖定：
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
     ```
3. **部署驗收**：
   - 合併進入 `main` 後，監控 `Deploy to GitHub Pages` 工作流程：
     ```bash
     gh run list --workflow="Deploy to GitHub Pages" --limit 2
     ```
   - 部署完成後，以 `curl -sI` 或瀏覽器強制重新整理（`Cmd+Shift+R`）驗證線上網址：
     `https://huanruilee.github.io/Transcriptions/?course=ru-zhong-lun#session-{SID}`

---

## 六、 接手執行清單 (Checklist for Next Sessions)

下一個接手的 Agent 請按以下清單執行 **第 29B 講 (Session 29B)**：
- [ ] 讀取 `courses/入中論善顯密意疏/source_text/page_098.txt` ~ `page_100.txt`
- [ ] 聽取/研讀 `session_29B.json` 原始講授進度
- [ ] 撰寫 `courses/入中論善顯密意疏/publications/lecture_29B_study_guide.md`
- [ ] 執行 `python3 scripts/sync_study_guide_to_session.py 29B`
- [ ] 執行 `python3 scripts/render_study_guide_html.py courses/入中論善顯密意疏/publications/lecture_29B_study_guide.md`
- [ ] 執行本地 3 道審計預檢（`summaries:audit`、`goldenStandard.test.js`、`build_human_review_package.py`）
- [ ] 開 PR、通過 CI、合併至 `main`、驗收 GitHub Pages 線上網址。
