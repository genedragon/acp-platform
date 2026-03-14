#!/home/zulip/deployments/current/.venv/bin/python3
"""
create-agent-bot.py
===================
Create a proper Zulip bot account for an OpenClaw agent identity using
Django's internal action layer (same code path as the web UI).

This is the CORRECT method for ACP self-hosted instances. Unlike the REST API
(POST /api/v1/bots), the Django approach creates accounts with is_bot=True
and bot_type=DEFAULT_BOT — which is what the Zulip web UI does.

Usage:
    sudo -u zulip python3 create-agent-bot.py --admin-email admin@your-realm.org --name "webMaster" --email "webmaster-bot@acp.wardcrew.org"
    sudo -u zulip python3 create-agent-bot.py --admin-email admin@your-realm.org --batch agents.json
    sudo -u zulip python3 create-agent-bot.py --admin-email admin@your-realm.org --name "testBot" --email "test-bot@acp.wardcrew.org" --dry-run

Requirements:
    - Must run as the 'zulip' system user (sudo -u zulip)
    - Zulip server must be installed at /home/zulip/deployments/current
    - Admin account specified by --admin-email must exist in the realm
    - Use a dedicated service account for --admin-email, not a personal address
"""

import sys
import os
import json
import argparse
import logging

# ── Bootstrap Django environment ─────────────────────────────────────────────
ZULIP_DEPLOYMENT = "/home/zulip/deployments/current"
sys.path.insert(0, ZULIP_DEPLOYMENT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "zproject.settings")

import django
django.setup()
# ─────────────────────────────────────────────────────────────────────────────

from zerver.models import UserProfile, Realm
from zerver.actions.create_user import do_create_user
from django.db import IntegrityError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def get_realm(realm_id: int = None) -> Realm:
    """Get the ACP realm (ID=2 for standard ACP installs)."""
    if realm_id:
        return Realm.objects.get(id=realm_id)
    # Exclude the internal system bot realm (always ID=1, string_id='zulipinternal')
    realm = Realm.objects.exclude(string_id="zulipinternal").first()
    if not realm:
        raise RuntimeError("No non-internal realm found. Is the Zulip server set up?")
    return realm


def get_acting_user(realm: Realm, admin_email: str) -> UserProfile:
    """Get the admin user who will own created bots.

    Use a dedicated service account for admin_email, not a personal address.
    If that account is compromised, all bot accounts it owns are at risk.
    """
    try:
        return UserProfile.objects.get(realm=realm, delivery_email__iexact=admin_email)
    except UserProfile.DoesNotExist:
        raise RuntimeError(
            f"Admin user '{admin_email}' not found in realm '{realm.name}'. "
            "Use --admin-email to specify a valid admin account. "
            "Tip: use a dedicated service account, not a personal email."
        )


