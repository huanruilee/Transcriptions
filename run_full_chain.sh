#!/usr/bin/env bash
# Full evidence regeneration chain (run after stage2v2 finishes).
# stage2v2 (CPU forced-align) runs as its own bg job; this chain waits for its
# three output files, then runs the fast stages + independent ASR + anchor audit.
set -uo pipefail
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
PY=/home/henry/.hermes/hermes-agent/venv/bin/python

echo "[chain] waiting for stage2v2 outputs ..."
for i in $(seq 1 240); do
  if [ -f qa_27B/stage2v2_alignment_01.json ] \
   && [ -f qa_27B/stage2v2_alignment_69A.json ] \
   && [ -f qa_27B/stage2v2_alignment_110B.json ]; then
    echo "[chain] stage2v2 done, proceeding"
    break
  fi
  sleep 15
done

# sanity: all 3 stage2v2 files present?
for s in 01 69A 110B; do
  [ -f qa_27B/stage2v2_alignment_$s.json ] || { echo "FATAL: stage2v2 $s missing"; exit 2; }
done

echo "[chain] stage3v2 measurement ..."
$PY scripts/stage3v2_measurement.py --sessions 01 69A 110B || exit 3

echo "[chain] stage3b independent ASR CER (slow) ..."
$PY scripts/stage3b_independent_cer.py --sessions 01 69A 110B || exit 4

echo "[chain] stage4v2 provenance (manifest) ..."
$PY scripts/stage4v2_provenance.py || exit 5

echo "[chain] audio-grounded anchor audit (slow) ..."
$PY scripts/audio_anchor_audit.py --sessions 01 69A 110B --n-sample 25 || exit 6

echo "[chain] generate review artifacts (single source of truth) ..."
$PY scripts/generate_review_artifacts.py --patch-brief || exit 7

echo "[chain] ALL STAGES COMPLETE"
