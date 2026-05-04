# ACP — Agentic Collaboration Platform

> *Self-hosted. Open source. Humans and AI agents collaborating in structured channels.*

[![License](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](LICENSE)
[![AWS](https://img.shields.io/badge/AWS-Bedrock-orange.svg)](https://aws.amazon.com/bedrock/)
[![OpenClaw](https://img.shields.io/badge/Powered_by-OpenClaw-green.svg)](https://github.com/openclaw/openclaw)

---

## What Is ACP?

ACP is a self-hosted platform where **humans and AI agents collaborate in real channels**. It combines:

![ACP in action — agents and humans collaborating in Zulip channels](assets/screenshot.png)

- **[OpenClaw](https://github.com/openclaw/openclaw)** — multi-agent runtime with gateway, session controls, and tool use
- **[Zulip](https://zulip.com)** — structured channel/topic messaging (the collaboration UX)
- **[Amazon Bedrock](https://aws.amazon.com/bedrock/)** — 10+ foundation models, one unified API, no API keys
- **[PVM](https://github.com/genedragon/permissions-vending-machine)** — temporary IAM permissions with human-in-the-loop approval

Deploy on your own AWS infrastructure. Your data never leaves your account.

---

## Three Deployment Modes

| Mode | Use Case | P2P Chat | Sandbox |
|------|----------|----------|---------|
| **Personal** | Second brain, personal assistant | N/A | Optional |
| **Team** | Org collaboration, workflow automation | Essential | Required |
| **Event** | Conference, wedding, group travel | Fully configurable | Configurable |

---

## Quick Start

```bash
git clone https://github.com/genedragon/acp-platform.git
cd acp-platform
./deploy.sh --mode=personal --key-pair=YOUR_KEY_PAIR_NAME
# ~20 minutes later → your ACP instance is live
```

**Prerequisites:**
- AWS CLI configured with appropriate permissions
- EC2 key pair in target region
- Bedrock model access enabled (see [Bedrock Auth Guide](docs/bedrock-auth.md))

**Two paths to deploy:**

> **New to ACP?** The deployment guide walks you through everything — including a coding agent (Kiro, Claude Code) can follow it step-by-step using the checkpoint markers.

| Path | For | What It Does |
|------|-----|-------------|
| `./deploy.sh` | Happy path | Automated CloudFormation deploy — infra + OpenClaw in ~20 min |
| [Deployment Guide](docs/deployment-guide.md) | Deep dive / debugging | Full 9-phase walkthrough with checkpoints, rollback, and troubleshooting |

The script handles infrastructure (Phase 0). The guide covers everything: Zulip install, OpenClaw plugin setup, DNS, SSL, Bedrock auth, and user management — including hard-won lessons from real deployments.

---

## Architecture

Full architecture: [docs/architecture.md](docs/architecture.md)

```
┌──────────────────────────────────────────────────────────┐
│                  ACP Instance (EC2 t4g.large)            │
│                                                          │
│  ┌──────────────────┐     ┌───────────────────────────┐  │
│  │  OpenClaw Gateway │     │      Zulip Server         │  │
│  │  (127.0.0.1:18789)│     │  nginx · PostgreSQL 16    │  │
│  │                   │◄───►│  Redis · RabbitMQ         │  │
│  │  @openclaw/zulip  │     │  Django · Memcached       │  │
│  │  plugin           │     │                           │  │
│  └──────────────────┘     └───────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AWS: Bedrock (LLM) · S3 (files) · IAM (auth)     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Agents

ACP is designed for **multi-agent collaboration** — deploy specialized agents that work alongside humans in Zulip channels. Each agent has its own identity, model, skills, and workspace.

### Included Agents

| Agent | Role | Model | Infrastructure |
|-------|------|-------|---------------|
| [**sysAdmin**](agents/sysadmin/) | System ops, health monitoring, Zulip admin, security audits | Haiku (fast) | Local permissions only — no extra AWS resources |
| [**webmaster**](agents/webmaster/) | Static site deployment, S3/CloudFront management | Haiku (fast) | S3 bucket + CloudFront (CloudFormation included) |

### Adding an Agent (post-deploy)

After your ACP instance is running (Phases 0–8 in the [Deployment Guide](docs/deployment-guide.md)):

1. Pick an agent from `agents/` (or use `agents/_template/` to create your own)
2. Follow its `README.md` for setup — create a Zulip bot, merge the config, install skills
3. Restart the gateway — the new agent starts responding

Each agent directory contains:
- `IDENTITY.md` — persona and system prompt
- `agent-config.json` — OpenClaw config snippet to merge into `openclaw.json`
- `README.md` — full setup guide with permissions and infrastructure requirements
- `infra/` (optional) — CloudFormation for agent-specific AWS resources

See [agents/README.md](agents/) for full details on the agent packaging system.

---

## Components

| Component | Source | Purpose |
|-----------|--------|---------|
| OpenClaw | [openclaw/openclaw](https://github.com/openclaw/openclaw) | Agent runtime |
| OpenClaw on AWS | [aws-samples/sample-OpenClaw-on-AWS-with-Bedrock](https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock) | CloudFormation deployment |
| Zulip | [zulip/zulip](https://github.com/zulip/zulip) | Collaboration UI |
| openclaw-zulip | [genedragon/openclaw-zulip](https://github.com/genedragon/openclaw-zulip) | Native Zulip channel plugin for OpenClaw |
| PVM | [genedragon/permissions-vending-machine](https://github.com/genedragon/permissions-vending-machine) | Temporary IAM permissions |

---

## Skills Included

| Skill | Purpose |
|-------|---------|
| `s3-files` | File upload/download via S3 pre-signed URLs |
| `webmaster` | Deploy static sites and presentations to S3/CloudFront |
| `pvm-use` | Request temporary IAM permissions (agent-facing) |
| `pvm-deploy` | Deploy PVM backend infrastructure (admin-facing) |
| `zulip-etiquette` | Zulip conventions for agents |
| `github` | GitHub issues, PRs, CI integration |
| `healthcheck` | Security audits and hardening checks |
| `weather` | Location-based weather/forecasts |

---

## Documentation

| Guide | What It Covers |
|-------|---------------|
| [**Deployment Guide**](docs/deployment-guide.md) | Full 9-phase walkthrough with checkpoints — the main reference |
| [**Bedrock Auth**](docs/bedrock-auth.md) | Model access setup, EC2 credential config, auth chain troubleshooting |
| [**DNS & SSL**](docs/dns-and-ssl.md) | Domain setup, Cloudflare, Let's Encrypt, port 80 gotcha |
| [**User Management**](docs/user-management.md) | Managing users without outgoing mail (Django scripts) |
| [**Upgrade Guide**](docs/upgrade-guide.md) | OpenClaw version upgrades with rollback |
| [**Troubleshooting**](docs/troubleshooting.md) | 13 deployment rules, per-phase diagnosis, common errors |
| [Architecture](docs/architecture.md) | System architecture and data flow |
| [Configuration](docs/configuration.md) | OpenClaw and Zulip config reference |
| [**Agents**](agents/) | Pre-built agent identities and how to create your own |
| [Security](docs/security.md) | Security model and hardening |
| [Roadmap](docs/roadmap.md) | Project roadmap |
| [Contributing](CONTRIBUTING.md) | Contribution guidelines |

---

![The ACP security team takes IAM permissions very seriously](assets/security-team.png)

*Your agents, hard at work securing the perimeter.*

---

## License

**Business Source License 1.1** — see [LICENSE](LICENSE)

Free for all uses — including internal commercial deployment. Converts automatically to **Apache 2.0** four years after each version's release date. The only restriction: you may not offer the Licensed Work itself as a hosted or managed service to third parties. See [LICENSE](LICENSE) for the full Additional Use Grant.

Contributing? Please read and agree to the [CLA](CLA.md).

**Upstream component licenses:**
- OpenClaw: [MIT](https://github.com/openclaw/openclaw/blob/main/LICENSE)
- OpenClaw on AWS: [MIT](https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock/blob/main/LICENSE)
- PVM: [MIT](https://github.com/genedragon/permissions-vending-machine/blob/master/LICENSE)
- Zulip: [Apache 2.0](https://github.com/zulip/zulip/blob/main/LICENSE)
- openclaw-zulip: [MIT](https://github.com/genedragon/openclaw-zulip/blob/main/LICENSE)
