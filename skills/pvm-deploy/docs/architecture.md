# Permissions Vending Machine - Architecture (Step Functions Edition)

## Overview

The Permissions Vending Machine (PVM) is a self-service IAM permissions approval system designed for agentic frameworks. It enables AI agents and automated systems to request AWS IAM permissions through an API, with human-in-the-loop approval via email. Users poll the status endpoint to check request outcomes.

**Core Philosophy:** Security-first, asynchronous, audit-complete, time-bound with **guaranteed expiration**.

**Security Principle:** No permanent permissions. All granted permissions automatically expire and are revoked at a **precise timestamp** using AWS Step Functions orchestration.

**Key Architectural Innovation:** This system uses **AWS Step Functions** for complete workflow orchestration, ensuring that every permission request follows a reliable, auditable, and time-bound execution path from request to automatic revocation.

## Architecture Comparison: Step Functions vs. Background Workers

### Why Step Functions for PVM?

| Aspect | Background Worker Approach | Step Functions Approach (PVM) |
|--------|---------------------------|-------------------------------|
| **Expiration Guarantee** | Polling-based (5-min intervals) - permissions can exceed expiry by up to 5 minutes | Timestamp-based Wait state - revocation occurs **exactly** at expiration time |
| **Workflow State Management** | Manual state tracking in DynamoDB, complex error handling | Built-in state machine with automatic transitions and error handling |
| **Approval Wait Handling** | Database polling or webhook with custom queueing | Activity Task with automatic token management |
| **Reliability** | Dependent on EventBridge schedule + Lambda success | Built-in retry logic, error handling, and execution durability |
| **Visibility** | Custom logging and piecing together request lifecycle | Complete execution history with visual workflow in Step Functions console |
| **Scalability** | Need to manage concurrent Lambda invocations, DynamoDB throughput | Automatic scaling, up to 1 million open executions |
| **Cost at Low Volume** | Multiple Lambda invocations + DynamoDB reads (polling overhead) | Pay only for state transitions (more economical at low-medium volume) |
| **Complexity** | Custom orchestration logic, retry handling, timeout management | Declarative state machine definition, less custom code |
| **Maximum Duration** | Unlimited (but requires custom expiration management) | **1 year maximum** (Step Functions limit) |

### When to Use Each Approach

**Use Step Functions (like PVM) when:**
- Precise timing is critical (expiration must be exact)
- Workflow has clear, sequential states with waits
- Audit trail and execution history are important
- You want to minimize custom orchestration code
- Permission durations are under 1 year

**Use Background Workers when:**
- Permission durations can exceed 1 year
- Polling-based checks are acceptable
- You need more flexibility in orchestration logic
- You already have a robust worker infrastructure
- Cost optimization at very high scale is critical

### PVM's Design Choice

PVM uses Step Functions because:

1. **Expiration is a compliance requirement** - Permissions must be revoked exactly at expiration time, not "within 5 minutes"
2. **Simple workflow** - The approval → grant → wait → revoke pattern fits perfectly in a state machine
3. **Reduced complexity** - No need for custom scheduler, queue management, or state coordination
4. **Better auditability** - Complete execution trace in Step Functions console
5. **Reliability** - Built-in retry, error handling, and dead-letter queues

**Trade-off Acknowledged:** Maximum permission duration is **1 year** (Step Functions execution limit). This is acceptable for PVM's use case (typical durations: minutes to hours, max: days). For longer-lived permissions, a hybrid approach or background worker model would be more appropriate.

