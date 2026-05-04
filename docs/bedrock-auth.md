# Bedrock Authentication

ACP uses Amazon Bedrock for LLM inference. This guide covers model access setup and the authentication chain for OpenClaw on EC2.

---

## Step 1: Request Model Access (Required — Console Only)

> ⚠️ **This step cannot be done via AWS CLI or API.** It requires the AWS Console. An AI agent executing this plan will need a human to complete this step.

> ⚠️ **Model access is per-region and per-account.** If deploying into a new AWS account or region, you must request access even if you had it elsewhere.

### Procedure (as of May 2026)

1. Open the **[Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)** in your target region
2. Navigate to **Model catalog** (left sidebar)
3. Click on any **Anthropic Claude** model (e.g., Claude Opus 4.7)
4. You will see a yellow banner:

   > *"Anthropic requires first-time customers to submit use case details before invoking a model, once per account or once at the organization's management account."*

5. Click **"Submit use case details"** and complete the form
6. Wait for access to be granted (usually instant, can take up to a few minutes)

### Recommended Models

| Model | Model ID | Use Case |
|-------|----------|----------|
| **Claude Haiku 4.5** | `anthropic.claude-haiku-4-5-20251001-v1:0` | Fast agent, low cost |
| **Claude Sonnet 4** | `anthropic.claude-sonnet-4-20250514-v1:0` | Balanced quality/speed |
| **Claude Opus 4.6** | `us.anthropic.claude-opus-4-6-v1` | Deep thinking, complex analysis |

> **Tip:** Also enable the `global.` prefixed cross-region inference variants (e.g., `global.anthropic.claude-haiku-4-5-20251001-v1:0`). These provide automatic regional failover.

### Verify Model Access (from EC2)

```bash
aws bedrock get-foundation-model \
  --model-identifier anthropic.claude-haiku-4-5-20251001-v1:0 \
  --region us-east-1 \
  --query 'modelDetails.modelName' --output text
# Expected: a model name (not an access denied error)
```

---

## Step 2: EC2 Credential Configuration

### The Problem

OpenClaw ≥2026.4.x changed how it discovers AWS credentials. On EC2 with an instance role but no explicit environment variables, the auth **pre-check fails** even though the AWS SDK would eventually resolve credentials via the instance metadata service.

**Symptom:** Bots connect to Zulip successfully, but every DM returns:
```
No API key found for amazon-bedrock.
Use /login or set an API key environment variable.
```

### The Fix (Two Parts)

**Part 1: Create `~/.aws/config`**

```bash
mkdir -p ~/.aws
cat > ~/.aws/config << 'EOF'
[default]
region = us-east-1
credential_source = Ec2InstanceMetadata
EOF
```

**Part 2: Set `AWS_PROFILE=default` in the systemd service**

This is already included in the [deployment guide](deployment-guide.md#63-create-systemd-service) systemd service file:

```ini
Environment=AWS_PROFILE=default
Environment=AWS_REGION=us-east-1
Environment=AWS_DEFAULT_REGION=us-east-1
```

### Why This Works

OpenClaw's auth resolver checks in order:

```
resolveAwsSdkAuthInfo() checks:
  1. AWS_BEARER_TOKEN_BEDROCK → explicit bearer token
  2. AWS_ACCESS_KEY_ID + SECRET → explicit IAM keys
  3. AWS_PROFILE → named profile (triggers SDK chain) ← USE THIS ON EC2
  4. Fall through → "aws-sdk default chain"
```

A separate `hasConfiguredAuth()` pre-check validates that one of these env vars is set **before** the SDK ever tries to resolve credentials. On EC2 with only an instance role (no env vars), this pre-check fails at step 4.

Setting `AWS_PROFILE=default` satisfies step 3. The `credential_source = Ec2InstanceMetadata` in `~/.aws/config` tells the SDK to use the EC2 instance role for actual credential resolution.

---

## Troubleshooting

### "No API key found for amazon-bedrock"

1. Check `~/.aws/config` exists with `credential_source = Ec2InstanceMetadata`
2. Check systemd service has `AWS_PROFILE=default` in Environment
3. Restart: `systemctl --user restart openclaw-gateway`
4. Test: send a DM to the bot (not just check Zulip connectivity)

### "Access denied" on Bedrock API calls

1. Verify IAM instance role has `bedrock:InvokeModel` permission
2. Verify model access was requested in the Bedrock console
3. Verify you're in the correct region

### "Could not resolve credentials"

1. Verify the instance has an IAM instance profile attached:
   ```bash
   curl -s http://169.254.169.254/latest/meta-data/iam/info | jq .InstanceProfileArn
   ```
2. Verify `aws sts get-caller-identity` returns valid output
