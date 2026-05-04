# webmaster Agent

**Static site deployment and management via S3 and CloudFront.**

webmaster handles the full lifecycle of static websites: building, validating, deploying to S3, managing CloudFront CDN distributions, and monitoring site health. DM it a request like "deploy a landing page for our project" and it builds, uploads, and returns a live URL.

## What It Does

- **Site deployment** — Upload HTML/CSS/JS to S3, serve via CloudFront CDN
- **Build pipeline** — Validate HTML, minify assets, check for broken links
- **Cache management** — Create CloudFront invalidations after deploys
- **Multi-site support** — Manage multiple sites in a single S3 bucket with path prefixes
- **Health monitoring** — Check site availability, SSL status, CDN cache hit ratios
- **DNS guidance** — Advise on custom domain setup (Route 53 or external DNS)

## Requirements

### Model

| Setting | Value |
|---------|-------|
| **Recommended** | `amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| **Why Haiku** | Fast for iterative deploy/test cycles, low cost |

### Skills

| Skill | Source | Purpose |
|-------|--------|---------|
| `webmaster` | `skills/webmaster/` | Site scaffolding, build, deploy, health checks |
| `s3-files` | `skills/s3-files/` | S3 file upload/download via pre-signed URLs |

### AWS Infrastructure

webmaster requires its own AWS resources beyond the base ACP stack:

| Resource | Purpose | Provisioned By |
|----------|---------|---------------|
| **S3 Bucket** | Site content storage (private, no public access) | `infra/webmaster-stack.yaml` |
| **CloudFront Distribution** | CDN with HTTPS, caching, global edge locations | `infra/webmaster-stack.yaml` |
| **Origin Access Control (OAC)** | Secure S3→CloudFront access (no public bucket) | `infra/webmaster-stack.yaml` |
| **IAM Policy** | S3 + CloudFront permissions for the agent | `permissions/iam-policy.json` |

**Estimated monthly cost:** ~$1–5/month for low-traffic sites (S3 storage + CloudFront requests).

### Zulip

| Setting | Value |
|---------|-------|
| Bot account required | Yes |
| Zulip role | Member (no admin needed) |
| Recommended channels | `🌐 websites`, `📊 deployments` |

## Setup

### 1. Deploy Infrastructure

Deploy the CloudFormation stack for webmaster's AWS resources:

```bash
aws cloudformation deploy \
  --template-file agents/webmaster/infra/webmaster-stack.yaml \
  --stack-name acp-webmaster \
  --region YOUR-REGION \
  --parameter-overrides BucketNamePrefix=acp-sites \
  --capabilities CAPABILITY_IAM

# Get the outputs
aws cloudformation describe-stacks \
  --stack-name acp-webmaster \
  --query "Stacks[0].Outputs" \
  --output table
```

Save the outputs:
- **BucketName** — the S3 bucket name (e.g., `acp-sites-123456789012`)
- **CloudFrontDomain** — the CDN URL (e.g., `d1234abcdef.cloudfront.net`)
- **DistributionId** — for cache invalidations

### 2. Add IAM Policy to Instance Role

Attach the webmaster IAM policy to the EC2 instance role:

```bash
# Get the instance role name from the base ACP stack
ROLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name acp-platform \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceRoleName'].OutputValue" \
  --output text)

# Attach the webmaster policy
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name acp-webmaster-policy \
  --policy-document file://agents/webmaster/permissions/iam-policy.json
```

> ⚠️ **Edit `iam-policy.json` first** — replace `YOUR-BUCKET-NAME` with the actual BucketName from step 1.

### 3. Create Zulip Bot

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'PYEOF'
from zerver.lib.users import create_user
from zerver.models import Realm, UserProfile

realm = Realm.objects.get(id=2)
bot = create_user(
    email='webmaster-bot@YOUR-DOMAIN',
    password=[REDACTED_PASSWORD]
    realm=realm,
    full_name='webmaster',
    acting_user=None
)
bot.is_bot = True
bot.bot_type = UserProfile.DEFAULT_BOT
bot.delivery_email = 'webmaster-bot@YOUR-DOMAIN'
bot.save()
print(f"API Key: {bot.api_key}")
PYEOF
```

### 4. Add to openclaw.json

Merge [agent-config.json](agent-config.json) into `~/.openclaw/openclaw.json`.

**Add to `agents.list[]`:**
```json
{
  "id": "webmaster",
  "name": "webmaster",
  "workspace": "~/.openclaw/workspace-webmaster",
  "model": {
    "primary": "amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0"
  }
}
```

**Add to `channels.zulip.accounts`:**
```json
"webmaster": {
  "botEmail": "webmaster-bot@YOUR-DOMAIN",
  "botToken": "YOUR-WEBMASTER-BOT-API-KEY",
  "dmPolicy": "open",
  "allowFrom": ["*"],
  "groupPolicy": "open"
}
```

**Add to `bindings[]`:**
```json
{
  "agentId": "webmaster",
  "match": { "channel": "zulip", "accountId": "webmaster" }
}
```

### 5. Configure the webmaster Skill

```bash
cp -r skills/webmaster ~/.openclaw/skills/
cp -r skills/s3-files ~/.openclaw/skills/

# Configure s3-files with the bucket name from step 1
cd ~/.openclaw/skills/s3-files
cp config.json.example config.json
# Edit config.json — set "bucket" to the BucketName from CloudFormation output
```

### 6. Create Workspace & Restart

```bash
mkdir -p ~/.openclaw/workspace-webmaster
cp agents/webmaster/IDENTITY.md ~/.openclaw/workspace-webmaster/SOUL.md

systemctl --user restart openclaw-gateway
sleep 5
journalctl --user -u openclaw-gateway --no-pager -n 20
# Look for: "connected as webmaster"
```

### 7. Test

DM **webmaster** in Zulip:

> "Create a simple landing page that says 'Hello from ACP' and deploy it."

It should build an HTML page, upload to S3, create a CloudFront invalidation, and return the live URL.
