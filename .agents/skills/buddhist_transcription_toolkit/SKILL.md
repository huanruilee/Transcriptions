---
name: buddhist-transcription-toolkit
description: Comprehensive toolkit and engineering standard for Buddhist treatise transcription, grounded ASR alignment, interactive proofreading, AI review gatekeeper, and web review consoles.
---

# Buddhist Text Transcription & Annotation Toolkit

This skill provides best practices, pipelines, and code patterns for Buddhist philosophical treatises (such as Tsongkhapa's *Illumination of the True Thought on the Middle Way* 《入中論善顯密意疏》).

## 1. Grounded Transcription & Outline Pipeline
- **Source Grounding**: Always load ground-truth treatise pages from `courses/<course>/source_text/page_XXX.txt` to inject authoritative terms into Whisper and LLM prompts.
- **Heading Format Standard**: All semantic section headings must strictly follow the `【科判/主題】說明` syntax (e.g. `【科判】卯二、破執`, `【名相辨析】破實事師所計自相實有`).
- **Sidebar Session Labels**: Format session items with chronological progress markers (e.g. `（85A）20180512 歸敬頌p6`).

## 2. Interactive Proofreading & Study Notes Workspace
- **Reader Interface**:
  - Dual modes: `🎧 聆聽模式` (Click-to-Seek) vs `📝 校對與筆記模式` (Click-to-Edit).
  - Sentence editor popover allowing real-time character edits, note-taking, and treatise page references.
  - Local persistence via `localStorage` namespace per session so user notes survive page refreshes.
  - Markdown note export generator embedding timestamps, treatise headings, and user annotations.

## 3. Backend AI Review Gatekeeper (Gatekeeper)
- Inspect proposed sentence corrections against `source_text/page_XXX.txt`.
- Output classification levels:
  - `🟢 HIGHLY_RECOMMENDED`: Definite homophone/terminological corrections matching treatise meaning.
  - `🟡 SUGGESTION`: Minor style/punctuation changes.
  - `🔴 WARNING`: Changes contradicting treatise doctrinal definitions.
- Timestamp Monotonicity: Strictly guard Whisper Large-v3 `start` and `end` timestamps.

## 4. Web Review Console (`review.html`)
- Visual side-by-side Diff rendering (`<del class="diff-del">` and `<ins class="diff-ins">`).
- Bounded 3-second audio snippet player for instant 2-second ear verification.
- Passkey + Tailscale private network authentication for secure 1-click approvals.

## 5. Session Quality Audit & Regression Runner (`npm run audit:session`)
To audit any lecture session (such as legacy drafts like `97B` or converted sessions like `29A`):
- Run individual audit: `node scripts/audit_session_regression.js <sessionId>` (e.g. `node scripts/audit_session_regression.js 97B`)
- Run batch audits: `node scripts/audit_session_regression.js all` / `legacy` / `converted`
- Automated checks performed:
  1. **Pattern 1 - Metadata & Provenance**: Must include `_meta.engine` (Whisper Large-v3), `_meta.llm_proofread`, and sentence/paragraph counts.
  2. **Pattern 2 - Remote Audio Stream**: Must point to official Flyday streaming URL in `audio_map.json`.
  3. **Pattern 3 - Semantic Headings**: Must contain $\ge 6$ thematic headings adhering to `【主題】說明` syntax.
  4. **Pattern 4 - Terminology & Homophone Purity**: Strictly forbids ASR soundalike corruptions (e.g. `人以四十` ➔ `但以世俗`, `果二生` ➔ `菩提心生`, `聖意` ➔ `勝義`, `非紋症` ➔ `飛蚊症`, `至向有` ➔ `自相有`).
  5. **Pattern 5 - Monotonicity & Acoustic Naturalness**: Strict timestamp non-inversion + authentic speech variance (rejects synthetic uniform slice timestamps).
  6. **Pattern 6 - Traditional Chinese Purity**: 0 simplified characters.
  7. **Treatise Grounding Verification**: Verifies presence of key phrases against corresponding `source_text/page_XXX.txt`.

## 6. Legacy vs Golden Benchmark Architecture Note
- The repository contains 199 sessions. Currently 89 sessions (01–53B) have completed full Whisper Large-v3 + Grounded LLM transformation (marked by `_meta`).
- Unconverted draft sessions (e.g. `97B`, `100A`, etc.) remain in raw ASR draft form until upgraded.
- `tests/acceptance/goldenStandard.test.js` intentionally guards converted sessions. For legacy draft diagnosis, always execute `npm run audit:session <sessionId>`.

