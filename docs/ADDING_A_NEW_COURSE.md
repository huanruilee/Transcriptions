# 新增課程標準操作手冊 (Adding a New Course Guide)

本手冊說明如何將《入中論善顯密意疏》多媒體轉寫學習平台的架構與自動化校稿工具鏈，快速應用到下一門新課程（如《菩提道次第廣論》、《四部宗義》等）。

---

## 1. 平台多課程架構 (Multi-Course Architecture)

平台採用集中式課程目錄管理 (`courses/catalog.json`)，前端閱讀器會動態載入選取之課程，並維持音文同步、科判目錄導覽與播放速度控制：

```text
Transcriptions/
├── courses/
│   ├── catalog.json                       # 平台全課程註冊表
│   ├── 入中論善顯密意疏/                    # 既有課程 (219 講)
│   └── [新課程名稱]/                        # 新增課程目錄
│       ├── course.json                    # 課程元資料與講次清單
│       ├── audio_map.json                 # 講次 ID 與音檔 URL 對照表
│       ├── toc.json                       # 宗派/原典科判大綱
│       ├── learned_corrections.json       # 該課程特有名相勘誤表
│       ├── source_text/                   # 原書切頁底本 (page_001.txt ...)
│       └── sessions/                      # 各講轉寫與校訂成果 (session_*.json)
```

---

## 2. 施作步驟 (Step-by-Step SOP)

### 第一步：一鍵初始化課程骨架

使用平台提供的初始化腳本：

```bash
python3 scripts/init_course.py \
  --id "guang-lun" \
  --title "菩提道次第廣論" \
  --master "見悲青增格西" \
  --description "見悲青增格西開示《菩提道次第廣論》講記系列課程。"
```

該腳本會自動完成：
1. 建立 `courses/<title>/` 及其所有子目錄（`sessions/`, `source_text/`）。
2. 生成符合 Schema 的初始 `course.json`、`audio_map.json`、`toc.json`、`learned_corrections.json`。
3. 自動將新課程註冊至 `courses/catalog.json`，前端側邊欄下拉選單立即出現新課程選項。

---

### 第二步：配置音檔清單 (`audio_map.json`)

在 `courses/[新課程名稱]/audio_map.json` 填入各講次 ID 與對應之音檔 URL（如 Flyday 雲端音檔或官方音檔）：

```json
{
  "01": "https://buddha.flyday.com.tw/.../01.mp3",
  "02A": "https://buddha.flyday.com.tw/.../02A.mp3",
  "02B": "https://buddha.flyday.com.tw/.../02B.mp3"
}
```

---

### 第三步：放置原典底本與科判目錄

1. **底本文字切頁**：
   將原典課本切頁文字放入 `courses/[新課程名稱]/source_text/`：
   - 檔名格式：`page_001.txt`, `page_002.txt`, ...
2. **科判目錄設定**：
   編輯 `courses/[新課程名稱]/toc.json`，依原典科判階層填寫：
   ```json
   {
     "courseId": "guang-lun",
     "courseTitle": "菩提道次第廣論",
     "sections": [
       {
         "id": "sec-1",
         "title": "歸敬頌及造者殊勝",
         "page": 1,
         "children": []
       }
     ]
   }
   ```

---

### 第四步：產生講次清單與批次轉寫

1. **生成講次清單**：
   執行腳本自動依 `audio_map.json` 產生講次骨架至 `course.json`：
   ```bash
   python3 scripts/prepare_session_manifest.py
   ```
2. **啟動 GPU 語音辨識與科判注入**：
   至 GPU 伺服器（如 `gx10`）執行批次轉寫：
   ```bash
   python3 scripts/batch_convert_all.py
   ```
   > **優勢**：轉寫腳本內建 `beam_size=5` 高精度解碼、科判大綱注入（Scaffolding）、繁簡防禦過濾（防 `無明瞭` 訛誤），並自動鎖定開示者為見悲青增格西。

---

### 第五步：義理直校與主動學習勘誤

1. **LLM 義理直校**：
   針對生澀講次，使用原典頌詞與頁碼進行端到端精準校訂：
   ```bash
   python3 scripts/llm_proofread_session_30B.py
   ```
2. **主動學習詞彙庫維護**：
   發現特定同音音訛時，加入 `courses/[新課程名稱]/learned_corrections.json`：
   ```json
   {
     "replacements": {
       "物意": "戌一",
       "民語": "明於"
     }
   }
   ```

---

