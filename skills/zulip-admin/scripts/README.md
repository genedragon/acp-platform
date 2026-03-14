# Zulip Admin Scripts

Automation scripts for common Zulip administration tasks.

## Available Scripts

### `zulip-create-bot.sh`

Programmatically create Zulip bot accounts via the REST API.

**Features:**
- Single bot creation
- Batch creation from CSV or JSON
- Dry-run mode for testing
- Comprehensive error handling
- Duplicate detection
- Detailed logging

**Usage:**

Single bot:
```bash
./zulip-create-bot.sh --email bot@realm.org --name "Bot Name" --password "SecurePass123"
```

Batch from CSV:
```bash
./zulip-create-bot.sh --batch bots.csv
```

Dry-run (test without creating):
```bash
./zulip-create-bot.sh --email bot@realm.org --name "Bot Name" --password "SecurePass123" --dry-run
```

**Prerequisites:**
- Valid `.zuliprc` configuration with admin credentials
- `can_create_users` permission granted to the admin account

See `../examples/` for CSV and JSON batch file templates.

**Full documentation:**
```bash
./zulip-create-bot.sh --help
```

### `zulip-audit.py`

Audit Zulip realm configuration and settings.

---

## Configuration

All scripts read credentials from `~/.zuliprc`:

```ini
[api]
email = admin-bot@your-realm.org
api_key = YOUR_API_KEY_HERE
site = https://your-realm.org
```

Alternatively, use environment variables:
```bash
export ZULIP_API_USER="admin-bot@your-realm.org"
export ZULIP_API_KEY="YOUR_API_KEY"
export ZULIP_SITE="https://your-realm.org"
```

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

## Logs

Scripts log to `~/.openclaw/workspace-{agent}/logs/` with timestamps and detailed event information.
