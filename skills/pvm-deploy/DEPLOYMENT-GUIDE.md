# AWS Permissions Vending Machine - Deployment Guide

Complete step-by-step instructions for deploying PVM infrastructure to AWS.

## Prerequisites

- AWS Account with administrative access
- AWS CLI installed and configured
- Node.js 18+ installed
- Python 3.9+ installed
- Git (for cloning the repository)

## Deployment Overview

PVM requires deploying the following AWS resources:

1. **DynamoDB Tables** - Request storage and resource allowlists
2. **IAM Roles** - Execution roles for Lambda and Step Functions
3. **Lambda Functions** - API handler and workflow tasks
4. **Step Functions State Machine** - Approval workflow orchestration
5. **API Gateway** - REST API endpoints
6. **SSM Parameters** - Configuration storage
7. **SES Configuration** - Email delivery setup

---

## Step-by-Step Deployment

### 1. Clone and Install

```bash
git clone https://github.com/YOUR-ORG/aws-permissions-vending-machine.git
cd aws-permissions-vending-machine
npm install
```

### 2. Configure SSM Parameters

Create configuration in AWS Systems Manager Parameter Store:

```bash
# Set approver email (receives approval requests)
aws ssm put-parameter \
  --name /pvm/approver-email \
  --value "your-email@example.com" \
  --type String \
  --overwrite

# Generate and store JWT secret for callback URLs
node scripts/generate-jwt-secret.js
```

**What this does:**
- Creates `/pvm/approver-email` parameter with your email
- Generates secure random secret and stores at `/pvm/jwt-secret`
- JWT secret is used to sign approval/denial callback URLs

**Verify:**
```bash
aws ssm get-parameter --name /pvm/approver-email
aws ssm get-parameter --name /pvm/jwt-secret --with-decryption
```

---

### 3. Create DynamoDB Tables

```bash
node scripts/create-tables.js
```

**What this creates:**

**Table: `pvm-requests`**
- Primary Key: `request_id` (String)
- Stores: Permission request lifecycle (PENDING → ACTIVE → REVOKED)
- Attributes: requester, permissions, status, timestamps, expiration

**Table: `pvm-allowlists`**
- Composite Key: `list_id` (String) + `resource_arn` (String)
- Stores: Authorized resources that can be requested
- Example: `{ list_id: "s3-buckets", resource_arn: "arn:aws:s3:::my-bucket" }`

**Verify:**
```bash
aws dynamodb list-tables | grep pvm
aws dynamodb describe-table --table-name pvm-requests
aws dynamodb describe-table --table-name pvm-allowlists
```

---

### 4. Create IAM Roles

#### A. Lambda Execution Role

Create base execution role for Lambda functions:

```bash
# Create trust policy
cat > /tmp/lambda-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name pvm-lambda-execution-role \
  --assume-role-policy-document file:///tmp/lambda-trust-policy.json

# Attach CloudWatch Logs policy
aws iam attach-role-policy \
  --role-name pvm-lambda-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

#### B. Lambda Permissions Policy

Create inline policy with DynamoDB, SSM, SES, Step Functions, and IAM access:

```bash
cat > /tmp/pvm-lambda-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/pvm-requests",
        "arn:aws:dynamodb:*:*:table/pvm-allowlists"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/pvm/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "states:StartExecution",
        "states:SendTaskSuccess",
        "states:SendTaskFailure"
      ],
      "Resource": "arn:aws:states:*:*:stateMachine:pvm-workflow"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole"
      ],
      "Resource": "arn:aws:iam::*:role/*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy"
      ],
      "Resource": "arn:aws:iam::*:policy/pvm-temp-*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name pvm-lambda-execution-role \
  --policy-name pvm-permissions \
  --policy-document file:///tmp/pvm-lambda-policy.json
