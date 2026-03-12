# Permissions Vending Machine (PVM) for Agents running in AWS

**Temporary IAM permission grants via email approval for AI agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The AWS Permissions Vending Machine (PVM) is a serverless solution that allows AI agents to request temporary IAM permissions through a REST API. It provides a secure, auditable workflow for granting time-limited access to AWS resources.

**Perfect for:** OpenClaw agents running on AWS that need temporary elevated permissions.

## Architecture

- **API Gateway** - REST API for permission requests and status checks
- **Step Functions** - Orchestrates approval workflow with human-in-the-loop approvals and strict expirations
- **Lambda Functions** - Handles requests, approvals, grants, and revocations
- **DynamoDB** - Stores permission requests and allowlists
- **SES** - Sends approval emails with JWT-signed callback links
- **IAM** - Dynamically attaches/detaches policies for temporary access

![PVM State Machine Graph](./docs/state-machine-graph.jpg)

## Prerequisites

### AWS Requirements
- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 18+ (for Lambda runtime)
- Python 3.9+ (for agent polling script)

### IAM Permissions Needed
The deploying user/role needs:
- Lambda (create, update functions)
- API Gateway (create, configure)
- Step Functions (create state machine)
- DynamoDB (create tables)
- IAM (create roles, policies)
- SES (send emails)
- SSM (read/write parameters)

## Quick Start Installation

### Option 1: Clone from GitHub (Recommended)

```bash
git clone https://github.com/YOUR-ORG/aws-permissions-vending-machine.git
cd aws-permissions-vending-machine
npm install
```

### Option 2: Install as OpenClaw Skill

For OpenClaw users, install as a skill:

```bash
openclaw skills install aws-pvm
cd ~/.openclaw/skills/aws-pvm
npm install
```

**Skill Name:** `aws-pvm`

### 1. Install Dependencies

```bash
cd aws-permissions-vending-machine
npm install
```

This installs AWS SDK and other dependencies needed for Lambda functions.

### 2. Configure SSM Parameters

Create required configuration in AWS Systems Manager Parameter Store:

```bash
# Set approver email (where approval requests go)
aws ssm put-parameter \
  --name /pvm/approver-email \
  --value "your-email@example.com" \
  --type String \
  --overwrite

# Generate and store JWT secret
node scripts/generate-jwt-secret.js
```

The JWT secret script will automatically create a secure random secret in SSM.

### 3. Create DynamoDB Tables

```bash
# Create both tables (requests + allowlists)
node scripts/create-tables.js
```

This creates:
- `pvm-requests` - Stores permission request lifecycle
- `pvm-allowlists` - Stores authorized resources

### 4. Deploy Lambda Functions

```bash
# Build and deploy all Lambda functions
./scripts/deploy-lambdas.sh
```

This deploys:
- `pvm-api` - Main API handler
- `pvm-store-request` - Initial request storage
- `pvm-send-approval-email` - Email delivery
- `pvm-grant-permissions` - IAM policy attachment
- `pvm-revoke-permissions` - IAM policy detachment
- `pvm-log-failure` - Error handling

### 5. Create IAM Roles

**Create Step Functions execution role:**

```bash
# Create trust policy
cat > /tmp/sfn-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "states.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name pvm-step-functions-role \
  --assume-role-policy-document file:///tmp/sfn-trust-policy.json

# Attach policy to invoke Lambda
aws iam attach-role-policy \
  --role-name pvm-step-functions-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaRole
```

**Create Lambda execution roles** (if using `deploy-lambdas.sh`, this may be automatic):

The Lambda functions need permissions for:
- CloudWatch Logs (write)
- DynamoDB (read/write on `pvm-requests` and `pvm-allowlists`)
- Step Functions (start execution, send task success/failure)
- IAM (attach/detach policies for grant/revoke)
- SES (send email)
- SSM (read parameters)

See `docs/iam-policy-ssm-access.json` for example policies.

### 6. Create Step Functions State Machine

```bash
aws stepfunctions create-state-machine \
  --name pvm-workflow \
  --definition file://docs/step-functions-state-machine.json \
  --role-arn arn:aws:iam::YOUR-ACCOUNT-ID:role/pvm-step-functions-role
```

