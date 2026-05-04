# Deployment Guide

> **Estimated time:** ~90 minutes (fresh deploy)  
> **Monthly cost:** $16–33 (single EC2 t4g.large)  
> **Audience:** Human operators or autonomous agents with SSH + AWS access

This guide walks through deploying an ACP instance from scratch. It is designed for both humans and coding agents — every phase ends with a checkpoint that includes verify commands, pass/fail criteria, and a rollback path.

**Two deployment paths:**

| Path | When to Use |
|------|-------------|
| `./deploy.sh --mode=personal` | Happy path — automates Phase 0 (CloudFormation) |
| This guide (manual) | When you need full control, or when `deploy.sh` fails at any phase |

The script handles AWS infrastructure (Phase 0). Phases 1–8 run on the EC2 instance via SSH and are documented here.

---

## Prerequisites

1. **AWS Account** with:
   - Bedrock model access enabled ([see bedrock-auth.md](bedrock-auth.md))
   - EC2 key pair created in target region
   - IAM permissions: EC2, CloudFormation, IAM, S3, Bedrock

2. **AWS CLI** configured:
   ```bash
   aws configure
   aws sts get-caller-identity  # Must succeed
   ```

3. **Domain name** — choose before starting. See [dns-and-ssl.md](dns-and-ssl.md) for setup.

4. **Git** and **bash** (Linux/macOS/WSL)

---

## Summary Flow

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
AWS Infra    Verify       Zulip       Zulip       Node.js +
(deploy.sh)  EC2+SSH      Server      Config      OpenClaw
                          Install     (org,bots)  Install

Phase 5 ──► Phase 6 ──► Phase 7 ──► Phase 8 ──► ✅ Done
Zulip        OpenClaw    SSL/TLS     Verify &
Plugin       Config +    (Let's      Smoke
Install      systemd     Encrypt)    Test
```

| Phase | What | Time | Key Output |
|-------|------|------|------------|
| **0** | AWS Infrastructure + Bedrock Model Access | 15 min | EC2, SG, IAM role, EIP |
| **1** | Verify EC2 + SSH | 5 min | SSH access confirmed |
| **2** | Install Zulip Server | 15 min | Zulip on ports 80/443 |
| **3** | Configure Zulip | 10 min | Org, admin user, bot accounts |
| **4** | Install OpenClaw | 5 min | `openclaw` binary on PATH |
| **5** | Install Zulip Plugin | 10 min | Plugin in extensions dir with symlinks |
| **6** | Configure OpenClaw + systemd | 10 min | Gateway running on 127.0.0.1:18789 |
| **7** | SSL/TLS | 5 min | Let's Encrypt cert active |
| **8** | Verify & Smoke Test | 10 min | Bots responding to DMs and @mentions |

---

## Permissions & Access Requirements

### AWS Permissions (for Phase 0)

| Service | Actions Required | Purpose |
|---------|-----------------|---------|
| **EC2** | `RunInstances`, `DescribeInstances`, `DescribeImages`, `CreateSecurityGroup`, `AuthorizeSecurityGroupIngress`, `AllocateAddress`, `AssociateAddress`, `CreateKeyPair` | Launch instance, networking |
| **IAM** | `CreateRole`, `PutRolePolicy`, `CreateInstanceProfile`, `AddRoleToInstanceProfile`, `PassRole` | Instance role for Bedrock |
| **CloudFormation** | `CreateStack`, `DescribeStacks`, `CreateChangeSet`, `ExecuteChangeSet` | If using `deploy.sh` |
| **Bedrock** | (on the *instance role*) `InvokeModel`, `InvokeModelWithResponseStream`, `ListFoundationModels` | LLM inference at runtime |
| **S3** | (optional) `GetObject`, `PutObject`, `ListBucket` | File storage, backups |

### Instance-Level Permissions (Phases 1–8)

| Requirement | Details |
|-------------|---------|
| **SSH Access** | Key pair for `ubuntu@<EIP>` — port 22 open in SG |
| **sudo/root** | Zulip installer requires root |
| **Outbound Internet** | Download Zulip, OpenClaw (npm), GitHub clone, Let's Encrypt ACME |
| **Ports Open** | 22 (SSH), 80 (HTTP — Let's Encrypt + redirect), 443 (HTTPS — Zulip UI) |

### Agent-Specific Notes

| Requirement | Details |
|-------------|---------|
| SSH tool access | Agent must be able to execute shell commands on the target EC2 |
| **No human approval needed** for Phases 0–6 | Idempotent infrastructure steps |
| **Human approval recommended** for Phase 7–8 | DNS cutover and final verification |
| **Bedrock model access requires AWS Console** | Cannot be done via CLI — see [bedrock-auth.md](bedrock-auth.md) |

---

## Phase 0: AWS Infrastructure (~15 min)

### Option A: Use deploy.sh (recommended)

```bash
git clone https://github.com/genedragon/acp-platform.git
cd acp-platform
./deploy.sh --mode=personal --key-pair=YOUR_KEY_PAIR_NAME
```

The script creates a CloudFormation stack with: VPC, EC2 (t4g.large ARM/Graviton), IAM role with Bedrock + S3 access, Security Group, S3 bucket.

### Option B: Manual (if deploy.sh fails or you need custom setup)

#### 0.1 Create Security Group

```bash
SG_ID=$(aws ec2 create-security-group \
  --group-name acp-sg \
  --description "ACP instance security group" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0
```

#### 0.2 Create IAM Role for Bedrock

```bash
cat > /tmp/ec2-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

cat > /tmp/bedrock-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:ListFoundationModels",
      "bedrock:GetFoundationModel"
    ],
    "Resource": "*"
  }]
}
EOF