```

**Security Note:** The IAM permissions allow grant/revoke Lambdas to attach/detach policies dynamically. These permissions are restricted to:
- Attach/detach/get role policies only for roles (not all IAM resources)
- Create policies only with `pvm-temp-*` prefix (temporary policies)
- PassRole limited to Lambda service

This prevents the Lambda from creating persistent IAM resources or escalating privileges beyond temporary grants.

#### C. Step Functions Execution Role

Create role for Step Functions to invoke Lambda:

```bash
# Create trust policy
cat > /tmp/sfn-trust-policy.json << 'EOF'
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

# Attach Lambda invocation policy
aws iam attach-role-policy \
  --role-name pvm-step-functions-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaRole
```

**Verify:**
```bash
aws iam get-role --role-name pvm-lambda-execution-role
aws iam get-role --role-name pvm-step-functions-role
```

---

### 5. Deploy Lambda Functions

Build and deploy all Lambda functions:

```bash
# Build Lambda packages
./scripts/rebuild-lambdas.sh

# Deploy all functions
./scripts/deploy-lambdas.sh
```

**What this deploys:**

| Function | Purpose | Trigger |
|----------|---------|---------|
| `pvm-api` | API Gateway handler | HTTP requests |
| `pvm-store-request` | Store request to DynamoDB | Step Functions task |
| `pvm-send-approval-email` | Send approval email via SES | Step Functions task |
| `pvm-grant-permissions` | Attach IAM policy | Step Functions task |
| `pvm-revoke-permissions` | Detach IAM policy | Step Functions task |
| `pvm-log-failure` | Log errors to DynamoDB | Step Functions error handler |

**Manual deployment (if script doesn't work):**

```bash
# Get Lambda execution role ARN
LAMBDA_ROLE_ARN=$(aws iam get-role --role-name pvm-lambda-execution-role --query 'Role.Arn' --output text)

# Deploy API Lambda
cd src
zip -r ../pvm-api.zip .
cd ..

aws lambda create-function \
  --function-name pvm-api \
  --runtime nodejs18.x \
  --role $LAMBDA_ROLE_ARN \
  --handler api.handler \
  --zip-file fileb://pvm-api.zip \
  --timeout 30 \
  --memory-size 256

# Repeat for task functions in src/tasks/
# (store-request, send-approval-email, grant-permissions, revoke-permissions, log-failure)
```

**Set environment variables:**

```bash
aws lambda update-function-configuration \
  --function-name pvm-api \
  --environment Variables="{
    REQUESTS_TABLE=pvm-requests,
    ALLOWLISTS_TABLE=pvm-allowlists
  }"

# Repeat for all Lambda functions
```

**Verify:**
```bash
aws lambda list-functions | grep pvm
aws lambda get-function --function-name pvm-api
```

---

### 6. Create Step Functions State Machine

Get Lambda ARNs and update state machine definition:

```bash
# Get ARNs
API_ARN=$(aws lambda get-function --function-name pvm-api --query 'Configuration.FunctionArn' --output text)
STORE_ARN=$(aws lambda get-function --function-name pvm-store-request --query 'Configuration.FunctionArn' --output text)
EMAIL_ARN=$(aws lambda get-function --function-name pvm-send-approval-email --query 'Configuration.FunctionArn' --output text)
GRANT_ARN=$(aws lambda get-function --function-name pvm-grant-permissions --query 'Configuration.FunctionArn' --output text)
REVOKE_ARN=$(aws lambda get-function --function-name pvm-revoke-permissions --query 'Configuration.FunctionArn' --output text)
FAILURE_ARN=$(aws lambda get-function --function-name pvm-log-failure --query 'Configuration.FunctionArn' --output text)

echo "Store: $STORE_ARN"
echo "Email: $EMAIL_ARN"
echo "Grant: $GRANT_ARN"
echo "Revoke: $REVOKE_ARN"
echo "Failure: $FAILURE_ARN"
```

**Update `docs/step-functions-state-machine.json`** with your Lambda ARNs, then create the state machine:

```bash
# Get Step Functions role ARN
SFN_ROLE_ARN=$(aws iam get-role --role-name pvm-step-functions-role --query 'Role.Arn' --output text)