### 7. Create API Gateway

### 7. Create API Gateway

**Using AWS Console (Easiest):**
1. Create new REST API named "pvm-api"
2. Create resources and methods:
   - `POST /permissions/request` → Lambda: `pvm-api`
   - `GET /permissions/status/{requestId}` → Lambda: `pvm-api`  
   - `GET /permissions/callback` → Lambda: `pvm-api`
3. Deploy to stage "prod"
4. Note the API URL (e.g., `https://abc123.execute-api.us-west-2.amazonaws.com/prod`)

**Using AWS CLI:**

```bash
# Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name pvm-api \
  --query 'id' \
  --output text)

# Get root resource
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' \
  --output text)

# Create /permissions resource
PERM_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part permissions \
  --query 'id' \
  --output text)

# Add methods and integrations (see DEPLOYMENT-GUIDE.md for full commands)
# Then deploy:
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod
```

For complete API Gateway CLI setup, see [`DEPLOYMENT-GUIDE.md`](./DEPLOYMENT-GUIDE.md#api-gateway-setup).

### 8. Configure Allowlists

Add authorized resources that agents can request:

```bash
# Add S3 bucket to allowlist
aws dynamodb put-item \
  --table-name pvm-allowlists \
  --item '{
    "list_id": {"S": "s3-buckets"},
    "resource_arn": {"S": "arn:aws:s3:::your-bucket-name"}
  }'

# Or use the helper script
node scripts/update-allowlist.js add s3-buckets arn:aws:s3:::your-bucket-name
```

## Agent Usage

### Request Permissions

```bash
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/prod/permissions/request \
  -H "Content-Type: application/json" \
  -d '{
    "requester_email": "agent@example.com",
    "resource_arns": ["arn:aws:s3:::your-bucket-name"],
    "reason": "Data upload task",
    "duration_minutes": 30
  }'
```

Response:
```json
{
  "request_id": "req_abc123",
  "status": "PENDING",
  "message": "Request submitted"
}
```

### Monitor Status

Use the included Python polling script:

```bash
python3 scripts/pvm_agent_poll.py req_abc123
```

The script will:
1. Poll for approval status every 10 seconds
2. Detect when permissions are granted (`ACTIVE`)
3. Exit successfully when ready to use

### Use Granted Permissions

Once status is `ACTIVE`, the agent can use the granted IAM permissions. The permissions will auto-revoke at expiration time.

## Files Overview

### Source Code (`src/`)
- `api.js` - Main API handler (request/status/callback endpoints)
- `db.js` - DynamoDB operations
- `validator.js` - Allowlist checking
- `jwt.js` - Token signing/verification
- `config.js` - Shared configuration

### Step Functions Tasks (`src/tasks/`)
- `store-request.js` - Saves initial request to DynamoDB
- `send-approval-email.js` - Sends email via SES
- `grant-permissions.js` - Attaches IAM policy
- `revoke-permissions.js` - Detaches IAM policy
- `log-failure.js` - Handles errors

### Scripts (`scripts/`)
- `pvm_agent_poll.py` - **Agent polling script** (Python)
- `create-tables.js` - Create DynamoDB tables
- `update-allowlist.js` - Add/remove allowlist entries
- `generate-jwt-secret.js` - Generate JWT secret
- `deploy-lambdas.sh` - Deploy all Lambda functions
- `rebuild-lambdas.sh` - Rebuild Lambda zip packages
- `cleanup-db.js` - Clean test data

### Documentation (`docs/`)
- `architecture.md` - System design overview
- `api-contract.md` - API specification
- `step-functions-state-machine.json` - Workflow definition
- `ssm-parameter-setup.md` - Configuration guide
- `STATE-MACHINE-ARCHITECTURE.md` - Workflow details

## Configuration

### Required SSM Parameters
- `/pvm/approver-email` - Where approval emails are sent
- `/pvm/jwt-secret` - Secret for signing callback tokens

### DynamoDB Tables
- `pvm-requests` - Request lifecycle storage
  - Primary key: `request_id` (String)
- `pvm-allowlists` - Authorized resources
  - Composite key: `list_id` (String) + `resource_arn` (String)

### Environment Variables (Lambda)
- `REQUESTS_TABLE` - DynamoDB requests table name
- `ALLOWLISTS_TABLE` - DynamoDB allowlists table name
- `STATE_MACHINE_ARN` - Step Functions ARN
- `API_BASE_URL` - API Gateway base URL

## Security

- ✅ JWT-signed callback URLs prevent unauthorized approvals
- ✅ Allowlist validation ensures only approved resources
- ✅ Time-limited grants (auto-revocation after expiration)
- ✅ IAM policy-based isolation per request
- ✅ Full audit trail in DynamoDB
- ✅ Email-based human approval required

## API Endpoints

### `POST /permissions/request`
Request temporary permissions

**Request:**
```json
{
  "requester_email": "agent@example.com",
  "resource_arns": ["arn:aws:s3:::bucket-name"],
  "reason": "Upload data",
  "duration_minutes": 30
}
```

**Response:**
```json
{
  "request_id": "req_abc123",
  "status": "PENDING",
  "message": "Request submitted"
}
```

### `GET /permissions/status/{requestId}`
Check request status

**Response:**
```json
{
  "request_id": "req_abc123",
  "status": "ACTIVE",
  "granted_at": "2026-02-24T18:00:00.000Z",
  "expires_at": "2026-02-24T18:30:00.000Z"
}
```

### `GET /permissions/callback?token=<jwt>`
Approve/deny callback (triggered by email link)

## Status Values

- `PENDING` - Initial state, approval email sent
- `ACTIVE` - Permissions granted, agent can use them
- `REVOKED` - Permissions removed (expired or denied)
- `DENIED` - Request rejected by approver
- `FAILED` - System error during processing
- `REVOCATION_FAILED` - Grant succeeded but revocation failed

## Troubleshooting

### Common Issues

**"Failed to get status, retrying..."**
- Check API Gateway endpoint is correct
- Verify Lambda function is deployed
- Check CloudWatch logs for errors

**"❌ Request not found"**
- Verify request_id is correct
- Check DynamoDB `pvm-requests` table

**"Permission denied on resource"**
- Add resource to allowlist in DynamoDB
- Use `scripts/update-allowlist.js` helper

**"Email not received"**
- Check SES email configuration
- Verify `/pvm/approver-email` SSM parameter
- Check SES sandbox mode (requires verified emails)

### Logs

Check CloudWatch Logs for each Lambda function:
- `/aws/lambda/pvm-api`
- `/aws/lambda/pvm-grant-permissions`
- `/aws/lambda/pvm-send-approval-email`
- etc.

Step Functions execution history:
```bash
aws stepfunctions list-executions --state-machine-arn <ARN>
```

## Testing

### Test Full Workflow

```bash
# 1. Request permissions
REQUEST_ID=$(curl -X POST https://YOUR-API/prod/permissions/request \
  -H "Content-Type: application/json" \
  -d '{
    "requester_email": "test@example.com",
    "resource_arns": ["arn:aws:s3:::test-bucket"],
    "reason": "Testing",
    "duration_minutes": 5
  }' | jq -r '.request_id')

echo "Request ID: $REQUEST_ID"

# 2. Monitor status
python3 scripts/pvm_agent_poll.py $REQUEST_ID

# 3. Check email and approve

# 4. Use permissions (agent does work here)

# 5. Verify cleanup
node scripts/cleanup-db.js $REQUEST_ID
```

## For OpenClaw Integration

This PVM solution is designed to work as an OpenClaw agent skill. To use:

1. **Install this repo** in your OpenClaw workspace
2. **Deploy AWS infrastructure** following steps above
3. **Configure OpenClaw agent** to use `scripts/pvm_agent_poll.py`
4. **Set environment variables** for API endpoint

The agent can then autonomously:
- Request permissions when needed
- Poll for approval
- Use granted permissions
- Handle expiration gracefully

## Complete Deployment Guide

For detailed step-by-step deployment instructions, see:
- [`DEPLOYMENT-GUIDE.md`](./DEPLOYMENT-GUIDE.md)

## License

MIT

## Support

For issues, questions, or contributions, contact the maintainer or open an issue.

---

**Built for AWS-based AI agents requiring temporary, auditable access to resources.**