## System Flow (Step Functions Orchestration)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   PERMISSIONS REQUEST FLOW (Step Functions)                 │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐
  │ Requester│ (AI Agent, Service, Developer)
  │  System  │
  └────┬─────┘
       │
       │ 1. POST /api/permissions/request
       │    {permissions: [...], requester, expirationMinutes, ...}
       │
       ▼
  ┌────────────────┐
  │   API Gateway  │
  │   + Lambda     │
  └────┬───────────┘
       │
       │ 2. Validate request
       │    Start Step Functions execution
       │    execution_arn becomes request_id
       │
       ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │                      STEP FUNCTIONS STATE MACHINE                  │
  │                                                                     │
  │   [Start]                                                           │
  │      │                                                              │
  │      ▼                                                              │
  │   [StoreRequest]  ──────────► Store initial request in DynamoDB    │
  │      │                         Status: PENDING                      │
  │      │                         Store execution ARN as request_id   │
  │      ▼                                                              │
  │   [WaitForApproval]  ───────► ** .waitForTaskToken **               │
  │      │                         Invoke SendApprovalEmail Lambda     │
  │      │                         Pass task token as input            │
  │      │                         Lambda sends email with token       │
  │      │                         Waits for SendTaskSuccess/Failure    │
  │      │                                                              │
  │      │ ◄────────────────────── Approver clicks [Approve] or [Deny] │
  │      │                         API Gateway endpoint receives click │
  │      │                         Calls SendTaskSuccess/Failure with  │
  │      │                         task token from JWT                 │
  │      │                                                              │
  │      ▼                                                              │
  │   [CheckApproval]  ─────────► Choice state based on approval result│
  │      │                                                              │
  │      ├─── Denied ──────────────────────────────────────┐          │
  │      │                                                   │          │
  │      ▼ Approved                                         ▼          │
  │   [GrantPermissions]  ──────► Execute IAM changes      [DenialComplete] │
  │      │                         Attach policies                     │
  │      │                         Log to audit trail                  │
  │      │                         Update DynamoDB: COMPLETED          │
  │      ▼                                                              │
  │   [WaitForExpiration]  ─────► ** WAIT STATE **                     │
  │      │                         TimestampPath: $.permission_expires_at│
  │      │                         Waits until exact expiration time   │
  │      │                         (No polling! Precise timestamp wait)│
  │      │                                                              │
  │      │ ... time passes ...                                         │
  │      │                                                              │
  │      ▼                                                              │
  │   [RevokePermissions]  ─────► Detach/delete IAM policies           │
  │      │                         Update DynamoDB: REVOKED             │
  │      │                         Log revocation to audit trail       │
  │      ▼                                                              │
  │   [SuccessComplete]  ────────► Execution complete                  │
  │                                                                     │
  │   [Error Handlers] ──────────► Catch states for failures           │
  │      • Email send failure     Update status                        │
  │      • IAM execution failure  Mark FAILED, log error               │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
       │
       │ 3. Return 202 Accepted {execution_arn as request_id}
       │
       ▼
  ┌──────────┐
  │Requester │ ◄───── Immediate response
  │ System   │        (request acknowledged, execution_arn returned)
  │          │
  │          │        Polls GET /permissions/status/:requestId
  │          │        to check for COMPLETED, DENIED, FAILED, etc.
  └──────────┘
```

## Step Functions State Machine Design

### State Machine Structure

The PVM state machine has these key states:

1. **StoreRequest** (Task) - Write request to DynamoDB
2. **WaitForApproval** (Task with .waitForTaskToken) - Invoke SendApprovalEmail Lambda with task token, wait for response
3. **CheckApproval** (Choice) - Branch on approved/denied
4. **GrantPermissions** (Task) - Execute IAM changes (if approved)
5. **WaitForExpiration** (Wait) - Pause until exact expiration timestamp
6. **RevokePermissions** (Task) - Remove IAM policies
7. **DenialComplete** (Succeed) - End state for denied requests
8. **SuccessComplete** (Succeed) - End state for successful workflows

### .waitForTaskToken Pattern for Approval

**The approval wait uses AWS Step Functions `.waitForTaskToken` integration:**

1. **State machine invokes SendApprovalEmail Lambda** with `.waitForTaskToken` suffix
2. **Step Functions passes task token** via `$$.Task.Token` in Lambda input
3. **Lambda receives task token as input parameter** (no polling needed!)
4. **Lambda generates JWT** with embedded task token
5. **Approval email sent** with links containing JWT
6. **Approver clicks link** → API Gateway endpoint
7. **Endpoint calls** `SendTaskSuccess` (approve) or `SendTaskFailure` (deny) with task token
8. **Step Functions resumes** execution with approval result

**Key Benefit:** No polling required! Task token is passed directly to Lambda as input. Much simpler than Activity Tasks.

**Lambda Input (receives task token):**
```json
{
  "taskToken": "AAAAKgAAAAIAAA...",
  "request": {
    "request_id": "execution-arn",
    "permissions_requested": [...],
    "requester": {...}
  }
}
```

**JWT Payload (includes task token):**
```json
{
  "request_id": "execution-arn",
  "action": "approve",
  "task_token": "AAAAKgAAAAIAAA...",
  "iat": 1708646400,
  "exp": 1708648200
}
```

**API Endpoint Logic (approve):**
```javascript
// Verify JWT, extract task token
const { task_token, request_id } = verifyToken(jwt);