# Create state machine
aws stepfunctions create-state-machine \
  --name pvm-workflow \
  --definition file://docs/step-functions-state-machine.json \
  --role-arn $SFN_ROLE_ARN
```

**Verify:**
```bash
aws stepfunctions list-state-machines | grep pvm-workflow
aws stepfunctions describe-state-machine \
  --state-machine-arn arn:aws:states:REGION:ACCOUNT:stateMachine:pvm-workflow
```

---

### 7. Create API Gateway

#### Option A: AWS Console (Recommended for First Deployment)

1. **Create REST API:**
   - Go to API Gateway Console
   - Click "Create API"
   - Choose "REST API" (not private)
   - Name: `pvm-api`
   - Click "Create"

2. **Create `/permissions` resource:**
   - Click "Create Resource"
   - Resource Name: `permissions`
   - Resource Path: `/permissions`
   - Click "Create"

3. **Create `/permissions/request` resource:**
   - Select `/permissions`
   - Click "Create Resource"
   - Resource Name: `request`
   - Resource Path: `/request`
   - Click "Create"

4. **Add POST method to `/permissions/request`:**
   - Select `/permissions/request`
   - Click "Create Method"
   - Method type: POST
   - Integration type: Lambda Function
   - Lambda Function: `pvm-api`
   - Click "Create"

5. **Create `/permissions/status` resource:**
   - Select `/permissions`
   - Click "Create Resource"
   - Resource Name: `status`
   - Click "Create"

6. **Create `{requestId}` path parameter:**
   - Select `/permissions/status`
   - Click "Create Resource"
   - Resource Name: `{requestId}`
   - Click "Create"

7. **Add GET method to `/permissions/status/{requestId}`:**
   - Select `/permissions/status/{requestId}`
   - Click "Create Method"
   - Method type: GET
   - Integration type: Lambda Function
   - Lambda Function: `pvm-api`
   - Click "Create"

8. **Create `/permissions/callback` resource:**
   - Select `/permissions`
   - Click "Create Resource"
   - Resource Name: `callback`
   - Click "Create"

9. **Add GET method to `/permissions/callback`:**
   - Select `/permissions/callback`
   - Click "Create Method"
   - Method type: GET
   - Integration type: Lambda Function
   - Lambda Function: `pvm-api`
   - Click "Create"

10. **Deploy API:**
    - Click "Deploy API"
    - Deployment stage: [New Stage] `prod`
    - Click "Deploy"

11. **Note the API URL:**
    - After deployment, you'll see: `https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod`
    - Save this URL for configuration

#### Option B: AWS CLI

```bash
# Get API Lambda ARN
API_LAMBDA_ARN=$(aws lambda get-function --function-name pvm-api --query 'Configuration.FunctionArn' --output text)

# Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name pvm-api \
  --description "Permissions Vending Machine API" \
  --query 'id' \
  --output text)

echo "API ID: $API_ID"

# Get root resource ID
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

# Create /permissions/request resource
REQUEST_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $PERM_ID \
  --path-part request \
  --query 'id' \
  --output text)

# Add POST method to /permissions/request
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $REQUEST_ID \
  --http-method POST \
  --authorization-type NONE

# Configure Lambda integration for POST /permissions/request
REGION=$(aws configure get region)
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $REQUEST_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${API_LAMBDA_ARN}/invocations"

# Create /permissions/status resource
STATUS_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $PERM_ID \
  --path-part status \
  --query 'id' \
  --output text)

# Create {requestId} path parameter resource
REQID_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $STATUS_ID \
  --path-part '{requestId}' \
  --query 'id' \
  --output text)

# Add GET method to /permissions/status/{requestId}
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $REQID_ID \
  --http-method GET \
  --authorization-type NONE \
  --request-parameters method.request.path.requestId=true

# Configure Lambda integration for GET /permissions/status/{requestId}
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $REQID_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${API_LAMBDA_ARN}/invocations"

# Create /permissions/callback resource
CALLBACK_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $PERM_ID \
  --path-part callback \
  --query 'id' \
  --output text)

# Add GET method to /permissions/callback
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $CALLBACK_ID \
  --http-method GET \
  --authorization-type NONE

# Configure Lambda integration for GET /permissions/callback
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $CALLBACK_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${API_LAMBDA_ARN}/invocations"

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
  --function-name pvm-api \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"

# Deploy API to prod stage
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod

# Get API URL
echo "API URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
```

**Update Lambda environment variables with API URL:**

```bash
API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"

aws lambda update-function-configuration \
  --function-name pvm-send-approval-email \
  --environment Variables="{API_BASE_URL=${API_URL}}"
```

**Verify:**
```bash
curl https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod/permissions/status/test
# Should return 404 or error (expected - endpoint is working)
```

---

### 8. Configure SES Email

If you're in **SES Sandbox mode** (default for new accounts), verify your approver email:

```bash
# Verify email address
aws ses verify-email-identity \
  --email-address your-email@example.com

# Check verification status
aws ses get-identity-verification-attributes \
  --identities your-email@example.com
```

You'll receive a verification email. Click the link to verify.

**For production:** Request SES production access via AWS Console (SES → Account Dashboard → Request Production Access).

**Verify:**
```bash
aws ses list-verified-email-addresses
```

---

### 9. Configure Resource Allowlists

Add authorized resources that agents can request:

```bash
# Add S3 bucket
aws dynamodb put-item \
  --table-name pvm-allowlists \
  --item '{
    "list_id": {"S": "s3-buckets"},
    "resource_arn": {"S": "arn:aws:s3:::your-bucket-name"}
  }'

# Add another resource
aws dynamodb put-item \
  --table-name pvm-allowlists \
  --item '{
    "list_id": {"S": "s3-buckets"},
    "resource_arn": {"S": "arn:aws:s3:::another-bucket"}
  }'

# Or use helper script
node scripts/update-allowlist.js add s3-buckets arn:aws:s3:::your-bucket-name
```

**Verify:**
```bash
aws dynamodb scan --table-name pvm-allowlists
```

---

### 10. Update Agent Polling Script

Configure the agent polling script with your API URL:

Edit `scripts/pvm_agent_poll.py`:

```python
# Line 22 - Update with your API Gateway URL
API_BASE = "https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/prod"
```

---

## Testing the Deployment

### End-to-End Test

```bash
# Set API URL
API_URL="https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod"

# 1. Submit test request
REQUEST_ID=$(curl -s -X POST "${API_URL}/permissions/request" \
  -H "Content-Type: application/json" \
  -d '{
    "requester_email": "test@example.com",
    "resource_arns": ["arn:aws:s3:::your-bucket-name"],
    "reason": "Deployment test",
    "duration_minutes": 5
  }' | jq -r '.request_id')

echo "Request ID: $REQUEST_ID"

# 2. Check status
curl -s "${API_URL}/permissions/status/${REQUEST_ID}" | jq .

# Expected: { "status": "PENDING", ... }

# 3. Monitor with polling script
python3 scripts/pvm_agent_poll.py "$REQUEST_ID"

# 4. Check email for approval link and click "Approve"

# 5. Polling script should detect ACTIVE status and exit

# 6. After expiration (5 min), check status again
curl -s "${API_URL}/permissions/status/${REQUEST_ID}" | jq .

# Expected: { "status": "REVOKED", ... }
```

---

## Verification Checklist

- [ ] SSM parameters created (`/pvm/approver-email`, `/pvm/jwt-secret`)
- [ ] DynamoDB tables created (`pvm-requests`, `pvm-allowlists`)
- [ ] IAM roles created (`pvm-lambda-execution-role`, `pvm-step-functions-role`)
- [ ] 6 Lambda functions deployed
- [ ] Lambda environment variables configured
- [ ] Step Functions state machine created
- [ ] API Gateway deployed with 3 endpoints
- [ ] SES email verified (if sandbox mode)
- [ ] At least one resource in allowlist
- [ ] Agent polling script configured with API URL
- [ ] End-to-end test successful

---

## Troubleshooting

### Lambda Deployment Issues

**Error: Role not found**
```bash
# Verify role exists
aws iam get-role --role-name pvm-lambda-execution-role

# If missing, create it (see Step 4)
```

**Error: Insufficient permissions**
```bash
# Verify your AWS user has required permissions
aws sts get-caller-identity
```

### API Gateway Issues

**403 Forbidden**
- Check Lambda permission for API Gateway invoke
- Verify API is deployed to `prod` stage

**404 Not Found**
- Verify routes are created correctly
- Check API Gateway deployment

### Step Functions Issues

**Execution fails immediately**
- Check Lambda ARNs in state machine definition
- Verify Step Functions role has Lambda invoke permissions
- Check CloudWatch logs for Lambda errors

### Email Issues

**Approval email not received**
- Verify SES email identity (sandbox mode)
- Check spam folder
- Check `/pvm/approver-email` SSM parameter
- Check CloudWatch logs for `pvm-send-approval-email`

**Callback doesn't work**
- Check JWT secret is configured
- Verify callback URL includes token parameter
- Check API Gateway `/permissions/callback` route

### Permission Issues

**"Resource not in allowlist"**
```bash
# Add resource to allowlist
aws dynamodb put-item \
  --table-name pvm-allowlists \
  --item '{"list_id": {"S": "s3-buckets"}, "resource_arn": {"S": "arn:aws:s3:::bucket"}}'
```

**Permissions not granted**
- Check `pvm-grant-permissions` CloudWatch logs
- Verify Lambda has IAM attach/detach permissions
- Check target IAM role exists

---

## Updating the Deployment

### Update Lambda Functions

```bash
# Rebuild packages
./scripts/rebuild-lambdas.sh

# Deploy updates
./scripts/deploy-lambdas.sh
```

Or update individually:

```bash
cd src
zip -r ../pvm-api.zip .
cd ..

aws lambda update-function-code \
  --function-name pvm-api \
  --zip-file fileb://pvm-api.zip
```

### Update Step Functions State Machine

```bash
aws stepfunctions update-state-machine \
  --state-machine-arn arn:aws:states:REGION:ACCOUNT:stateMachine:pvm-workflow \
  --definition file://docs/step-functions-state-machine.json
```

### Update API Gateway

After making changes in Console or CLI:

```bash
aws apigateway create-deployment \
  --rest-api-id YOUR-API-ID \
  --stage-name prod
```

---

## Cost Estimate

**Monthly costs for moderate usage (~100 requests/month):**

- **API Gateway:** ~$3.50/million requests = $0.00035
- **Lambda:** ~$0.20/million requests (with free tier) = minimal
- **Step Functions:** ~$25/million state transitions = $0.025
- **DynamoDB:** On-demand pricing, ~$1.25/million reads/writes = $0.001
- **SES:** ~$0.10/1000 emails = $0.01
- **SSM Parameters:** Free (standard tier)

**Total:** ~$0.04/month for light usage, scaling with volume

---

## Security Considerations

1. **IAM Permissions:** Lambda execution role has powerful IAM permissions (attach/detach policies). Restrict access to PVM infrastructure.

2. **Allowlist Management:** Only add resources to allowlist that agents should access. Regularly audit allowlist entries.

3. **JWT Secret:** Keep `/pvm/jwt-secret` secure. Rotate periodically.

4. **SES Sandbox:** In production, request SES production access to send to any email.

5. **API Access:** Consider adding authentication to API Gateway (IAM auth, API keys, or Cognito).

6. **Audit Trail:** All actions are logged to DynamoDB `pvm-requests` table. Monitor for suspicious activity.

---

## Support

- **Documentation:** See [README.md](./README.md) for architecture and usage
- **API Specification:** See [docs/api-contract.md](./docs/api-contract.md)
- **Architecture:** See [docs/architecture.md](./docs/architecture.md)

---

**Deployment complete!** Your PVM instance is ready for agent requests.
