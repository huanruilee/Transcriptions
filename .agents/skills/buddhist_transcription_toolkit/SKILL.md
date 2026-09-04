---
name: buddhist-transcription-toolkit
description: Comprehensive toolkit and engineering standard for Buddhist treatise transcription, grounded ASR alignment, interactive proofreading, AI review gatekeeper, and web review consoles.
---

# Buddhist Text Transcription & Annotation Toolkit

This skill provides best practices, pipelines, specifications, and code patterns for transcribing, aligning, and proofreading Buddhist philosophical treatises—specifically Tsongkhapa's *Illumination of the True Thought on the Middle Way* (《入中論善顯密意疏》).

---

## 1. Authoritative Web Catalog & Source Grounding

### Canonical 219-Session Web Matrix
* **Official Web Source**: [https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68](https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68)
* **Total Canonical Sessions**: **219 lectures** (Lecture 01 is a single session; Lectures 02 through 110 consist of Part A and Part B pairs = 1 + 109 × 2 = 219 sessions).
* **Audio Mapping Policy**: Every session must have its remote stream mapped in `courses/入中論善顯密意疏/audio_map.json` pointing directly to `https://buddha.flyday.com.tw/...`.

### Treatise Ground Truth (285 Pages)
* **Source Text Location**: `courses/入中論善顯密意疏/source_text/` (`page_001.txt` ~ `page_285.txt`).
* **Page Slicing Requirement**: Every session in `course.json` must specify its `pageRange` (e.g. `p.66`, `p.97-p.100`). Before running ASR transcription or LLM proofreading, the corresponding treatise pages must be loaded to extract Buddhist terminology and ground truth citations.

---

## 2. 5-Step Grounded ASR Pipeline Architecture

All lecture sessions are produced via the standardized 5-step Grounded Pipeline in `scripts/batch_convert_all.py`:

```mermaid
flowchart LR
    A[Step 0: Ground Truth Slicing] --> B[Step 1: GPU Whisper ASR]
    B --> C[Step 2: Punctuation & Rule Pre-polishing]
    C --> D[Step 3: 27B LLM Dual-Track Proofreading]
    D --> E[Step 4: Topical Subheading Extraction]
    E --> F[Step 5: Traditional Chinese Packaging]
```

1. **Step 0: Audio Acquisition & Page Slicing**
   * Download or stream remote MP3 to `audio/<SID>.mp3`.
   * Load corresponding pages from `source_text/page_XXX.txt`.
2. **Step 1: Dedicated GPU Whisper ASR (Port 8010)**
   * Endpoint: `http://127.0.0.1:8010/v1/audio/transcriptions` (`faster-whisper large-v3-turbo`, CUDA int8 on GB10, 59x Realtime).
   * Generates microsecond-precision acoustic timestamps (`start`, `end`, `text`).
3. **Step 2: Semantic Segmentation & Rule Pre-polishing**
   * Merge short fragments (`pause < 1.1s`) into natural sentences ($\le 28$ characters).
   * Apply built-in Buddhist glossary regex substitutions (e.g., `葡萄切勒 -> 補特伽羅`, `勝一地 -> 勝義諦`, `物意 -> 戌一`, `民語 -> 明於`, `真意為有自信 -> 增益為有自性`, `藏幣 -> 障蔽`, `來人所為 -> 能仁說為`).
4. **Step 3: Local Qwen3.8-27B Dual-Track Proofreading (Port 8001 / 4001)**
   * Batched in 25 sentences with treatise context and **Outline Scaffolding** (科判字號動態注入 from `toc.json`).
   * Speaker attribution: **見悲青增格西**.
   * **Dual-track rule**:
     - *Verses/Treatise recitation*: 100% strictly aligned to the root text.
     - *Oral commentary*: Preserve conversational phrasing and oral delivery; only correct homophones and Buddhist terms.
5. **Step 4: Topical Subheading Generation**
   * Extract 6~10 structured headings per session matching Tsongkhapa's structural outline (科判), formatted as `【科判/主題】說明`.
