# Issue #11 v2 獨立技術複驗 Brief（修正版 — 回應 Codex review）

## 審查範圍

branch `issue11-v2-correction`，supersede `2eaaf4f`（v1）與 `054fd3c`（interim）。
本次 revision 回應 Codex source review 的 **3×P1 + 1×P2**，從 `054fd3c` 實質修正
（舊 `356f8e9`/`ff2b4cc` 未修正，已棄用）。

## Codex findings → 修正對照

| # | 級別 | Finding | 修正 | 位置 |
|---|---|---|---|---|
| P1-1 | P1 | 300s chunk 用 `a0 - 10s` overlap，邊界句被雙重 align → token allocation 偏移 | **完全移除 overlap**。每句依 published midpoint 指派**唯一** chunk（互斥分片），無任何文字重疊 | `stage2v2_alignment.py` `sent_chunk` + chunk loop |
| P1-2 | P1 | fallback 只按字數分配、不比對 token/text identity → 漏字/多字/多字元錯配 | **identity-based monotonic 兩指標 mapping**：逐字元比對 aligner word 流，處理 insertion/omission/substitution/multi-char，字元 pointer 永不倒退（monotonic 保證）；**移除字數 budget fallback** | `monotonic_map()` |
| P1-3 | P1 | CER 以 published text 對 published-derived `a["text"]` → CER=0 是 self-echo | **stage2v2 完全移除 CER**（它只是 pipeline-integrity 訊號，~0 是數學後果）。改由 `stage3b_independent_cer.py` 用**獨立 faster-whisper large-v3-turbo ASR** 產生 hypothesis，Levenshtein/|ref| 量真 CER；stage3v2 明確標 `is_text_accuracy_evidence=false` | `stage3b_independent_cer.py` + `stage3v2_measurement.py` |
| P2-1 | P2 | pilot payload 遺失 sessionId/title/paragraph IDs → 破壞標題/下一堂/autoplay | pilot payload 現保留 `sessionId/title/date/page/audioUrl` + 逐 paragraph `id/start/end` + `_pilot_v2` flag + `_meta` | `stage2v2_alignment.py` pilot block |

## 另修

- **silent pass → hard fail**：stage3v2/stage3b 缺 evidence 時 `sys.exit(2/3)`（非 `return None`+`continue`）；所有 guard tests 缺檔一律 `assert.fail`（非 `return`/`continue`）
- **provenance**：確切 `whisperx`/`faster-whisper`/`whisper` 版本（`importlib.metadata`），git head SHA 於產出時抓取，alignment manifest 完整列 01/69A/110B
- **negative tests**：新增 chunk overlap（aligned words ≈ content chars 帶）、token omission/insertion/substitution/multi-char（JS port `monotonicMap` 驅動 fixture）、metadata preservation、missing-evidence hard-fail
- **ts reference**：`published_start` 僅標為 `LEGACY/COARSE BASELINE`，**非** audio-grounded acceptance reference；ts metric 改名 `ts_*_vs_legacy`

## v2 架構（修正後）

- **Alignment**: WhisperX `align()` + `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`（char-level）
- **Chunking**: 300s 互斥分片（依 published midpoint 指派唯一 chunk，避 OOM、無 overlap）
- **Token→sentence**: monotonic two-pointer identity mapping（每內容字元 1 對 1，monotonic）
- **CER（pipeline integrity）**: stage2v2 內**不計算**（~0 是後果，無資訊量）
- **CER（真文字準確率）**: stage3b 獨立 faster-whisper ASR hypothesis vs published，Levenshtein/|ref|
- **ts error**: matched by sentence index，reference = published_start（**legacy/coarse**，非 audio-grounded）
- **NEEDS_REVIEW**: `no_alignment` / `non_monotonic` / `out_of_bounds` / `low_confidence`(score<0.5)
- **Pilot route**: `?pilot=<sid>`，ratio=1.0 bypass，payload 含完整 session metadata

## 證據檔案（全部重新產生，不沿用舊數據）

