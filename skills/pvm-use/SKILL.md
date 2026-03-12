# pvm-use

**Request temporary AWS permissions through human-approved workflow**

## When to Use This Skill

Use when your agent needs AWS permissions it doesn't currently have — S3 access, DynamoDB writes, Secrets Manager reads, EC2 operations, etc. PVM grants **time-limited** permissions with human approval via email.

**Do NOT use for:** Permissions your agent role already has. Check first with `aws sts get-caller-identity` and test the operation before requesting elevated access.

## How It Works

1. Agent submits a permission request → API returns `request_id`
2. Approver receives email with Approve/Deny buttons
3. Agent polls status until `ACTIVE`, `DENIED`, or `FAILED`
4. If approved: IAM policy is attached to your role automatically
5. Permissions auto-revoke after the requested duration

## Configuration

Set these before first use:

```bash
# Required — your PVM API endpoint
export PVM_API_BASE="https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/prod"

# Optional — your IAM role ARN (auto-detected if on EC2/Lambda)
export PVM_REQUESTER_IDENTITY="arn:aws:iam::ACCOUNT:role/YOUR-ROLE"
```

Or copy `config/pvm.env.example` to `config/pvm.env` and fill in values.

## Quick Start

### 1. Request Permissions

```bash
# Using the shell script
bash scripts/pvm-request.sh \
  --name "my-agent" \
  --action "s3:GetObject" \
  --resource "arn:aws:s3:::my-bucket/*" \
  --minutes 30
```

### 2. Wait for Approval

```bash
# Poll until approved/denied (default 60min timeout)
bash scripts/pvm-poll.sh <request_id>
```

### 3. Use Your Permissions

Once status is `ACTIVE`, your IAM role has the requested permissions. Just use AWS normally:

```bash
aws s3 cp s3://my-bucket/file.txt ./file.txt
```

Permissions auto-revoke after the requested duration. No cleanup needed.

## Direct API Usage

If you prefer raw API calls:

### Submit Request

```bash
curl -s -X POST "$PVM_API_BASE/permissions/request" \
  -H "Content-Type: application/json" \
  -d '{
    "requester": {
      "identity": "arn:aws:iam::ACCOUNT:role/my-role",
      "name": "my-agent"
    },
    "permissions_requested": [
      {
        "action": "s3:GetObject",
        "resource": "arn:aws:s3:::target-bucket/*"
      }
    ],
    "expiration_minutes": 30
  }'
```

**Response:**
```json
{
  "request_id": "arn:aws:states:REGION:ACCOUNT:execution:pvm-workflow:pvm-...",
  "status": "PENDING",
  "message": "Request submitted for approval"
}
```

### Check Status

```bash
# URL-encode the request_id (it contains colons and slashes)
curl -s "$PVM_API_BASE/permissions/status/$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$REQUEST_ID")"
```

**Status values:** `PENDING` → `ACTIVE` → `REVOKED` (happy path), or `DENIED` / `FAILED`

## Request Schema

| Field | Required | Description |
|-------|----------|-------------|
| `requester.identity` | Yes | Your IAM role/user ARN |
| `requester.name` | Yes | Human-readable agent name |
| `permissions_requested[].action` | Yes | IAM action (e.g. `s3:GetObject`) |
| `permissions_requested[].resource` | Yes | Resource ARN |
| `expiration_minutes` | Yes | Duration after approval (5–10080) |

## Multiple Permissions in One Request

```json
{
  "requester": { "identity": "...", "name": "data-pipeline" },
  "permissions_requested": [
    { "action": "s3:GetObject", "resource": "arn:aws:s3:::source-bucket/*" },
    { "action": "s3:PutObject", "resource": "arn:aws:s3:::dest-bucket/*" },
    { "action": "dynamodb:PutItem", "resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/results" }
  ],
  "expiration_minutes": 60
}
```

## Common Permission Patterns

### S3 Read
```json
{ "action": "s3:GetObject", "resource": "arn:aws:s3:::BUCKET/*" }
```

### S3 Write
```json
{ "action": "s3:PutObject", "resource": "arn:aws:s3:::BUCKET/PREFIX/*" }
```

### DynamoDB Read/Write
```json
{ "action": "dynamodb:*", "resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/TABLE" }
```

### Secrets Manager
```json
{ "action": "secretsmanager:GetSecretValue", "resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:NAME-*" }
```

### EC2 Describe
```json
{ "action": "ec2:Describe*", "resource": "*" }
```

## Polling Best Practices

- Poll every **10 seconds** while `PENDING`
- Set a **timeout** (default: 60 minutes, matches approval link expiry)
- Stop polling on `ACTIVE`, `DENIED`, `FAILED`, or `REVOKED`
- The `pvm-poll.sh` script handles all of this automatically

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `403 Forbidden` on request | Not in approved VPC | Must call from VPC with API Gateway endpoint |
| `DENIED` status | Approver rejected | Revise request, try again |
| `FAILED` after approval | IAM role doesn't exist or resource not in allowlist | Verify your role ARN exists; check allowlist |
| Timeout (no response) | Approver didn't see email | Check SES delivery; contact approver |
| `MessageRejected` | SES sandbox — sender/recipient not verified | Verify email addresses in SES |

## Files

| File | Purpose |
|------|---------|
| `scripts/pvm-request.sh` | Submit permission request (CLI wrapper) |
| `scripts/pvm-status.sh` | One-shot status check |
| `scripts/pvm-poll.sh` | Poll until terminal state |
| `scripts/pvm-client.py` | Full Python client (request + poll) |
| `config/pvm.env.example` | Configuration template |
| `docs/api-reference.md` | Complete API documentation |

## Related

- **pvm-deploy** — Deploy/manage the PVM backend infrastructure
- **GitHub:** `github.com/YOUR-ORG/permissions-vending-machine`
