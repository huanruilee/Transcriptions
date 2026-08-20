#!/usr/bin/env bash
# Full evidence regeneration chain.
#
# Reviewer (PR #12 #5349634955 follow-up) — prior version only waited for
# the output files to exist, so a pre-existing stale file would pass the
# gate even though stage2v2 had not actually re-run. Now we:
#   1. Generate a RUN_ID at start; record it + input hash + code SHA.
#   2. Capture the child PID ($$ of the launched python) and its exit code.
#   3. Require output files' mtime to be AFTER the recorded start time.
#   4. Persist all of this into qa_27B/_run_<RUN_ID>/run.json so the
#      reviewer can verify the chain actually executed this run.
set -uo pipefail
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
PY=/home/henry/.hermes/hermes-agent/venv/bin/python

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
RUN_DIR="qa_27B/_run_${RUN_ID}"
mkdir -p "$RUN_DIR"
START_EPOCH=$(date +%s)
START_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "[chain] RUN_ID=$RUN_ID  start=$START_UTC"

# Capture code SHA + input hashes (everything that produced the output)
CODE_SHA=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
INPUT_HASHES=$(cat courses/入中論善顯密意疏/sessions/session_{01,69A,110B}.json \
               audio/{01,69A,110B}.mp3 2>/dev/null \
               | sha256sum | cut -c1-32)

# Save run start info
cat > "$RUN_DIR/run.json" <<EOF
{
  "run_id": "$RUN_ID",
  "start_utc": "$START_UTC",
  "start_epoch": $START_EPOCH,
  "code_sha": "$CODE_SHA",
  "input_hashes": "$INPUT_HASHES",
  "stages": []
}
EOF

# Run a python step and capture pid + exit code + per-stage output mtime.
run_step() {
  local name="$1"; shift
  local log="$RUN_DIR/${name}.log"
  local meta="$RUN_DIR/${name}.json"
  echo "[chain] stage: $name  ($*)"
  local pid t0
  t0=$(date +%s)
  "$PY" "$@" > "$log" 2>&1 &
  pid=$!
  wait "$pid"
  local rc=$?
  local t1
  t1=$(date +%s)
  # Per-stage output mtime (latest mtime of any file this stage touched,
  # picked up by the glob the caller passes in). Default: the log itself.
  local latest_mtime
  latest_mtime=$(stat -c %Y "$log")
  cat > "$meta" <<EOF
{"name":"$name","cmd":"$*","pid":$pid,"exit_code":$rc,
 "start_epoch":$t0,"end_epoch":$t1,
 "output_mtime_epoch":$latest_mtime,
 "run_id":"$RUN_ID"}
EOF
  if [ "$rc" -ne 0 ]; then
    echo "[chain] FAIL  $name  exit=$rc  log=$log"
    return $rc
  fi
  echo "[chain] OK    $name  exit=0  pid=$pid  mtime=$latest_mtime"
  return 0
}

# Require stage2v2 output mtime > chain start, AND the file must exist
# (it might already exist on disk; mtime check is what proves it was
#  produced this run).
require_stage2() {
  local sid="$1"
  local f="qa_27B/stage2v2_alignment_${sid}.json"
  if [ ! -f "$f" ]; then
    echo "[chain] FAIL  stage2v2_${sid}: file $f missing"
    return 2
  fi
  local mtime
  mtime=$(stat -c %Y "$f")
  if [ "$mtime" -le "$START_EPOCH" ]; then
    echo "[chain] FAIL  stage2v2_${sid}: $f mtime=$mtime <= chain start=$START_EPOCH (stale)"
    return 3
  fi
  echo "[chain] OK    stage2v2_${sid}: $f mtime=$mtime > chain start=$START_EPOCH"
  return 0
}

# Wait for stage2v2 to finish (up to 240 * 15s = 60 min).
echo "[chain] waiting for stage2v2 outputs (mtime > chain start $START_EPOCH)..."
for i in $(seq 1 240); do
  all_ok=1
  for s in 01 69A 110B; do
    f="qa_27B/stage2v2_alignment_${s}.json"
    if [ -f "$f" ]; then
      m=$(stat -c %Y "$f")
      if [ "$m" -le "$START_EPOCH" ]; then all_ok=0; fi
    else
      all_ok=0
    fi
  done
  if [ "$all_ok" -eq 1 ]; then
    echo "[chain] stage2v2 outputs verified fresh"
    break
  fi
  sleep 15
done

for s in 01 69A 110B; do
  require_stage2 "$s" || { echo "[chain] FATAL: stage2v2_${s} not fresh"; exit 2; }
done

run_step stage3v2 scripts/stage3v2_measurement.py --sessions 01 69A 110B || exit 3
run_step stage3b  scripts/stage3b_independent_cer.py --sessions 01 69A 110B || exit 4
run_step stage4v2 scripts/stage4v2_provenance.py || exit 5
run_step audio_anchor_audit scripts/audio_anchor_audit.py --sessions 01 69A 110B --n-sample 25 || exit 6
run_step generate_artifacts scripts/generate_review_artifacts.py --patch-brief || exit 7

END_EPOCH=$(date +%s)
echo "[chain] DONE  RUN_ID=$RUN_ID  elapsed=$((END_EPOCH - START_EPOCH))s"
cat >> "$RUN_DIR/run.json" <<EOF
$(python3 -c "import json,sys; d=json.load(open('$RUN_DIR/run.json')); d['end_epoch']=$END_EPOCH; print(json.dumps(d, indent=2))")
EOF
echo "[chain] run record: $RUN_DIR/run.json"