# aws-pvm

**AWS Permissions Vending Machine - Temporary IAM permission requests via email approval**

## Description

Request temporary IAM permissions through email approval workflow. Designed for AI agents running in OpenClaw on AWS that need time-limited elevated access to AWS resources.

The agent makes a permission request, an approver receives an email, and upon approval the agent automatically receives temporary IAM permissions that auto-revoke after expiration.

## Category

aws-infrastructure

## Tags

- aws
- iam
- permissions
- security
- temporary-access
- step-functions
- serverless
- approval-workflow

## Requirements

### For Agents (Using PVM)
- OpenClaw instance running on AWS
- Python 3.9+ (for polling script)
- PVM backend deployed (or access to deployed PVM API)

### For Deploying PVM Backend
- AWS Account with admin permissions
- AWS CLI configured
- Node.js 18+
- Lambda deployment permissions
- DynamoDB, Step Functions, API Gateway, SES access

## Installation

### As OpenClaw Skill

```bash
openclaw skills install aws-pvm
```

### From GitHub

```bash
git clone https://github.com/YOUR-ORG/aws-permissions-vending-machine.git
cd aws-permissions-vending-machine
npm install
```

## Quick Start

### Agent Usage (Request Permissions)

1. **Configure API endpoint** (in `scripts/pvm_agent_poll.py`):
   ```python
   API_BASE = "https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/prod"
   ```

2. **Request permissions:**
   ```bash
   curl -X POST $API_BASE/permissions/request \
     -H "Content-Type: application/json" \
     -d '{
       "requester_email": "agent@example.com",
       "resource_arns": ["arn:aws:s3:::my-bucket"],
       "reason": "Data upload task",
       "duration_minutes": 30
     }'
   ```

3. **Monitor status:**
   ```bash
   python3 scripts/pvm_agent_poll.py <request_id>
   ```

4. **Use granted permissions** when status becomes `ACTIVE`

### Deploying PVM Backend

See [`DEPLOYMENT-GUIDE.md`](./DEPLOYMENT-GUIDE.md) for complete deployment instructions.

## Files Overview

### For Agents
- `scripts/pvm_agent_poll.py` - **Main agent script** for monitoring permission requests
- `README.md` - Complete documentation
- `docs/api-contract.md` - API reference

### For Deployers
- `src/` - Lambda function source code
- `scripts/deploy-lambdas.sh` - Deploy all functions
- `scripts/create-tables.js` - Set up DynamoDB tables
- `docs/step-functions-state-machine.json` - Workflow definition
- `DEPLOYMENT-GUIDE.md` - Deployment instructions
- `INSTALLATION-CHECKLIST.md` - Verification checklist

## Configuration

### Agent Configuration
Update `scripts/pvm_agent_poll.py`:
```python
API_BASE = "https://your-api-id.execute-api.region.amazonaws.com/prod"
```

### Backend Configuration (SSM Parameters)
```bash
# Approver email
aws ssm put-parameter --name /pvm/approver-email --value "approver@example.com"

# JWT secret
node scripts/generate-jwt-secret.js
```

## Use Cases

- **Temporary S3 access** - Upload/download files to specific buckets
- **Database modifications** - Temporary DynamoDB write access
- **Secret retrieval** - Time-limited Secrets Manager access
- **Cross-account access** - Assume roles in other AWS accounts
- **Elevated operations** - Any IAM permission that needs approval

## Security Features

- ✅ Email-based approval (human-in-the-loop)
- ✅ JWT-signed callback URLs (prevents tampering)
- ✅ DynamoDB allowlist (only approved resources)
- ✅ Auto-revocation after expiration
- ✅ Full audit trail in DynamoDB
- ✅ Time-limited permissions (default 60 minutes)

## API Endpoints

### `POST /permissions/request`
Submit permission request

### `GET /permissions/status/{requestId}`
Check request status

### `GET /permissions/callback?token=<jwt>`
Approve/deny callback (triggered by email)

## Status Values

- `PENDING` - Awaiting approval
- `ACTIVE` - Permissions granted, ready to use
- `REVOKED` - Permissions removed (expired or denied)
- `DENIED` - Request rejected
- `FAILED` - System error

## Documentation

- [README.md](./README.md) - Complete documentation
- [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) - Deployment instructions
- [INSTALLATION-CHECKLIST.md](./INSTALLATION-CHECKLIST.md) - Verification checklist
- [docs/architecture.md](./docs/architecture.md) - System architecture
- [docs/api-contract.md](./docs/api-contract.md) - API specification

## Example Workflow

```bash
# 1. Agent requests permission
REQUEST_ID=$(curl -X POST $API_URL/permissions/request -d @request.json | jq -r .request_id)

# 2. Poll for approval
python3 scripts/pvm_agent_poll.py $REQUEST_ID

# 3. Script exits when ACTIVE - permissions ready!

# 4. Use permissions (automatic via IAM role)
aws s3 cp file.txt s3://approved-bucket/

# 5. Permissions auto-revoke after expiration
```

## For OpenClaw Integration

This skill deploys the PVM backend. The companion **pvm-use** skill provides agent-side tools.

**After deployment**, run the auto-configurator to set up all agents:

```bash
bash scripts/configure-pvm-use.sh
```

This auto-discovers the API Gateway URL and writes `config/pvm.env` into every agent workspace that has `pvm-use` installed. Zero manual config needed.

**Manual override** (if auto-discovery fails):
```bash
bash scripts/configure-pvm-use.sh --api-id YOUR-API-ID --region us-west-2
```

### Deployment configures agents automatically

`deploy-lambdas.sh` calls `configure-pvm-use.sh` as its final step, so agents are ready to use PVM immediately after deployment.

**Admin deploys (this skill):**
- Lambda functions
- Step Functions state machine
- DynamoDB tables
- API Gateway
- Auto-configures pvm-use for all agents

**Agent uses (pvm-use skill):**
- `scripts/pvm-request.sh` — Submit requests
- `scripts/pvm-poll.sh` — Wait for approval
- `scripts/pvm-client.py` — Full Python client

## Troubleshooting

### "Failed to get status"
- Check API endpoint URL in `pvm_agent_poll.py`
- Verify API Gateway is deployed

### "Request not found"
- Verify request_id format
- Check DynamoDB table exists

### "Permission denied"
- Resource not in allowlist
- Contact admin to add resource

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/YOUR-ORG/aws-permissions-vending-machine/issues)
- Documentation: [Complete docs](./README.md)

## License

MIT License - See [LICENSE](./LICENSE) file

## Author

Created for OpenClaw agents running on AWS

---

**Version:** 1.1.0  
**Last Updated:** 2026-02-24
