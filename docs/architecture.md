# Architecture

## Overview

ACP is a layered platform. Each layer is independently swappable in the future, but the default stack is:

### Runtime Architecture

## Components

### Zulip (Collaboration UX)
- **Role:** Human-facing interface. Channels for structured topics, DMs for P2P.
- **Deployment:** Native install on EC2 (recommended) or Docker
- **Source:** https://github.com/zulip/zulip (Apache 2.0)
- **Plugin:** `genedragon/openclaw-zulip` connects Zulip to OpenClaw via native channel plugin

### OpenClaw (Agent Runtime)
- **Role:** Executes AI agents with tools: browser, shell, file, web search, etc.
- **Session model:** Each conversation is a session; agents are sandboxed by workspace
- **Source:** https://github.com/openclaw/openclaw (MIT)
- **AWS deployment:** https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock

### Amazon Bedrock
- **Role:** Model inference. No API keys; uses IAM roles.
- **Models:** Claude (Anthropic), Llama (Meta), Titan (Amazon), and more
- **Region:** Must be enabled per-region in AWS console

### PVM — Permissions Vending Machine
- **Role:** Temporary, human-approved IAM permission grants for agents
- **Architecture:** API Gateway → Step Functions → Lambda → IAM
- **Source:** https://github.com/genedragon/permissions-vending-machine (MIT)
- **Flow:** Agent requests permission → approver email → time-limited grant → auto-revoke

### S3 Files Skill
- **Role:** File uploads/downloads via pre-signed URLs
- **Skill:** `skills/s3-files/`

---

## Deployment Modes

### Personal Mode
```
EC2 (t4g.medium) → OpenClaw + Zulip + Bedrock
Optional: PVM, S3
Security: Minimal (single-user, trusted)
Cost: ~$25-40/month
```

### Team Mode
```
EC2 (t4g.large) → OpenClaw + Zulip + Bedrock + PVM
Required: Sandbox isolation, audit logs, IAM roles
Security: Strict
Cost: ~$60-100/month
```

### Event Mode
```
EC2 (t4g.large, auto-teardown) → OpenClaw + Zulip + Bedrock
P2P Chat: Configurable per-instance
Duration: Time-limited, auto-teardown
Cost: Pay-per-use
```

---

## Security Model

See [security.md](security.md) for the full security overview.

**Key principles:**
1. **Workspace isolation** — Each agent has a separate workspace directory
2. **Sandbox mode** — Non-main agents run in restricted shells (no external network by default)
3. **PVM for IAM** — Agents never hold standing AWS permissions; all elevated access is time-limited + human-approved
4. **Main vs non-main agents** — Main agent has broader trust; non-main agents are sandboxed
5. **Audit trail** — CloudTrail captures all AWS API calls; Zulip channel history is the conversation log

---

## Data Flow

1. User posts message in Zulip channel/topic
2. `openclaw-zulip` plugin receives event via Zulip event queue API
3. Bridge POSTs to OpenClaw Gateway (`/v1/responses`)
4. Gateway routes to appropriate agent session
5. Agent processes with tools (Bedrock, browser, S3, etc.)
6. Agent posts reply back to Zulip via plugin
7. CloudTrail logs all AWS API calls for audit

---

## AWS Infrastructure (CloudFormation)

See `cloud/aws/cloudformation/acp-stack.yaml` for the full template.

Key resources:
- **VPC** with public/private subnets
- **EC2** (Graviton ARM, t4g family) — 20-40% cheaper than x86
- **IAM Roles** — Bedrock access, S3 access, SSM (no open ports required)
- **Security Group** — HTTPS (443) inbound; SSM Session Manager for SSH (no port 22 open)
- **S3 Bucket** — File storage + backups
- **CloudTrail** — API audit logging