// Send success to Step Functions
await stepfunctions.sendTaskSuccess({
  taskToken: task_token,
  output: JSON.stringify({
    approved: true,
    approved_by: approverEmail,
    approved_at: new Date().toISOString()
  })
}).promise();
```

### Wait State for Precise Expiration

**The expiration wait uses a Wait state with TimestampPath:**

```json
{
  "Type": "Wait",
  "TimestampPath": "$.permission_expires_at",
  "Next": "RevokePermissions"
}
```

**How it works:**

1. **GrantPermissions task** calculates: `permission_expires_at = approval_time + expiration_minutes`
2. **Stores in execution context:** `{..., "permission_expires_at": "2026-02-22T20:00:00Z"}`
3. **WaitForExpiration state** reads `$.permission_expires_at` from context
4. **Step Functions pauses execution** until that exact timestamp
5. **At expiration time**, execution automatically resumes to RevokePermissions
6. **No polling required!** Step Functions manages the timer internally

**Precision:** Sub-second accuracy. Revocation occurs within seconds of expiration time.

**Maximum Duration:** 1 year (Step Functions execution time limit). This is enforced at request validation time.

## Component Responsibilities

### 1. API Gateway + Lambda (Entry Point)

**File:** `src/api.js`

**Responsibilities:**
- Accept POST requests at `/api/permissions/request`
- Validate incoming request schema
- **Start Step Functions execution** (not just DynamoDB write)
- Return execution ARN as `request_id`
- Accept GET requests at `/api/permissions/approve` and `/api/permissions/deny`
- **Call SendTaskSuccess/SendTaskFailure** with task token from JWT

**Key Change from Original:**
- No longer sends callbacks
- Users must poll GET /permissions/status/:requestId for results
- Approval endpoints call Step Functions API (not DynamoDB updates)

**API Handler (request submission):**
```javascript
export async function handlePermissionRequest(event) {
  const request = JSON.parse(event.body);
  
  // Validate request
  validateRequest(request);
  
  // Start Step Functions execution
  const execution = await stepfunctions.startExecution({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    input: JSON.stringify(request)
  }).promise();
  
  return {
    statusCode: 202,
    body: JSON.stringify({
      request_id: execution.executionArn,
      status: 'pending',
      created_at: new Date().toISOString()
    })
  };
}
```

**Approval Handler:**
```javascript
export async function handleApprove(event) {
  const token = event.queryStringParameters.token;
  
  // Verify JWT
  const { task_token, request_id } = verifyToken(token);
  
  // Send success to Step Functions
  await stepfunctions.sendTaskSuccess({
    taskToken: task_token,
    output: JSON.stringify({
      approved: true,
      approved_by: extractApproverEmail(event),
      approved_at: new Date().toISOString()
    })
  }).promise();
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: renderApprovalSuccessPage(request_id)
  };
}
```

### 2. Step Functions State Machine Tasks (Lambda Functions)

Each Task state in the state machine invokes a Lambda function:

#### StoreRequest Lambda (`src/tasks/store-request.js`)

**Input:** Initial request from API  
**Output:** Request record with execution ARN as request_id  
**Responsibility:**
- Store request in DynamoDB with status `PENDING`
- Use execution ARN as `request_id`
- Calculate `permission_expires_at` (approval time comes later, this is request time + duration)
- Return full request object for next states

#### SendApprovalEmail Lambda (`src/tasks/send-approval-email.js`)

**Input:** Request object + task token (from `$$.Task.Token`)  
**Output:** Email sent confirmation  
**Responsibility:**
- Receive task token as direct input parameter (no polling!)
- Generate JWT tokens with task token embedded
- Construct approval email HTML
- Send via AWS SES
- Return success (Lambda completes, but state machine waits for external callback)

**Critical:** This Lambda **receives the task token as input** from Step Functions via `.waitForTaskToken` pattern. No polling required!

#### GrantPermissions Lambda (`src/tasks/grant-permissions.js`)

**Input:** Request object + approval result  
**Output:** IAM execution result + calculated `permission_expires_at`  
**Responsibility:**
- Validate requested permissions against allowlist
- Construct IAM policy document
- Attach policy to target principal
- Calculate precise expiration timestamp: `permission_expires_at = approval.approved_at + expiration_minutes`
- Store this timestamp in execution context for Wait state
- Update DynamoDB with status `COMPLETED` and policy details
- Log IAM actions to audit trail

**Output Example:**
```json
{
  "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-abc123",
  "attached_at": "2026-02-22T19:15:30Z",
  "permission_expires_at": "2026-02-22T20:00:30Z",
  "target_principal": "arn:aws:iam::123456789012:role/agent-role"
}
```

#### RevokePermissions Lambda (`src/tasks/revoke-permissions.js`)

**Input:** Request object + IAM execution result  
**Output:** Revocation confirmation  
**Responsibility:**
- Extract policy ARN and target principal
- Call `iam:DeleteRolePolicy` or `iam:DeleteUserPolicy`
- Update DynamoDB with status `REVOKED`
- Log revocation to audit trail
- Return revocation details

### 3. Task Token Delivery (No Worker Needed!)

**The `.waitForTaskToken` pattern eliminates the need for a separate worker:**

**How it works:**
1. Step Functions invokes `SendApprovalEmail` Lambda with `arn:aws:states:::lambda:invoke.waitForTaskToken`
2. Step Functions **automatically passes task token** via `$$.Task.Token` in the Lambda input
3. Lambda receives token directly as a parameter
4. Lambda embeds token in JWT and sends email
5. Lambda returns (completes), but Step Functions **keeps execution open**
6. When approval API endpoint calls `SendTaskSuccess`, Step Functions resumes

**Key Benefit:** No polling loop! No `GetActivityTask()` calls! Task token is delivered directly to Lambda as input. This is the AWS-recommended pattern for approval-based workflows.

### 4. DynamoDB Tables

Same schema as before, but with additional fields:

#### `pvm-requests` Table

**Additional Fields:**
- `execution_arn` (String) - Step Functions execution ARN (also the request_id)
- `task_token` (String) - Activity task token (for debugging, not used by app logic after email sent)

**Indexes:**
- GSI: `status-permission_expires_at-index` (NOT used for polling, but for monitoring/dashboards)

### 5. Audit Logger

Same as before, logs all events to DynamoDB `pvm-audit-logs` table.

**Additional events:**
- `execution_started`
- `execution_completed`
- `execution_failed`
- `task_token_generated`
- `wait_state_entered` (optional, for deep tracing)

## Data Models

### Request Record (DynamoDB: `pvm-requests`)

**Primary Key:** `request_id` (String, Step Functions execution ARN)

```json
{
  "request_id": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "execution_arn": "arn:aws:states:us-east-1:123456789012:execution:pvm-state-machine:550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING | APPROVED | DENIED | COMPLETED | REVOKED | FAILED",
  "created_at": "2026-02-22T19:13:00Z",
  "updated_at": "2026-02-22T20:00:30Z",
  
  "requester": { ... },
  "permissions_requested": [ ... ],
  
  "expiration": {
    "requested_duration_minutes": 45,
    "permission_expires_at": "2026-02-22T20:00:30Z"
  },
  
  "approval": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-02-22T19:15:00Z",
    "action": "approve | deny",
    "task_token": "AAAAKgAAAAIAAA..." 
  },
  
  "execution": {
    "executed_at": "2026-02-22T19:15:30Z",
    "policy_arn": "arn:aws:iam::123456789012:policy/pvm-request-550e8400",
    "errors": []
  },
  
  "revocation": {
    "revoked_at": "2026-02-22T20:00:30Z",
    "revoked_by": "system",
    "reason": "expiration"
  },
  
  "ttl": 1740257580
}
```

## Step Functions State Machine Definition

See `docs/step-functions-state-machine.json` for the complete Amazon States Language (ASL) definition.

**Key States:**

- **StoreRequest** - Task state invoking `StoreRequestFunction` Lambda
- **WaitForApproval** - **Task state with `.waitForTaskToken`** invoking `SendApprovalEmailFunction` Lambda and waiting for response
- **CheckApproval** - Choice state branching on `$.approval.approved`
- **GrantPermissions** - Task state invoking `GrantPermissionsFunction` Lambda
- **WaitForExpiration** - **Wait state** with `TimestampPath: $.permission_expires_at`
- **RevokePermissions** - Task state invoking `RevokePermissionsFunction` Lambda
- **DenialComplete** - Succeed state for denied requests
- **SuccessComplete** - Succeed state for completed workflows

**Error Handling:**

Each Task state has:
```json
{
  "Retry": [
    {
      "ErrorEquals": ["Lambda.ServiceException", "Lambda.TooManyRequestsException"],
      "IntervalSeconds": 2,
      "MaxAttempts": 3,
      "BackoffRate": 2.0
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "Next": "HandleFailure",
      "ResultPath": "$.error"
    }
  ]
}
```

## Security Model

### 1. JWT Signing (with Task Token)

**JWT Payload:**
```json
{
  "request_id": "arn:aws:states:...",
  "action": "approve",
  "task_token": "AAAAKgAAAAIAAA...",
  "iat": 1708646400,
  "exp": 1708648200
}
```

**Approval Flow:**
1. Verify JWT signature and expiration
2. Extract `task_token`
3. Call `stepfunctions.sendTaskSuccess({ taskToken: task_token, output: {...} })`

**Security:**
- Task token is opaque, single-use (Step Functions enforces)
- JWT signature prevents tampering
- JWT expiration (60 min) limits exposure window
- Task token cannot be reused after SendTaskSuccess/Failure

### 2. IAM Permissions (System Role)

**Step Functions Execution Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:pvm-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "states:SendTaskSuccess",
        "states:SendTaskFailure"
      ],
      "Resource": "*"
    }
  ]
}
```

