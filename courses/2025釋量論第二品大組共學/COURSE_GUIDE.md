# 《2025 釋量論・第二品》大組共學課程專屬指導（COURSE_GUIDE）

本文件適用 `courses/2025釋量論第二品大組共學/`（`courseId: shi-liang-lun-study-group-2025`，如性法師指導・如來法性影音頻道），為本課程在全域 [docs/TRANSCRIPTION_WORKFLOW.md](../../docs/TRANSCRIPTION_WORKFLOW.md)（v1.9）之下的**課程層單一事實來源（SSOT）**。

> 歷史文件定位：[docs/STUDY_GROUP_WORKFLOW_V3.md](../../docs/STUDY_GROUP_WORKFLOW_V3.md) 記錄既有 47 講（Wave 1–4）的批次精煉與 Prompt 演進；[docs/STUDY_GROUP_2025_TRANSCRIPTION_PLAN.md](../../docs/STUDY_GROUP_2025_TRANSCRIPTION_PLAN.md) 為早期盤點封存檔。**自本版起，所有新講產出與既有講次翻新，一律以本文件為準。**

---

## 1. 來源與課程基本事實
- **官方播放清單**：`https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh`
- **課程底本與奠基**：必先讀取 [grounding.json](grounding.json)；本講所涉《釋量論・成量品》頌文須優先對齊 `courses/釋量論第二品/source_text/` 官方正行原典（若存在）。
- **官方討論大綱（`source_outlines/32-XX.json`）**：
  - 新增講次前必先確認對應講次的 `source_outlines/32-XX.json` 是否存在且標題正確（注意：`32-29.json` 曾誤植舊題「道諦與正念之別相（上）」，須與實際 YouTube 講題「無我慧才是解脫道（上）」核對一致）。
  - 若新講次尚未取得官方 `source_outlines/32-XX.json`，應明確標註 `sourceOutline: "pending"`，**僅由音訊實際討論內容抽取候選題目（3～7 題，全形 `？` 結尾）**，嚴禁捏造官方題號或錯誤科判標題。
- **不可播放與跳號原則**：YouTube 清單中標示為私人／隱藏／不可播放之項目，一律排除，不可自行補號或猜測；第 18–22 講為播放清單原始缺口，維持明確缺口不補號。

---

## 2. 兩軌明確分工（取消重疊全文 `dialogue_transcript`）

大組共學單講長達 2.5～3 小時，學員研討往往發散且冗長，而如性法師的立破開示最為關鍵。為兼顧**原音保真**與**高效學習**，本課程採「兩軌明確分工」，**後續新講與翻新講次不再新增獨立的全文 `dialogue_transcript.{md,html}`**：

| 軌道 | 產出檔案 | 核心定位 | 內容處理原則 |
| :--- | :--- | :--- | :--- |
| **第一軌：原音逐字稿** | `sessions/session_XX.json` + `toc.json` | 完整原音、全文檢索、點播對照 | 100% 保留 `sentences[].rawText`；依全域 v1.9 清除純冗詞、合併碎句、補齊全形標點；精確區分講者角色與 3～7 題 `discussionQuestions`（與 `toc.json` 1:1 同步）。 |
| **第二軌：思辨研讀講記（v4 四層版）** | `publications/lecture_XX_study_guide.{md,txt,html}` | 高效學習主戰場 | 學員發言**高度收斂為觀點光譜與誤區**；法師開示**高保真分點精編**；以「破立對照」串聯，每段必附 `[▶ mm:ss]` 原音按鈕與 `.verbatim-drawer` 原話抽屜。 |

---

## 3. 講者角色、去識別化與轉接語紅線（定案）

1. **三類合法講者角色（`session_XX.json` 合約）**：
   - `paragraphs[].speaker` 與 `sentences[].speaker` 僅允許三種合法值：`如性法師`、`維那/主持`、`學員`（受 [studyGroup27Prototype.test.js](../../tests/unit/studyGroup27Prototype.test.js) 強制驗證）。
   - 開場帶念三稱聖號與開經偈、串場唸題、點名同學、結尾致謝與帶念迴向偈，皆屬 `維那/主持`，嚴禁將主持人「相信大家聽完法師的開示……」等語誤標為 `如性法師`。
2. **學員去識別化稱呼（`學員1`、`學員2`…）**：
   - **公開網頁（`study_guide` 與校訂後 `text`）嚴禁暴露學員真實姓名／法名／私稱（如 `琳達師姐`、`洪梅師姐`、`忠孝師兄` 等）**。
   - 為保留同一位學員在辯論中的觀點脈絡，單講內依學員首次出場順序匿名編號為 **`學員1`、`學員2`、`學員3`……**（例如：`學員1` `[▶ 07:50]`、`學員2` `[▶ 09:42]`）。
   - 嚴禁將內部人名對照表提交至公開網站或 `courses/` 公開資料目錄；`sentences[].rawText` 維持原音不更動。
