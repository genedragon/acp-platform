---
name: zulip-admin
description: Zulip organization administration via the REST API. Use when managing users (create, deactivate, reactivate, update roles), channels (create, archive, update permissions, subscribe/unsubscribe users), auditing realm settings, managing user groups, custom profile fields, custom emoji, linkifiers, or performing any Zulip org-admin operation. Assumes the calling agent has Organization Administrator privileges. NOT for: reading/sending messages (use the zulip skill), or OpenClaw gateway config.
---

# Zulip Admin Skill

You are a Zulip Organization Administrator. This skill covers **all admin operations** via the Zulip REST API. You have full admin privileges on the realm.

## Authentication

All API calls use your bot credentials. Construct requests with:

```bash
curl -sSX <METHOD> "https://<REALM>/api/v1/<endpoint>" \
  -u "<BOT_EMAIL>:<BOT_API_KEY>" \
  [parameters]
```

Your credentials are in your `.zuliprc` file or OpenClaw config. Never log or expose the API key.

---

## 1. User Management

### List Users

```
GET /api/v1/users
```

Options: `?client_gravatar=false&include_custom_profile_fields=true`

Key fields in response: `user_id`, `full_name`, `email`, `delivery_email`, `role`, `is_active`, `is_bot`, `bot_type`, `bot_owner_id`, `date_joined`.

### Create User

```
POST /api/v1/users
```

Required: `email`, `password`, `full_name`. Returns `user_id`.

**Important**: Requires `can_create_users` permission. On self-hosted, grant via:
```bash
/home/zulip/deployments/current/manage.py change_user_role <email> can_create_users --realm <realm>
```

#### Automated Bot Creation (ACP Self-Hosted — Preferred)

For ACP instances where you control the Zulip server, use the Django-based script.
This creates **proper bot accounts** (`is_bot=True`, `bot_type=DEFAULT_BOT`) — identical
to what the Zulip web UI creates. The REST API workaround (`POST /api/v1/users`) creates
regular user accounts which lack the bot badge, count toward user limits, and can log
into the web UI.

**Single bot (Django method):**
```bash
sudo -u zulip /home/zulip/deployments/current/.venv/bin/python3 \
  ./skill-admin/scripts/create-agent-bot.py \
  --name "webMaster" \
  --email "webmaster-bot@your-realm.org"
```

**Batch from JSON:**
```bash
sudo -u zulip /home/zulip/deployments/current/.venv/bin/python3 \
  ./skill-admin/scripts/create-agent-bot.py \
  --batch agents.json
```

JSON format: `[{"name": "webMaster", "email": "webmaster-bot@your-realm.org"}, ...]`

**Dry-run:**
```bash
sudo -u zulip /home/zulip/deployments/current/.venv/bin/python3 \
  ./skill-admin/scripts/create-agent-bot.py \
  --name "testBot" --email "test@your-realm.org" --dry-run
```

See `scripts/create-agent-bot.py` for full options including `--json` output for scripting.

#### Automated Bot Creation (Remote Zulip — REST API Fallback)

Use only when you **don't** have SSH access to the Zulip server.
Creates user accounts (`is_bot=False`) which work for API use but lack proper bot identity.

**Single bot:**
```bash
./skill-admin/scripts/zulip-create-bot.sh \
  --email newbot@your-realm.org \
  --name "New Bot" \
  --password "TempPassword123"
```

**Batch creation from CSV:**
```bash
./skill-admin/scripts/zulip-create-bot.sh --batch bots.csv
```

**CSV format** (`examples/example-bots.csv`):
```csv
email,name,password
bot1@your-realm.org,Bot One,TempPass123
bot2@your-realm.org,Bot Two,TempPass123
```

**JSON format** (`examples/example-bots.json`):
```json
{
  "bots": [
    {"email": "bot1@your-realm.org", "name": "Bot One", "password": "TempPass123"},
    {"email": "bot2@your-realm.org", "name": "Bot Two", "password": "TempPass123"}
  ]
}
```

**Features:**
- Dry-run mode (`--dry-run`) to test without creating
- Comprehensive logging to `~/.openclaw/workspace-{agent}/logs/zulip-create-bot.log`
- Email and password validation
- Duplicate detection
- Automatic realm detection from `~/.zuliprc`

**Requirements:**
- Valid `.zuliprc` configuration or environment variables
- `can_create_users` permission (granted via management command above)

