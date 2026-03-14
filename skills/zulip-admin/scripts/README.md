# Zulip Admin Scripts

Automation scripts for common Zulip administration tasks.

## Available Scripts

### `create-agent-bot.py` (Preferred — Django method)

Creates proper Zulip bot accounts (`is_bot=True`) using Zulip's internal Django
action layer — the same code path as the web UI. Requires server access.

**Features:**
- Creates proper `is_bot=True, bot_type=DEFAULT_BOT` accounts (unlike REST API)
- Batch creation from JSON
- Dry-run mode
- Safe upgrade of existing users to bots (requires `--allow-upgrade`)
- Batch safety limit (`--max-batch`, default 100)

**Usage:**

```bash
# Single bot
sudo -u zulip python3 create-agent-bot.py \
    --admin-email svc-botowner@your-realm.org \
    --name "webMaster" --email "webmaster-bot@acp.wardcrew.org"

# Batch from JSON
sudo -u zulip python3 create-agent-bot.py \
    --admin-email svc-botowner@your-realm.org \
    --batch agents.json

# Dry-run
sudo -u zulip python3 create-agent-bot.py \
    --admin-email svc-botowner@your-realm.org \
    --name "prodMan" --email "prodman-bot@acp.wardcrew.org" --dry-run
```

**Security notes:**
- `--admin-email` is required. Use a dedicated service account, **not a personal email**.
- `--allow-upgrade` must be explicitly passed to convert a human user account to a bot. This is potentially irreversible.

---

### `zulip-create-bot.sh` (Fallback — REST API method)

Creates Zulip bot accounts via the REST API. Works against any Zulip instance
with valid API credentials. Does **not** require server access.

**Note:** The REST API creates regular user accounts, not proper `is_bot=True` bots.
Prefer `create-agent-bot.py` for ACP self-hosted instances.

**Features:**
- Single and batch bot creation (CSV or JSON)
- Dry-run mode
- Batch safety limit (`--max-batch`, default 100)
- Config file permission checks

**Usage:**

```bash
# Single bot via env var (recommended)
ZULIP_BOT_PASSWORD="$(pass show bots/mybot)" \
    ./zulip-create-bot.sh --email bot@realm.org --name "Bot Name"

# Single bot via stdin
echo "strong-password" | \
    ./zulip-create-bot.sh --email bot@realm.org --name "Bot Name" --password-stdin

# Batch from CSV (passwords in file)
./zulip-create-bot.sh --batch bots.csv

# Dry-run
./zulip-create-bot.sh --email bot@realm.org --name "Bot Name" --dry-run
```

**Password security:** `--password` CLI argument is intentionally not supported.
Use `ZULIP_BOT_PASSWORD` env var or `--password-stdin` to avoid credential exposure
in process listings (`ps aux`) and shell history.

---

## Configuration

All scripts read credentials from `~/.zuliprc`:

```ini
[api]
email = admin-bot@your-realm.org
api_key = YOUR_API_KEY_HERE
site = https://your-realm.org
```

**Set permissions to 600:**
```bash
chmod 600 ~/.zuliprc
```

The shell script will warn if `~/.zuliprc` has insecure permissions.

Alternatively, use environment variables:
```bash
export ZULIP_API_USER="admin-bot@your-realm.org"
export ZULIP_API_KEY="YOUR_API_KEY"
export ZULIP_SITE="https://your-realm.org"
```

## Logs

Scripts log to `~/.openclaw/workspace-{agent}/logs/` with timestamps.

**Security:** Log files may contain email addresses and other identifying information.
Protect the log directory:
```bash
chmod 700 ~/.openclaw/workspace-sysadmin/logs/
```

If verbose mode (`--verbose`) is used, logs may include API responses. Do **not** log
to shared or world-readable directories, and rotate logs regularly to limit exposure.

## Granting can_create_users Permission

On self-hosted Zulip, run as the zulip user:

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py \
  change_user_role admin-bot@your-realm.org can_create_users -r REALM_ID
```

Find your realm ID:
```bash
sudo -u zulip /home/zulip/deployments/current/manage.py list_realms
```
