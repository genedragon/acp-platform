# OpenClaw Upgrade Guide

How to upgrade OpenClaw to a new version on a running ACP instance. Based on real production upgrade experience.

**Estimated time:** ~15 minutes (excluding debugging)

---

## Pre-Upgrade Checklist

```bash
# 1. Verify SSH access
ssh ubuntu@YOUR-ELASTIC-IP "echo OK"

# 2. Check current version
openclaw --version

# 3. Check current gateway status
systemctl --user status openclaw-gateway

# 4. Verify bot is responding (send a test DM in Zulip)

# 5. Check disk space (need at least 2GB free)
df -h /
```

**STOP if any check fails.** Fix the issue before upgrading.

---

## Phase 1: Backup (~2 min)

```bash
BACKUP_DIR="/home/ubuntu/backups/pre-upgrade-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup config
cp ~/.openclaw/openclaw.json "$BACKUP_DIR/"

# Backup plugin
cp -r ~/.openclaw/extensions/zulip "$BACKUP_DIR/zulip-plugin-backup"

# Backup systemd service
cp ~/.config/systemd/user/openclaw-gateway.service "$BACKUP_DIR/"

# Record current state
echo "=== Pre-Upgrade State ===" > "$BACKUP_DIR/state.txt"
echo "Date: $(date)" >> "$BACKUP_DIR/state.txt"
openclaw --version >> "$BACKUP_DIR/state.txt" 2>&1
echo "Node: $(node --version)" >> "$BACKUP_DIR/state.txt"

echo "Backup at: $BACKUP_DIR"
```

---

## Phase 2: Stop Gateway (~1 min)

```bash
systemctl --user stop openclaw-gateway

# Verify
systemctl --user status openclaw-gateway
# Should show: inactive (dead)

pgrep -a openclaw || echo "No openclaw processes — good"
```

---

## Phase 3: Upgrade OpenClaw (~5 min)

```bash
# Check available versions
npm view openclaw versions --json 2>/dev/null | tail -20

# Install target version
sudo npm install -g --prefix /usr/local openclaw@TARGET_VERSION

# Verify
openclaw --version
which openclaw  # Must be /usr/local/bin/openclaw
```

---

## Phase 4: Update Zulip Plugin (~5 min)

> ⚠️ Move old plugin **outside** extensions dir — do NOT rename in place. OpenClaw scans the entire extensions directory.

```bash
# Move old plugin to backup (NOT inside extensions/)
mv ~/.openclaw/extensions/zulip "$BACKUP_DIR/zulip-old"

# Clone fresh plugin
git clone https://github.com/genedragon/openclaw-zulip.git /tmp/openclaw-zulip-new
cp -r /tmp/openclaw-zulip-new ~/.openclaw/extensions/zulip

# Install peer dependencies
cd ~/.openclaw/extensions/zulip
npm install @sinclair/typebox zod

# Recreate symlinks (rm -rf, not rm -f!)
OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
rm -rf node_modules/zod node_modules/openclaw
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw/node_modules/zod" node_modules/zod
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw" node_modules/openclaw

# Verify
ls node_modules/openclaw/package.json  # Must exist
```

---

## Phase 5: Verify Configuration (~2 min)

```bash
# JSON valid?
cat ~/.openclaw/openclaw.json | python3 -m json.tool > /dev/null && echo "JSON OK" || echo "JSON INVALID!"

# Gateway mode set?
grep '"mode"' ~/.openclaw/openclaw.json
# Must show "local"

# /etc/hosts entry?
grep YOUR-DOMAIN /etc/hosts
# Must show 127.0.0.1 YOUR-DOMAIN

# AWS config?
cat ~/.aws/config
# Must show credential_source = Ec2InstanceMetadata
```

### Bedrock Auth (if upgrading to ≥2026.4.x from <2026.4.x)

If the previous version didn't require `AWS_PROFILE`, add it now:

```bash
# Add to systemd service (if not already present)
# Edit: ~/.config/systemd/user/openclaw-gateway.service
# Add under [Service]:
#   Environment=AWS_PROFILE=default
#   Environment=AWS_REGION=us-east-1
#   Environment=AWS_DEFAULT_REGION=us-east-1

# Create AWS config (if not already present)
mkdir -p ~/.aws
cat > ~/.aws/config << 'EOF'
[default]
region = us-east-1
credential_source = Ec2InstanceMetadata
EOF
```

See [bedrock-auth.md](bedrock-auth.md) for the full explanation.

---

## Phase 6: Start Gateway (~2 min)

```bash
systemctl --user daemon-reload
systemctl --user start openclaw-gateway

sleep 5
systemctl --user status openclaw-gateway
# Must show: active (running)

journalctl --user -u openclaw-gateway --no-pager -n 30
```

**Look for:**
- ✅ `"Zulip ON · OK"` — plugin loaded
- ✅ `"Event queue registered"` — connected to Zulip
- ❌ `"plugin-sdk"` errors — symlinks wrong
- ❌ `"duplicate plugin id"` — old plugin still in extensions dir
- ❌ `"COMPAT_DEPRECATED"` — old-style imports
- ❌ `"No API key found for amazon-bedrock"` — [bedrock-auth.md](bedrock-auth.md)

---

## Phase 7: Test (~5 min)

| Test | How | Expected |
|------|-----|----------|
| **DM response** | Send DM to bot in Zulip | Bot responds (tests Bedrock auth) |
| **@mention** | `@**BotName** ping` in a channel | Bot responds |
| **Session persistence** | 3–4 follow-up messages in DM | Context maintained |
| **No deprecation warnings** | `journalctl --user -u openclaw-gateway -n 100 \| grep -i deprecated` | None |

> ⚠️ **Always test a DM** — Zulip connectivity can succeed even when Bedrock auth is broken.

---

## Phase 8: Record Results

```bash
cat > "$BACKUP_DIR/upgrade-record.md" << EOF
# OpenClaw Upgrade Record

**Date:** $(date)
**Previous Version:** PREVIOUS_VERSION
**New Version:** $(openclaw --version)
**Plugin:** genedragon/openclaw-zulip main

## Results
- [ ] Gateway starts without errors
- [ ] Zulip shows ON · OK
- [ ] DM test passed
- [ ] @mention test passed
- [ ] No deprecation warnings

## Issues Found
(list any)
EOF
```

---

## Rollback Procedure

If the upgrade fails at any point:

```bash
# Stop gateway
systemctl --user stop openclaw-gateway

# Restore previous OpenClaw version
sudo npm install -g --prefix /usr/local openclaw@PREVIOUS_VERSION

# Restore old plugin from backup
rm -rf ~/.openclaw/extensions/zulip
cp -r "$BACKUP_DIR/zulip-plugin-backup" ~/.openclaw/extensions/zulip

# Recreate symlinks for the old version
cd ~/.openclaw/extensions/zulip
OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
rm -rf node_modules/zod node_modules/openclaw
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw/node_modules/zod" node_modules/zod
ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw" node_modules/openclaw

# Restore config and service (if changed)
cp "$BACKUP_DIR/openclaw.json" ~/.openclaw/openclaw.json
cp "$BACKUP_DIR/openclaw-gateway.service" ~/.config/systemd/user/

# Restart
systemctl --user daemon-reload
systemctl --user start openclaw-gateway
```