Run `./skill-admin/scripts/zulip-create-bot.sh --help` for full documentation.

### Update User

```
PATCH /api/v1/users/{user_id}
```

Parameters: `full_name`, `role` (100=owner, 200=admin, 300=mod, 400=member, 600=guest), `profile_data`, `new_email`.

### Deactivate User

```
DELETE /api/v1/users/{user_id}
```

⚠️ **Destructive** — always confirm with the org owner first. Deactivating a user also deactivates their bots.

Optional `actions`: `delete_profile`, `delete_public_channel_messages`, `delete_private_channel_messages`, `delete_direct_messages`.

### Reactivate User

```
POST /api/v1/users/{user_id}/reactivate
```

### Update Own Avatar

```
POST /api/v1/users/me/avatar
```

Multipart file upload. Works with bot credentials (no special permissions needed).

```bash
curl -sSX POST "$REALM/api/v1/users/me/avatar" \
  -u "$BOT_EMAIL:$BOT_API_KEY" \
  -F "file=@/path/to/avatar.png"
```

### Roles Reference

| Code | Role |
|------|------|
| 100 | Organization Owner |
| 200 | Organization Administrator |
| 300 | Organization Moderator |
| 400 | Member |
| 600 | Guest |

Only owners can grant/revoke the owner role.

---

## 2. Channel (Stream) Management

### List All Channels

```
GET /api/v1/streams
```

Options: `?include_default=true`. Returns `stream_id`, `name`, `description`, `invite_only`, `is_web_public`, `is_archived`, `history_public_to_subscribers`, `message_retention_days`, `date_created`.

### Get Channel by ID

```
GET /api/v1/streams/{stream_id}
```

### Create a Channel

Use the subscribe endpoint — Zulip auto-creates channels that don't exist:

```
POST /api/v1/users/me/subscriptions
```

```bash
curl -sSX POST "$REALM/api/v1/users/me/subscriptions" \
  -u "$BOT_EMAIL:$BOT_API_KEY" \
  --data-urlencode 'subscriptions=[{"name":"new-channel","description":"Purpose of channel"}]' \
  --data-urlencode 'invite_only=true' \
  --data-urlencode 'announce=true'
```

Key parameters for new channels:
- `invite_only` (bool) — true = private channel
- `is_web_public` (bool) — publicly readable without auth
- `is_default_stream` (bool) — auto-subscribe new members
- `announce` (bool) — notification bot announces creation
- `history_public_to_subscribers` (bool)

### Subscribe Users to a Channel

```
POST /api/v1/users/me/subscriptions
```

```bash
--data-urlencode 'subscriptions=[{"name":"channel-name"}]' \
--data-urlencode 'principals=[user_id_1, user_id_2]'
```

Principals can be user IDs (preferred) or email addresses.

### Unsubscribe Users

```
PATCH /api/v1/users/me/subscriptions
```

```bash
--data-urlencode 'subscriptions=["channel-name"]' \
--data-urlencode 'principals=[user_id]'
```

### Update Channel Settings

```
PATCH /api/v1/streams/{stream_id}
```

Parameters: `description`, `new_name`, `is_private`, `is_default_stream`, `message_retention_days`, `history_public_to_subscribers`.

### Archive a Channel

```
DELETE /api/v1/streams/{stream_id}
```

⚠️ **Destructive** — confirm first. Archived channels are read-only and hidden. Messages are preserved.

### Get Channel Subscribers

```
GET /api/v1/streams/{stream_id}/members
```

### Get Topics in a Channel

```
GET /api/v1/users/me/{stream_id}/topics
```

### Delete a Topic

```
POST /api/v1/streams/{stream_id}/delete_topic
```

⚠️ **Destructive** — deletes all messages in the topic.

---

## 3. Channel Audit Checklist

When auditing channels, check:

1. **Privacy alignment** — Is `invite_only` set correctly? Should it be private?
2. **Subscriber list** — Are the right users/bots subscribed? Any unexpected members?
3. **Description** — Is it clear what the channel is for?
4. **Posting permissions** — Who can post? (`can_send_message_group`)
5. **Message retention** — Is a retention policy set? Should it be?
6. **Default channel** — Should new users auto-join this?
7. **Stale channels** — Any channels with no recent activity that should be archived?