aws iam create-role --role-name acp-ec2-role \
  --assume-role-policy-document file:///tmp/ec2-trust-policy.json
aws iam put-role-policy --role-name acp-ec2-role \
  --policy-name acp-bedrock-policy \
  --policy-document file:///tmp/bedrock-policy.json
aws iam create-instance-profile --instance-profile-name acp-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name acp-profile --role-name acp-ec2-role

sleep 10  # IAM propagation
```

#### 0.3 Allocate Elastic IP

```bash
EIP_ALLOC=$(aws ec2 allocate-address --query 'AllocationId' --output text)
EIP_IP=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" \
  --query 'Addresses[0].PublicIp' --output text)

echo "Set DNS A record: YOUR-DOMAIN → $EIP_IP"
```

#### 0.4 Request Bedrock Model Access

This **requires the AWS Console** — see [bedrock-auth.md](bedrock-auth.md) for the full procedure.

#### 0.5 Launch EC2

```bash
AMI_ID=$(aws ec2 describe-images --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t4g.large \
  --key-name YOUR_KEY_PAIR_NAME \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name=acp-profile \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC"
```

### ✅ Checkpoint 0

```bash
aws ec2 describe-instances --instance-ids YOUR-INSTANCE-ID \
  --query 'Reservations[0].Instances[0].State.Name' --output text
# Expected: running

dig +short YOUR-DOMAIN
# Expected: YOUR-ELASTIC-IP
```

**Pass criteria:** Instance is running, DNS resolves to the Elastic IP.  
**If failed:** See [troubleshooting.md#phase-0](troubleshooting.md#phase-0).  
**Rollback:** `aws ec2 terminate-instances --instance-ids YOUR-INSTANCE-ID`

---

## Phase 1: Verify EC2 + SSH (~5 min)

```bash
ssh -i ~/.ssh/YOUR_KEY.pem ubuntu@YOUR-ELASTIC-IP "echo OK && uname -m"
# Expected: OK
#           aarch64
```

### ✅ Checkpoint 1

```bash
ssh -i ~/.ssh/YOUR_KEY.pem ubuntu@YOUR-ELASTIC-IP "echo OK && uname -m"
# Expected: OK and aarch64
```

**Pass criteria:** SSH connects, architecture is `aarch64` (ARM/Graviton).  
**If failed:** Check security group port 22, key pair name, Elastic IP association.  
**Rollback:** Instance is disposable — terminate and restart from Phase 0.

---

## Phase 2: Install Zulip Server (~15 min)

> All commands from here run **on the EC2 instance** via SSH.

```bash
ssh -i ~/.ssh/YOUR_KEY.pem ubuntu@YOUR-ELASTIC-IP
```

### 2.1 System Prep

```bash
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
sudo apt-get install -y -qq curl wget git unzip jq
```

### 2.2 Download & Install Zulip

```bash
cd /tmp
curl -fLO "https://download.zulip.com/server/zulip-server-11.6.tar.gz"
tar xzf zulip-server-11.6.tar.gz
cd zulip-server-11.6

sudo scripts/setup/install \
  --hostname=YOUR-DOMAIN \
  --email=admin@example.com \
  --self-signed-cert \
  --no-push-notifications \
  --postgresql-version=16
```

> ⚠️ **Critical rules:**
>
> | Rule | Why |
> |------|-----|
> | Use `scripts/setup/install` (NOT `./install`) | Different binary at root level — causes cryptic errors |
> | Use `--postgresql-version=16` | PG18 has `io_uring` memory issues on ARM/Graviton |
> | Do NOT pre-install PostgreSQL | Zulip installs its own; pre-installed PG causes conflicts |
> | Ignore the one-time org creation link | We configure Zulip in Phase 3 via Django shell |

### ✅ Checkpoint 2

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "print('Zulip OK')"
# Expected: Zulip OK

psql --version
# Expected: psql (PostgreSQL) 16.x (NOT 18.x)
```

**Pass criteria:** Both commands succeed as shown.  
**If failed:** See [troubleshooting.md#phase-2](troubleshooting.md#phase-2).  
**Rollback:** Instance is disposable — terminate and restart from Phase 0.

---

## Phase 3: Configure Zulip (~10 min)

### 3.1 Create Organization & Admin User

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'PYEOF'
from zerver.lib.users import create_user
from zerver.models import Realm
realm = Realm.objects.get(id=2)
create_user(
    email='admin@example.com',
    password='YOUR-ADMIN-PASSWORD',
    realm=realm,
    full_name='Admin',
    acting_user=None
)
print("Admin user created")
PYEOF
```

### 3.2 Create Bot User(s)

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'PYEOF'
from zerver.lib.users import create_user
from zerver.models import Realm, UserProfile
realm = Realm.objects.get(id=2)

bot = create_user(
    email='bot@YOUR-DOMAIN',
    password='unused',
    realm=realm,
    full_name='MyBot',
    acting_user=None
)
bot.is_bot = True
bot.save()
print(f"Bot created. API Key: {bot.api_key}")
# >>> SAVE THIS API KEY — you need it in Phase 6
PYEOF
```

> For creating **human users** without email invitations, see [user-management.md](user-management.md).

### 3.3 Set RealmDomain Mapping (CRITICAL for auth)

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "
from zerver.models import Realm, RealmDomain
realm = Realm.objects.get(id=2)
rd, created = RealmDomain.objects.get_or_create(realm=realm, domain='YOUR-DOMAIN')
print(f'RealmDomain: {rd.domain} (created={created})')
"
```

> ⚠️ **Auth chain:** `hostname → RealmDomain → Realm → get_user_by_delivery_email() → check_password()`  
> If any link is broken, users/bots get "user not found." The RealmDomain mapping is the most commonly missed step.

### ✅ Checkpoint 3

```bash
# Log in as admin at https://YOUR-DOMAIN (self-signed cert — accept the warning)
# Verify the bot API key was printed and saved
```

**Pass criteria:** Admin can log in at `https://YOUR-DOMAIN`. Bot API key is saved.  
**If failed:** See [troubleshooting.md#phase-3](troubleshooting.md#phase-3).  
**Rollback:** Re-run the Django shell commands — they are idempotent.

---

## Phase 4: Install OpenClaw (~5 min)

### 4.1 Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
node --version  # Must show v22.x.x
```

### 4.2 Install OpenClaw

```bash
sudo npm install -g --prefix /usr/local openclaw@latest

openclaw --version
which openclaw   # Must be /usr/local/bin/openclaw
```

> **Note:** Use `--prefix /usr/local` to isolate from Zulip's bundled Node.js.

### 4.3 Configure AWS Credentials for Bedrock

> ⚠️ **Required for OpenClaw ≥2026.4.x.** Without this, bots connect to Zulip but fail on every LLM call. See [bedrock-auth.md](bedrock-auth.md) for the full explanation.

```bash
mkdir -p ~/.aws
cat > ~/.aws/config << 'EOF'
[default]
region = us-east-1
credential_source = Ec2InstanceMetadata
EOF

# Verify
aws sts get-caller-identity
```

### ✅ Checkpoint 4

```bash
openclaw --version
# Expected: OpenClaw 2026.x.x

which openclaw
# Expected: /usr/local/bin/openclaw

aws sts get-caller-identity
# Expected: returns account info (no error)
```

**Pass criteria:** All three commands succeed.  
**If failed:** See [troubleshooting.md#phase-4](troubleshooting.md#phase-4).  
**Rollback:** `sudo npm uninstall -g --prefix /usr/local openclaw`

---

## Phase 5: Install Zulip Plugin (~10 min)

### 5.1 Clone Plugin

```bash
cd /tmp
git clone https://github.com/genedragon/openclaw-zulip.git

mkdir -p ~/.openclaw/extensions
cp -r /tmp/openclaw-zulip ~/.openclaw/extensions/zulip
```

### 5.2 Install Peer Dependencies

```bash
cd ~/.openclaw/extensions/zulip
npm install @sinclair/typebox zod
```

### 5.3 Create Symlinks

> ⚠️ Use `rm -rf` (not `rm -f`) — `npm install` creates real directories that block symlink creation.

```bash
OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
mkdir -p node_modules

rm -rf node_modules/zod node_modules/openclaw

ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw/node_modules/zod" node_modules/zod
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw" node_modules/openclaw

# Verify
ls -la node_modules/zod       # Should be a symlink
ls -la node_modules/openclaw  # Should be a symlink
ls node_modules/openclaw/package.json  # Should exist
```

### 5.4 (Optional) Install Companion Skills

```bash
cp -r /tmp/openclaw-zulip/skills ~/.openclaw/skills/zulip
cp -r /tmp/openclaw-zulip/skill-admin ~/.openclaw/skills/zulip-admin
```

### ✅ Checkpoint 5

```bash
ls ~/.openclaw/extensions/zulip/openclaw.plugin.json
# Expected: file exists

ls -la ~/.openclaw/extensions/zulip/node_modules/openclaw
# Expected: symlink pointing to openclaw installation

ls ~/.openclaw/extensions/zulip/node_modules/openclaw/package.json
# Expected: file exists (symlink resolves)
```

**Pass criteria:** Plugin config exists, symlinks resolve correctly.  
**If failed:** See [troubleshooting.md#phase-5](troubleshooting.md#phase-5).  
**Rollback:** `rm -rf ~/.openclaw/extensions/zulip` and start Phase 5 over.

---

## Phase 6: Configure OpenClaw + systemd (~10 min)

### 6.1 Create OpenClaw Config

```bash
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "channels": {
    "zulip": {
      "enabled": true,
      "baseUrl": "https://YOUR-DOMAIN",
      "chatmode": "oncall",
      "accounts": {
        "default": {
          "botEmail": "bot@YOUR-DOMAIN",
          "botToken": "YOUR-BOT-API-KEY",
          "dmPolicy": "open",
          "allowFrom": ["*"],
          "groupPolicy": "open"
        }
      }
    }
  },
  "gateway": {
    "mode": "local",
    "bind": "127.0.0.1",
    "port": 18789
  },
  "agents": {
    "defaults": {
      "model": "amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0"
    }
  }
}
EOF

chmod 600 ~/.openclaw/openclaw.json
```

> ⚠️ **`gateway.mode` MUST be `"local"`** — the gateway refuses to start without it.

### 6.2 Self-Referencing DNS (CRITICAL)

```bash
echo "127.0.0.1 YOUR-DOMAIN" | sudo tee -a /etc/hosts
```

> EC2 instances cannot route to their own public IP. OpenClaw needs to reach Zulip at the same hostname via localhost.

### 6.3 Create systemd Service

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/openclaw-gateway.service << 'EOF'
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h
ExecStart=/usr/local/bin/openclaw gateway start
Restart=always
RestartSec=10
Environment=HOME=/home/ubuntu
Environment=AWS_PROFILE=default
Environment=AWS_REGION=us-east-1
Environment=AWS_DEFAULT_REGION=us-east-1

[Install]
WantedBy=default.target
EOF
```

> ⚠️ **`AWS_PROFILE=default` is required** for OpenClaw ≥2026.4.x. See [bedrock-auth.md](bedrock-auth.md) for why.

### 6.4 Enable & Start

```bash
loginctl enable-linger ubuntu

systemctl --user daemon-reload
systemctl --user enable openclaw-gateway
systemctl --user start openclaw-gateway

sleep 5
systemctl --user status openclaw-gateway
```

### ✅ Checkpoint 6

```bash
systemctl --user status openclaw-gateway
# Expected: active (running)

journalctl --user -u openclaw-gateway --no-pager -n 20 | grep -i "zulip"
# Expected: "Zulip ON · OK" or "Event queue registered"
```

**Pass criteria:** Gateway is `active (running)` and Zulip plugin loaded.  
**If failed:** See [troubleshooting.md#phase-6](troubleshooting.md#phase-6).  
**Rollback:** `systemctl --user stop openclaw-gateway` — safe to restart after fixing config.

---

## Phase 7: SSL/TLS (~5 min)

> **Prerequisite:** DNS A record must point to the Elastic IP. See [dns-and-ssl.md](dns-and-ssl.md).  
> **Port 80 must be open** in the security group — Let's Encrypt ACME HTTP-01 challenge requires it.

```bash
sudo /home/zulip/deployments/current/scripts/setup/setup-certbot \
  --hostname=YOUR-DOMAIN --email=admin@example.com
```

### ✅ Checkpoint 7

```bash
curl -s https://YOUR-DOMAIN/api/v1/server_settings | jq .zulip_version
# Expected: "11.6" (or your Zulip version)
```

**Pass criteria:** HTTPS works and returns valid Zulip version.  
**If failed:** See [dns-and-ssl.md#troubleshooting](dns-and-ssl.md#troubleshooting) — most common cause is port 80 blocked or Cloudflare proxy enabled during cert issuance.  
**Rollback:** Zulip continues to work on the self-signed cert. No damage from a failed certbot attempt.

---

## Phase 8: Verify & Smoke Test (~10 min)

### 8.1 Service Health Checks

```bash
# Zulip API
curl -s https://YOUR-DOMAIN/api/v1/server_settings | jq .zulip_version

# OpenClaw Gateway
curl -s http://127.0.0.1:18789/health

# PostgreSQL
sudo -u postgres psql -c "SELECT 1"

# Gateway logs
journalctl --user -u openclaw-gateway --no-pager -n 50
```

**Good signs in logs:**
- `"Zulip ON · OK"`
- `"Event queue registered"`
- `"connected as YourBotName"`

**Bad signs — see [troubleshooting.md](troubleshooting.md):**
- `"plugin-sdk"` errors → symlinks wrong (Phase 5)
- `"createDedupeCache"` → old plugin code loaded
- `"No API key found for amazon-bedrock"` → missing AWS_PROFILE ([bedrock-auth.md](bedrock-auth.md))

### 8.2 Functional Tests

| Test | Action | Expected |
|------|--------|----------|
| **DM Response** | Send DM to bot: "Hello, what version are you running?" | Bot responds coherently |
| **Channel @Mention** | In any channel: `@**BotName** ping` | Bot responds to the mention |
| **Session Persistence** | Send 3–4 follow-up messages in DM | Bot maintains context |
| **No Deprecation Warnings** | `journalctl --user -u openclaw-gateway -n 100 \| grep -i deprecated` | No COMPAT_DEPRECATED |

### 8.3 Record Deployment

```bash
cat > ~/deployment-record-$(date +%Y%m%d).md << EOF
# ACP Deployment Record

**Date:** $(date)
**Domain:** YOUR-DOMAIN
**Instance:** $(curl -s http://169.254.169.254/latest/meta-data/instance-id)
**OpenClaw:** $(openclaw --version)
**Zulip:** $(curl -s https://YOUR-DOMAIN/api/v1/server_settings 2>/dev/null | jq -r .zulip_version)
**PostgreSQL:** $(psql --version | head -1)
**Node.js:** $(node --version)

## Test Results
- [ ] DM response works
- [ ] @mention response works
- [ ] Session persistence works
- [ ] No deprecation warnings
- [ ] SSL certificate active
EOF
```

### ✅ Checkpoint 8

**Pass criteria:** Bot responds to DMs and @mentions. All health checks pass.  
**If failed:** See [troubleshooting.md](troubleshooting.md).  
**Deployment is complete.** 🎉

---

## Multi-Agent Configuration (Optional)

To run multiple bots with different models:

```json
{
  "agents": {
    "defaults": {
      "model": "amazon-bedrock/us.anthropic.claude-opus-4-6-v1"
    },
    "list": [
      {
        "id": "helper",
        "name": "Helper",
        "workspace": "~/.openclaw/workspace-helper",
        "model": {
          "primary": "amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0"
        }
      }
    ]
  },
  "bindings": [
    {
      "agentId": "helper",
      "match": { "channel": "zulip", "accountId": "helper" }
    }
  ],
  "channels": {
    "zulip": {
      "accounts": {
        "default": {
          "botEmail": "main-bot@YOUR-DOMAIN",
          "botToken": "YOUR-MAIN-BOT-API-KEY"
        },
        "helper": {
          "botEmail": "helper-bot@YOUR-DOMAIN",
          "botToken": "YOUR-HELPER-BOT-API-KEY"
        }
      }
    }
  }
}
```

Each agent gets its own workspace: `~/.openclaw/workspace-{name}/` with `SOUL.md`, `MEMORY.md`, etc.

---

## Rollback Procedure

Safe at any point. Nothing is destructive until DNS points to the new instance.

```bash
# Stop gateway
systemctl --user stop openclaw-gateway

# If upgrading: restore previous OpenClaw version
sudo npm install -g --prefix /usr/local openclaw@PREVIOUS_VERSION

# Restore old plugin from backup
rm -rf ~/.openclaw/extensions/zulip
cp -r /path/to/backup/zulip-plugin-backup ~/.openclaw/extensions/zulip

# Recreate symlinks
cd ~/.openclaw/extensions/zulip
OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
rm -rf node_modules/zod node_modules/openclaw
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw/node_modules/zod" node_modules/zod
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw" node_modules/openclaw

# Restart
systemctl --user start openclaw-gateway
```

---

## Teardown

```bash
# If using deploy.sh / CloudFormation:
aws cloudformation delete-stack --stack-name acp-platform --region us-east-1

# S3 bucket must be emptied first:
aws s3 rm s3://YOUR_BUCKET --recursive
aws s3 rb s3://YOUR_BUCKET

# If manual: terminate instance and release EIP
aws ec2 terminate-instances --instance-ids YOUR-INSTANCE-ID
aws ec2 release-address --allocation-id YOUR-EIP-ALLOC-ID
```

---

## Related Documentation

- [Architecture](architecture.md) — System design and data flow
- [DNS & SSL Setup](dns-and-ssl.md) — Domain configuration, Cloudflare, Let's Encrypt
- [Bedrock Auth](bedrock-auth.md) — Model access, auth chain, troubleshooting
- [User Management](user-management.md) — Managing users without outgoing mail
- [Troubleshooting](troubleshooting.md) — Common failures and fixes
- [Upgrade Guide](upgrade-guide.md) — OpenClaw version upgrades
- [Configuration Reference](configuration.md) — openclaw.json options
- [Security Overview](security.md) — Security posture and hardening
