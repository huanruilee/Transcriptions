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
