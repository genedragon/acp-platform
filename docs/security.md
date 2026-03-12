# Security Overview

## Defense-in-Depth Model

ACP uses multiple independent security layers so that a breach of one layer doesn't compromise the entire system.

```
Layer 1: Network (VPC, Security Groups, No open port 22)
Layer 2: Access Control (IAM Roles, PVM, Sandbox mode)
Layer 3: Agent Isolation (Workspaces, Main vs non-main)
Layer 4: Data Protection (Encryption at rest/transit, No secrets in code)
Layer 5: Audit & Monitoring (CloudTrail, Zulip logs, CloudWatch)
```

---

## Key Security Controls

### 1. OpenClaw Sandbox Mode

**What it does:** Restricts agent capabilities to a safe subset.

| Capability | Main Agent | Non-Main (Sandboxed) |
|-----------|-----------|---------------------|
| Shell exec | Full (exec tool) | Denied or allowlisted |
| Network access | Full | Blocked by default |
| File system | Workspace + specified paths | Workspace only |
| Browser control | Full | Limited or denied |
| AWS API calls | Via IAM role | Via PVM only (time-limited) |

**Configuration:** Set in OpenClaw's `config.yaml` per-agent.

**Default by mode:**
- Personal: sandbox=optional (off by default)
- Team: sandbox=required for non-main agents
- Event: sandbox=configurable per instance

### 2. Agent Workspace Separation

Each agent has an isolated workspace directory. Agents cannot access each other's workspaces by default.

```
~/.openclaw/
├── workspace-main/      ← Main agent (trusted)
├── workspace-botWard/   ← botWard agent (isolated)
├── workspace-agentN/    ← Other agents (isolated)
└── shared/              ← Optional shared space (explicit config)
```

**Why it matters:** If a non-main agent is compromised (e.g., via prompt injection), it cannot read the main agent's memory, credentials, or workspace files.

### 3. Main vs Non-Main Agent Privileges

| Privilege | Main Agent | Non-Main Agent |
|-----------|-----------|----------------|
| Read all workspaces | ✅ | ❌ |
| Spawn sub-agents | ✅ | Limited |
| Access secrets/memory | ✅ | Own workspace only |
| Shell access | Full (if enabled) | Sandboxed |
| AWS credentials | Via IAM role | Via PVM only |

**Principle:** Main agent is the trusted orchestrator. Non-main agents are workers with limited scope.

### 4. PVM — Temporary IAM Permissions

The Permissions Vending Machine ensures agents never hold standing elevated AWS permissions.

**Flow:**
1. Agent requests specific permission (e.g., `s3:PutObject`)
2. Approver receives email with approve/deny link
   - Links are **time-limited** (expire after 15 minutes)
   - Links are **single-use** (invalidated on first click)
   - **Re-authentication is required** before approval is recorded (IAM/Cognito session check)
   - Approval action is **logged with approver identity** in DynamoDB + CloudTrail
3. On approval: temporary IAM policy attached (5-60 min TTL)
4. Auto-revoke when TTL expires (Step Functions enforced)
5. Full audit log in DynamoDB + CloudTrail

**Why this matters:** Even if an agent is compromised, it cannot escalate privileges beyond what was explicitly approved for a time-limited window.

### 5. No Secrets in Code

All credentials, API keys, and secrets must be:
- **Environment variables** (never hardcoded)
- **AWS SSM Parameter Store** (for structured config)
- **AWS Secrets Manager** (for high-value secrets)

The `.gitignore` blocks: `.env`, `*.pem`, `*.key`, `config.json`, `.zuliprc`, and all credential files.

### 6. IAM Roles (Not Keys)

All AWS service access uses **IAM roles** attached to the EC2 instance. No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` are used or stored.

Minimum required permissions per component:
- **OpenClaw runtime:** `bedrock:InvokeModel`, `s3:GetObject/PutObject`
- **Zulip:** `ses:SendEmail`, `s3:PutObject` (backups)
- **PVM:** `iam:AttachUserPolicy`, `iam:DetachUserPolicy`, `ses:SendEmail`, `dynamodb:*`, `states:*`

### 7. Audit Logging

| Source | What's Logged |
|--------|--------------|
| CloudTrail | All AWS API calls (IAM, Bedrock, S3, etc.) |
| Zulip | All message history (human + agent conversations) |
| CloudWatch | EC2 system metrics, application logs |
| PVM DynamoDB | All permission requests, approvals, grants, revocations |

---

## Security by Deployment Mode

| Control | Personal | Team | Event |
|---------|----------|------|-------|
| Sandbox (non-main agents) | Optional | Required | Configurable |
| PVM (temporary IAM) | Optional | Required | Required |
| Audit logs | Basic | Full | Full |
| IAM roles (no static keys) | Required | Required | Required |
| Encryption at rest | S3 only | S3 + EBS | S3 + EBS |
| P2P chat restrictions | N/A | Role-based | Per-instance |
| MFA for admin | Recommended | Required | Required |

---

## Threat Model

### T1: Prompt Injection
**Risk:** Malicious content in user messages manipulates agent behavior.
**Mitigations:**
- Sandbox mode prevents shell execution from injected commands
- Non-main agents have limited tool scope
- PVM prevents unauthorized AWS resource access

### T2: Compromised Agent Workspace
**Risk:** Agent reads another agent's secrets or memory.
**Mitigations:**
- Workspace isolation (separate directories, no cross-read by default)
- Main vs non-main privilege separation

### T3: AWS Credential Exposure
**Risk:** Agent exfiltrates IAM credentials.
**Mitigations:**
- IAM roles (no static keys to steal)
- PVM time-limits all elevated access
- CloudTrail detects unusual API call patterns

### T4: Zulip Message Exfiltration
**Risk:** Agent leaks private Zulip messages to external services.
**Mitigations:**
- Network sandbox blocks external egress for non-main agents
- Security review of skills before installation

### T5: Supply Chain (Skills/MCPs)
**Risk:** Third-party skill contains malicious code.
**Mitigations:**
- Skills run in agent workspace (not host)
- Sandbox mode limits blast radius
- Code review required before installing community skills

---

## Security Checklist (Pre-Launch)

- [ ] IAM roles configured (no static keys)
- [ ] All secrets in SSM or Secrets Manager
- [ ] `.gitignore` covers credential files
- [ ] Sandbox mode enabled for non-main agents (team/event modes)
- [ ] PVM deployed and tested
- [ ] CloudTrail enabled
- [ ] Security groups: no port 22 open (use SSM Session Manager)
- [ ] HTTPS only (Let's Encrypt or ACM)
- [ ] Admin account MFA enabled
- [ ] Default passwords changed
- [ ] S3 bucket policies: no public access
- [ ] Bedrock model access scoped to needed models only

---

## Reporting Security Issues

Please report security vulnerabilities via private disclosure to the maintainers. Do not open public GitHub issues for security bugs.

See [SECURITY.md](../SECURITY.md) for the full disclosure policy.