6. **Step 5: Traditional Chinese Conversion & OpenCC Defensive Filter**
   * Run OpenCC `s2twp` Taiwan traditional conversion.
   * Apply defensive filter against over-conversions: e.g. `無明瞭 -> 無明了`.
   * Enforce zero blacklist violations in `tests/unit/asrIntegrityGate.test.js` and `tests/unit/proofreadingQualityGates.test.js`.
   * Output to `courses/入中論善顯密意疏/sessions/session_<SID>.json`.

---

## 3. Formatting & Schema Standards

* **Heading Format Standard**: All semantic section headings must strictly follow the `【科判/主題】說明` syntax (e.g. `【科判】卯二、破執`, `【名相辨析】破實事師所計自相實有`).
* **Sidebar Session Labels**: Format session items with chronological progress markers (e.g. `（85A）20180512 歸敬頌p6`, `（27B）20161231 第六現前地p95`).
* **Sentence Purity**:
  - `start` and `end` must be non-negative numbers with monotonic progression ($s[i].start \ge s[i-1].end - 0.05$).
  - `text` must be clean Traditional Chinese with proper punctuation (`，` `。` `！` `？`).
  - Zero simplified characters, zero prompt leaks (`Here is`, `【輸出】`), zero corrupt tokens (`咒詩`, `葡萄切勒`).

---

## 4. Quality Verification & Gatekeeper Tooling

* **Completeness Gate**:
  ```bash
  npm run test:completeness         # Dynamic gap detection audit report
  npm run test:completeness:strict  # Strict 100% (219/219) completeness gate
  ```
* **Unit & Schema Test Suite**:
  ```bash
  npm run test:unit                 # 160+ automated contract & schema tests
  ```
* **Acoustic Sync Blind-Test**:
  ```bash
  python3 scripts/verify_audio_sync.py <SID> audio/<SID>.mp3 --samples 15
  # Threshold: Acoustic match rate >= 75%
  ```
* **Active Learning & Disambiguation Engine**:
  ```bash
  python3 scripts/active_learning_manager.py --eval     # Evaluate rules
  python3 scripts/active_learning_manager.py --sync-all # Propagate learned terms
  ```

---

## 5. Web Review Console & Interactive Proofreading

* **Reader Interface (`index.html`)**:
  - Dual modes: `🎧 聆聽模式` (Click-to-Seek) vs `📝 校對與筆記模式` (Click-to-Edit).
  - Sentence editor popover allowing real-time character edits, note-taking, and treatise page references.
  - Local persistence via `localStorage` namespace per session so user notes survive page refreshes.
  - Markdown note export generator embedding timestamps, treatise headings, and user annotations.
* **Web Review Console (`review.html`)**:
  - Visual side-by-side Diff rendering (`<del class="diff-del">` and `<ins class="diff-ins">`).
  - Bounded 3-second audio snippet player for instant ear verification.
  - Passkey + Tailscale private network authentication for secure 1-click approvals.

---

## 6. Physical Line Boundary Grounding Protocol (物理行邊界鎖定規範)

When calibrating a session's table of contents alignment (`toc.json`), headings (`session_*.json`), and course summaries (`course.json`):

1. **Root Cause of LLM Hallucination**:
   - LLMs easily fall into "keyword traps" (e.g. hearing the Geshe mention "三種補特伽羅" or "無明" in passing and immediately tagging future outline nodes like `戌二` or `亥二`).
2. **Physical Line Number Verification**:
   - Always load the exact treatise pages (`courses/入中論善顯密意疏/source_text/page_XXX.txt`).
   - Find the exact sentence where the Geshe's消文 concludes in that audio session.
   - Contrast the sentence's line number against the line number of subsequent outline headings:
     * *Example (Session 31B)*: Audio text concludes at `page_103.txt` line 6 (`反應見為虛妄也`). Heading `亥二、釋煩惱不共建立` begins at line 8. Therefore, Session 31B is strictly grounded in `亥一、正義` (lines 1–6) and MUST NOT claim `亥二` or `戌二`.
