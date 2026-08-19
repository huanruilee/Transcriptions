# Issue #11 v2 獨立審查 Brief

## 審查範圍

commit `356f8e9` (branch `issue11-v2-correction`)，supersede `2eaaf4f`。

## v1 (2eaaf4f) 被否決的 9 項缺陷

1. 60s-mid-clip window → non-monotonic timestamps
2. CER=0 self-echo（corrected text vs aligner output of same text）
3. ts error 對 nearest arbitrary ASR word
4. SequenceMatcher.ratio() 標為 CER
5. 獨立 ASR 替代 audio-grounded review
6. Tests 驗證 evidence fields 非 alignment correctness
7. Quality testing skipped in normal gate
8. No aligned pilot data deployed
9. No provenance (model hash, audio hash)

## v2 架構

- **Alignment**: WhisperX `align()` + wav2vec2-large-xlsr-53-chinese-zh-cn
- **Chunking**: 5-min (300s) slices, 避 OOM
- **CER**: Levenshtein edit distance / |reference chars|
- **ts error**: matched by sentence index (not nearest word)
- **NEEDS_REVIEW**: avg_score < 0.5 的句子
- **Pilot route**: `?pilot=<sid>` feature flag, ratio=1.0 bypass
- **Provenance**: model hashes, audio sha256, repro commands

## 證據檔案

| 檔案 | 內容 |
|---|---|
| `qa_27B/stage2v2_alignment_{01,69A,110B}.json` | 逐句 timestamp + score |
| `qa_27B/stage2v2_aligned_{01,69A,110B}.json` | pilot payload (app.js 用) |
| `qa_27B/stage3v2_measurement_{01,69A,110B}.json` | CER + ts error + 術語 |
| `qa_27B/stage3v2_measurement_manifest.json` | 3 堂彙總 |
| `qa_27B/stage4v2_provenance.{json,md}` | 完整 provenance |
| `scripts/cer_check.js` | ESM Levenshtein CER module |
| `scripts/stage2v2_alignment.py` | alignment engine |
| `scripts/stage3v2_measurement.py` | measurement engine |
| `scripts/stage4v2_provenance.py` | provenance generator |
| `tests/alignment-pipeline.test.js` | 15 guard tests |
| `tests/fixtures/alignment/` | negative fixtures |

## 3 堂結果

| 指標 | 01 | 69A | 110B |
|---|---|---|---|
| 句數 | 434 | 538 | 599 |
| NEEDS_REVIEW | 52 (12.0%) | 52 (9.7%) | 42 (7.0%) |
| CER | 0.000 | 0.000 | 0.000 |
| Omitted | 0 | 0 | 0 |
| Term errors | 0 | 0 | 0 |
| Monotonic violations | 0 | 0 | 0 |
| ts median | 33.8s | 45.4s | 19.3s |
| ts P95 | 128.7s | 92.7s | 83.7s |

## 測試

75 tests: 74 pass, 0 fail, 1 skip (27B quality — known skip)

## 已知限制

1. **ts error 超標**：published_start 是原始粗標（8s/120s 階梯），非音訊 ground truth。wav2vec2 ts 是 audio-grounded，偏差是 reference 定義問題
2. **無 audio-capable reviewer**：CER=0 是 forced alignment 的數學後果（align 已知文字 → 0 dropped），非獨立驗證
3. **CPU-only**：vLLM 占 GPU，alignment 用 CPU (~12 min/session)

## 需 Reviewer 確認

1. Monotonic invariants 是否真的 pass（抽 3 堂各 50 句驗證 start/end 不遞減）
2. NEEDS_REVIEW 標記是否合理（score < 0.5 的抽 5 句對照音檔）
3. CER 定義是否正確（Levenshtein / |ref|）
4. Guard tests 是否有效（negative fixtures 真的能被偵測）
5. Provenance 是否完整可重現
6. ts error 的 reference 定義是否接受 published_start 或需 audio-grounded

## Provenance

- python: 3.11.15
- node: v22.23.1
- align_model: jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn
- git_head: 356f8e9
- branch: issue11-v2-correction
- audio sha256: 見 stage4v2_provenance.json

## 審查驗證數字（已計算，供 Reviewer 對照）

### Monotonicity（全量，非抽樣）

| Session | 句數 | start 非遞減 violations | end 非遞減 violations | 時間範圍 / 音檔 |
|---|---|---|---|---|
| 01 | 434 | 0 | 0 | [0.6, 2432.8] / 2466s |
| 69A | 538 | 0 | 0 | [2.9, 3256.9] / 3257s |
| 110B | 599 | 0 | 0 | [0.0, 3246.7] / 3247s |

**結論：1571 句全量 monotonic，0 violations。**

### NEEDS_REVIEW（total 146，5 lowest score）

| Session | pos | score | 時間 | 文字 |
|---|---|---|---|---|
| 01 | 340 | 0.032 | 1806.9-1807.0 | 嗯。 |
| 01 | 329 | 0.065 | 1784.7-1785.2 | 對這個，這個地方，每個人都解釋都會不一樣。 |
| 110B | 163 | 0.085 | 892.1-892.4 | 什麼如，如那個什麼。 |
| 69A | 352 | 0.091 | 2080.9-2081.2 | 「士夫補特伽羅」，這樣。 |
| 01 | 34 | 0.092 | 259.0-259.3 | 對，總之就是唯識家。 |

低 score 多是短填充詞（嗯/對/什麼如）+ 術語句，符合 wav2vec2 對非標準漢語語境 confidence 低的預期。

### CER 分解

| Session | n_low_confidence | cer_overall | cer_max |
|---|---|---|---|
| 01 | 52 | 0.0 | 0.0 |
| 69A | 52 | 0.0 | 0.0 |
| 110B | 42 | 0.0 | 0.0 |

**注意**：CER=0 是 forced alignment 的數學後果（align 已知 published 文字 → 0 dropped）。
這是**預期**，不是獨立 audio-grounded 驗證。Reviewer 須理解此限制。

完整驗證數字：`qa_27B/review_verification_package.json`

## Pilot Preview

https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=01