Report findings as a table:

```
| Channel | Privacy | Subscribers | Description | Issues |
|---------|---------|-------------|-------------|--------|
```

---

## 4. User Groups

### List User Groups

```
GET /api/v1/user_groups
```

### Create User Group

```
POST /api/v1/user_groups/create
```

Parameters: `name`, `description`, `members` (array of user IDs).

### Update User Group

```
PATCH /api/v1/user_groups/{user_group_id}
```

### Update Group Members

```
POST /api/v1/user_groups/{user_group_id}/members
```

Parameters: `add` (array of user IDs), `delete` (array of user IDs).

### Deactivate User Group

```
DELETE /api/v1/user_groups/{user_group_id}
```

---

## 5. Organization Settings

### Get Server Settings (public)

```
GET /api/v1/server_settings
```

Returns realm info, auth methods, Zulip version, push notification status.

### Get Linkifiers

```
GET /api/v1/realm/linkifiers
```

### Add Linkifier

```
POST /api/v1/realm/filters
```

Parameters: `pattern` (regex), `url_template`.

Example: Auto-link `#123` to GitHub issues:
```bash
--data-urlencode 'pattern=#(?P<id>[0-9]+)' \
--data-urlencode 'url_template=https://github.com/org/repo/issues/{id}'
```

### Custom Emoji

```
POST /api/v1/realm/emoji/{emoji_name}
```

Upload with multipart form: `-F "filename=@emoji.png"`.

### Custom Profile Fields

```
GET /api/v1/realm/profile_fields
POST /api/v1/realm/profile_fields
```

Useful for adding org-specific fields (team, role, pronouns, etc.).

---

## 6. Invitations

### Send Invitations

```
POST /api/v1/invites
```

Parameters: `invitee_emails` (comma-separated), `stream_ids` (channels to auto-subscribe), `invite_as` (role code).

### Create Reusable Invite Link

```
POST /api/v1/invites/multiuse
```

Parameters: `stream_ids`, `invite_as`.

### List All Invitations

```
GET /api/v1/invites
```

### Revoke Invitation

```
DELETE /api/v1/invites/{invite_id}
```

---

## 7. Bot Management

### Key Bot Types

| Type | Description |
|------|-------------|
| 1 | Generic bot (API-driven, like OpenClaw bots) |
| 2 | Incoming webhook |
| 3 | Outgoing webhook |
| 4 | Embedded bot |

### Bot Provisioning Workflow

When setting up a new bot for the realm:

1. **Create bot** in Zulip UI (Settings → Bots) or via API
2. **Record credentials** — bot email + API key
3. **Set role** if needed (`PATCH /api/v1/users/{bot_id}` with `role`)
4. **Subscribe to channels** — use the subscribe endpoint with `principals`
5. **Upload avatar** — `POST /api/v1/users/me/avatar`
6. **Configure in OpenClaw** if it's an agent bot (add to `openclaw.json` agents + bindings)
7. **Restart the gateway** — `openclaw gateway restart`
8. **Test connectivity** — verify the bot can read/write in expected channels

---

## 8. Common Admin Workflows

### Onboard a New Human User

1. Create user: `POST /api/v1/users` (email, name, temp password)
2. Subscribe to default channels + any team-specific channels
3. Add to relevant user groups
4. Set custom profile fields if configured
5. Send welcome DM with getting-started info
6. Notify the org owner of the new account

### Onboard a New Bot

1. Create bot in Zulip UI or API
2. Record bot email + API key securely
3. Promote to admin if needed: `PATCH /api/v1/users/{id}` with `role: 200`
4. Subscribe to required channels
5. Upload avatar
6. Add to OpenClaw config (`openclaw.json` — agents + bindings)
7. Restart OpenClaw gateway
8. Test: send @mention in a subscribed channel

### Periodic Channel Audit

1. `GET /api/v1/streams` — list all channels
2. For each channel, check subscribers: `GET /api/v1/streams/{id}/members`
3. Cross-reference with active users (`is_active: true`)
4. Flag channels with 0 active subscribers → candidate for archival
5. Flag private channels with unexpected members
6. Report findings to the org owner

### Permission Escalation

To grant admin to a user or bot:
```bash
curl -sSX PATCH "$REALM/api/v1/users/{user_id}" \
  -u "$BOT_EMAIL:$BOT_API_KEY" \
  --data-urlencode 'role=200'
```