| 檔案 | 內容 |
|---|---|
| `stage2v2_alignment_{01,69A,110B}.json` | 逐句 timestamp + score + **diagnostics**（char_coverage, n_omitted, non_monotonic） |
| `stage2v2_aligned_{01,69A,110B}.json` | pilot payload（含 sessionId/title/para id/`_pilot_v2`） |
| `stage3v2_measurement_{01,69A,110B}.json` | integrity CER + **獨立 ASR proxy CER** + ts-vs-legacy + 術語 |
| `stage3b_independent_cer_{01,69A,110B}.json` | **獨立 faster-whisper hypothesis + 真 CER** |
| `stage4v2_provenance.{json,md}` | 確切版本 + audio sha256 + git SHA + 重現指令 |
| `stage2v2_alignment_manifest.json` / `stage3v2_measurement_manifest.json` | 3 堂彙總 |
| `review_verification_package.json` | 機器可讀驗證數據（monotonic/NEEDS_REVIEW/CER） |

## 3 堂結果（重新計算，pipeline 跑完後填入）

| 指標 | 01 | 69A | 110B |
|---|---|---|---|
| 句數 | | | |
| content chars / aligned words | | | |
| char_coverage | | | |
| n_omitted / n_substituted | | | |
| n_non_monotonic（須=0） | | | |
| NEEDS_REVIEW | | | |
| 獨立 ASR proxy CER（真準確率） | | | |
| ts median / P95（vs legacy） | | | |

## 測試

完整 `npm test`（含 15+ guard + negative tests）+ pilot browser regression。
缺 evidence 一律 **hard fail**（無 silent skip）。

## 已知限制（誠實標明）

1. **published_start = legacy/coarse baseline**：原始粗標（8s/120s 階梯），非音訊 ground truth。
   ts median/P95 是對 legacy 量的**系統性偏差**，非 alignment 錯誤。alignment 本身 monotonic（0 violations）。
   **ts 的 audio-grounded acceptance** 需同句 audio anchor — 屬 audio-capable reviewer 範圍。
2. **獨立 ASR proxy 是人耳複核的 proxy，非人耳複核**：large-v3-turbo 對中文佛教術語仍可能錯，
   故其 CER 是**proxy 下限**，**不能單獨給 GO**。
3. **CPU-only**：vLLM 占 GPU，alignment + ASR 都用 CPU。

## 需 Reviewer（小檢 K-15）重新計算（不得只抄 review_verification_package.json）

1. **Monotonic**：自 `stage2v2_alignment_*.json` 重新算 3 堂全量 start/end 不遞減 + char_coverage 一致性
2. **Token mapping**：抽句驗證 monotonic char→word（對照 diagnostics 的 n_omitted/substituted）
3. **CER**：自 `stage3b_independent_cer_*.json` 的 `hypothesis` vs `reference` 重算 Levenshtein/|ref|，
   對照 `cer_overall`；確認非 self-echo
4. **Metadata**：對照 production `session_*.json` 驗證 pilot payload 的 sessionId/title/para id 完整
5. **ts reference 語意**：確認 `ts_*_vs_legacy` 標記 + `is_audio_grounded=false`
6. **negative tests**：跑 `npm test`，確認 overlap/omission/insertion/multi-char/metadata 負例真能 fail

## 審查範圍界定（重要）

- 若 reviewer **非 audio-capable**：verdict **限定為 technical/reproducibility review**，
  真人音訊驗收（ts audio-grounded anchor + 人耳 CER）**仍列唯一 acceptance blocker**。
- 獨立 ASR proxy **不得**被視為人耳複核，**不得**據此給 GO。

## Provenance

- python / node / whisperx / faster-whisper / whisper：見 `stage4v2_provenance.json`（確切版本）
- align_model：`jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`
- asr_model：`Systran/faster-whisper-large-v3-turbo`
- git head / branch / audio sha256：見 `stage4v2_provenance.md`

## Pilot Preview

- https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=01
- https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=69A
- https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=110B