**Lambda Execution Roles** (approval API endpoint needs):
```json
{
  "Effect": "Allow",
  "Action": [
    "states:SendTaskSuccess",
    "states:SendTaskFailure"
  ],
  "Resource": "*"
}
```

**Note:** `GetActivityTask` is NOT needed! The `.waitForTaskToken` pattern passes the token directly to the Lambda.

### 3. Task Token Security

- Task tokens are single-use (Step Functions enforces)
- Tokens expire when execution times out (max 7 days for approval wait)
- Tokens cannot be guessed (cryptographically random, 1024+ bits)
- SendTaskSuccess requires valid token (Step Functions validates)
- Token is passed securely from Step Functions → Lambda → JWT → API endpoint

### 4. IAM Permissions for GrantPermissions Lambda

The `GrantPermissions` Lambda requires precise IAM permissions to grant temporary policies while preventing privilege escalation:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPolicyManagement",
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:GetPolicy",
        "iam:GetPolicyVersion"
      ],
      "Resource": "arn:aws:iam::*:policy/pvm-request-*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "${AWS::Region}"
        }
      }
    },
    {
      "Sid": "AllowRolePolicyAttachment",
      "Effect": "Allow",
      "Action": [
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy"
      ],
      "Resource": "arn:aws:iam::*:role/agent-*",
      "Condition": {
        "StringLike": {
          "iam:PolicyArn": "arn:aws:iam::*:policy/pvm-request-*"
        }
      }
    },
    {
      "Sid": "DenyAllOtherIAMActions",
      "Effect": "Deny",
      "Action": "iam:*",
      "NotResource": [
        "arn:aws:iam::*:role/agent-*",
        "arn:aws:iam::*:policy/pvm-request-*"
      ]
    }
  ]
}
```

**Security Constraints:**
- **Policy Naming:** Only policies prefixed with `pvm-request-*` can be created
- **Role Targeting:** Only roles prefixed with `agent-*` can be modified
- **Deny-by-Default:** Explicit deny on all other IAM resources
- **No User Policies:** Cannot attach policies to IAM users (only roles)
- **No Admin Actions:** Cannot create users, groups, or modify unrelated roles

**Rationale:**
- Prevents PVM from granting permissions outside its scope
- Ensures only temporary, tracked policies are created
- Protects against privilege escalation attacks
- Enables audit trail (all policies follow naming convention)

### 5. IAM Permissions for RevokePermissions Lambda

The `RevokePermissions` Lambda requires mirror permissions to clean up policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPolicyDeletion",
      "Effect": "Allow",
      "Action": [
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:GetPolicy",
        "iam:ListPolicyVersions"
      ],
      "Resource": "arn:aws:iam::*:policy/pvm-request-*"
    },
    {
      "Sid": "AllowRolePolicyDetachment",
      "Effect": "Allow",
      "Action": [
        "iam:DeleteRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy"
      ],
      "Resource": "arn:aws:iam::*:role/agent-*",
      "Condition": {
        "StringLike": {
          "iam:PolicyArn": "arn:aws:iam::*:policy/pvm-request-*"
        }
      }
    },
    {
      "Sid": "DenyAllOtherIAMActions",
      "Effect": "Deny",
      "Action": "iam:*",
      "NotResource": [
        "arn:aws:iam::*:role/agent-*",
        "arn:aws:iam::*:policy/pvm-request-*"
      ]
    }
  ]
}
```

