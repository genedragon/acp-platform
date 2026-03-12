#!/usr/bin/env bash
# pvm-status.sh — One-shot status check for a PVM request
#
# Usage: bash pvm-status.sh <request_id>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/../config/pvm.env" ]] && source "$SCRIPT_DIR/../config/pvm.env"

: "${PVM_API_BASE:?ERROR: Set PVM_API_BASE}"

REQUEST_ID="${1:?Usage: pvm-status.sh <request_id>}"

# URL-encode the request ID (contains colons, slashes)
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$REQUEST_ID")

RESPONSE=$(curl -s -w "\n%{http_code}" "$PVM_API_BASE/permissions/status/$ENCODED")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -eq 200 ]]; then
  STATUS=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null)
  echo "Status: $STATUS"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
elif [[ "$HTTP_CODE" -eq 404 ]]; then
  echo "❌ Request not found: $REQUEST_ID"
  exit 1
else
  echo "❌ Error (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