3. **主持人轉接語防混段紅線**：
   - 凡出現「請法師」「法師請說」「謝謝師兄，接下來我們再請……」等轉接語，**必須於該處切分新段落**，絕不可將「主持人點評 ＋ 學員道謝 ＋ 下一位學員發言」或「主持人請法師 ＋ 法師開示」揉進同一個 `學員` 段落（受 `audit_reading_quality.mjs` `Y5_SUSPECT_SPEAKER_MIX` 雷達監測）。
4. **開場三稱與結尾迴向偈保護**：
   - 完整保留開場三稱「南無本師釋迦牟尼佛」與開經偈（不可誤當重複幻覺刪除）。
   - 完整保留結尾合掌迴向偈「遇此無上大師教，皆由上師深恩故，此善迴向諸眾生，願成善士攝受因」（同時尊重 `session_33` 原音核定合約 `皆由上師生恩故`）。

---

## 4. 「思辨研讀講記（v4）」四層結構規格

所有新增講次（`29下`、`30上` 起）及翻新標竿（`29上`）之 `publications/lecture_XX_study_guide.md` 統一採以下四層結構：

### Layer 1｜3 分鐘課前導讀與名相卡
- **脈絡定位**：2～3 句說明本講在《成量品》的承接位置。
- **本講核心偈頌對照表**：列出頌文原句（依官方原典底本核對）、白話核心義理、對應本講題次。
- **核心名相速查（3～5 組）**：精準定義本講關鍵法相與辨析對照（如「心的自性 vs. 境的自性」、「近取因 vs. 助緣」）。

### Layer 2｜逐題「思辨破立單元」（每道討論題 `Q1..Qn` 重複此四模塊）
1. **【原題與思辨焦點】**：列出精煉原題（與 `session_XX.json` `discussionQuestions` 及 `toc.json` 一致），並以 1 句話點出此題真正檢驗的教理關鍵。
2. **【學員研討光譜（高度收斂版）】**：將該題 30～50 分鐘的發散討論，按立場與思路收斂為 2～4 條精煉論點（不逐人流水帳抄錄），區分：
   - **切中要害的見解**（標註 `學員N` + `[▶ mm:ss](url#t=SEC)`）
   - **典型卡點／常見誤區**（標註 `學員N` + `[▶ mm:ss](url#t=SEC)`）
   - **觸發法師補充的延伸追問**（若有）
3. **【如性法師核心開示（高保真重點版）】**：全講最高權重，**不可壓縮成空泛摘要**。須完整保留法師的立宗、破斥邏輯、關鍵譬喻，並明確標示法師回應前面哪一個學員誤區；每段開頭皆附 `[▶ mm:ss](url#t=SEC)` 與正文寫在同一行（嚴禁使用 `HH:MM:SS`、嚴禁在連結後換行、嚴禁出現「研讀講記指出」等後設自稱、嚴禁中段斷尾）。
4. **【本題正見定調（Takeaway Box）】**：以 2～3 條 `❌ 常見誤區 → ✅ 本講正見` 條列收束。

### Layer 3｜法師特別提點與聞思心法
- 獨立萃取法師於換題或結尾給予的學習心態、思辨方法與日常修行提醒（例如如何善用懷疑、避免「我懂了」陷阱），並記錄結尾合掌迴向（時間點須對齊實際結尾原音，不可提前掛在法師開示段）。

### Layer 4｜課後自我檢核卡（3～5 題折疊問答）
- 使用 `<details>` 折疊卡設計實戰觀念辨析題，展開後顯示**參考正見**與**重聽法師開示 `[▶ mm:ss]`** 連結。

### 時間軸與抽屜硬門檻
- 所有 `[▶ mm:ss](url#t=SEC)` 須先經時間對齊至 `session_XX.json` 實句起點，**且該秒數原音的講者與內容必須與該段講記所述一致**（不可把學員提問秒數掛在「法師指出」段）。
- 涵蓋率須達全講時長 `>= 70%`（延伸至結勸與迴向）、無重複 `###` 標題、無全形 `watch？v=`、由 `scripts/render_study_guide_html.py` 產出 `.html` 並通過抽屜 100% 覆蓋與時間對齊測試。

---

## 5. 新增講次端到端 SOP（低成本模型友善）