**Security Constraints:**
- **Policy Cleanup:** Only `pvm-request-*` policies can be deleted
- **Role Protection:** Only `agent-*` roles can have policies detached
- **Deny-by-Default:** Explicit deny on all other IAM operations
- **Idempotent:** Handles "NoSuchEntity" errors gracefully (policy already deleted)

**Error Handling:**
- `NoSuchEntityException`: Ignored (policy already deleted, not an error)
- IAM throttling: Retry with exponential backoff (3 attempts)
- Other errors: Fail execution, trigger alarm for manual intervention

### 6. Permission Allowlist Enforcement

The system enforces a permission allowlist at multiple layers:

**1. API Validation (Pre-Execution):**
- Reject requests with forbidden actions before starting execution
- Return 400 Bad Request with specific denial reason
- Prevents invalid requests from entering workflow

**2. GrantPermissions Task (Runtime):**
- Re-validate permissions against allowlist
- Reject wildcard actions (`*:*`, `iam:*`)
- Reject dangerous actions (`iam:CreateUser`, `iam:AttachUserPolicy`, etc.)
- Allow read-only actions (`Get*`, `List*`, `Describe*`)
- Allow specific write actions (configurable allowlist)

**3. IAM Policy Constraints (Infrastructure):**
- Lambda execution role cannot grant permissions outside `agent-*` roles
- Enforced by IAM policy conditions on Lambda role itself
- Defense-in-depth: Even if allowlist is bypassed, IAM prevents escalation

### 7. VPC Access Control

The PVM API uses **Regional API Gateway with resource policy** to restrict the permission request endpoint to approved VPCs while keeping approval endpoints publicly accessible.