⚠️ Only do this when explicitly authorized by the org owner.

---

## 9. Safety Rules

1. **Never deactivate users without explicit approval from the org owner**
2. **Never archive channels without explicit approval**
3. **Never delete topics without explicit approval**
4. **Never change the organization owner role**
5. **Always log what you're about to do before doing it** — state the action, target, and rationale
6. **Confirm destructive operations** — if in doubt, ask
7. **Audit before modify** — always check current state before making changes
8. **Keep credentials secure** — never expose API keys in messages or logs

---

## 10. Troubleshooting

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `UNAUTHORIZED` | Bad API key or wrong bot email | Check credentials in config |
| `BAD_REQUEST` | Missing required param or invalid value | Check API docs for required fields |
| `UNAUTHORIZED_PRINCIPAL` | Can't subscribe deactivated/nonexistent user | Verify user exists and is active |
| `BAD_IMAGE` | Invalid image format for avatar upload | Use PNG or JPEG, valid file |

### Auth Chain

Zulip auth: hostname → RealmDomain → Realm → `get_user_by_delivery_email()` → `check_password()`.

- `delivery_email` is canonical for auth (not `email`)
- Always use Zulip's management APIs for user creation — raw SQL skips critical fields like `delivery_email`
- Django passwords require `set_password()` — never write password hashes directly

### Checking Realm Health

Use the bundled audit script:

```bash
ZULIPRC=/path/to/.zuliprc python3 <skill-dir>/scripts/zulip-audit.py --all
```

Or manually:

```bash
# Server settings (no auth needed)
curl -sS "$REALM/api/v1/server_settings" | python3 -m json.tool

# List all users
curl -sS -u "$BOT_EMAIL:$BOT_API_KEY" "$REALM/api/v1/users" | python3 -c "
import json,sys
d = json.load(sys.stdin)
for u in d['members']:
    status = '✅' if u['is_active'] else '❌'
    role = {100:'owner',200:'admin',300:'mod',400:'member',600:'guest'}.get(u['role'],'?')
    bot = ' 🤖' if u['is_bot'] else ''
    print(f\"{status} {u['user_id']:3d} | {u['full_name']:20s} | {role:8s}{bot}\")
"
```

---

## Bundled Script: `zulip-audit.py`

A quick realm audit tool in `scripts/zulip-audit.py`. Reads credentials from `ZULIPRC` env var or `~/.zuliprc`.

```bash
# Full audit (users + channels + subscriptions)
ZULIPRC=/path/to/.zuliprc python3 scripts/zulip-audit.py --all

# Users only
python3 scripts/zulip-audit.py --users

# Channels only
python3 scripts/zulip-audit.py --channels

# Subscription map (who's in what channel)
python3 scripts/zulip-audit.py --subscriptions
```

---

## API Reference

Full docs: https://zulip.com/api/rest

Key endpoints summary:

| Category | Endpoint | Method | Admin? |
|----------|----------|--------|--------|
| Users | `/api/v1/users` | GET | No |
| Users | `/api/v1/users` | POST | Yes* |
| Users | `/api/v1/users/{id}` | PATCH | Yes |
| Users | `/api/v1/users/{id}` | DELETE | Yes |
| Users | `/api/v1/users/{id}/reactivate` | POST | Yes |
| Avatar | `/api/v1/users/me/avatar` | POST | No |
| Channels | `/api/v1/streams` | GET | No |
| Channels | `/api/v1/streams/{id}` | PATCH | Yes |
| Channels | `/api/v1/streams/{id}` | DELETE | Yes |
| Subscribe | `/api/v1/users/me/subscriptions` | POST | No** |
| Subscribers | `/api/v1/streams/{id}/members` | GET | No |
| Topics | `/api/v1/users/me/{id}/topics` | GET | No |
| Groups | `/api/v1/user_groups` | GET | No |
| Groups | `/api/v1/user_groups/create` | POST | Yes |
| Invites | `/api/v1/invites` | GET/POST | Yes |
| Emoji | `/api/v1/realm/emoji/{name}` | POST | Yes |
| Linkifiers | `/api/v1/realm/filters` | POST | Yes |
| Settings | `/api/v1/server_settings` | GET | No |

\* Requires `can_create_users` permission  
\** Admins can subscribe others; members can subscribe themselves
