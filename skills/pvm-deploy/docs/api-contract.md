# API Contract - Permissions Vending Machine

## Overview

This document defines the complete API contract for the Permissions Vending Machine (PVM). All endpoints use JSON for requests and responses. All timestamps are in ISO 8601 format (UTC).

**Base URL:** `https://pvm.example.com/api`

**Authentication:** None required for request submission (rate-limited by IP). Approval actions authenticated via JWT tokens.

**API Version:** v1

---

## Endpoints

### 1. Submit Permission Request

**Endpoint:** `POST /permissions/request`

**Description:** Submit a new permission request. Returns immediately with request ID. Check request status using the status endpoint.

**🔒 VPC Access Requirement:** This endpoint is **only accessible from approved VPCs**. Requests must originate from systems running in VPCs configured in `ALLOWED_VPC_IDS` environment variable. Requests from outside these VPCs will receive `403 Forbidden` error.

**Access Method:** Requester systems must use API Gateway VPC endpoint (`com.amazonaws.<region>.execute-api`) to ensure `aws:SourceVpc` condition is evaluated.

**Note:** Approval endpoints (`/permissions/approve`, `/permissions/deny`) remain **publicly accessible** to support email workflow.

#### Request Schema

```json
{
  "requester": {
    "name": "string (required, 1-100 chars)",
    "identity": "string (required, AWS ARN or unique identifier)",
    "system": "string (required, system/service name)",
    "email": "string (optional, valid email)",
    "metadata": {
      "key": "value (optional, additional context)"
    }
  },
  "permissions": [
    {
      "action": "string (required, IAM action format: service:Action)",
      "resource": "string (required, ARN or wildcard)",
      "description": "string (optional, human-readable reason)"
    }
  ],
  "expiration_minutes": "integer (required, 5-10080, duration after approval)",
  "approval_link_expiry_minutes": "integer (optional, 5-1440, default 30)",
  "metadata": {
    "project": "string (optional)",
    "ticket_id": "string (optional)",
    "priority": "string (optional: low|medium|high)"
  }
}
```

#### Field Constraints

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `requester.name` | string | Yes | 1-100 characters |
| `requester.identity` | string | Yes | Valid ARN or identifier |
| `requester.system` | string | Yes | 1-50 characters |
| `requester.email` | string | No | Valid email format |
| `permissions` | array | Yes | 1-100 items |
| `permissions[].action` | string | Yes | Valid IAM action (e.g., `s3:GetObject`) |
| `permissions[].resource` | string | Yes | Valid ARN or `*` |
| `permissions[].description` | string | No | Max 500 characters |
| `expiration_minutes` | integer | Yes | 5-10080 (5 min to 7 days); duration after approval |
| `approval_link_expiry_minutes` | integer | No | 5-1440 (default: 30) |

#### Success Response (202 Accepted)

```json
{
  "request_id": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "execution_arn": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "created_at": "2026-02-22T19:13:00Z",
  "expires_at": "2026-02-22T19:43:00Z",
  "message": "Permission request received and pending approval"
}
```

**Note:** The `request_id` is now the Step Functions execution ARN. This ARN uniquely identifies the workflow execution and can be used to track the request status in the Step Functions console.

#### Error Responses

**403 Forbidden - VPC Access Denied**
```json
{
  "message": "User: anonymous is not authorized to perform: execute-api:Invoke on resource: arn:aws:execute-api:us-east-1:123456789012:abc123xyz/prod/POST/permissions/request with an explicit deny"
}
```

**Note:** This error occurs when the request originates from outside the approved VPCs. Ensure your system accesses the API through a VPC endpoint in an approved VPC. This is an API Gateway resource policy denial (not a Lambda-generated error).

**400 Bad Request - Invalid Schema**
```json
{
  "error": "validation_error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "permissions[0].action",
      "issue": "Invalid IAM action format"
    },
    {
      "field": "expiration_minutes",
      "issue": "Must be between 5 and 10080"
    }
  ]
}
```

**400 Bad Request - Forbidden Permission**
```json
{
  "error": "forbidden_permission",
  "message": "One or more requested permissions are not allowed",
  "details": [
    {
      "action": "iam:CreateUser",
      "reason": "IAM user creation not permitted by allowlist"
    }
  ]
}
```