def create_bot(
    name: str,
    email: str,
    realm: Realm,
    acting_user: UserProfile,
    dry_run: bool = False,
    allow_upgrade: bool = False,
) -> dict:
    """
    Create a proper Zulip bot account using do_create_user with bot_type=DEFAULT_BOT.

    Returns a dict with: name, email, api_key, user_id, is_bot, status
    """
    # Check for existing account
    existing = UserProfile.objects.filter(
        realm=realm, delivery_email__iexact=email
    ).first()

    if existing:
        if existing.is_bot:
            log.warning(f"Bot already exists: {name} <{email}> (ID={existing.id}) — skipping")
            return {
                "name": existing.full_name,
                "email": existing.delivery_email,
                "api_key": existing.api_key,
                "user_id": existing.id,
                "is_bot": existing.is_bot,
                "status": "existing",
            }
        else:
            # Regular user account exists — require explicit opt-in to upgrade
            if not allow_upgrade:
                raise RuntimeError(
                    f"Account '{email}' (ID={existing.id}) already exists as a regular user (is_bot=False). "
                    "Converting a human account to a bot is potentially irreversible. "
                    "Pass --allow-upgrade to explicitly authorize this conversion."
                )
            log.warning(
                f"⚠️  Upgrading existing user account to bot: {email} (ID={existing.id}). "
                "This may be irreversible in some Zulip versions."
            )
            if not dry_run:
                existing.is_bot = True
                existing.bot_type = UserProfile.DEFAULT_BOT
                existing.bot_owner = acting_user
                existing.is_active = True
                existing.full_name = name
                existing.save(update_fields=["is_bot", "bot_type", "bot_owner", "is_active", "full_name"])
                log.info(f"Upgraded: {name} <{email}> (ID={existing.id}) → is_bot=True")
            return {
                "name": name,
                "email": email,
                "api_key": existing.api_key,
                "user_id": existing.id,
                "is_bot": True,
                "status": "upgraded",
            }

    if dry_run:
        log.info(f"[DRY-RUN] Would create bot: {name} <{email}>")
        return {
            "name": name,
            "email": email,
            "api_key": "(dry-run)",
            "user_id": None,
            "is_bot": True,
            "status": "dry-run",
        }

    bot = do_create_user(
        email=email,
        password=None,
        realm=realm,
        full_name=name,
        bot_type=UserProfile.DEFAULT_BOT,
        bot_owner=acting_user,
        acting_user=acting_user,
    )
    log.info(f"Created bot: {bot.full_name} <{bot.delivery_email}> (ID={bot.id})")
    return {
        "name": bot.full_name,
        "email": bot.delivery_email,
        "api_key": bot.api_key,
        "user_id": bot.id,
        "is_bot": bot.is_bot,
        "status": "created",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Create proper Zulip bot accounts for OpenClaw agent identities",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EXAMPLES:
  # Create a single bot
  sudo -u zulip python3 create-agent-bot.py \\
      --admin-email svc-botowner@your-realm.org \\
      --name "webMaster" --email "webmaster-bot@acp.wardcrew.org"

  # Batch create from JSON
  sudo -u zulip python3 create-agent-bot.py \\
      --admin-email svc-botowner@your-realm.org \\
      --batch agents.json

  # Dry-run (show what would be created)
  sudo -u zulip python3 create-agent-bot.py \\
      --admin-email svc-botowner@your-realm.org \\
      --name "prodMan" --email "prodman-bot@acp.wardcrew.org" --dry-run

  # Output JSON for scripting
  sudo -u zulip python3 create-agent-bot.py \\
      --admin-email svc-botowner@your-realm.org \\
      --name "webMaster" --email "webmaster-bot@acp.wardcrew.org" --json

  # Allow upgrading an existing user account to a bot (use with care)
  sudo -u zulip python3 create-agent-bot.py \\
      --admin-email svc-botowner@your-realm.org \\
      --name "webMaster" --email "webmaster@your-realm.org" --allow-upgrade

BATCH JSON FORMAT:
  [
    {"name": "webMaster",    "email": "webmaster-bot@acp.wardcrew.org"},
    {"name": "sysArchitect", "email": "sysarchitect-bot@acp.wardcrew.org"},
    {"name": "prodMan",      "email": "prodman-bot@acp.wardcrew.org"}
  ]

SECURITY NOTES:
  - Use a dedicated service account for --admin-email, NOT a personal email.
    If that account is compromised, all bots it owns are at risk.
  - --allow-upgrade converts human user accounts to bots. This may be irreversible
    in some Zulip versions. Only use it when you are certain the account is safe to convert.
  - API keys returned by this script grant full bot access. Store them securely.
        """,
    )
    parser.add_argument("--name",         help="Bot display name (e.g. 'webMaster')")
    parser.add_argument("--email",        help="Bot email (e.g. 'webmaster-bot@acp.wardcrew.org')")
    parser.add_argument("--batch",        help="JSON file with list of {name, email} objects")
    parser.add_argument("--admin-email",  required=True,
                        help="Admin user email (bot owner). Required. "
                             "Use a dedicated service account, NOT a personal email address.")
    parser.add_argument("--realm-id",     type=int, default=None,
                        help="Realm ID (default: auto-detect non-internal realm)")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Show what would be created without making changes")
    parser.add_argument("--json",         action="store_true",
                        help="Output results as JSON (useful for scripting)")
    parser.add_argument("--allow-upgrade", action="store_true",
                        help="Allow converting existing regular user accounts to bot accounts. "
                             "⚠️  Potentially irreversible. Only use when the account is safe to convert.")
    parser.add_argument("--max-batch",    type=int, default=100,
                        help="Maximum bots allowed in a single batch run (default: 100). "
                             "Safety limit to prevent accidental mass creation.")

    args = parser.parse_args()

    if not args.batch and not (args.name and args.email):
        parser.error("Provide either --name + --email for a single bot, or --batch FILE for multiple")

    realm = get_realm(args.realm_id)
    acting_user = get_acting_user(realm, args.admin_email)

    results = []

    if args.batch:
        with open(args.batch) as f:
            bots = json.load(f)
        if len(bots) > args.max_batch:
            parser.error(
                f"Batch file contains {len(bots)} entries, exceeding --max-batch limit of {args.max_batch}. "
                "Increase --max-batch or split into smaller files."
            )
        for bot in bots:
            result = create_bot(
                name=bot["name"],
                email=bot["email"],
                realm=realm,
                acting_user=acting_user,
                dry_run=args.dry_run,
                allow_upgrade=args.allow_upgrade,
            )
            results.append(result)
    else:
        result = create_bot(
            name=args.name,
            email=args.email,
            realm=realm,
            acting_user=acting_user,
            dry_run=args.dry_run,
            allow_upgrade=args.allow_upgrade,
        )
        results.append(result)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print()
        print("=" * 60)
        print(f"{'Bot Creation Summary':^60}")
        print("=" * 60)
        for r in results:
            status_icon = {"created": "✅", "existing": "⏭️", "upgraded": "🔧", "dry-run": "🔍"}.get(r["status"], "?")
            print(f"{status_icon} {r['name']}")
            print(f"   Email:   {r['email']}")
            print(f"   API key: {r['api_key']}")
            print(f"   User ID: {r['user_id']}")
            print(f"   Status:  {r['status']}")
            print()

        created = sum(1 for r in results if r["status"] == "created")
        upgraded = sum(1 for r in results if r["status"] == "upgraded")
        skipped = sum(1 for r in results if r["status"] in ("existing", "dry-run"))
        print(f"Created: {created}  Upgraded: {upgraded}  Skipped: {skipped}")


if __name__ == "__main__":
    main()
