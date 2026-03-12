# Configuration Reference

## deploy.sh Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `personal` | Deployment mode: `personal`, `team`, `event` |
| `--region` | `us-west-2` | AWS region |
| `--stack` | `acp-platform` | CloudFormation stack name |
| `--key-pair` | (required) | EC2 key pair name |
| `--no-pvm` | false | Skip PVM deployment |
| `--no-zulip` | false | Skip Zulip deployment |
| `--skip-preflight` | false | Skip preflight checks |

**Environment variables (alternative to flags):**
```bash
export DEPLOY_MODE=team
export AWS_REGION=us-east-1
export STACK_NAME=my-acp
export KEY_PAIR=my-key
./deploy.sh
```

---

## Mode-Specific Defaults

### Personal Mode
```yaml
instance_type: t4g.medium
sandbox_mode: optional
pvm: optional
zulip_p2p_chat: n/a
audit_level: basic
estimated_cost: $25-40/month
```

### Team Mode
```yaml
instance_type: t4g.large
sandbox_mode: required (non-main agents)
pvm: required
zulip_p2p_chat: role-based
audit_level: full
estimated_cost: $60-100/month
```

### Event Mode
```yaml
instance_type: t4g.large
sandbox_mode: configurable
pvm: required
zulip_p2p_chat: fully-configurable-per-instance
audit_level: full
auto_teardown: configurable (TTL in hours/days)
estimated_cost: pay-per-use
```

---

## P2P Chat Configuration (Event Mode)

In `templates/event/config.yaml`:

```yaml
p2p_chat:
  # Enable/disable all P2P (DM) messaging
  enabled: true

  # Scope: all (everyone can DM), members-only (no guests), admin-only, disabled
  scope: members-only

  # Specific overrides
  overrides:
    - role: guest
      can_dm: false
    - role: member
      can_dm: true
    - role: admin
      can_dm: true

  # Channel-level P2P (within channel context)
  channels:
    # Default for channels not listed
    default: members-only
    # Per-channel overrides
    - name: "general"
      p2p: all
    - name: "vip"
      p2p: admin-only
```

---

## Skills Configuration

### s3-files

Create `skills/s3-files/config.json` (from `config.json.example`):

```json
{
  "bucketName": "YOUR_BUCKET_NAME",
  "region": "us-west-2",
  "defaultExpirationHours": 24
}
```

⚠️ **Never commit `config.json`** — only `config.json.example` belongs in git.

### webmaster

See `skills/webmaster/SKILL.md` for configuration options.

Key settings (via environment or config):
- `WEBMASTER_BUCKET`: S3 bucket for site hosting
- `WEBMASTER_REGION`: AWS region
- `WEBMASTER_REGISTRY_TABLE`: DynamoDB table for deployment registry

### pvm-use

Configure via `skills/pvm-use/config/pvm.env` (from `pvm.env.example`):

```bash
PVM_API_URL=https://YOUR_API_GATEWAY_ID.execute-api.REGION.amazonaws.com/prod
PVM_API_KEY=your-api-key-here
```

---

## OpenClaw Configuration

OpenClaw's main config is in `~/.openclaw/config.yaml` (on the EC2 instance).

Key ACP-relevant settings:

```yaml
# Agent workspaces
workspaces:
  main: ~/.openclaw/workspace-main
  sandbox: ~/.openclaw/workspace-sandbox

# Sandbox mode (recommended for team/event)
sandbox:
  enabled: true
  shell_allowed: false
  network_allowed: false
  allowed_tools:
    - memory_search
    - memory_get
    - message

# Bedrock model
model: amazon-bedrock/us.anthropic.claude-sonnet-4-6

# Gateway
gateway:
  port: 18789
  token_env: OPENCLAW_GATEWAY_TOKEN
```

---

## Zulip Bot Configuration

The `openclaw-zulip` plugin is configured via `openclaw channels add --channel zulip`. Bot credentials are stored in OpenClaw's config (never committed to git):

```ini
[api]
email=your-bot@zulip.example.com
key=YOUR_BOT_API_KEY
site=https://your-zulip-instance.com
```

**Get these values from:** Zulip admin panel → Bots → Add new bot → API key.
