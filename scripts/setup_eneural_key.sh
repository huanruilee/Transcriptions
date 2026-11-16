#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_FILE="$CONFIG_DIR/eneural.env"
ENDPOINT="https://agents.eneural.ai/v1"

umask 077
mkdir -p "$CONFIG_DIR"

printf 'Enter ENEURAL API key (input hidden): '
IFS= read -r -s api_key
printf '\n'

if [[ -z "$api_key" || "$api_key" == *$'\n'* || "$api_key" == *$'\r'* ]]; then
  echo 'Error: empty or invalid key.' >&2
  exit 1
fi

tmp_file="$(mktemp "$CONFIG_DIR/eneural.env.XXXXXX")"
cleanup() { rm -f "$tmp_file"; }
trap cleanup EXIT

printf 'ENEURAL_API_KEY=%s\n' "$api_key" > "$tmp_file"
chmod 600 "$tmp_file"
mv -f "$tmp_file" "$CONFIG_FILE"
unset api_key
trap - EXIT

set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a

echo "Key saved to $CONFIG_FILE (permissions: 600)."
echo 'Checking eneural model access without printing the key...'

models_json="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  -H "Authorization: Bearer ${ENEURAL_API_KEY}" \
  "$ENDPOINT/models")"

python3 - "$models_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
model_ids = [item.get("id") for item in payload.get("data", [])]
target = "deepseek-v4.1-flash"
if target in model_ids:
    print(f"OK: {target} is available.")
else:
    print(f"Authenticated, but {target} was not listed.")
    print("Available model ids:")
    for model_id in model_ids:
        if model_id:
            print(f"  {model_id}")
    sys.exit(2)
PY
