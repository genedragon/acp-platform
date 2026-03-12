#!/usr/bin/env bash
# pvm-poll.sh — Poll a PVM request until terminal state
#
# Usage: bash pvm-poll.sh <request_id> [--timeout 3600] [--interval 10]
#
# Exits 0 on ACTIVE/REVOKED, exits 1 on DENIED/FAILED/timeout
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/../config/pvm.env" ]] && source "$SCRIPT_DIR/../config/pvm.env"

: "${PVM_API_BASE:?ERROR: Set PVM_API_BASE}"

REQUEST_ID="${1:?Usage: pvm-poll.sh <request_id> [--timeout 3600] [--interval 10]}"
shift

TIMEOUT=3600
INTERVAL=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)  TIMEOUT="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$REQUEST_ID")
START=$(date +%s)
LAST_STATUS=""

echo "🔍 Polling request: $REQUEST_ID"
echo "   Timeout: ${TIMEOUT}s | Interval: ${INTERVAL}s"
echo ""

while true; do
  ELAPSED=$(( $(date +%s) - START ))
  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    echo ""
    echo "❌ TIMEOUT after ${TIMEOUT}s — approval not received"
    exit 1
  fi

  RESPONSE=$(curl -s "$PVM_API_BASE/permissions/status/$ENCODED" 2>/dev/null) || {
    echo "   ⚠️  Connection error, retrying in ${INTERVAL}s..."
    sleep "$INTERVAL"
    continue
  }

  STATUS=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

  # Only print when status changes
  if [[ "$STATUS" != "$LAST_STATUS" ]]; then
    echo "   $(date +%H:%M:%S) Status: $STATUS"
    LAST_STATUS="$STATUS"
  fi

  case "$STATUS" in
    ACTIVE|COMPLETED)
      echo ""
      echo "✅ Permissions GRANTED!"
      EXPIRES=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('expires_at', d.get('expiration',{}).get('permission_expires_at','unknown')))" 2>/dev/null || echo "unknown")
      echo "   Expires: $EXPIRES"
      echo "   Your IAM role now has the requested permissions."
      exit 0
      ;;
    DENIED)
      echo ""
      echo "❌ Request DENIED by approver"
      exit 1
      ;;
    FAILED)
      echo ""
      ERROR=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error_message', d.get('error','unknown')))" 2>/dev/null || echo "unknown")
      echo "❌ Request FAILED: $ERROR"
      exit 1
      ;;
    REVOKED)
      echo ""
      echo "⏰ Permissions already REVOKED (expired)"
      exit 0
      ;;
    PENDING|AWAITING_APPROVAL)
      # Keep polling
      ;;
    *)
      echo "   ⚠️  Unknown status: $STATUS"
      ;;
  esac

  sleep "$INTERVAL"
done
