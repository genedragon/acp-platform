# ACP Agents

ACP deploys **multiple specialized agents** that collaborate in shared Zulip channels. Each agent has its own identity, model, workspace, and skills — running as a separate bot account in Zulip.

## Included Agents

| Agent | Role | Model | AWS Infra Required |
|-------|------|-------|--------------------|
| [**sysAdmin**](sysadmin/) | System ops, health monitoring, Zulip admin | Claude Haiku | None (local only) |
| [**webmaster**](webmaster/) | Static site deployment via S3/CloudFront | Claude Haiku | S3 + CloudFront |

## How Agents Work

Each agent runs as an independent session inside the OpenClaw gateway. When a user DMs a bot or @mentions it in a channel, the gateway routes the message to the corresponding agent session. Agents can:

- Respond to DMs and channel @mentions
- Execute shell commands, browse the web, manage files
- Use skills (reusable capability packages)
- Maintain conversation history and workspace state

Agents are isolated — each has its own workspace directory, memory, and session history. They share the same OpenClaw gateway process and Zulip server.

## Agent Package Structure

Each agent directory contains:

```
agents/<name>/
├── README.md            # What it does, setup steps, permissions needed
├── IDENTITY.md          # System prompt / persona definition
├── agent-config.json    # OpenClaw config snippet to merge into openclaw.json
├── infra/               # (optional) CloudFormation or IaC for AWS resources
│   └── <name>-stack.yaml
└── permissions/         # (optional) IAM policies, local permission docs
    └── iam-policy.json
```

## Adding an Agent to Your ACP

### 1. Create a Zulip Bot

In the Zulip admin panel (or via [Django shell](../docs/user-management.md) if no mail server):

- Create a new bot user (e.g., `sysadmin-bot@YOUR-DOMAIN`)
- Save the API key

### 2. Add Agent Config

Merge the agent's `agent-config.json` into your `~/.openclaw/openclaw.json`:

- Add the agent to `agents.list[]`
- Add the Zulip bot account to `channels.zulip.accounts`
- Add a binding to route the bot account to the agent

See each agent's README for the exact config.

### 3. Install Required Skills

```bash
# Copy skills referenced by the agent
cp -r /path/to/acp-platform/skills/<skill-name> ~/.openclaw/skills/
```

### 4. Deploy Infrastructure (if needed)

Some agents require AWS resources. Check the agent's README for infrastructure requirements and deploy any CloudFormation templates in `infra/`.

### 5. Create Workspace & Restart

```bash
# Create the agent's workspace
mkdir -p ~/.openclaw/workspace-<name>

# Copy the IDENTITY.md as the agent's system prompt
cp agents/<name>/IDENTITY.md ~/.openclaw/workspace-<name>/SOUL.md

# Restart the gateway to pick up the new agent
systemctl --user restart openclaw-gateway
```

### 6. Test

Send a DM to the new bot in Zulip. It should respond using the agent's persona and have access to its configured skills.

## Creating Your Own Agent

Use the [_template](_template/) directory as a starting point:

```bash
cp -r agents/_template agents/my-agent
# Edit README.md, IDENTITY.md, and agent-config.json
```

See [docs/deployment-guide.md](../docs/deployment-guide.md) for the multi-agent configuration reference.
