---
trigger: always_on
description: Mandatory invariants for Buddhist treatise study guides and session transcripts (verbatim root text preservation, cross-page verification, and anti-hallucination rules).
---

# Study Guide & Treatise Root Text Invariants (《善顯密意疏》講記與課文保留鐵則)

When creating, editing, or calibrating study guides (`publications/lecture_*_study_guide.md`), outlines (`source_outlines/*.json`), or session transcripts (`sessions/session_*.json`), you MUST strictly follow these invariants:

1. **100% Verbatim Preservation of Cited Treatise Text (強制完整保留《善顯》課文原文)**:
   - Whenever the speaker (Geshe) recites, quotes, or explains a passage from *Madhyamakāvatāra* (《入中論》頌文) or Tsongkhapa's *Illumination of the True Thought* (《善顯密意疏》課文), **the exact root text MUST be preserved verbatim in the study guide paragraph** (formatted in bold quotes `「**……**」` and verified character-for-character against `courses/入中論善顯密意疏/source_text/page_XXX.txt`).
   - NEVER omit the treatise text or replace it with a vernacular summary, because the entire lecture exists to explicate the root text.

2. **Cross-Page Flashback Verification (跨頁回看必查)**:
   - If the speaker instructs students to flip back or forward to another page during the lecture (e.g., flipping from p.109 back to p.104 to compare terminology), you MUST load the referenced `source_text/page_XXX.txt`, include the cited root text verbatim, and document the speaker's analysis without skipping.

3. **Strict Anti-Hallucination & Next-Session Cutoff Check (嚴禁超前幻覺與跨講次核對)**:
   - Always inspect the raw transcript until the very end of the audio AND check the opening of the next session (`session_{NEXT_SID}.json`).
   - If a reader recites a new outline heading near the end of a class but is immediately interrupted by a student Q&A—leaving the actual explanation of that heading to the next session—you MUST faithfully transcribe the Q&A and NEVER fabricate commentary from the root text for the postponed section.

4. **Paragraph Granularity & Triad Synchronization (段落密度與三位一體同步)**:
   - Split study guide commentary into 20–30 timestamped paragraphs (`[▶ mm:ss](url#t=sec)`) so that sentence density strictly satisfies `1.5 <= avgSentences <= 8.0` in `tests/acceptance/goldenStandard.test.js`.
   - Always synchronize `.md` changes to `.html`, `source_outlines/{SID}.json`, and `sessions/session_{SID}.json` via `scripts/render_study_guide_html.py` and `scripts/sync_study_guide_to_session.py {SID}`, followed by `npm run summaries:audit` and `node --test tests/acceptance/goldenStandard.test.js`.