**Security Model:**
- **Request endpoint (`POST /permissions/request`):** VPC-only access
- **Approval endpoints (`GET /permissions/approve`, `GET /permissions/deny`):** Public access (required for email workflow)
- **Rationale:** Requester systems run in trusted VPCs; approvers click email links from anywhere (office, home, mobile)

#### API Gateway Configuration

**Endpoint Type:** Regional (not Private, not Edge-Optimized)

**Why Regional?**
- Resource policies can enforce VPC restrictions
- Still publicly routable for approval endpoints
- Lower latency for in-region requests
- Simpler DNS configuration than Edge-Optimized

**Why Not Private API?**
- Private APIs require VPC endpoint for ALL requests
- Approval links wouldn't work from public internet
- Approvers would need VPN access (defeats purpose of email workflow)

#### Resource Policy

The API Gateway resource policy implements selective VPC restriction:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRequestsFromApprovedVPCs",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*/*/POST/permissions/request",
      "Condition": {
        "StringEquals": {
          "aws:SourceVpc": ["vpc-12345678", "vpc-87654321"]
        }
      }
    },
    {
      "Sid": "AllowPublicApprovalEndpoints",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": [
        "arn:aws:execute-api:*:*:*/*/GET/permissions/approve",
        "arn:aws:execute-api:*:*:*/*/GET/permissions/deny"
      ]
    },
    {
      "Sid": "DenyAllOtherAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*/*/*",
      "Condition": {
        "StringNotEquals": {
          "aws:SourceVpc": ["vpc-12345678", "vpc-87654321"]
        },
        "StringNotLike": {
          "aws:ResourcePath": ["/permissions/approve", "/permissions/deny"]
        }
      }
    }
  ]
}
```

**Policy Explanation:**

1. **Statement 1 (AllowRequestsFromApprovedVPCs):**
   - Allows `POST /permissions/request` ONLY from specified VPCs
   - Uses `aws:SourceVpc` condition to verify request origin
   - VPC IDs are configurable (see Environment Variables below)

2. **Statement 2 (AllowPublicApprovalEndpoints):**
   - Explicitly allows public access to approval/denial endpoints
   - No VPC restriction
   - Required for approvers to click email links from any location

3. **Statement 3 (DenyAllOtherAccess):**
   - Denies all other API paths unless from approved VPCs OR approval paths
   - Defense-in-depth: Blocks any undocumented endpoints
   - Ensures only intended endpoints are accessible

**Important Notes:**
- The Deny statement includes `StringNotLike` exception for approval paths, preventing it from blocking legitimate approval requests
- VPC condition only works if requests come through VPC endpoint
- Requests from EC2 instances with public IPs will NOT have `aws:SourceVpc` set (must use VPC endpoint)

#### VPC Endpoint Configuration

For the resource policy to work, requester systems must access the API through a **VPC endpoint**:

**Required VPC Endpoint Type:** `com.amazonaws.<region>.execute-api`

**Steps:**
1. Create VPC endpoint in requester VPC
2. Associate with subnets where requester systems run
3. Configure security groups to allow HTTPS (port 443) outbound
4. Requester systems must use VPC endpoint DNS name OR Regional API Gateway endpoint (AWS auto-routes through VPC endpoint)

**Example VPC Endpoint Creation:**
```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345678 \
  --service-name com.amazonaws.us-east-1.execute-api \
  --route-table-ids rtb-12345678 \
  --subnet-ids subnet-12345678 subnet-87654321 \
  --security-group-ids sg-12345678
```

#### Multiple VPC Support

The system supports multiple VPCs via environment variable configuration:

**Environment Variable:** `ALLOWED_VPC_IDS` (comma-separated list)

**Example:**
```bash
ALLOWED_VPC_IDS=vpc-12345678,vpc-87654321,vpc-abcdef12
```

**Deployment Process:**
1. Set `ALLOWED_VPC_IDS` in CloudFormation/Terraform/SAM template
2. Template renders resource policy with VPC IDs
3. API Gateway applies resource policy on deployment
4. Update policy by redeploying with new VPC IDs

#### Error Response for VPC Restriction

When a request is made to `POST /permissions/request` from outside approved VPCs:

**HTTP Status:** 403 Forbidden

**Response Body:**
```json
{
  "message": "User: anonymous is not authorized to perform: execute-api:Invoke on resource: arn:aws:execute-api:us-east-1:123456789012:abc123xyz/prod/POST/permissions/request with an explicit deny"
}
```

**Note:** This is the default AWS API Gateway resource policy denial message. Custom error messages are not supported for resource policy denials.

#### Testing VPC Restrictions

**Test 1: Request from approved VPC (should succeed)**
```bash
# From EC2 instance in VPC vpc-12345678
curl -X POST https://pvm.example.com/api/permissions/request \
  -H "Content-Type: application/json" \
  -d '{"requester": {...}, "permissions": [...]}'

