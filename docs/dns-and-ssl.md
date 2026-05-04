# DNS & SSL Setup

ACP requires a domain name pointing to the EC2 instance. This guide covers DNS configuration for any domain and SSL certificate setup via Let's Encrypt.

---

## Choose Your Domain

Decide before starting the deployment. All docs use `YOUR-DOMAIN` as the placeholder.

| Option | Example | Notes |
|--------|---------|-------|
| **Subdomain of existing domain** | `acp.yourdomain.com` | Easiest — add an A record in your DNS provider |
| **New dedicated domain** | `youracpplatform.com` | Register first; allow 24–48h for propagation |
| **Apex domain** | `yourdomain.com` | Works, but subdomains are more flexible |

---

## DNS Record Setup

**Minimum required:** A single **A record** pointing your domain to the Elastic IP.

```
Type: A
Name: acp (or @ for apex)
Value: <Elastic IP from Phase 0>
TTL: 300 (5 min — low for initial setup, increase later)
```

### Verify Propagation

```bash
dig +short YOUR-DOMAIN
# Must return your Elastic IP
```

If the IP doesn't resolve, wait for propagation (can take minutes to hours depending on registrar).

---

## Where the Domain Appears

Every `YOUR-DOMAIN` placeholder must be replaced with your chosen domain:

| Phase | File/Command | What to Set |
|-------|-------------|-------------|
| **2** | Zulip `--hostname=` | `--hostname=YOUR-DOMAIN` |
| **3** | RealmDomain mapping | `domain='YOUR-DOMAIN'` |
| **6** | `openclaw.json` → `baseUrl` | `"https://YOUR-DOMAIN"` |
| **6** | `openclaw.json` → `botEmail` | `"bot@YOUR-DOMAIN"` |
| **6** | `/etc/hosts` | `127.0.0.1 YOUR-DOMAIN` |
| **7** | Let's Encrypt `--hostname=` | `--hostname=YOUR-DOMAIN` |

---

## Cloudflare Configuration (Recommended)

If using Cloudflare as DNS provider/proxy:

| Setting | Value | Why |
|---------|-------|-----|
| **Proxy status** | Proxied (orange cloud) | DDoS protection, hides origin IP |
| **SSL/TLS mode** | Full (Strict) | End-to-end encryption |
| **Minimum TLS** | 1.2 | Security baseline |
| **Always Use HTTPS** | On | Redirects HTTP → HTTPS |

### Cloudflare + Let's Encrypt Gotcha

> ⚠️ **If using Cloudflare proxy + Let's Encrypt:** Temporarily set the A record to **DNS only** (grey cloud) during `certbot` setup so the ACME HTTP-01 challenge reaches the origin directly. Re-enable proxy after the cert is issued.

**Alternative:** Use Cloudflare's Origin CA certificate instead of Let's Encrypt — this avoids the proxy toggle entirely.

---

## Direct DNS (No Proxy)

If using Route 53, Google Domains, Namecheap, or another registrar without a proxy layer:

1. Add the A record as shown above
2. Wait for propagation: `dig +short YOUR-DOMAIN`
3. Proceed directly to SSL setup — no proxy complications

---

## SSL Certificate Setup (Let's Encrypt)

### Prerequisites

- DNS A record must point to the Elastic IP
- **Port 80 must be open** in the EC2 security group (Let's Encrypt ACME HTTP-01 requires it)
- If using Cloudflare: set to DNS-only (grey cloud) during cert issuance

### Install Certificate

```bash
sudo /home/zulip/deployments/current/scripts/setup/setup-certbot \
  --hostname=YOUR-DOMAIN --email=admin@example.com
```

### Verify

```bash
curl -s https://YOUR-DOMAIN/api/v1/server_settings | jq .zulip_version
# Should return the Zulip version string
```

---

## Troubleshooting

### Certbot "Timeout during connect (likely firewall problem)"

```
Detail: YOUR-ELASTIC-IP: Fetching http://YOUR-DOMAIN/.well-known/acme-challenge/...: Timeout during connect
```

**Cause:** Let's Encrypt CA cannot reach port 80 on the instance.

**Fix (in order of likelihood):**

1. **Security group:** Verify inbound TCP port 80 is open from `0.0.0.0/0`
2. **Cloudflare proxy:** Switch to DNS-only (grey cloud), re-run certbot, then re-enable proxy
3. **nginx not running:** `sudo systemctl status nginx` — it should be active

**Quick test from your local machine:**
```bash
curl -v http://YOUR-DOMAIN/
# If it times out: port 80 is blocked (SG or Cloudflare)
# If it connects: certbot should work
```

### "Could not connect to the Certbot server"

Outbound internet is blocked. Check the EC2 security group allows outbound traffic (default allows all outbound).

### Certificate Renewal

Let's Encrypt certs expire after 90 days. Zulip's certbot setup includes an automatic renewal cron job. Verify:

```bash
sudo certbot renew --dry-run
```
