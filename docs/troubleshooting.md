# Troubleshooting

Common issues and their fixes, organized by deployment phase. Each rule represents real debugging time from production deployments.

---

## Quick Reference: Deployment Rules

| # | Rule | Impact if Violated |
|---|------|-------------------|
| 1 | **Never pre-install PostgreSQL** — Zulip installs its own | Installer fails or creates conflicting clusters |
| 2 | **Use `--postgresql-version=16`** on ARM/Graviton | PG18 `io_uring` crashes under load |
| 3 | **Installer path is `scripts/setup/install`** (not `./install`) | Wrong binary, cryptic errors |
| 4 | **`gateway.mode: "local"`** must be in openclaw.json | Gateway refuses to start |
| 5 | **Install peer deps IN the plugin directory** | Plugin fails to load |
| 6 | **Use `npm install --prefix /usr/local`** for OpenClaw | Avoids conflict with Zulip's bundled Node |
| 7 | **Add `127.0.0.1 YOUR-DOMAIN` to `/etc/hosts`** | OpenClaw can't reach Zulip (EC2 can't route to own public IP) |
| 8 | **Set `AWS_PROFILE=default`** in systemd + create `~/.aws/config` | Bedrock auth fails silently on OpenClaw ≥2026.4.x |
| 9 | **Use `rm -rf` (not `rm -f`)** before creating symlinks | `npm install` creates real dirs that block symlinks |
| 10 | **Move old plugins OUTSIDE extensions dir** when upgrading | OpenClaw scans all of extensions/ and loads duplicate plugins |
| 11 | **Set RealmDomain mapping** in Zulip | Auth chain breaks — users/bots get "not found" |
| 12 | **Test a DM (not just connectivity)** after starting gateway | Zulip connection succeeds even when Bedrock auth is broken |
| 13 | **Request Bedrock model access in console** before first deploy | IAM permissions alone are not enough — models must be explicitly enabled per-account per-region |

---

## Phase 0: AWS Infrastructure

### CloudFormation stack creation fails

- **"Key pair not found"**: Verify the key pair exists in the target region: `aws ec2 describe-key-pairs --region YOUR-REGION`
- **"Insufficient permissions"**: Your IAM user needs CloudFormation, EC2, IAM, and S3 permissions
- **Stack rollback**: Check CloudFormation events in the console for the specific resource that failed

### DNS doesn't resolve

```bash
dig +short YOUR-DOMAIN
# Empty = DNS not propagated yet
```

Wait 5–60 minutes. If using a new domain/registrar, can take up to 48 hours.

---

## Phase 2: Zulip Installation

### Installer fails with PostgreSQL errors

**Symptom:** Errors about conflicting PostgreSQL versions or missing clusters.

**Cause:** PostgreSQL was pre-installed. Zulip needs to install its own.

**Fix:**
```bash
sudo apt-get purge -y postgresql* 2>/dev/null
# Then re-run the Zulip installer
```

### `io_uring` crashes on ARM/Graviton

**Symptom:** PostgreSQL crashes under load with kernel-level errors.

**Cause:** PostgreSQL 18 has `io_uring` memory allocation issues on ARM.

**Fix:** Reinstall Zulip with `--postgresql-version=16`.

### Wrong installer binary

**Symptom:** Cryptic errors during install.

**Cause:** Running `./install` at the repo root instead of `scripts/setup/install`.

**Fix:** Use the correct path:
```bash
sudo scripts/setup/install --hostname=YOUR-DOMAIN ...
```

---

## Phase 3: Zulip Configuration

### "User not found" on login

**Cause 1: Missing RealmDomain mapping** (most common)

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "
from zerver.models import Realm, RealmDomain
realm = Realm.objects.get(id=2)
print(list(RealmDomain.objects.filter(realm=realm).values('domain')))
"
```

If empty, add it:
```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "
from zerver.models import Realm, RealmDomain
realm = Realm.objects.get(id=2)
RealmDomain.objects.get_or_create(realm=realm, domain='YOUR-DOMAIN')
"
```

**Cause 2: Empty `delivery_email`**

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "
from zerver.models import UserProfile
for u in UserProfile.objects.filter(delivery_email=''):
    print(f'  BROKEN: id={u.id} email={u.email} name={u.full_name}')
"
```

