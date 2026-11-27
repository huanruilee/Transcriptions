#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/pr_ship.sh <pr-number-or-url>" >&2
  exit 1
fi

PR="$1"
REPO="huanruilee/Transcriptions"
LIVE_URL="https://huanruilee.github.io/Transcriptions/"

echo "=== 1. Enable auto-merge (--merge) for PR $PR ==="
gh pr merge "$PR" --repo "$REPO" --auto --merge

echo "=== 2. Wait for PR checks and merge ==="
sleep 5
gh pr checks "$PR" --repo "$REPO" --watch

for _ in $(seq 1 30); do
  state=$(gh pr view "$PR" --repo "$REPO" --json state -q '.state')
  if [ "$state" = "MERGED" ]; then
    break
  fi
  sleep 3
done

state=$(gh pr view "$PR" --repo "$REPO" --json state -q '.state')
if [ "$state" != "MERGED" ]; then
  echo "ERROR: PR $PR state is '$state' instead of MERGED" >&2
  exit 1
fi

MERGE_SHA=$(gh pr view "$PR" --repo "$REPO" --json mergeCommit -q '.mergeCommit.oid')
echo "MERGED SHA: $MERGE_SHA"

echo "=== 3. Watch main Completion Acceptance ($MERGE_SHA) ==="
ACCEPT_ID=""
for _ in $(seq 1 24); do
  ACCEPT_ID=$(gh run list --repo "$REPO" --branch main --limit 10 \
    --json databaseId,workflowName,headSha \
    -q ".[] | select(.workflowName==\"Completion Acceptance\" and .headSha==\"$MERGE_SHA\") | .databaseId" | head -n 1)
  if [ -n "$ACCEPT_ID" ]; then
    break
  fi
  sleep 5
done
if [ -z "$ACCEPT_ID" ]; then
  echo "ERROR: Completion Acceptance run not found for $MERGE_SHA" >&2
  exit 1
fi
gh run watch "$ACCEPT_ID" --repo "$REPO" --exit-status

echo "=== 4. Watch Deploy to GitHub Pages ($MERGE_SHA) ==="
DEPLOY_ID=""
for _ in $(seq 1 24); do
  DEPLOY_ID=$(gh run list --repo "$REPO" --branch main --limit 10 \
    --json databaseId,workflowName,headSha \
    -q ".[] | select(.workflowName==\"Deploy to GitHub Pages\" and .headSha==\"$MERGE_SHA\") | .databaseId" | head -n 1)
  if [ -n "$DEPLOY_ID" ]; then
    break
  fi
  sleep 5
done
if [ -z "$DEPLOY_ID" ]; then
  echo "ERROR: Deploy to GitHub Pages run not found for $MERGE_SHA" >&2
  exit 1
fi
gh run watch "$DEPLOY_ID" --repo "$REPO" --exit-status

echo "=== 5. Verify live GitHub Pages HTTP 200 ==="
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$LIVE_URL")
echo "LIVE_HTTP_CODE=$HTTP_CODE ($LIVE_URL)"
if [ "$HTTP_CODE" != "200" ]; then
  exit 1
fi
