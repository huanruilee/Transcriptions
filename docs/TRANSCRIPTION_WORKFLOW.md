# 逐字稿標準流程

版本：1.7。更新：2026-11-20（Asia/Taipei）。適用：所有課程及所有 Agent。
本文件合併至 `main` 後生效；後續一律讀取 [main 最新版](https://github.com/huanruilee/Transcriptions/blob/main/docs/TRANSCRIPTION_WORKFLOW.md)，並與 [逐字稿排版與編輯標準化計劃](EDITORIAL_FORMATTING_PLAN.md) 及 [Agent 交接與全流程執行手冊](AGENT_HANDOFF_PLAYBOOK.md) 保持一致，不要複製一份自行維護。

## 1. 權威與適用順序

1. 使用者對本次任務的明確指示。
2. 課程專屬指導：`courses/<課程名>/COURSE_GUIDE.md`（若存在）與 `courses/<課程名>/grounding.json`，定義該課程獨有的底本用法、名相禁忌、特殊格式與參考文件入口；在不牴觸全域紅線前提下優先適用。
3. 本文件與 [逐字稿排版與編輯標準化計劃](EDITORIAL_FORMATTING_PLAN.md)：Stage 0 ～ Stage 7 單向轉稿與品管流水線、口語冗詞清除與依語意順句規範。
4. [品質契約](TRANSCRIPT_PROOFREADING_QUALITY_CONTRACT.md)、[資料 Schema](DATA_SCHEMA.md)、[專案規格](SPECIFICATION.md) 等領域細節；涉及本流程的舊敘述以本文件與 `EDITORIAL_FORMATTING_PLAN.md` 為準，Schema 不得未經協調直接改動。
5. 舊 SOP、交接、skill 與歷史報告僅作背景和工具參考。Draft 文件／PR 不改變正式流程。

若現有程式、Schema 或文件尚未支援要求，明列缺口並採可稽核的人工步驟；不得宣稱已有自動強制攔截。不得以「測試全綠」代替音訊或論義已人工核定。

## 2. 先確認本次交付

開工或回報專案現況前，**必須先執行 `git fetch origin` 同步遠端最新 `origin/main` 狀態**（不可僅憑本地舊分支或過時快取做判斷），再記錄 Task ID、講次、工作分支／隔離 checkout、來源 commit、來源檔 digest、允許的模型／provider、預期產物及發布範圍。保留別人的未提交內容。不直接改 main、不自動擴大全庫。

預設交付是**流暢原意閱讀版（不整篇改寫、必除口語冗詞、必合碎句並依語意補順）**。產物定位如下：

| 產物 | 內容規則 | 來源與用途 |
| --- | --- | --- |
| 原始 ASR／原話來源（`verbatim/`） | 原樣保存；不以校字後文字覆蓋 | 追溯、還原、音訊對照 |
| 正式逐字稿（`sessions/session_XX.json`） | 校同音錯字與佛法名相、**徹底清除 `呃／嗯／啊／好，那` 等口語冗詞與結巴、合併被 ASR 切碎的單詞與子句並依語意補順句子**、套用出版級臺灣正體標點；嚴禁整大篇改寫或無中生有，保留全部實義副詞、否定詞及師生問答 | 預設正文（對標《釋量論·成量品 32-1.pdf》版型與品質） |
| 導讀摘要（`contentOverview`） | 導讀明標 AI 摘要，須於正文與 `sent-X` 完全定稿後生成／同步，並鎖定 `sourceDigest` | 學習輔助；與正文句子 ID 及引文嚴格同步 |

檔案位置依課程既有 Schema 使用 `sessions/`、`verbatim/`、`publications/`、`source_outlines/`。不要假設所有課程都有相同格式。既有精煉 session 不得未審查就改成另一種資料結構。

## 3. 前置研讀、參考資料與基礎概念學習（Domain Grounding）

在開始任何講次的校對或轉寫之前，**必須先執行「前置知識萃取與研讀（Pre-flight Grounding）」**，絕不可在對課程主題毫無概念的情況下盲目校對。

### Step 0 前置關卡（Gate）：先找來源，再開工

**未完成本節 Step 0 的三項強制檢索與知識包產出，不得開始任何講次的校對或轉寫。**
本節為**前置關卡**，不是建議；未通過者視為未開工。

**為什麼強制**：2026-11-16 四念住重做實測 —— 缺少 Step 0（未取得同一講的整編講記），
導致 5 個 Stage 5 worker 先後耗盡 output token、零產出；同時規則對照表只能抓已知錯寫，
對「整句亂碼」完全無感（s04 漏報 26 倍）。補上 Step 0 後，以講記為基準的 3-gram 對齊
一次就找出 209 句規則表抓不到的亂碼。

#### 必須產出

| 產物 | 位置 | 說明 |
| --- | --- | --- |
| 課程基礎知識包 | `courses/<course>/grounding.json` | 實體庫、名相對照表、章節對照、來源清單 |
| 課程專屬指導書（有特殊規則時必建） | `courses/<course>/COURSE_GUIDE.md` | 該課程獨有的底本正規化／對齊規則、名相消歧禁忌、講者口語習慣、專用腳本與參考文件入口 |
| 參考資料 inventory | `reviews/evidence/<course>/reference/README.md` | 每份來源：`referenceId`、類型、URL、本機路徑、SHA256、取得日期、核對狀態、允許用途 |

**沒有 `grounding.json` 的課程視為未完成 Step 0。**
（目前已有：菩薩就是這樣成佛、2025釋量論第二品大組共學、**四念住**。）

#### 「先找來源」的搜尋順序（由高到低）

1. **同一講的整編逐字稿／講記／官方字幕** —— 價值最高，是講者原話的定稿，可直接比對用字
2. 該影片說明欄、官方下載頁、附件（講義、課本、勘誤）
3. 教材底本、經論原文（《俱舍論》《瑜伽師地論》等）—— 佐證專名與引文
4. 講者所屬道場／學院的官方網站、傳記、法語珠璣
5. 圖書館、出版者、可追溯的第三方資料（最後手段，須標明版本與缺漏）

#### 搜尋範圍檢查（避免漏掉同名不同物）

- 同名經文的**不同譯本**不可直接當這一講的底本
- **其他年度的同題課程**、同名作者的**另一場**演講不可混用
- 必須核對：課程、講者、講次、錄製日期、影片 ID／音檔、上下半講、版次／頁碼

#### 找到整編講記時（強烈建議，路徑已驗證）

若找到同一講的整編講記，**必須**：

1. 抓取全文存到 `reviews/evidence/<course>/reference/`，附抓取腳本與 SHA256；**若來源為 PDF／OCR 擷取，匯入 `source_text/` 前必須先執行 Unicode NFKC 正規化**（消除康熙部首或 CJK 相容字元如 `教㈻藍圖㆗`，並清理多餘斷行與頁碼雜訊），避免後續對齊失效
2. 寫出**講記章節 ↔ 本課程講次**的對照表
3. 建立**字串對齊工具**（見 `tools/sinianzhu_align_jiangji.py` 的實作），
   以「本講無對應」為指標找出整句亂碼 —— 這是規則對照表抓不到的部分；同時**從官方底本自動抽取本課專有名詞與關鍵術語表，強制比對並攔截 ASR 同音／近音誤植**（例如「二地→二諦」「四地→四諦」「三歸一→三皈依」「十六形象→十六行相」），凡與底本衝突的高頻專名一律列為 `reviewRequired=true` 必檢項目，不得僅靠通用詞表放行
4. 修正後以**法相詞頻對齊**驗證整體貼合度
   （講記是整理稿，逐句吻合率低是正常的，**不可用逐句比對判定好壞**）

#### 步驟與執行規範：
1. **內容概覽與先導研讀**：
   - 快速速讀本講次的粗辨識文字或摘要，抓出本講的核心議題（例如：大乘發心、空性二諦、唯識三性、量學現量/比量）。
2. **自動實體預檢與聯網探針（Step 0: Entity Grounding Probe）**：
   - **強制必查 3 項實體檢索**，杜絕封閉記憶盲猜：
     1. **道場與住持**：搜尋 `"{channel} 住持 法師"`（例如確認高雄法印講堂住持為「見岸法師」，杜絕「見安/按師父」等語音諧音）。
     2. **教材底本與作者**：搜尋 `"{title} 書 講義"`（例如確認教材為達賴喇嘛、圖丹卻準《菩薩就是這樣成佛：達賴喇嘛給初發心修行人的第五個錦囊》）。
     3. **前置與關聯課程**：查閱影片資訊欄中的關聯詞（例如《瑜伽師地論》、印順導師《空之探究》）。
3. **萃取「課程基礎知識包（Course Micro-Knowledge Base）」**：
   - 從課本與參考資料中學習並固化本門課程專屬的：
     - **實體庫（Entities）**：講者法號、住持法號、常隨眾、道場名稱、引用論師（如宗喀巴、月稱、寂天、印順導師）。
     - **專門名相（Terminology）**：本課高頻核心術語（如自性/世俗諦/勝義諦/種姓/自他換/六度/資糧）。
     - **核心論理脈絡（Doctrinal Schema）**：破立架構（自宗、他宗、所破、能立）。
4. **將知識包作為後續全部管線的唯一底本依據**：
   - 萃取出的知識包寫入該課程的 `grounding.json` 或 `course.json`，供確定性規則、本地模型與頂級模型終審時共用。
   - 任何校對修改均必須溯源自此知識包或原典依據，杜絕無來源的憑空捏造。
5. **增量學習之即時回寫與全課廣播（Continuous Sync & Broadcast）**：
   - 當人工或 Agent 修正一處核心實體（如「見安 $\rightarrow$ 見岸法師」），必須同時觸發：
     1. 更新該講次 `session.json`；
     2. 回寫課程 `grounding.json` 與全域消歧規則庫 `config/doctrinal-disambiguation-rules.json`；
     3. 觸發自動廣播檢測，批次掃描該課程其餘所有講次，同步清除同類誤植。

## 4. 單向轉稿與校對流水線（Stage 1 ～ Stage 5）

1. **Stage 1（原始 ASR 轉寫與備份）**：在隔離沙盒跑指定講次，保留原始辨識與時間戳備查。
2. **Stage 2（佛法名相／異常偵測 ＋ GX10 Whisper 局部重辨識與幻覺修復）**：
   - 在進行任何順句之前，必須先執行規則掃描（`dharmaTermAudit.js`）與 LLM 語意異常偵測（`llmOmissionAudit.js`），針對疑似聽錯名相、頁碼誤辨、連續重複 3 次以上之 Whisper 幻覺或外文亂碼，透過 SSH 呼叫 GX10 Whisper（`100.113.144.100:8010`）切出目標音訊窗進行雙軌重辨識並還原正字。
3. **Stage 3（清除口語冗詞、合併破碎短句與依語意補順）**：
   - **不整段改寫、不捏造未講內容，但必須清除口語冗詞並依語意補順句子**：
     - **區分「修辭重複」與「口語冗詞／結巴」**：保留講者為強調義理而刻意反覆的修辭重複；徹底清除 `呃`、`嗯`、`啊`、`喔`、`欸`、句首無實義的 `好，那`、`那，`、`好，`、`就是說，`、以及口吃結巴重複（`這個這個`、`然後，然後呢`）。若某個 `sent-X` 整句僅含發語詞、冗詞或無實義單字應答，直接從 `sentences[]` 移除該物件（嚴禁設為空字串 `""`）。
     - **合併被切碎的單詞與子句**：當同一個詞或同一個連貫子句被 ASR 切成多個 1～4 字碎片（如 `傳，` + `達出去，`），合併為單一完整 `sent-X`，時間軸更新為 `start = 首句.start`、`end = 末句.end`，消除詞語中間的碎逗號。
     - **依語意補順與出版級標點**：將口語半截斷句或倒裝依語意順為自然通順的句子，補齊殘缺名相與連接詞，並套用臺灣繁體出版級標點（《釋量論·成量品 32-1.pdf》標準）。
     - **保護實義詞彙**：時間、程度、邏輯與否定詞（`剛好`、`已經`、`因為`、`所以`、`如果`、`但是`、`沒有`、`不要`）及師生問答必須完整保留。
4. **Stage 4（兩級分段與主題編號小標）**：
   - **一級章節（大標）**：取自 YouTube 影片提綱或課程科判，僅作章節邊界，**嚴禁作為唯一切段依據**。
   - **二級自然段（正文段落）**：在冗詞清除、碎句合併定型後，由 `paragraphLayoutPlanner.js` 或語意切段規則將章節內正文切分為每段 **150～350 字（約 8～20 句；硬上限 35 句）** 的自然段（同步更新 `paragraph.start = 首句.start`、`paragraph.end = 末句.end`），並每 3～6 段配置 `1. ...`、`2. ...` 編號義理小標，杜絕數百句擠成同一段落。
5. **Stage 5（Agent 佛法專家逐段通讀審核）**：
   - 主控 Agent 必須親自逐段通讀全文，同時驗收「佛法名相與義理 100% 正確」及「零發語詞殘留（無 `呃/嗯/啊`）、無破碎逗號斷句、文句自然流暢」。遇有疑義音段立即調用 GX10 Whisper 重聽確認。

## 5. Stage 6：導讀摘要（`contentOverview`）與資料同步

**導讀摘要生成與同步必須排在 Stage 5 專家審核定稿之後執行**（且 `_meta.correctionsPending` 與 `hallucinationSuspects` 須先清零或完成人工裁決、正文標點與碎句整併已定型），避免內文修訂或碎句合併導致摘要引文失效與重工：
1. 導讀獨立標示為 AI 整理，引用定稿後之正文 `sent-X` ID 與文字，區分講者主張、他宗批評與學員提問；其中 `discussionTopics`（或 `discussionQuestions`）每講應收斂為 **3～7 題**緊扣法義的核心辨析問題，皆以全形問號 `？` 結尾。
2. 任何講次內文有增刪、合併或修改句子文字時，必須同步更新 `contentOverview` 中所有包含 `evidence[]` 的四個陣列（`mainPoints`、`discussionTopics`、`sections`、`referenceViews`——過濾已刪除或被合併的舊 `sent-id`、更新 `quote` 與現行句子完全一致），並呼叫 `scripts/content_overview_pipeline.mjs` 的 `computeSourceDigest(transcript)` 重新計算寫入 `contentOverview.sourceDigest`。
3. 同步工具先輸出候選，正式同步需對新正文有效的摘要審查；不可只更新 digest 讓驗證通過。例如《入中論》既有工具：

```sh
# 將 SID 換成已指定講次；輸出目錄須為新目錄
python3 scripts/sync_study_guide_to_session.py SID --candidate-dir tmp/workflow/SID/candidate
# 在候選與新摘要審查均完成、獲准正式套用後，二擇一執行
python3 scripts/sync_study_guide_to_session.py SID --overview-file tmp/workflow/SID/reviewed-overview.json
```

`--candidate-dir` 與 `--overview-file` 不可混用。渲染時明列單一 Markdown 路徑，避免無參數批次重寫出版品。新科判需核對原典物理頁／行及當講截止點；不得因提到關鍵詞就掛到未講的後續科判。

### 5.2 學習鷹架（`studyScaffolding`）底本與時間軸強制規範

為杜絕偈頌張冠李戴與時間戳估算偏差，產製或更新 `sessions/session_*.json` 中的 `studyScaffolding` 時，必須遵守以下兩項紅線：

1. **偈頌原文必須逐字取自課程底本（禁止模型憑記憶補寫）**：
   - `studyScaffolding.verses` 內每一首偈頌的中文譯文，必須逐字複製自該課程對應的底本或講記原文（如 `publications/lecture_*_dialogue_transcript.md` 或 `source_text/page_*.txt`），嚴禁由模型憑記憶生成或改寫。
2. **時間戳必須從定稿逐字稿實際句子反查（禁止估算填寫）**：
   - `verseMappings`、`compassMaps` 與 `pauseBoxes` 的所有時間戳（秒數），必須在逐字稿定稿後，從 `sessions/session_*.json` 內實際對應句子的 `start` 時間程式化反查取得，不得憑印象或分段比例估算。
   - 提交 PR 前必須跑過 `npm run summaries:audit`、`npm test` 與 `npm run test:v2`，並在部署至 GitHub Pages 後實地開啟線上網頁抽查確認。

## 6. 待閱校版可以先上線

使用者已同意：尚未人工完整校稿的成果可以先上線，之後在閱讀中校正。**人工逐句回聽不是待閱校發布的先決條件。** 發布仍需來源可追溯、自動品質通過、修改可檢查、獨立工程 review 及正常 CI／部署。

| 顯示狀態 | 可以宣稱 | 所需記錄 |
| --- | --- | --- |
| 待閱校版 | 已完成機器處理，尚未人工完整校訂 | 來源版本、生成日期、待核項目與自動驗證 |
| 閱校中 | 已開始閱讀，部分仍待確認 | 已確認範圍、修改紀錄、待回聽項目 |
| 已確認版 | 使用者明確確認的閱讀／聽核範圍 | 核定者、日期、對應版本與剩餘限制 |

這是發布語意，不要求立刻新增三個 Schema enum。沿用現有欄位及可顯示的說明；缺少欄位時用隨產物版本綁定的 manifest／說明保存。不能只在內部報告寫待核：**閱讀頁、獨立 HTML／Markdown 與實際下載都須讓讀者看見待閱校狀態**。若既有 UI／匯出尚無法顯示，先做小範圍功能修正，不能以未顯示的 metadata 宣稱完成。

可用標示：「待閱校版：經 ASR 與 AI 輔助整理，尚未人工完整校訂；疑義請配合原音核對。」未回聽不得填 `humanListened=true`。已閱校也不等於整講逐字聽核。

## 7. 閱讀校正與回歸資料

已有逐字稿可先作「文字參考基準」，但只有綁定相同錄音區間與來源版本、經人工聽核確認的部分，才能作「人工聽核 Benchmark」。是否聽核、是否參與提示／調整，以及評估模式必須分別記錄；已有逐字稿不自動成為 gold。參與開發的案例歸回歸集；盲測留出集須按講次／音源分組，禁止重疊片段洩漏。詳見 [Benchmark 分流與交接](REFERENCE_EVIDENCE_PROTOCOL.md#benchmark-分流)。使用同一參考稿輔助生成再比對它，只能報告 reference-assisted 結果，不稱獨立準確率。

每次人工修改保存來源版本、句子 ID、before／after、音訊區間、時間、修改者及理由；區分「閱讀確認」「音訊回聽確認」「底本核字」「純編輯」。目前未具備自動修訂紀錄的入口，以人工 ledger 補齊；本文件不宣稱後端功能已完成。

一次校正先適用本句，不直接推廣全庫。「長短→常斷」等需上下文的規則必須有正例與一般語境反例；檢查重複執行結果一致。人工修改可成為回歸候選，但開發案例不能稱作未見驗收集。原始 ASR、校字候選與發布修訂均可還原。

### 頂級模型（如 Claude 3.5 Sonnet / GPT-4o）終審提示規範
當管線完成確定性規則與本地模型初篩後，若需請更高階模型進行爭議句終審：
```markdown
【提示給頂級 Agent 的終審 Prompt 範本】
你是一位精通漢傳與藏傳佛學的權威校審仲裁者。
任務：審查以下語音辨識之「佛法名相誤植」與「文義顯然不通處」，做出最終判定。
原則：
1. 嚴禁整大篇改寫或無中生有；但必須清除無實義的口語發語詞（呃、嗯、啊、好，那）並依語意將破碎短句補順。
2. 依上下文義理消歧（如：中觀空性作「自性」，世俗信心作「自信」）。
3. 證據不足或無把握者，一律 REJECT（維持原文）。
背景實體：[課程名稱/講者/傳承/教材名稱]
待審爭議句清單：
[{"id": "sent-xx", "context": "...前後文...", "target": "原辨識", "proposal": "建議修正", "reason": "存疑理由"}]
輸出格式：僅回傳 JSON 陣列：[{"id": "sent-xx", "action": "ACCEPT"|"REJECT"|"REVISE", "final": "修正文字", "code": "HOMOPHONE|DOCTRINE|FLUENT_SMOOTH"}]
```

升級「已確認版」須由使用者明確確認範圍；未解決高風險疑點明列，不能以模型票數或使用者曾開啟頁面自動核定。

## 8. Stage 7：驗證、自動化品質門檻、提交與部署

迭代時跑相關測試；固定最終成果後執行：

```sh
npm run audit:reading-quality -- courses/<課程名>
npm run test:v2
npm test
npm run summaries:audit
node --test tests/acceptance/goldenStandard.test.js
npm run build:v2
```

另跑本課程所需來源／ledger 稽核；不修改 gate 或測試預期來掩蓋正文錯誤。發現歷史 skip 或門檻只掃部分 engine，報告範圍，不宣稱全庫皆驗證。公開文字要求繁體中文、零適用禁止同音錯字、零殘留純發語詞（`呃/嗯/啊`），且符合下表之最低閱讀品質量化門檻；原始辨識證據（`rawText`）則保留原貌。新訂正規則不能因湊零禁字而誤改實詞。

### 最低閱讀品質量化門檻（Minimum Reading Quality Gate，含「待閱校版」）

即使以「待閱校版（`candidate-review-required`）」先上線，仍須通過 `npm run audit:reading-quality -- courses/<課程名>` 自動化稽核與以下紅線，**不得以「Schema 合法、無空字串」代替閱讀品質驗收，亦禁止以未整編的 Raw ASR 原始段直接套粗綱充數**：

| 檢查項目 | 紅線門檻 | 說明 |
| --- | --- | --- |
| 無句尾標點句比例 | `< 5%` | 杜絕 ASR 原始段未補標點直接上線（如 2026-11-19《四法印》曾高達 60.6%） |
| 1～3 字孤立碎句比例 | `< 2%` | 「第一點」「例如」等未完碎片須與前後子句合併並繼承首尾時間軸 |
| 純冗詞／無實義單字句 | `0` | 「呃」「嗯」「啊」或無實義單字應答句須直接移除該 `sentence` 物件 |
| `_meta.correctionsPending` 與 `hallucinationSuspects` | `0`（或附人工裁決紀錄） | 必須於生成 `contentOverview`（Stage 6）與合併前清零 |
| 單段閱讀粒度 | 目標 150～350 字（硬上限 35 句） | YouTube 粗綱／科判僅作一級章節；章節內一律切分為二級自然段 |
| 官方底本專名對齊（`noBaseText: false`） | NFKC 零相容字元 ＋ 零高頻專名衝突 | 匯入底本先做 Unicode NFKC 正規化，並抽取底本專名強制比對 ASR |
| `discussionTopics` / `discussionQuestions` | 3～7 題且全形 `？` 結尾 | 適用所有課程，嚴禁僅產 1～2 題交差 |

（註：上述靜態指標已由 `scripts/audit_reading_quality.mjs` 提供自動化檢查；專名語意衝突與高風險義理仍須由執行 Agent 與獨立 Reviewer 抽查覆核。）

瀏覽器確認閱讀頁、原話、導讀、待閱校標示、寬窄排版、下載完整性及末句音訊。閱讀器程式與發布路徑依 [閱讀器發布 Test Patterns](../TESTING.md#閱讀器發布-test-patterns2026-10-24) 分別驗證原入口、失敗回退、資料保真、實際下載與部署版本；Pages workflow 的 artifact／deployed smoke 皆通過才算工程部署驗收完成。獨立 reviewer 看固定 commit 與證據；工程 PASS、內容核定、發布與人工聽核分開記錄。

使用新分支。建立 PR 必須帶明列 base、head 及 body 檔，避免互動卡住：

```sh
gh pr create --base main --head codex/TASK-BRANCH --body-file /tmp/TASK-pr-body.md
# 確認本次已有合併授權，且固定版本 review／CI 通過後
gh pr merge PR_NUMBER --merge
```

禁止 squash、force-push。合併後核對同一 main SHA 的 CI／Pages 部署與實頁；有問題用新修正／revert PR。不能把 PR CI 綠燈寫成已部署。

## 9. 交接與版本維護

交接最少記錄：Task／講次、分支／commit、來源與成果 digest、已過 gate 及證據路徑、待閱校與待回聽範圍、執行中工作、下一條命令、禁止覆寫檔案與授權界線。不要在交接文件保存 token／憑證。

交接另附 reference inventory 路徑、每份資料的使用角色與版本核對狀態、Benchmark 的聽核／資料分組／參考暴露狀態。接手者先核對 digest 與缺口，不重做已通過且來源相符的工作。可直接採用 [參考資料交接範本](REFERENCE_EVIDENCE_PROTOCOL.md#交接範本)。

維護時修改本檔、更新版本與下表，並同步 `AGENTS.md`／`START_HERE.md` 的入口；舊文件保留歷史，但明示被取代之處。執行中任務綁定來源版本，新版出現時先看差異，不盲目重跑已完成工作。

| 版本 | 日期 | 變更 |
| --- | --- | --- |
| 1.7 | 2026-11-20 | 消除跨檔矛盾與冗餘：`AGENTS.md` 瘦身為 SSOT 路由並移除過時 Draft／重複語句、區分修辭重複與結巴重複、統一兩級分段（150～350 字／硬上限 35 句）、將 `studyScaffolding` 整併入 §5.2 並對齊 Stage 0～7、新增自動化稽核腳本 `scripts/audit_reading_quality.mjs`（`npm run audit:reading-quality`），並下放《入中論》《四法印》《三主要道》專屬規則至各自 `COURSE_GUIDE.md` |
| 1.6 | 2026-11-20 | 納入《四法印》成果覆盤教訓：強制開工／查現況前 `git fetch origin`、確立「全域標準＋課程目錄 `COURSE_GUIDE.md`」兩層指導架構、外部底本匯入前 Unicode NFKC 正規化與官方底本專名強制對齊、禁止僅靠 YouTube 粗綱造成超大單段、Stage 6 前清零 `correctionsPending`/`hallucinationSuspects`，並新增「最低閱讀品質量化門檻」（適用待閱校版）與全課程 3～7 題討論問題規範 |
| 1.5 | 2026-11-15 | 正式合入低 Token 漏斗共用模組（`scripts/lib/eneuralClient.mjs`、`scripts/lib/transcriptGuards.mjs`）、`config/locked-sessions.json` 前置鎖定檢查與最小差異輸出（`fixes + breaks`），並新增全流程交接手冊 `docs/AGENT_HANDOFF_PLAYBOOK.md` |
| 1.4 | 2026-11-14 | 對齊 Stage 0～7 單向流水線；廢除「保留口頭禪／禁止刪合碎句」舊規，改為強制清除口語冗詞（呃、嗯、啊、好，那）、合併破碎短句並依語意補順句子，且導讀同步移至 Stage 5 專家終審定稿之後 |
| 1.3 | 2026-11-13 | 納入讀者體驗改進：連續閱讀與對照雙模式、ASR 幻覺收折膠囊標記、講記雙向跳轉與名相懸浮註釋規範 |
| 1.2 | 2026-10-24 | 納入閱讀器發布五層測試契約與 artifact／deployed 瀏覽器 gate |
| 1.1 | 2026-10-24 | 強制先尋找並核對參考資料；區分整編稿、字幕與人工聽核基準；增加 Benchmark 防洩漏、低 Token 分工及來源清單交接 |
| 1.0 | 2026-10-23 | 統一原話優先、精煉另軌、待閱校可發布、保真追溯與驗證交接；取代舊 SOP 相衝突的流程敘述 |

低 Token 漏斗工作流與實戰操作規範已正式收錄於 [Agent 交接與全流程執行手冊](AGENT_HANDOFF_PLAYBOOK.md) 與 [大組共學工作流 v3](STUDY_GROUP_WORKFLOW_V3.md)；PR #271 與 PR #281 若仍屬歷史獨立 Draft，採用前仍須先核對實際合併狀態與程式。