# Expected: 202 Accepted
```

**Test 2: Request from outside approved VPC (should fail)**
```bash
# From laptop, public internet, or unapproved VPC
curl -X POST https://pvm.example.com/api/permissions/request \
  -H "Content-Type: application/json" \
  -d '{"requester": {...}, "permissions": [...]}'

# Expected: 403 Forbidden (resource policy denial)
```

**Test 3: Approval link from public internet (should succeed)**
```bash
# From browser, public internet (clicking email link)
curl https://pvm.example.com/api/permissions/approve?token=eyJhbG...

# Expected: 200 OK (HTML success page)
```

#### Security Benefits

1. **Attack Surface Reduction:**
   - Only trusted VPCs can submit permission requests
   - Prevents external attackers from flooding the system
   - Reduces risk of abuse (unauthorized permission requests)

2. **Defense-in-Depth:**
   - Even if JWT secret is compromised, attacker can't submit requests from outside VPCs
   - Complements authentication and authorization layers

3. **Compliance:**
   - Ensures permission requests originate from known infrastructure
   - Supports audit requirements (all requests come from tagged VPCs)

4. **Network Segmentation:**
   - Requester systems isolated in VPCs
   - Approval workflow remains accessible (email links work from anywhere)

#### Operational Considerations

**Adding New VPCs:**
1. Update `ALLOWED_VPC_IDS` environment variable
2. Redeploy API Gateway with updated resource policy
3. Create VPC endpoint in new VPC
4. Test connectivity from new VPC

**Removing VPCs:**
1. Ensure no active requests from VPC to be removed
2. Update `ALLOWED_VPC_IDS` (remove VPC ID)
3. Redeploy API Gateway
4. Delete VPC endpoint (optional)

**Monitoring:**
- CloudWatch Logs show `aws:SourceVpc` in request metadata
- Track 403 errors for unauthorized VPC access attempts
- Alert on unexpected VPC IDs in logs

**Limitations:**
- Resource policy applies to ALL stages (dev, prod) unless using separate APIs
- VPC endpoint adds minor latency (~10-50ms)
- VPC endpoint costs ~$0.01/hour (~$7/month per endpoint)

#### Why This Approach Over Alternatives

**Option 1: Private API Gateway**
- ❌ Approval links wouldn't work from public internet
- ❌ Requires VPN for approvers (defeats email workflow purpose)

**Option 2: Lambda Authorizer with IP Allowlist**
- ❌ IP addresses change (EC2 instances, Auto Scaling)
- ❌ Complex management (track hundreds of IPs)
- ❌ No VPC-level enforcement

**Option 3: Regional API + Resource Policy (PVM Choice) ✅**
- ✅ Request endpoint VPC-restricted
- ✅ Approval endpoints remain public
- ✅ VPC-level enforcement (infrastructure-based)
- ✅ Easy management (VPC IDs are stable)
- ✅ Supports multiple VPCs

## Monitoring and Observability

### Step Functions Metrics (CloudWatch)

**Built-in Metrics:**
- `ExecutionTime` - Duration of each execution
- `ExecutionsStarted` - Number of new requests
- `ExecutionsSucceeded` - Completed workflows
- `ExecutionsFailed` - Failed workflows
- `ExecutionsTimedOut` - Executions exceeding 1 year limit

**Custom Metrics:**
- Permissions granted per hour
- Permissions revoked per hour
- Average approval time (time in WaitForApproval state)
- Callback delivery success rate

### Alarms

- Execution failure rate > 5%
- Average approval time > 24 hours (requests stuck)
- Activity task timeout rate > 10%
- IAM execution error rate > 1%

### Step Functions Console

**Visual Execution Tracking:**
- See current state of each request
- View execution history (all state transitions)
- Inspect input/output of each state
- Debug failed executions with error details
- Search executions by status, time range

### Logging

- All Lambda functions log to CloudWatch Logs
- Step Functions execution events logged automatically
- DynamoDB audit log for compliance
- Structured JSON logs for easy querying

## Deployment Architecture

### AWS Services Used

1. **API Gateway** - REST API for request submission and approval endpoints
2. **Step Functions** - State machine orchestration
3. **Lambda** - Task execution (6-8 functions)
4. **DynamoDB** - Request and audit storage
5. **SES** - Email delivery
6. **Secrets Manager** - JWT secret storage
7. **CloudWatch** - Logs, metrics, alarms
8. **S3** - Optional long-term audit archive

### Lambda Functions

| Function | Trigger | Timeout | Memory | Concurrent Executions |
|----------|---------|---------|--------|----------------------|
| `pvm-api-handler` | API Gateway | 29s | 512 MB | High (API endpoint) |
| `pvm-approval-handler` | API Gateway | 10s | 256 MB | Medium (approval clicks) |
| `pvm-store-request` | Step Functions | 30s | 256 MB | Matches execution starts |
| `pvm-send-approval-email` | Step Functions | 60s | 256 MB | Matches execution starts |
| `pvm-grant-permissions` | Step Functions | 60s | 512 MB | Matches approvals |
| `pvm-revoke-permissions` | Step Functions | 30s | 512 MB | Matches expirations |

**Note:** No `expiration-checker` Lambda needed! Step Functions Wait state handles timing. No `send-callback` Lambda needed - users poll status endpoint.

### Environment Variables

Same as before, plus:

| Variable | Description | Example |
|----------|-------------|---------|
| `STATE_MACHINE_ARN` | ARN of PVM state machine | `arn:aws:states:us-east-1:...:stateMachine:pvm` |
| `ALLOWED_VPC_IDS` | Comma-separated list of VPC IDs allowed to call request endpoint | `vpc-12345678,vpc-87654321,vpc-abcdef12` |

### Cost Comparison

**Step Functions Pricing (us-east-1):**
- State transitions: $0.025 per 1,000 transitions
- Average execution: ~15 state transitions
- Cost per request: ~$0.000375

**Example Monthly Cost (1,000 requests):**
- Step Functions: $0.38
- Lambda: ~$5 (estimate)
- DynamoDB: ~$1 (on-demand)
- SES: $0.10 (1,000 emails)
- **Total: ~$6.50/month**

**Comparison to Background Worker:**
- EventBridge: $1/million events = ~$0.09/month (5-min polling)
- Expiration checker Lambda: ~$2/month (8,640 invocations)
- **Savings with Step Functions: ~$2/month at low volume, plus better reliability**

At higher volumes (>10,000 requests/month), costs are similar, but Step Functions provides better visibility and reliability.

## Limitations and Considerations

### 1. Maximum Permission Duration: 1 Year

**Step Functions Limitation:** Maximum execution time is 1 year (365 days).

**Impact:**
- `expiration_minutes` must be ≤ 525,600 (1 year)
- Requests exceeding this limit are rejected at API validation
- For longer durations, consider a hybrid approach (Step Functions for grant, background worker for very long expirations)

**Validation:**
```javascript
if (request.expiration_minutes > 525600) {
  throw new Error('Maximum permission duration is 1 year (525,600 minutes)');
}
```

### 2. Approval Task Timeout

**If approval email is never clicked:**
- WaitForApproval task has a timeout (configurable, e.g., 7 days = 604800 seconds)
- After timeout, execution fails with `States.Timeout`
- Catch block sends "expired" callback to requester
- Request marked as `EXPIRED` in DynamoDB

**Configuration:**
```json
{
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
  "TimeoutSeconds": 604800,
  "Catch": [
    {
      "ErrorEquals": ["States.Timeout"],
      "Next": "HandleApprovalTimeout"
    }
  ]
}
```

### 3. Step Functions Quota

- Maximum open executions: 1 million (per region)
- Maximum execution history: 25,000 events per execution
- State transition limit: Not a concern for PVM (< 20 transitions per execution)

### 4. No Polling Overhead

**Benefit:** Unlike background workers, Step Functions doesn't consume resources while waiting. The Wait state incurs no Lambda invocations or DynamoDB reads during the wait period.

### 5. Idempotency

**Step Functions executions are idempotent by execution ARN:**
- Same `request_id` (execution ARN) cannot be started twice
- Approval endpoints check if task token is still valid
- SendTaskSuccess/Failure are idempotent (second call is no-op)

## Future Enhancements

All future enhancements from the original design apply, plus:

1. **Parallel Approvals** - Use Step Functions Parallel state for multi-approver workflow
2. **Dynamic Timeout** - Adjust activity timeout based on permission risk level
3. **Execution Replay** - Restart failed executions from the failure point
4. **Step Functions Express Workflows** - For very high-volume, short-duration requests (< 5 minutes)
5. **Nested Workflows** - Invoke child state machines for complex permission sets

## Migration Path from Background Worker Architecture

If you previously implemented the background worker approach:

1. **Keep existing DynamoDB schema** - Only add `execution_arn` field
2. **Deploy state machine alongside existing system** - Run both in parallel
3. **Migrate incrementally** - Route new requests to Step Functions, let old requests complete
4. **Decommission EventBridge schedule** - After all old requests expire
5. **Remove expiration-checker Lambda** - No longer needed

**Zero-downtime migration** is possible by using feature flags in the API handler.

---

**Document Version:** 2.0 (Step Functions Edition)  
**Last Updated:** 2026-02-22  
**Author:** OpenClaw AI (BotWard)  
**Architecture:** AWS Step Functions Orchestration with Guaranteed Expiration