Fix broken users:
```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell -c "
from zerver.models import UserProfile
for u in UserProfile.objects.filter(delivery_email=''):
    u.delivery_email = u.email
    u.save()
    print(f'  Fixed: {u.email}')
"
```

### Zulip auth chain reference

```
hostname → RealmDomain → Realm → get_user_by_delivery_email() → check_password()
```

A break at any link produces "user not found."

---

## Phase 4: OpenClaw Installation

### `openclaw` command not found

Check the install prefix and PATH:
```bash
which openclaw                    # Should be /usr/local/bin/openclaw
ls /usr/local/lib/node_modules/openclaw/package.json  # Should exist
```

If it installed under Zulip's Node instead:
```bash
sudo npm uninstall -g openclaw
sudo npm install -g --prefix /usr/local openclaw@latest
```

---

## Phase 5: Zulip Plugin

### "Cannot find module" errors on gateway start

**Symptom:** `Error: Cannot find module '/usr/local/lib/node_modules/openclaw/dist/plugin-sdk/...'`

**Cause:** OpenClaw version and plugin version mismatch. The plugin's imports expect a specific version's module layout.

**Fix:** Check the plugin was tested with your OpenClaw version. If on a newer OpenClaw than the plugin supports, downgrade:
```bash
sudo npm install -g --prefix /usr/local openclaw@2026.4.14
# Then recreate symlinks (Phase 5.3)
```

### "duplicate plugin id detected"

**Cause:** Old plugin left inside `~/.openclaw/extensions/`.

**Fix:** Move old plugins **outside** the extensions directory:
```bash
mv ~/.openclaw/extensions/zulip-old-* ~/backups/
systemctl --user restart openclaw-gateway
```

### Symlink creation fails ("Is a directory")

**Cause:** `npm install` created real `node_modules/zod/` directory.

**Fix:** Use `rm -rf` (not `rm -f`):
```bash
rm -rf node_modules/zod node_modules/openclaw
# Then create symlinks as in Phase 5.3
```

---

## Phase 6: OpenClaw Configuration

### Gateway refuses to start (exits immediately)

**Symptom:** `systemctl status` shows `exited, code=1` within seconds.

**Diagnosis:** Run manually to see the real error:
```bash
systemctl --user stop openclaw-gateway
OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
node $OPENCLAW_DIR/lib/node_modules/openclaw/dist/index.js gateway --port 18789
```

Common causes:
- **Missing `gateway.mode: "local"`** → add to openclaw.json
- **Invalid JSON** → `cat ~/.openclaw/openclaw.json | python3 -m json.tool`
- **Plugin load failure** → check symlinks (Phase 5)

### Gateway starts but bot doesn't respond to DMs

**Symptom:** `Zulip ON · OK` in logs, but DMs return errors or silence.

**Cause:** Bedrock auth is broken. Zulip connectivity works but LLM calls fail.

**Fix:** See [bedrock-auth.md](bedrock-auth.md) — add `AWS_PROFILE=default` and `~/.aws/config`.

**Key diagnostic:** Always test with a DM to the bot, not just check that the gateway is running.

### "TypeError: fetch failed" in logs (intermittent)

**Cause:** Missing `/etc/hosts` entry. EC2 can't route to its own public IP.

**Fix:**
```bash
grep YOUR-DOMAIN /etc/hosts
# If empty:
echo "127.0.0.1 YOUR-DOMAIN" | sudo tee -a /etc/hosts
systemctl --user restart openclaw-gateway
```

---

## Phase 7: SSL/TLS

See [dns-and-ssl.md#troubleshooting](dns-and-ssl.md#troubleshooting) for certbot issues (most common: port 80 blocked).

---

## General

### How to view gateway logs

```bash
# Recent logs
journalctl --user -u openclaw-gateway --no-pager -n 50

# Follow live
journalctl --user -u openclaw-gateway -f

# Search for errors
journalctl --user -u openclaw-gateway --no-pager | grep -i "error\|fail\|denied"
```

### How to restart the gateway

```bash
systemctl --user restart openclaw-gateway
sleep 5
systemctl --user status openclaw-gateway
```

### How to check all component versions

```bash
echo "OpenClaw: $(openclaw --version)"
echo "Node.js: $(node --version)"
echo "Zulip: $(curl -s https://YOUR-DOMAIN/api/v1/server_settings 2>/dev/null | jq -r .zulip_version)"
echo "PostgreSQL: $(psql --version | head -1)"
echo "OS: $(uname -srm)"
```
