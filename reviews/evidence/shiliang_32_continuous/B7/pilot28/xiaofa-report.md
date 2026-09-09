# Session 28 Timestamp Pilot — Xiaofa Report

**Verdict: PASS**

## Baseline
- branch (start): `codex/shiliang-32-continuous-quality`
- HEAD: `0a03dd4f11efe6cae607eee0fdb54f3ee7cb71ea`
- workspace: `/home/henry/.gx10/tasks/shiliang32-20260909/worker`
- new branch: `codex/xiaofa-session28-pilot`
- commit: `fix: restore session 28 timestamp continuity`
- author: Xiaofa Agent <huanruilee.us+codex@gmail.com>

## Canonical raw ASR (verified before alignment)
- path: `/home/henry/.gx10/xiaofa/outputs/session28-sync-20260908/investigation/inputs/raw-asr.json`
- sha256: `caeb546d440f5048740deef862d2f5e2935fc9d27a30642ff87dfa3efd407ba9`
- duration: 5128.6235 s
- last raw id: 2345, end 5116.41

## Problem (before fix)
- `courses/釋量論第二品/sessions/session_28.json`
- sent-180..194 timestamps were placed 13–100 s later than their raw ASR evidence (e.g. sent-186 was at 2250.32..2258.62 but raw 994..1001 = 2184.04..2199.58).
- sent-194.end = 2359.15 > sent-195.start = 2258.83 → monotonicity break (backward jump of 100.32 s).
- 15 sentences in sent-180..194 carried wrong anchors; sent-195/196 happened to be correct.

## Method (per spec)
- Used raw segment start/end **only**, no averaging, no fabrication.
- Each corrected timestamp equals the start of one raw segment and the end of another (rounded to 2 decimals, matching published precision).
- Mapped `session_28.json` sent-180..196 to raw ASR segments 988..1051 (raw 988 sits after sent-179.end=2161.39, preserving global monotonicity; raw 988 begins with 由了苦相续 which matches the leading phrase of sent-180's published text).
- Sentences kept their **original text unchanged** (per spec "不可改文字").
- Paragraph `start`/`end` fields re-anchored to first/last sentence of each paragraph to satisfy ASR Integrity Gate + 32-講 sentence invariants.

## Changed sentences (before → after, with raw segment IDs)
| id | before | after | raw segment range |
|---|---|---|---|
| sent-180 | 2175.28 → 2193.86 | 2175.28 → 2177.94 | 988..989 (由了苦相续 / 而生起悲悯) |
| sent-181 | 2193.86 → 2199.97 | 2177.94 → 2180.87 | 990..991 (但阿罗汉 / 之所以对众生) |
| sent-182 | 2199.97 → 2204.13 | 2180.87 → 2184.04 | 992..993 (生起悲悯 / 不是那种状态) |
| sent-183 | 2207.11 → 2222.86 | 2184.04 → 2192.76 | 994..997 (接着 另外一个质疑 如果阿罗汉 有悲心) |
| sent-184 | 2222.86 → 2224.18 | 2192.76 → 2199.58 | 998..1001 (当他所悲悯的对象 ... 生起称恋) |
| sent-185 | 2224.18 → 2231.25 | 2199.58 → 2203.11 | 1002 (这讲的不就是我们吗) |
| sent-186 | 2250.32 → 2258.62 | 2203.11 → 2215.78 | 1003..1009 (如果我们 ... 应该会) |
| sent-187 | 2258.62 → 2260.86 | 2215.78 → 2221.90 | 1010..1013 (之所以会生起称恋 ... 对他生起贪恋) |
| sent-188 | 2262.67 → 2265.82 | 2221.90 → 2231.36 | 1014..1017 (所以再一次的证明 ... 是建构在贪之上) |
| sent-189 | 2265.82 → 2266.32 | 2231.36 → 2238.94 | 1018..1021 (由于我们贪爱他 ... 而对他生起悲悯) |
| sent-190 | 2266.32 → 2266.82 | 2238.94 → 2247.14 | 1022..1027 (之后 ... 生起称恋) |
| sent-191 | 2266.82 → 2272.44 | 2247.14 → 2250.47 | 1028..1029 (所以他提出 / 这个相同的质疑) |
| sent-192 | 2273.86 → 2282.61 | 2250.47 → 2252.53 | 1030..1031 (如果阿罗汉 / 有悲心) |
| sent-193 | 2330.42 → 2355.22 | 2252.53 → 2256.45 | 1032..1033 (当他所悲悯的对象 / 被其他人伤害了) |
| sent-194 | 2355.22 → 2359.15 | 2256.45 → 2258.83 | 1034..1035 (他应该会 / 生起称恋了) |
| sent-195 | 2258.83 → 2280.98 | 2258.83 → 2280.98 | 1036..1043 (unchanged — already correct) |
| sent-196 | 2280.98 → 2300.31 | 2280.98 → 2300.31 | 1044..1051 (unchanged — already correct) |

Paragraph `start`/`end` (also re-anchored to keep p.start/p.end = first/last sentence):
- p_39: 2250.32 / 2231.25 → 2203.11 / 2203.11
- p_40: 2250.32 / 2258.62 → 2203.11 / 2215.78
- p_41: 2258.62 / 2359.15 → 2215.78 / 2258.83

## Test updates
- `tests/unit/session28AnchorRegression.test.js`: added 17 raw-ASR exact anchors (sent-180..196) to `EXPECTED`. Each anchor documented with its raw segment IDs and content. TOL=0.005 s, ROUND to 2 decimals (consistent with published precision).
- Original sent-197..212 anchors retained unchanged.
- All monotonicity tests, text-preservation tests, and review-only-flag tests remain in place.

## Verification (real execution)
- `node --test tests/unit/session28AnchorRegression.test.js` → 8/8 pass
- `node --test tests/unit/shiliangAllSessionsPatterns.test.js tests/unit/sessionInventory.test.js` → 46/46 pass (32-講 sentence invariants now satisfied for p_39/p_40/p_41)
- `npm test` (full suite): 322 tests, 312 pass, 7 fail (all 7 pre-existed at 0a03dd4 — annotationWorkflow, localModelHeadings, a11y, sidebarFilterBehavior, tocRemediation, tocResponsiveRefactor, uxCourseOverview — unrelated to session_28). The session28 anchor regression test goes from failing → passing. ASR Integrity Gate goes from failing → passing.
- Monotonicity violations across the whole sentence stream: 0 (was 1 at sent-194→sent-195 before fix).

## Diff scope
Only three files modified (matches spec):
1. `courses/釋量論第二品/sessions/session_28.json` — timestamps only
2. `tests/unit/session28AnchorRegression.test.js` — added raw-ASR exact anchors for sent-180..196
3. `reviews/evidence/shiliang_32_continuous/B7/pilot28/xiaofa-report.md` — this report (replaces prior BLOCKED report)

`reviews/evidence/shiliang_32_continuous/xiaofa-smoke.txt` was NOT modified/committed (per spec).

## Out-of-scope course
- `courses/入中論善顯密意疏/` not touched (verified by session28AnchorRegression test path assertion).