### 第六步：本機驗收與正式部署

1. **本機全套測試**：
   ```bash
   npm test
   npm run test:proofread
   npm run test:asr-gate
   ```
2. **提交代碼**：
   ```bash
   git add courses/[新課程名稱] courses/catalog.json
   git commit -m "feat(course): add [新課程名稱] initial curriculum"
   git push origin main
   ```
3. **GitHub Pages 自動發布**：
   GitHub Actions 會在 20 秒內自動將最新課程打包並發布至正式站台，無須任何手動伺服器設定！

---

## 附：`video/youtube` 且有「官方底本」的課程（四法印先例）

《四法印》（`si-fa-yin`）是本平台第一門「講師自己在 YouTube 描述附官方整編逐字稿 PDF＋官方音檔」的
`video/youtube` 課程，因此走的是**底本對校**路徑，比《三主要道》《四念住》的純 ASR＋詞庫更強。
可重現指令全部落在 `scripts/sifayin_*.py`：

| 步驟 | 指令 | 產物 |
|---|---|---|
| 0 抓官方素材 | `python3 scripts/sifayin_intake.py --sessions 01,..` | `reviews/evidence/sifayin/playlist-NN/{reference_official.pdf,source.mp3}` ＋ `intake_manifest.json`（SHA-256） |
| 1 官方提綱 | `python3 scripts/sifayin_outline.py` | `playlist-NN/outline.json`（附時間碼小標；缺提綱即報錯，不猜） |
| 2 ASR | `python3 scripts/sifayin_asr.py --sessions ..` | `playlist-NN/raw_asr.json`（segments＋RTF＋尾差＋音檔雜湊） |
| 3 底本對校＋切段 | `~/projects/transcription-web/venv/bin/python scripts/sifayin_build_transcript.py --sessions ..` | `courses/四法印/sessions/*.json` ＋ `correction_candidates.json` |
| 4 內容摘要 | `node scripts/content_overview_pipeline.mjs --session si-fa-yin/session_NN --apply`（要改走 eNeural 才加 `OVERVIEW_PROVIDER=eneural`） | session 內 `contentOverview`（證據逐字回查） |
| 5 稽核六件套 | `python3 scripts/sifayin_finalize.py --sessions ..` | `run_manifest.json`、`review.md`、`content_review*.json` |
| 6 課程註冊 | `python3 scripts/sifayin_grounding.py && python3 scripts/sifayin_build_catalog.py` | `grounding.json`、`course.json`、`toc.json`、`correction-dates.html`、`courses/catalog.json` |

關鍵紀律（寫進 `tests/unit/siFaYin.test.js` 當閘門）：

1. **時間碼只來自 ASR**；官方提綱只決定段落邊界與小標。
2. 官方底本是**整編定稿**：只有「同音／近音＋底本詞頻佐證」的名相訛誤才自動改寫
   （`strict-homophone`／`near-homophone-term`），口語刪節一律標 `editorial-divergence` 不改；
   同音但無詞頻佐證者標 `reviewNeeded` 交人工，絕不自動改。
3. `rawText` 保留 ASR 原樣，`text` 才是校訂結果。
4. **底本詞庫的 n-gram 只在同一子句內組字**（標點切斷、換行視同連續）：把標點直接丟掉會把
   「自己。我」當成詞「己我」（實測 23 次）這種假名相；同時詞表校正**不得拆散底本也在用的詞**
   （`breaks_attested_word()`：ASR 原字與鄰字在底本已構成詞、改後的組合成語在底本零出現 → 退回人工，
   例：不得把「難遭遇」改成「難遭於」）。
5. 官方 PDF／音檔屬第三方大檔，**不入庫**；只入庫抽取後的純文字底本，並在
   `reference_inventory.json` 留 SHA-256 與原始下載連結。
4. 未經逐句人工聽核前，`publicationState` 維持 `candidate-review-required`，
   `run_manifest.gates.humanListened` 必為 `false`。
5. 每講證據必須湊齊六件套，`content_review_manifest` 的 `unsupported` 必須為 0。
6. 兩處註冊都要改：`courses/catalog.json` 與 `src/stores/course.ts`；
   新增課程後 `contentOverviewPipeline`／`transcriptProofreadingPipeline` 的總數常量要同步更新。
7. 跑順序不可逆：先定稿逐字稿，再跑 `contentOverview`；之後若重建逐字稿，digest 會失配，
   `npm run summaries:audit` 會擋下。
