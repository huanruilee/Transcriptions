#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/eneural.env"
if [[ ! -r "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE. Run scripts/setup_eneural_key.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a

export AGENT_REVIEW_ENDPOINT="https://agents.eneural.ai/v1/chat/completions"
export AGENT_REVIEW_MODEL="deepseek-v4.1-flash"
export ADJUDICATOR_ENDPOINT="http://127.0.0.1:8001/v1/chat/completions"
export ADJUDICATOR_MODEL="Qwen3.8-27B"
unset ADJUDICATOR_API_KEY

exec python3 "$(dirname "$0")/grounded_correct_sinianzhu.py" "$@"
