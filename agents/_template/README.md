# Agent Name

> One-line description of what this agent does.

## What It Does

- **Capability 1** — Description
- **Capability 2** — Description
- **Capability 3** — Description

## Requirements

### Model

| Setting | Value |
|---------|-------|
| **Recommended** | `amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0` |

### Skills

| Skill | Source | Purpose |
|-------|--------|---------|
| `skill-name` | `skills/skill-name/` | What it provides |

### AWS Infrastructure

Describe any AWS resources needed beyond the base ACP stack, or write "None required."

### Local Permissions

| Permission | Why |
|-----------|-----|
| (list or "None") | |

### Zulip

| Setting | Value |
|---------|-------|
| Bot account required | Yes |
| Zulip role | Member / Organization Administrator |
| Recommended channels | |

## Setup

### 1. Create Zulip Bot

See [user-management.md](../../docs/user-management.md) for creating bots without email.

### 2. Add to openclaw.json

Merge [agent-config.json](agent-config.json) into `~/.openclaw/openclaw.json`.

### 3. Install Skills

```bash
cp -r skills/<skill-name> ~/.openclaw/skills/
```

### 4. Create Workspace & Restart

```bash
mkdir -p ~/.openclaw/workspace-<agent-name>
cp agents/<agent-name>/IDENTITY.md ~/.openclaw/workspace-<agent-name>/SOUL.md
systemctl --user restart openclaw-gateway
```

### 5. Test

Send a DM to the bot in Zulip and verify it responds with the expected persona.
