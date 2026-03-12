#!/usr/bin/env bash
# pvm-request.sh — Submit a PVM permission request
#
# Usage:
#   bash pvm-request.sh --name "my-agent" --action "s3:GetObject" --resource "arn:aws:s3:::bucket/*" --minutes 30
#   bash pvm-request.sh --json request.json
#
# Environment:
#   PVM_API_BASE       — Required. API Gateway base URL
#   PVM_REQUESTER_IDENTITY — Optional. Auto-detected from EC2 instance metadata if unset
#
set -euo pipefail

# Load config if exists
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/../config/pvm.env" ]] && source "$SCRIPT_DIR/../config/pvm.env"

: "${PVM_API_BASE:?ERROR: Set PVM_API_BASE to your PVM API endpoint}"

# Auto-detect identity from EC2 instance metadata
detect_identity() {
  if [[ -n "${PVM_REQUESTER_IDENTITY:-}" ]]; then
    echo "$PVM_REQUESTER_IDENTITY"
    return
  fi
  # Try IMDSv2
  local token
  token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null) || true
  if [[ -n "$token" ]]; then
    local info
    info=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
      "http://169.254.169.254/latest/meta-data/iam/info" 2>/dev/null) || true
    if [[ -n "$info" ]]; then
      echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin).get('InstanceProfileArn','unknown'))" 2>/dev/null || echo "unknown"
      return
    fi
  fi
  echo "unknown"
}

# Parse arguments
NAME=""
ACTIONS=()
RESOURCES=()
MINUTES=""
JSON_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)      NAME="$2"; shift 2 ;;
    --action)    ACTIONS+=("$2"); shift 2 ;;
    --resource)  RESOURCES+=("$2"); shift 2 ;;
    --minutes)   MINUTES="$2"; shift 2 ;;
    --json)      JSON_FILE="$2"; shift 2 ;;
    --identity)  PVM_REQUESTER_IDENTITY="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: pvm-request.sh --name NAME --action ACTION --resource RESOURCE --minutes MINS"
      echo "       pvm-request.sh --json request.json"
      echo ""
      echo "Options:"
      echo "  --name NAME          Requester name (e.g. 'data-pipeline')"
      echo "  --action ACTION      IAM action (repeatable, e.g. 's3:GetObject')"
      echo "  --resource RESOURCE  Resource ARN (repeatable, pairs with --action)"
      echo "  --minutes MINS       Permission duration after approval (5-10080)"
      echo "  --identity ARN       IAM role ARN (auto-detected if omitted)"
      echo "  --json FILE          Send raw JSON request body from file"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -n "$JSON_FILE" ]]; then
  # Send raw JSON
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PVM_API_BASE/permissions/request" \
    -H "Content-Type: application/json" \
    -d "@$JSON_FILE")
else
  # Validate args
  [[ -z "$NAME" ]] && { echo "ERROR: --name required"; exit 1; }
  [[ ${#ACTIONS[@]} -eq 0 ]] && { echo "ERROR: --action required (at least one)"; exit 1; }
  [[ ${#RESOURCES[@]} -eq 0 ]] && { echo "ERROR: --resource required (at least one)"; exit 1; }
  [[ ${#ACTIONS[@]} -ne ${#RESOURCES[@]} ]] && { echo "ERROR: Each --action needs a matching --resource"; exit 1; }
  [[ -z "$MINUTES" ]] && { echo "ERROR: --minutes required"; exit 1; }

  IDENTITY=$(detect_identity)

  # Build permissions array
  PERMS="["
  for i in "${!ACTIONS[@]}"; do
    [[ $i -gt 0 ]] && PERMS+=","
    PERMS+="{\"action\":\"${ACTIONS[$i]}\",\"resource\":\"${RESOURCES[$i]}\"}"
  done
  PERMS+="]"

  BODY=$(cat <<EOF
{
  "requester": {
    "identity": "$IDENTITY",
    "name": "$NAME"
  },
  "permissions_requested": $PERMS,
  "expiration_minutes": $MINUTES
}
EOF
)

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PVM_API_BASE/permissions/request" \
    -H "Content-Type: application/json" \
    -d "$BODY")
fi

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  REQUEST_ID=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('request_id',''))" 2>/dev/null)
  echo "✅ Request submitted"
  echo "   Request ID: $REQUEST_ID"
  echo "   Status: PENDING"
  echo ""
  echo "Next: bash scripts/pvm-poll.sh '$REQUEST_ID'"
else
  echo "❌ Request failed (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi
