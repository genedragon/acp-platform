# Installation Checklist

This checklist ensures you have everything needed to deploy PVM on a fresh AWS OpenClaw instance.

## Pre-Installation Verification

### 1. Environment Check
```bash
# Check Node.js version (need 18+)
node --version

# Check Python version (need 3.9+)
python3 --version

# Check AWS CLI
aws --version

# Verify AWS credentials configured
aws sts get-caller-identity
```

### 2. Required AWS Permissions
Ensure your IAM user/role has:
- ✅ Lambda (CreateFunction, UpdateFunction)
- ✅ API Gateway (CreateRestApi, CreateResource, CreateMethod)
- ✅ Step Functions (CreateStateMachine)
- ✅ DynamoDB (CreateTable, PutItem, GetItem)
- ✅ IAM (CreateRole, CreatePolicy, AttachRolePolicy)
- ✅ SES (SendEmail)
- ✅ SSM (PutParameter, GetParameter)

## Installation Steps

### Step 1: Install Dependencies ✅
```bash
cd pvm-clean-repo
npm install
```

**Verify:**
```bash
ls -la node_modules/ | head
# Should show installed packages
```

### Step 2: Configure SSM Parameters ✅
```bash
# Set approver email
aws ssm put-parameter \
  --name /pvm/approver-email \
  --value "YOUR-EMAIL@example.com" \
  --type String \
  --overwrite

# Generate JWT secret
node scripts/generate-jwt-secret.js
```

**Verify:**
```bash
aws ssm get-parameter --name /pvm/approver-email
aws ssm get-parameter --name /pvm/jwt-secret --with-decryption
```

### Step 3: Create DynamoDB Tables ✅
```bash
node scripts/create-tables.js
```

**Verify:**
```bash
aws dynamodb list-tables | grep pvm
# Should show: pvm-requests, pvm-allowlists
```

### Step 4: Create IAM Roles ✅

**Lambda Execution Role:**
```bash
# Create role with basic Lambda execution permissions
# Plus: DynamoDB, SES, SSM, IAM, Step Functions access
# See docs/iam-policy-ssm-access.json for example
```

**Step Functions Role:**
```bash
# Create role that can invoke Lambda functions
```

### Step 5: Deploy Lambda Functions ✅
```bash
./scripts/deploy-lambdas.sh
```

**Verify:**
```bash
aws lambda list-functions | grep pvm
# Should show all 6 functions
```

### Step 6: Create API Gateway ✅

**Manual (Console):**
1. Create REST API named "pvm-api"
2. Add routes:
   - POST /permissions/request
   - GET /permissions/status/{requestId}
   - GET /permissions/callback
3. Deploy to stage "prod"
4. Note the API URL

**Or use CLI:**
```bash
# See DEPLOYMENT-GUIDE.md for detailed API Gateway CLI commands
```

### Step 7: Create Step Functions State Machine ✅
```bash
# Update docs/step-functions-state-machine.json with your Lambda ARNs
aws stepfunctions create-state-machine \
  --name pvm-workflow \
  --definition file://docs/step-functions-state-machine.json \
  --role-arn arn:aws:iam::YOUR-ACCOUNT:role/pvm-step-functions-role
```

**Verify:**
```bash
aws stepfunctions list-state-machines | grep pvm-workflow
```

### Step 8: Configure Environment Variables ✅

Update Lambda function environment variables:
```bash
aws lambda update-function-configuration \
  --function-name pvm-api \
  --environment Variables="{
    REQUESTS_TABLE=pvm-requests,
    ALLOWLISTS_TABLE=pvm-allowlists,
    STATE_MACHINE_ARN=arn:aws:states:REGION:ACCOUNT:stateMachine:pvm-workflow,
    API_BASE_URL=https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod
  }"
```

### Step 9: Configure SES ✅

**If in SES Sandbox:**
```bash
# Verify approver email
aws ses verify-email-identity --email-address YOUR-EMAIL@example.com

# Check verification status
aws ses get-identity-verification-attributes \
  --identities YOUR-EMAIL@example.com
```

**Production:** Request SES production access via AWS Console.

### Step 10: Add Test Allowlist Entry ✅
```bash
# Add a test S3 bucket
node scripts/update-allowlist.js add s3-buckets arn:aws:s3:::test-bucket-name
```

**Verify:**
```bash
aws dynamodb scan --table-name pvm-allowlists
```

## Post-Installation Testing

### Test 1: API Health
```bash
curl https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod/permissions/status/test
# Should return 404 (expected - no such request)
```

### Test 2: Full Request Flow
```bash
# Make request
curl -X POST https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod/permissions/request \
  -H "Content-Type: application/json" \
  -d '{
    "requester_email": "test@example.com",
    "resource_arns": ["arn:aws:s3:::test-bucket-name"],
    "reason": "Installation test",
    "duration_minutes": 5
  }'

# Save the request_id from response
```

### Test 3: Status Check
```bash
python3 scripts/pvm_agent_poll.py <request_id>
```

### Test 4: Approve via Email
1. Check email for approval link
2. Click approve
3. Agent polling script should detect ACTIVE status

## Verification Checklist

- [ ] Node.js 18+ installed
- [ ] Python 3.9+ installed
- [ ] AWS CLI configured
- [ ] IAM permissions verified
- [ ] `npm install` completed
- [ ] SSM parameters created (approver email + JWT secret)
- [ ] DynamoDB tables created (requests + allowlists)
- [ ] IAM roles created (Lambda + Step Functions)
- [ ] Lambda functions deployed (6 total)
- [ ] API Gateway created and deployed
- [ ] Step Functions state machine created
- [ ] Lambda environment variables configured
- [ ] SES email verified (if sandbox mode)
- [ ] Test allowlist entry added
- [ ] API health test passed
- [ ] Full request flow tested
- [ ] Email approval works
- [ ] Agent polling script works

## Required Files Present

- [ ] `package.json` - Dependencies definition
- [ ] `package-lock.json` - Locked dependency versions
- [ ] `src/api.js` - Main API handler
- [ ] `src/db.js` - DynamoDB operations
- [ ] `src/validator.js` - Allowlist checking
- [ ] `src/jwt.js` - Token operations
- [ ] `src/config.js` - Configuration
- [ ] `src/tasks/*.js` - Step Functions tasks (6 files)
- [ ] `scripts/pvm_agent_poll.py` - Agent polling
- [ ] `scripts/create-tables.js` - Table setup
- [ ] `scripts/generate-jwt-secret.js` - JWT setup
- [ ] `scripts/update-allowlist.js` - Allowlist management
- [ ] `scripts/deploy-lambdas.sh` - Deployment script
- [ ] `docs/step-functions-state-machine.json` - Workflow definition
- [ ] `docs/architecture.md` - System documentation
- [ ] `README.md` - Main documentation
- [ ] `DEPLOYMENT-GUIDE.md` - Detailed deployment steps

## Common Issues

### "npm install" fails
```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### SES email not received
- Verify email address in SES (sandbox mode)
- Check spam folder
- Check SES sending limits
- Check CloudWatch logs: `/aws/lambda/pvm-send-approval-email`

### Lambda deployment fails
```bash
# Check IAM permissions
aws iam get-user
# or
aws sts get-caller-identity

# Check Lambda limits
aws service-quotas get-service-quota \
  --service-code lambda \
  --quota-code L-B99A9384
```

### API Gateway 403 errors
- Verify Lambda permissions
- Check API Gateway routes are configured
- Verify API is deployed to stage

### Step Functions execution fails
- Check Lambda function ARNs in state machine definition
- Verify Step Functions IAM role permissions
- Check CloudWatch logs for each Lambda

## Success Criteria

✅ All checklist items completed
✅ Test request returns request_id
✅ Status check returns PENDING
✅ Approval email received
✅ Agent polling script detects ACTIVE
✅ No errors in CloudWatch logs

---

**If all checks pass, your PVM installation is complete and ready for production use!**