3. **Mandatory Invariant**:
   - Never tag a session with an outline node whose treatise root text begins after the session's physical lecture cutoff line.

---

## 7. Field-Tested Spoken Buddhist Homophone Lexicon (法師口語消文同音字庫)

During live oral commentary, ASR models frequently phoneticize Tibetan/Taiwanese-accented Buddhist technical terms into everyday homophones. The following corrections are mandatory invariants:

| ASR Error (訛字) | Correct Buddhist Term (正字) | Doctrinal Context / Source Meaning |
| :--- | :--- | :--- |
| `五米` | `無明` | 染污無明、十二有支之無明 |
| `地實` | `諦實` | 諦實成立、非諦實 |
| `生文` | `聲聞` | 聲聞、獨覺、菩薩三類聖者 |
| `假信` | `假性` | 唯是假性、全無諦實 |
| `髒斃` / `藏幣` | `障蔽` | 無明障蔽之心、所知障障蔽 |
| `據生` | `俱生` | 俱生實執、俱生我執 |
| `七弟` | `七地` | 七地以下菩薩 |
| `消聞` | `消文` | 依照經論文句消文解說 |
| `時有` / `值時有` | `實有` / `執實有` | 執諸法實有、非實有耳 |
| `強位` | `強謂` | 若不如上釋，強謂此於彼等應成非世俗諦 |
| `成可效顧` | `誠可笑故` | 於彼以無實執為理由，誠可笑故 |
| `貪承吃` | `貪瞋痴` | 煩惱三毒（貪瞋痴） |
| `畢竟不限` | `畢竟不現` | 實性於具無明者畢竟不現 |
| `自取` | `自續` | 自續派、自續以下 |
| `有不進步` | `有部、經部` | 小乘有部與經部二宗 |
| `為世` | `唯識` | 大乘唯識宗 |
| `葡萄切勒` | `補特伽羅` | Pudgala，數取趣/補特伽羅 |
| `勝一地` | `勝義諦` | Paramārtha-satya，二諦之勝義諦 |

---

## 8. Regression Test Invariant Preservation (測試回歸保護規範)

Automated tests in `tests/unit/` enforce strict behavioral invariants that must be preserved during all AI calibrations:

1. **Sidebar Filter Behavioral Tokens**:
   - `tests/unit/sidebarFilterBehavior.test.js` requires specific keyword tokens in early lecture summaries for search filtering tests:
     * Lecture `01` summary MUST contain `歸敬頌`.
     * Lecture `02A` summary MUST contain `釋禮敬`.
   - Never replace these historical test anchor tokens during automated batch summary updates.
2. **Monotonic Timestamps & Segment Preservation**:
   - Editorial corrections must modify only `text`.
   - Never alter acoustic timing markers (`start`, `end`) or delete segments, preserving click-to-seek and sentence editor audio sync.

---

## 9. 1-Click Local Active Learning & Disk Sync Bridge (1 鍵直連本機後台)

To enable self-evolving transcription learning from interactive web proofreading without manual copy-paste:

1. **Local Sync Server (`scripts/sync_server.py`)**:
   - Zero-dependency Python server listening on port `9091` with full CORS enabled.
   - Provides `/api/status`, `/api/learn`, `/api/sync-batch`, and `/api/learned`.
   - Ingests human corrections, updates `learned_corrections.json`, and applies verified edits directly to target `session_*.json` on disk.
2. **Frontend Integration (`src/js/localSync.js` & `src/js/annotation.js`)**:
   - **Real-Time Auto Sync**: When saving an edit in the sentence editor with `🧠 標記為全庫通用佛學名相修正` checked, automatically posts to `/api/learn`. If online, changes are written to disk and learned immediately.
   - **1-Click Sync Hub (`#local-sync-btn`)**: Clicking the header button opens the sync hub, checking connection status and transferring all accumulated edits from `localStorage['learned_suggestions']` into the repository with a single click.
3. **Execution Command**:
   ```bash
   npm run sync-server   # or: python3 scripts/sync_server.py
   ```
