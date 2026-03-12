# PVM API Reference (Agent-Facing)

## Base URL

Set via `PVM_API_BASE` environment variable.

## Endpoints

### POST /permissions/request

Submit a permission request. Returns immediately.

**Request:**
```json
{
  "requester": {
    "identity": "arn:aws:iam::ACCOUNT:role/ROLE",
    "name": "agent-name"
  },
  "permissions_requested": [
    { "action": "s3:GetObject", "resource": "arn:aws:s3:::bucket/*" }
  ],
  "expiration_minutes": 30
}
```

**Response (200):**
```json
{
  "request_id": "arn:aws:states:REGION:ACCOUNT:execution:pvm-workflow:pvm-...",
  "status": "PENDING",
  "message": "Request submitted for approval",
  "submitted_at": "2026-03-07T05:43:32.270Z"
}
```

**Errors:**
- `400` — Invalid request schema or forbidden permission
- `403` — Not in approved VPC
- `429` — Rate limited

### GET /permissions/status/{requestId}

Check request status. The `requestId` must be URL-encoded (it's a full ARN).

**Response (200):**
```json
{
  "request_id": "arn:aws:states:...",
  "status": "PENDING | ACTIVE | DENIED | FAILED | REVOKED",
  "submitted_at": "...",
  "permissions": [...]
}
```

**Errors:**
- `404` — Request not found

### GET /permissions/approve?token=JWT

Approval callback (used by email link, not by agents).

### GET /permissions/deny?token=JWT

Denial callback (used by email link, not by agents).

## Status Lifecycle

```
PENDING → ACTIVE → REVOKED     (happy path)
PENDING → DENIED               (approver denied)
PENDING → FAILED               (system error after approval)
PENDING → (timeout)            (no response within approval window)
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /permissions/request | 10/min per IP |
| GET /permissions/status | 20/min per IP |

## Notes

- `request_id` is a Step Functions execution ARN — URL-encode it for status checks
- Permissions attach to the IAM role specified in `requester.identity`
- The role must exist before requesting
- Resources must be in the PVM allowlist (configured by admin)
- Approval emails go to the configured approver (SES must be set up)