**429 Too Many Requests**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests from this source",
  "retry_after": 60,
  "limit": "10 requests per minute"
}
```

**500 Internal Server Error**
```json
{
  "error": "internal_error",
  "message": "An internal error occurred processing your request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example Request

```bash
curl -X POST https://pvm.example.com/api/permissions/request \
  -H "Content-Type: application/json" \
  -d '{
    "requester": {
      "name": "OpenClaw AI Agent",
      "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
      "system": "openclaw-production",
      "email": "agent@openclaw.example.com"
    },
    "permissions": [
      {
        "action": "s3:GetObject",
        "resource": "arn:aws:s3:::agent-workspace/*",
        "description": "Read access to agent workspace bucket for task execution"
      },
      {
        "action": "dynamodb:Query",
        "resource": "arn:aws:dynamodb:us-east-1:123456789012:table/agent-state",
        "description": "Query agent state table for session persistence"
      }
    ],
    "expiration_minutes": 45,
    "metadata": {
      "project": "openclaw-agentic-framework",
      "ticket_id": "JIRA-1234",
      "priority": "high"
    }
  }'
```

---

### 2. Approve Permission Request

**Endpoint:** `GET /permissions/approve?token=<jwt>`

**Description:** Approve a permission request. This endpoint is called when the approver clicks the "Approve" button in the email. Returns HTML page confirming approval.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT token from approval email |

#### Success Response (200 OK)

**Content-Type:** `text/html`

Returns HTML page displaying:
- ✅ Success message
- Request ID
- Permissions approved
- Notification that requester will be notified via callback

**Example HTML Response:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Permission Request Approved</title>
  <style>/* styling */</style>
</head>
<body>
  <h1>✅ Permission Request Approved</h1>
  <p>Request ID: <code>550e8400-e29b-41d4-a716-446655440000</code></p>
  <h2>Approved Permissions:</h2>
  <ul>
    <li><code>s3:GetObject</code> on <code>arn:aws:s3:::agent-workspace/*</code></li>
    <li><code>dynamodb:Query</code> on <code>arn:aws:dynamodb:us-east-1:123456789012:table/agent-state</code></li>
  </ul>
  <p>Permissions have been granted. Use the status endpoint to check request details.</p>
</body>
</html>
```

#### Error Responses

**401 Unauthorized - Expired Token**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Approval Link Expired</title>
</head>
<body>
  <h1>⏰ Approval Link Expired</h1>
  <p>This approval link has expired. Approval links are valid for 30 minutes.</p>
  <p>Request ID: <code>550e8400-e29b-41d4-a716-446655440000</code></p>
  <p>Please contact the requester to submit a new request.</p>
</body>
</html>
```

**401 Unauthorized - Invalid Token**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Invalid Approval Link</title>
</head>
<body>
  <h1>❌ Invalid Approval Link</h1>
  <p>This approval link is invalid or malformed.</p>
  <p>Please use the link provided in the approval email.</p>
</body>
</html>
```

**403 Forbidden - Already Processed**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Already Processed</title>
</head>
<body>
  <h1>ℹ️ Request Already Processed</h1>
  <p>This permission request has already been <strong>approved</strong>.</p>
  <p>Request ID: <code>550e8400-e29b-41d4-a716-446655440000</code></p>
  <p>Approved at: 2026-02-22 19:15:00 UTC</p>
</body>
</html>
```

---

### 3. Deny Permission Request

**Endpoint:** `GET /permissions/deny?token=<jwt>`

**Description:** Deny a permission request. This endpoint is called when the approver clicks the "Deny" button in the email. Returns HTML page confirming denial.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT token from approval email |

#### Success Response (200 OK)

**Content-Type:** `text/html`

Returns HTML page displaying:
- ⛔ Denial message
- Request ID
- Permissions denied
- Notification that requester will be notified via callback

**Example HTML Response:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Permission Request Denied</title>
  <style>/* styling */</style>
</head>
<body>
  <h1>⛔ Permission Request Denied</h1>
  <p>Request ID: <code>550e8400-e29b-41d4-a716-446655440000</code></p>
  <h2>Denied Permissions:</h2>
  <ul>
    <li><code>s3:GetObject</code> on <code>arn:aws:s3:::agent-workspace/*</code></li>
    <li><code>dynamodb:Query</code> on <code>arn:aws:dynamodb:us-east-1:123456789012:table/agent-state</code></li>
  </ul>
  <p>The request has been denied. Use the status endpoint to check request details.</p>
</body>
</html>
```

#### Error Responses

Same as `/permissions/approve` (expired, invalid, already processed).

---

### 4. Check Permission Request Status

**Endpoint:** `GET /permissions/status/:requestId`

**Description:** Check the current status of a permission request. Use this endpoint to poll for approval results.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requestId` | string | Yes | Request ID (execution ARN) from initial submission |

#### Success Response (200 OK)

**Status: PENDING (awaiting approval)**
```json
{
  "request_id": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "created_at": "2026-02-22T19:13:00Z",
  "requester": {
    "name": "OpenClaw AI Agent",
    "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
    "system": "openclaw-production"
  },
  "permissions_requested": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::agent-workspace/*"
    },
    {
      "action": "dynamodb:Query",
      "resource": "arn:aws:dynamodb:us-east-1:123456789012:table/agent-state"
    }
  ],
  "expiration": {
    "requested_duration_minutes": 45
  }
}
```

**Status: COMPLETED (approved and permissions granted)**
```json
{
  "request_id": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "created_at": "2026-02-22T19:13:00Z",
  "updated_at": "2026-02-22T19:15:35Z",
  
  "requester": {
    "name": "OpenClaw AI Agent",
    "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
    "system": "openclaw-production"
  },
  
  "permissions_granted": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::agent-workspace/*",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-550e8400",
      "attached_at": "2026-02-22T19:15:30Z"
    },
    {
      "action": "dynamodb:Query",
      "resource": "arn:aws:dynamodb:us-east-1:123456789012:table/agent-state",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-550e8400",
      "attached_at": "2026-02-22T19:15:30Z"
    }
  ],
  
  "approval": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-02-22T19:15:00Z"
  },
  
  "expiration": {
    "permission_expires_at": "2026-02-22T20:00:00Z",
    "duration_minutes": 45
  },
  
  "execution": {
    "executed_at": "2026-02-22T19:15:30Z",
    "duration_ms": 1250
  }
}
```

**Status: DENIED**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "DENIED",
  "created_at": "2026-02-22T19:13:00Z",
  "updated_at": "2026-02-22T19:14:00Z",
  
  "requester": {
    "name": "OpenClaw AI Agent",
    "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
    "system": "openclaw-production"
  },
  
  "permissions_requested": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::agent-workspace/*"
    },
    {
      "action": "dynamodb:Query",
      "resource": "arn:aws:dynamodb:us-east-1:123456789012:table/agent-state"
    }
  ],
  
  "denial": {
    "denied_by": "admin@example.com",
    "denied_at": "2026-02-22T19:14:00Z",
    "reason": "Permissions too broad - please request specific bucket paths"
  }
}
```

**Status: FAILED (approved but execution failed)**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "created_at": "2026-02-22T19:13:00Z",
  "updated_at": "2026-02-22T19:15:35Z",
  
  "requester": {
    "name": "OpenClaw AI Agent",
    "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
    "system": "openclaw-production"
  },
  
  "permissions_requested": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::agent-workspace/*"
    }
  ],
  
  "approval": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-02-22T19:15:00Z"
  },
  
  "execution": {
    "attempted_at": "2026-02-22T19:15:30Z",
    "failed": true,
    "error": {
      "code": "AccessDenied",
      "message": "User: arn:aws:iam::123456789012:role/pvm-executor is not authorized to perform: iam:PutRolePolicy on resource: role/openclaw-agent",
      "type": "iam_execution_error"
    }
  }
}
```

**Status: REVOKED (permissions automatically expired)**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "REVOKED",
  "created_at": "2026-02-22T19:13:00Z",
  "updated_at": "2026-02-22T20:00:00Z",
  
  "requester": {
    "name": "OpenClaw AI Agent",
    "identity": "arn:aws:iam::123456789012:role/openclaw-agent",
    "system": "openclaw-production"
  },
  
  "permissions_revoked": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::agent-workspace/*",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-550e8400",
      "granted_at": "2026-02-22T19:15:30Z",
      "revoked_at": "2026-02-22T20:00:00Z"
    },
    {
      "action": "dynamodb:Query",
      "resource": "arn:aws:dynamodb:us-east-1:123456789012:table/agent-state",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-550e8400",
      "granted_at": "2026-02-22T19:15:30Z",
      "revoked_at": "2026-02-22T20:00:00Z"
    }
  ],
  
  "approval": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-02-22T19:15:00Z"
  },
  
  "expiration": {
    "requested_duration_minutes": 45,
    "actual_duration_minutes": 45,
    "permission_expires_at": "2026-02-22T20:00:00Z",
    "reason": "automatic_expiration"
  },
  
  "revocation": {
    "revoked_by": "system",
    "revoked_at": "2026-02-22T20:00:00Z",
    "method": "scheduled_expiration_check"
  }
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": "request_not_found",
  "message": "Permission request not found",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example Usage

```bash
# Poll for status after submission
curl https://pvm.example.com/api/permissions/status/arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000
```

**Polling Recommendations:**
- Initial poll: Immediately after submission
- While PENDING: Poll every 5-10 seconds
- After COMPLETED/DENIED/FAILED: Stop polling
- Maximum poll duration: Match approval link expiry (default 30 minutes)

---

## Status Polling Guide

Since the system no longer uses callbacks, you must poll the status endpoint to determine request outcomes.

### Polling Strategy

**1. Submit Request**
```bash
response=$(curl -X POST https://pvm.example.com/api/permissions/request -d '...')
request_id=$(echo $response | jq -r '.request_id')
```

**2. Poll Status**
```bash
while true; do
  status=$(curl https://pvm.example.com/api/permissions/status/$request_id)
  state=$(echo $status | jq -r '.status')
  
  case $state in
    PENDING)
      echo "Waiting for approval..."
      sleep 5
      ;;
    COMPLETED)
      echo "Permissions granted!"
      break
      ;;
    DENIED|FAILED)
      echo "Request not approved: $state"
      break
      ;;
  esac
done
```

**3. Use Permissions**

After status becomes `COMPLETED`, your IAM principal (role/user) will have the requested permissions attached.

### Polling Best Practices

- **Exponential backoff:** Start at 2s, increase to 5s, then 10s
- **Respect rate limits:** Max 20 req/min on status endpoint
- **Set timeout:** Stop polling after approval link expiry time
- **Handle errors:** Retry on 5xx errors, fail on 4xx errors

---

## Error Response Standards

All error responses follow this schema:

```json
{
  "error": "error_code",
  "message": "Human-readable error description",
  "details": [
    {
      "field": "path.to.field",
      "issue": "Description of specific issue"
    }
  ],
  "request_id": "uuid (if applicable)",
  "timestamp": "ISO 8601 timestamp"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `validation_error` | 400 | Request schema validation failed |
| `forbidden_permission` | 400 | Requested permission not allowed |
| `invalid_token` | 401 | JWT token invalid or malformed |
| `expired_token` | 401 | JWT token expired |
| `rate_limit_exceeded` | 429 | Too many requests from source |
| `already_processed` | 403 | Request already approved/denied |
| `request_not_found` | 404 | Request ID not found |
| `internal_error` | 500 | Unexpected system error |

---

## Complete Request/Response Examples

### Example 1: Successful Request and Approval

**Step 1: Submit Request**

```bash
POST /api/permissions/request
Content-Type: application/json

{
  "requester": {
    "name": "DataSync Agent",
    "identity": "arn:aws:iam::123456789012:role/datasync-agent",
    "system": "data-pipeline-prod",
    "email": "datasync@example.com"
  },
  "permissions": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::source-bucket/*",
      "description": "Read source data for ETL pipeline"
    },
    {
      "action": "s3:PutObject",
      "resource": "arn:aws:s3:::dest-bucket/processed/*",
      "description": "Write processed data to destination"
    }
  ],
  "expiration_minutes": 120,
  "approval_link_expiry_minutes": 60,
  "metadata": {
    "pipeline": "daily-etl",
    "priority": "high"
  }
}
```

**Response:**
```json
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "request_id": "7a3c1e90-5f2b-4d8a-9c31-8e4f5a6b7c8d",
  "status": "pending",
  "created_at": "2026-02-22T20:00:00Z",
  "expires_at": "2026-02-22T21:00:00Z",
  "message": "Permission request received and pending approval"
}
```

**Step 2: Approver Clicks "Approve" Link**

Email sent to admin@example.com with approval link:
```
https://pvm.example.com/api/permissions/approve?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Step 3: Poll Status Endpoint**

```bash
GET /api/permissions/status/7a3c1e90-5f2b-4d8a-9c31-8e4f5a6b7c8d
```

**Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "request_id": "7a3c1e90-5f2b-4d8a-9c31-8e4f5a6b7c8d",
  "status": "COMPLETED",
  "created_at": "2026-02-22T20:00:00Z",
  "updated_at": "2026-02-22T20:05:12Z",
  "requester": {
    "name": "DataSync Agent",
    "identity": "arn:aws:iam::123456789012:role/datasync-agent",
    "system": "data-pipeline-prod"
  },
  "permissions_granted": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::source-bucket/*",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-7a3c1e90",
      "attached_at": "2026-02-22T20:05:10Z"
    },
    {
      "action": "s3:PutObject",
      "resource": "arn:aws:s3:::dest-bucket/processed/*",
      "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-7a3c1e90",
      "attached_at": "2026-02-22T20:05:10Z"
    }
  ],
  "approval": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-02-22T20:05:00Z"
  },
  "expiration": {
    "permission_expires_at": "2026-02-22T22:05:00Z",
    "duration_minutes": 120
  },
  "execution": {
    "executed_at": "2026-02-22T20:05:10Z",
    "duration_ms": 980
  }
}
```

### Example 2: Request Denied

**Step 1: Submit Request**

```bash
POST /api/permissions/request
Content-Type: application/json

{
  "requester": {
    "name": "Test Agent",
    "identity": "arn:aws:iam::123456789012:role/test-agent",
    "system": "testing",
    "email": "test@example.com"
  },
  "permissions": [
    {
      "action": "iam:CreateUser",
      "resource": "*",
      "description": "Create IAM users for testing"
    }
  ],
  "expiration_minutes": 30
}
```

**Response:**
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "forbidden_permission",
  "message": "One or more requested permissions are not allowed",
  "details": [
    {
      "action": "iam:CreateUser",
      "reason": "IAM user creation not permitted by allowlist"
    }
  ],
  "timestamp": "2026-02-22T20:10:00Z"
}
```

**No email sent, no status to poll (request rejected immediately).**

---

## API Versioning

**Current Version:** v1

**Version Header:** `X-API-Version: v1` (optional, defaults to latest)

**Deprecation Policy:**
- Major version changes announced 90 days in advance
- Old versions supported for 180 days after deprecation
- Breaking changes only in major versions

---

## Rate Limits

### Per IP Address

| Endpoint | Rate Limit |
|----------|-----------|
| `POST /permissions/request` | 10 req/min, 100 req/hour |
| `GET /permissions/approve` | 20 req/min |
| `GET /permissions/deny` | 20 req/min |

### Per Requester Identity

| Metric | Limit |
|--------|-------|
| Requests per hour | 50 |
| Requests per day | 500 |
| Pending requests (simultaneous) | 20 |

**Rate Limit Headers:**

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1708646460
```

**Rate Limit Exceeded Response:**
```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded for this source",
  "retry_after": 60,
  "limit": "10 requests per minute",
  "timestamp": "2026-02-22T20:15:00Z"
}
```

---

## Testing the API

### Test Endpoint (Sandbox)

**Base URL:** `https://pvm-sandbox.example.com/api`

- Same API contract as production
- Uses test IAM roles (no real permissions granted)
- Callbacks delivered to RequestBin/webhook.site endpoints
- No rate limits
- Auto-expires test requests after 1 hour

### Example Test Request

```bash
curl -X POST https://pvm-sandbox.example.com/api/permissions/request \
  -H "Content-Type: application/json" \
  -d '{
    "requester": {
      "name": "Test Agent",
      "identity": "arn:aws:iam::123456789012:role/test",
      "system": "test"
    },
    "permissions": [
      {
        "action": "s3:GetObject",
        "resource": "arn:aws:s3:::test-bucket/*"
      }
    ],
    "expiration_minutes": 60
  }'
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-22  
**Author:** OpenClaw AI (BotWard)
