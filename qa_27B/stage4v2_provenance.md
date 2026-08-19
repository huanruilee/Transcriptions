# Issue #11 v2 — Provenance & Reproducibility

- **Branch:** `issue11-v2-correction`
- **Git HEAD (final):** `1b553137d831e2e3c28a9dc06bb202773696e336`
- **Python:** 3.11.15
- **Node:** v22.23.1
- **Platform:** Linux-6.17.0-1026-nvidia-aarch64-with-glibc2.39
- **torch:** 2.8.0
- **whisperx:** 3.8.6
- **faster-whisper:** 1.2.1
- **opencc:** 0.1.7
- **huggingface-hub:** 0.36.2
- **transformers:** 4.57.6
- **Align model:** `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn` (dir 5,105,024,244 B, exists=True)
- **Independent ASR model:** `mobiuslabsgmbh/faster-whisper-large-v3-turbo` (dir 3,243,332,006 B, exists=True)
- **3-session alignment manifest present:** True

## Reproduction commands

- `pip install 'huggingface-hub>=0.34.0,<1.0' whisperx faster-whisper opencc-python-reimplemented`
- `python scripts/stage2v2_alignment.py --sessions 01 69A 110B`
- `python scripts/stage3b_independent_cer.py --sessions 01 69A 110B`
- `python scripts/stage3v2_measurement.py --sessions 01 69A 110B`
- `python scripts/stage4v2_provenance.py --head-sha <FINAL_SHA>`
- `npm test`
- `curl -s https://gx10-2887.tail378c21.ts.net/transcriptions/?pilot=01`

## Estimated timings

- alignment_session_minutes_est: 9
- independent_asr_session_minutes_est: 8
- measurement_seconds_est: 10
- test_seconds_est: 30

## Historical gaps

- Original MacWhisper provenance cannot be recovered — it ran outside this repo. Published sentence texts/timestamps are treated as an opaque third-party artefact; no audio provenance is claimed for the original MacWhisper step.