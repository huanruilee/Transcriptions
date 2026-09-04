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
