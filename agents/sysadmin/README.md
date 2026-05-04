# sysAdmin Agent

**System operations, health monitoring, and Zulip organization administration.**

sysAdmin is the ops backbone of your ACP instance. It monitors system health, manages Zulip users and channels, performs security audits, and handles routine maintenance — so you don't have to SSH in for every small task.

## What It Does

- **System health monitoring** — disk space, memory, CPU, service status
- **Zulip organization admin** — create/deactivate users, manage channels, update permissions
- **Security audits** — check open ports, review IAM roles, verify SSL certificates
- **Log analysis** — parse journalctl, nginx, and PostgreSQL logs for errors
- **Cron management** — schedule and monitor recurring tasks
- **Incident response** — diagnose service failures, restart crashed processes

## Requirements

### Model

| Setting | Value |
|---------|-------|
| **Recommended** | `amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| **Why Haiku** | Fast response for ops tasks, low cost (~$0.25/1M input tokens) |

### Skills

| Skill | Source | Purpose |
|-------|--------|---------|
| `zulip-admin` | `skills/zulip-admin/` | Zulip user/channel/group management |
| `healthcheck` | `skills/healthcheck/` | System health and security audits |

### Local Permissions

sysAdmin needs elevated access on the EC2 instance:

| Permission | Why |
|-----------|-----|
| `sudo` | Service restarts, package updates, config changes |
| `systemctl` | Start/stop/restart OpenClaw gateway, Zulip services |
| `journalctl` | Read service logs for diagnostics |
| `/etc/hosts` write | Update self-referencing DNS entries |
| `crontab` | Schedule and manage recurring tasks |

> ⚠️ **Security note:** sysAdmin has broad local access. In team/event deployments, consider restricting its shell access via OpenClaw's sandbox configuration.

### AWS Infrastructure

**None required** beyond the base ACP stack. sysAdmin operates locally on the EC2 instance.

### Zulip

| Setting | Value |
|---------|-------|
| Bot account required | Yes |
| Zulip role | **Organization Administrator** (for user/channel management) |
| Recommended channels | `🛠️ devops`, `🔐 security`, `📊 monitoring` |

## Setup

### 1. Create Zulip Bot

Via [Django shell](../../docs/user-management.md) (no mail server) or Zulip admin panel:

```bash
# Create bot via Django shell
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'PYEOF'
from zerver.lib.users import create_user
from zerver.models import Realm, UserProfile

realm = Realm.objects.get(id=2)
bot = create_user(
    email='sysadmin-bot@YOUR-DOMAIN',
    password=None,
    realm=realm,
    full_name='sysAdmin',
    acting_user=None
)
bot.is_bot = True
bot.bot_type = UserProfile.DEFAULT_BOT
bot.delivery_email = 'sysadmin-bot@YOUR-DOMAIN'
bot.role = UserProfile.ROLE_REALM_ADMINISTRATOR
bot.save()
print(f"API Key: {bot.api_key}")
PYEOF
```

Save the API key — you'll need it in the next step.

### 2. Add to openclaw.json

Merge the contents of [agent-config.json](agent-config.json) into your `~/.openclaw/openclaw.json`:

**Add to `agents.list[]`:**
```json
{
  "id": "sysadmin",
  "name": "sysAdmin",
  "workspace": "~/.openclaw/workspace-sysadmin",
  "model": {
    "primary": "amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0"
  }
}
```

**Add to `channels.zulip.accounts`:**
```json
"sysadmin": {
  "botEmail": "sysadmin-bot@YOUR-DOMAIN",
  "botToken": "YOUR-SYSADMIN-BOT-API-KEY",
  "dmPolicy": "open",
  "allowFrom": ["*"],
  "groupPolicy": "allowlist"
}
```

**Add to `bindings[]`:**
```json
{
  "agentId": "sysadmin",
  "match": { "channel": "zulip", "accountId": "sysadmin" }
}
```

### 3. Install Skills

```bash
cp -r skills/zulip-admin ~/.openclaw/skills/
cp -r skills/healthcheck ~/.openclaw/skills/ 2>/dev/null || echo "healthcheck skill not yet available"
```

### 4. Create Workspace

```bash
mkdir -p ~/.openclaw/workspace-sysadmin
cp agents/sysadmin/IDENTITY.md ~/.openclaw/workspace-sysadmin/SOUL.md
```

### 5. Restart Gateway

```bash
systemctl --user restart openclaw-gateway
sleep 5
journalctl --user -u openclaw-gateway --no-pager -n 20
# Look for: "connected as sysAdmin"
```

### 6. Test

Send a DM to **sysAdmin** in Zulip:

> "Check the system health — disk space, memory, and gateway status."

The bot should respond with system diagnostics.
