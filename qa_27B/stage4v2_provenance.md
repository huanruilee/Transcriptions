# Issue #11 v2 — Provenance & Reproducibility

- **Branch:** `issue11-v2-correction`
- **Git HEAD:** `2eaaf4fed0eb26573fa1762de33c91d04a6820dd`
- **Python:** 3.11.15
- **Node:** v22.23.1
- **Platform:** Linux-6.17.0-1026-nvidia-aarch64-with-glibc2.39
- **CUDA available:** False
- **WhisperX:** unknown
- **Align model:** `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`
- **Align model dir exists:** True
- **Align model dir size:** 5,105,024,244 bytes

## Reproduction commands

- `pip install 'huggingface-hub>=0.34.0,<1.0' whisperx faster-whisper opencc-python-reimplemented`
- `python scripts/stage2v2_alignment.py --sessions 01 69A 110B`
- `python scripts/stage3v2_measurement.py --sessions 01 69A 110B`
- `python scripts/stage4v2_provenance.py`
- `npm test`

## Estimated timings

- alignment_session_01_minutes_estimated: 9
- alignment_session_69A_minutes_estimated: 11
- alignment_session_110B_minutes_estimated: 11
- measurement_total_seconds_estimated: 10
- test_total_seconds_estimated: 30

## Historical gaps

- Original MacWhisper provenance cannot be recovered — the MacWhisper workflow ran outside this repo and did not emit version-locked transcripts. The published sentence texts and timestamps in courses/.../session_*.json are therefore treated as an opaque third-party artefact; we do not claim audio provenance for the original MacWhisper step.