1. **Step 0 奠基與素材查核**：確認 `grounding.json`、YouTube 影片 ID／時長、`source_outlines/32-XX.json`（缺件時標 `pending`）。
2. **Step 1 語音轉寫（GX10 本地 Whisper）**：下載音訊至 GX10 暫存並以本地 Whisper (`http://127.0.0.1:8010/v1/audio/transcriptions`) 轉寫；驗證音訊與 YouTube 時長無飄移（`R1`），完整保留 `rawText`。
3. **Step 2 逐字稿整編與低成本雷達仲裁**：
   - 本地規則去純冗詞、合併 1～3 字碎句、補標點、依 `grounding.json` 校對專名、切分講者與 `Q1..Qn`（含 `學員1, 學員2...` 去識別化）。
   - 執行 `node scripts/audit_reading_quality.mjs courses/2025釋量論第二品大組共學/sessions/session_XX.json --radar-out /tmp/radar_XX.json`，並以低成本模型（`glm53-flash` / `scripts/lib/radarAdjudicator.mjs`）批次處理黃燈卡片（含 `Y5_SUSPECT_SPEAKER_MIX`）。
   - 補齊 `discussionQuestions`（3～7 題，`？` 結尾）、4～6 段 `teacherSummary`、`contentOverview`（重算 `sourceDigest`）。
4. **Step 3 產出 v4 思辨研讀講記**：
   - 本地切出各題「學員發言包（已匿名為 `學員N`）」與「法師開示包」；低成本模型分塊生成四層內容；高階覆核時間錨點、講者一致性與因明義理。
   - 執行 `python3 scripts/render_study_guide_html.py courses/2025釋量論第二品大組共學/publications/lecture_XX_study_guide.md` 同步產出 `.html` 與 `.txt`。
5. **Step 4 註冊與同步清單**：
   - 更新 `course.json`（新增 session 項目，並於 `studyGuides[]` 註冊 `publications/lecture_XX_study_guide.html`）。
   - 更新 `toc.json`（`sessionId` 對應之節點數與 `discussionQuestions` 1:1 一致）、`catalog.json`、`correction-dates.html`。
   - **同步更新寫死數量的測試合約**：若新增講次，須同步更新 [tests/unit/studyGroup27Prototype.test.js](../../tests/unit/studyGroup27Prototype.test.js) 中的 `course.sessions.length` 斷言（原為 `47`）。
6. **Step 5 驗收與上線紅線**：
   - 必跑且全綠：
     - `node scripts/audit_reading_quality.mjs courses/2025釋量論第二品大組共學/sessions/session_XX.json`（新增／翻新講次須 `0` 紅燈）
     - `npm run summaries:audit`（`complete: true, invalid: 0`）
     - `npm run test:v2`
     - `npm test`
     - `npm run build:v2`
   - PR 須通過全部 CI 並以 `--merge` 合併至 `main`，確認 `Deploy to GitHub Pages` 成功後，實際開啟線上 `github.io` 頁面抽查。

---

## 6. 鎖定講次與歷史測試合約保護清單

執行任何批次腳本或翻新任務前，**嚴禁破壞以下既有測試合約**：
- **`session_01.json`（SHA-256 絕對鎖定）**：登記於 [config/locked-sessions.json](../../config/locked-sessions.json)，由 `tests/unit/studyGroupSession01RemoteReviewBundle.test.js` 驗證，禁止修改任何字元。
- **來源對應與特定講次合約**：
  - `session_10`、`11`、`14`、`15`、`20`、`21`：`studyGroupSourceMapping.test.js`（保留明確 partial / unmatched / candidate mapping IDs）。
  - `session_23`（`12下`）：`studyGroup27Prototype.test.js`（5 題 TOC 同步與講記檢查）。
  - `session_27B`：`studyGroup27Prototype.test.js`（保留 27B 來源與 1:1 摘要合約）。
  - `session_33`：保留原音核定之「皆由上師生恩故」。
  - `reviews/evidence/study-group-2025/playlist_inventory.json`：`studyGroupPlaylistInventory.test.js` 驗證早期 44 筆歷史封存快照，勿隨意覆寫該歷史 evidence 檔。
- **既有 47 講與新增講次之品質門檻分層**：
  - `session_01`～`45` 屬歷史批次產出，維持既有測試合約通過即可；**凡翻新之標竿講次（`session_46` / `29上`）與所有新增講次（`session_47` / `29下` 起），一律強制通過全域 v1.9 `audit:reading-quality` 零紅燈門檻與本文件 v4 思辨講記規格**。
