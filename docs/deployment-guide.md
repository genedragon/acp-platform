# Deployment Guide

## Prerequisites

Before running `deploy.sh`, you need:

1. **AWS Account** with:
   - Bedrock model access enabled in target region ([Enable Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html))
   - EC2 key pair created in target region
   - IAM permissions: EC2, CloudFormation, IAM, S3, Bedrock

2. **AWS CLI** configured:
   ```bash
   aws configure
   # or use AWS IAM Identity Center (SSO)
   ```

3. **Git** and **bash** (Linux/macOS/WSL)

---

## Quick Deploy

```bash
git clone https://github.com/genedragon/acp-platform.git
cd acp-platform

# Personal mode (single user)
./deploy.sh --mode=personal --key-pair=YOUR_KEY_PAIR_NAME

# Team mode (org collaboration)
./deploy.sh --mode=team --key-pair=YOUR_KEY_PAIR_NAME

# Event mode (temporary deployment)
./deploy.sh --mode=event --key-pair=YOUR_KEY_PAIR_NAME
```

---

## Step-by-Step Guide

### Phase 1: Infrastructure (CloudFormation)

The `deploy.sh` script deploys `cloud/aws/cloudformation/acp-stack.yaml`.

This creates:
- VPC with public subnet
- EC2 instance (Graviton ARM t4g.large — 20-40% cheaper than x86)
- IAM role with Bedrock + S3 access
- Security Group (HTTPS 443 inbound; SSM for shell access — no port 22)
- S3 bucket for file storage

**Expected time:** ~5-8 minutes

### Phase 2: OpenClaw Setup

OpenClaw is automatically installed via EC2 user-data script.

**Verify:**
```bash
# Connect via SSM (no SSH key required)
aws ssm start-session --target INSTANCE_ID --region REGION

# Check OpenClaw status
openclaw status
```

### Phase 3: Zulip Installation

Zulip runs on the same EC2 instance (or separate instance for team/event modes).

**Native install (recommended):**
```bash
# Connect to EC2
aws ssm start-session --target INSTANCE_ID

# Follow Zulip native install
sudo apt update && sudo apt install -y curl
curl -fLO https://download.zulip.com/server/zulip-server-latest.tar.gz
# ... (see docs/zulip-native-install.md for full guide)
```

**Expected time:** ~15-20 minutes

### Phase 4: Connect Zulip ↔ OpenClaw

Install the `openclaw-zulip` plugin:

```bash
# On EC2
cd /home/ubuntu
git clone https://github.com/genedragon/openclaw-zulip.git
cd openclaw-zulip
npm install

# Create Zulip bot and get API key from Zulip admin panel
# Configure .zuliprc (NOT committed to git)
cp .zuliprc.example .zuliprc
# Edit .zuliprc with your bot credentials

# Start bridge
npm start
# Or: sudo systemctl enable --now openclaw-zulip-bridge
```

### Phase 5: Install Skills

```bash
# Copy skills to OpenClaw workspace
cp -r skills/s3-files ~/.openclaw/skills/
cp -r skills/webmaster ~/.openclaw/skills/
cp -r skills/pvm-use ~/.openclaw/skills/

# Configure s3-files skill
cd ~/.openclaw/skills/s3-files
cp config.json.example config.json
# Edit config.json with your S3 bucket name (no secrets!)
```

### Phase 6: Deploy PVM (team/event modes)

```bash
# See skills/pvm-deploy/SKILL.md for full guide
cd skills/pvm-deploy

# Configure approver email in SSM (not in code)
aws ssm put-parameter \
  --name /pvm/approver-email \
  --value "your-email@example.com" \
  --type String

# Deploy PVM backend
./scripts/deploy-lambdas.sh
```

---

## Post-Deployment Checklist

- [ ] Zulip accessible at your domain/IP
- [ ] OpenClaw gateway running (`openclaw status`)
- [ ] Bridge connected (Zulip bot active in channels)
- [ ] Test: mention bot in Zulip → response received
- [ ] S3 files skill configured (bucket name set)
- [ ] PVM deployed (team/event modes)
- [ ] SSL certificate installed (Let's Encrypt recommended)
- [ ] Admin account MFA enabled
- [ ] Default passwords changed

---

## Teardown

```bash
# Remove entire CloudFormation stack
aws cloudformation delete-stack \
  --stack-name acp-platform \
  --region us-west-2

# This removes: EC2, VPC, IAM roles, Security Groups
# S3 bucket must be emptied first:
aws s3 rm s3://YOUR_BUCKET --recursive
aws s3 rb s3://YOUR_BUCKET
```

---

## Troubleshooting

See [docs/troubleshooting.md](troubleshooting.md) (coming soon).

Common issues:
- **Bedrock access denied:** Enable models in AWS Bedrock console for your region
- **Zulip can't send email:** Configure SES (see [docs/ses-setup.md](ses-setup.md))
- **Bridge not connecting:** Check `.zuliprc` credentials and bot API key
- **PVM approval emails not arriving:** Verify SES sender is verified
