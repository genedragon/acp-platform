# User Management Without Outgoing Mail

ACP instances often run **without an outgoing mail server** (no SES, no SMTP). This means:

- ❌ Email invitations don't work
- ❌ Password reset emails don't work
- ❌ Email notifications don't work
- ❌ The "Invite users" button in Zulip's UI is useless

All user management must be done via **Django management commands** on the server.

> **Who runs these:** Anyone with `sudo` SSH access to the EC2 instance. Commands run as the `zulip` system user.

---

## Script 1: Create a New Human User

Creates a user who can log in immediately with the specified password. No email sent.

```bash
#!/bin/bash
# Usage: ./create-user.sh "email@example.com" "Full Name" "password123"

EMAIL="${1:?Usage: $0 email full_name password}"
FULL_NAME="${2:?Usage: $0 email full_name password}"
PASSWORD="${3:?Usage: $0 email full_name password}"

sudo -u zulip /home/zulip/deployments/current/manage.py shell << PYEOF
from zerver.lib.users import create_user
from zerver.models import Realm, UserProfile

realm = Realm.objects.get(id=2)

from zerver.models import get_user_by_delivery_email
try:
    existing = get_user_by_delivery_email(email='${EMAIL}', realm=realm)
    print(f"ERROR: User '${EMAIL}' already exists (id={existing.id})")
except UserProfile.DoesNotExist:
    user = create_user(
        email='${EMAIL}',
        password='${PASSWORD}',
        realm=realm,
        full_name='${FULL_NAME}',
        acting_user=None
    )
    user.delivery_email = '${EMAIL}'
    user.save()
    print(f"✅ User created: {user.full_name} <{user.delivery_email}> (id={user.id})")
    print(f"   Login at: https://YOUR-DOMAIN")
PYEOF
```

> ⚠️ **Always set `delivery_email` explicitly.** In some Zulip configurations, `create_user` sets `email` but leaves `delivery_email` empty — which breaks the auth chain silently (user gets "account not found" on login).

---

## Script 2: Reset a User's Password

Since password reset emails don't work, reset directly via Django:

```bash
#!/bin/bash
# Usage: ./reset-password.sh "email@example.com" "newpassword123"

EMAIL="${1:?Usage: $0 email new_password}"
NEW_PASSWORD="${2:?Usage: $0 email new_password}"

sudo -u zulip /home/zulip/deployments/current/manage.py shell << PYEOF
from zerver.models import Realm, UserProfile, get_user_by_delivery_email

realm = Realm.objects.get(id=2)

try:
    user = get_user_by_delivery_email(email='${EMAIL}', realm=realm)
    user.set_password('${NEW_PASSWORD}')
    user.save()
    print(f"✅ Password reset for: {user.full_name} <{user.delivery_email}>")
except UserProfile.DoesNotExist:
    print(f"ERROR: User '${EMAIL}' not found in realm")
PYEOF
```

> ⚠️ **Always use `set_password()`** — never set the password field directly via raw SQL. Zulip uses Django's password hashing; a raw string won't match during authentication.

---

## Script 3: Create a Bot Account

Bots authenticate by API key (not password):

```bash
#!/bin/bash
# Usage: ./create-bot.sh "botname-bot@YOUR-DOMAIN" "BotDisplayName"

BOT_EMAIL="${1:?Usage: $0 bot_email display_name}"
BOT_NAME="${2:?Usage: $0 bot_email display_name}"

sudo -u zulip /home/zulip/deployments/current/manage.py shell << PYEOF
from zerver.lib.users import create_user
from zerver.models import Realm, UserProfile

realm = Realm.objects.get(id=2)

bot = create_user(
    email='${BOT_EMAIL}',
    password=None,
    realm=realm,
    full_name='${BOT_NAME}',
    acting_user=None
)
bot.is_bot = True
bot.bot_type = UserProfile.DEFAULT_BOT
bot.delivery_email = '${BOT_EMAIL}'
bot.save()

print(f"✅ Bot created: {bot.full_name} <{bot.delivery_email}> (id={bot.id})")
print(f"   API Key: {bot.api_key}")
print(f"   >>> SAVE THIS API KEY — needed for openclaw.json <<<")
PYEOF
```

---

## Script 4: List All Users

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'PYEOF'
from zerver.models import Realm, UserProfile

realm = Realm.objects.get(id=2)
users = UserProfile.objects.filter(realm=realm, is_active=True).order_by('date_joined')

print(f"{'Type':<6} {'ID':<6} {'Name':<25} {'Email':<40} {'API Key'}")
print("-" * 110)
for u in users:
    utype = "BOT" if u.is_bot else "USER"
    api = u.api_key if u.is_bot else "(n/a)"
    print(f"{utype:<6} {u.id:<6} {u.full_name:<25} {u.delivery_email:<40} {api}")
PYEOF
```

---

## Script 5: Deactivate a User

```bash
#!/bin/bash
# Usage: ./deactivate-user.sh "email@example.com"

EMAIL="${1:?Usage: $0 email}"

sudo -u zulip /home/zulip/deployments/current/manage.py shell << PYEOF
from zerver.lib.actions import do_deactivate_user
from zerver.models import Realm, get_user_by_delivery_email

realm = Realm.objects.get(id=2)
user = get_user_by_delivery_email(email='${EMAIL}', realm=realm)
do_deactivate_user(user, acting_user=None)
print(f"✅ Deactivated: {user.full_name} <{user.delivery_email}>")
PYEOF
```

---

## Generate Reusable Invite Links (Alternative)

For self-service sign-up without email:

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py generate_invite_links \
  --count 10 --expiry-days 30
```

Prints invite URLs that users visit to create their own accounts. Useful for onboarding multiple users at once.

---

## Quick Reference

| Operation | Without Mail | With Mail (SES/SMTP) |
|-----------|-------------|---------------------|
| **Create user** | Script 1 (Django shell) | Zulip UI → Invite |
| **Reset password** | Script 2 (Django shell) | Zulip UI → "Forgot password" |
| **Create bot** | Script 3 (Django shell) | Zulip Settings → Bots → Add |
| **List users** | Script 4 (Django shell) | Zulip admin panel |
| **Deactivate user** | Script 5 (Django shell) | Zulip admin → Users → Deactivate |
| **Bulk invite** | `generate_invite_links` | Zulip UI → Invite → email list |
| **Notifications** | Not available | Email digests, missed messages |
