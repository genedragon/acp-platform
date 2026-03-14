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
    sudo -u zulip python3 create-agent-bot.py --name "webMaster" --email "webmaster-bot@acp.wardcrew.org"
    sudo -u zulip python3 create-agent-bot.py --batch agents.json
    sudo -u zulip python3 create-agent-bot.py --name "testBot" --email "test-bot@acp.wardcrew.org" --dry-run

Requirements:
    - Must run as the 'zulip' system user (sudo -u zulip)
    - Zulip server must be installed at /home/zulip/deployments/current
    - Gene's admin account (gene.alpert@gmail.com) must exist in the realm
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


def get_acting_user(realm: Realm, admin_email: str = "gene.alpert@gmail.com") -> UserProfile:
    """Get the admin user who will own created bots."""
    try:
        return UserProfile.objects.get(realm=realm, delivery_email__iexact=admin_email)
    except UserProfile.DoesNotExist:
        raise RuntimeError(
            f"Admin user '{admin_email}' not found in realm '{realm.name}'. "
            "Use --admin-email to specify a different admin account."
        )


def create_bot(
    name: str,
    email: str,
    realm: Realm,
    acting_user: UserProfile,
    dry_run: bool = False,
) -> dict:
    """
    Create a proper Zulip bot account using do_create_user with bot_type=DEFAULT_BOT.

    Returns a dict with: name, email, api_key, user_id, is_bot
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
            log.warning(
                f"User account exists for {email} (ID={existing.id}, is_bot=False). "
                "Upgrading to proper bot account..."
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
  sudo -u zulip python3 create-agent-bot.py --name "webMaster" --email "webmaster-bot@acp.wardcrew.org"

  # Batch create from JSON
  sudo -u zulip python3 create-agent-bot.py --batch agents.json

  # Dry-run (show what would be created)
  sudo -u zulip python3 create-agent-bot.py --name "prodMan" --email "prodman-bot@acp.wardcrew.org" --dry-run

  # Output JSON for scripting
  sudo -u zulip python3 create-agent-bot.py --name "webMaster" --email "webmaster-bot@acp.wardcrew.org" --json

BATCH JSON FORMAT:
  [
    {"name": "webMaster",    "email": "webmaster-bot@acp.wardcrew.org"},
    {"name": "sysArchitect", "email": "sysarchitect-bot@acp.wardcrew.org"},
    {"name": "prodMan",      "email": "prodman-bot@acp.wardcrew.org"}
  ]

NOTES:
  - Must run as the 'zulip' system user (use: sudo -u zulip python3 ...)
  - Creates accounts with is_bot=True, bot_type=DEFAULT_BOT (Generic bot)
  - This is equivalent to creating via Zulip web UI Settings → Bots → Add a new bot
  - If an account exists as a regular user, it will be upgraded to a bot account
  - API keys are auto-generated by Zulip and returned on creation
        """,
    )
    parser.add_argument("--name",         help="Bot display name (e.g. 'webMaster')")
    parser.add_argument("--email",        help="Bot email (e.g. 'webmaster-bot@acp.wardcrew.org')")
    parser.add_argument("--batch",        help="JSON file with list of {name, email} objects")
    parser.add_argument("--admin-email",  default="gene.alpert@gmail.com",
                        help="Admin user email (bot owner). Default: gene.alpert@gmail.com")
    parser.add_argument("--realm-id",     type=int, default=None,
                        help="Realm ID (default: auto-detect non-internal realm)")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Show what would be created without making changes")
    parser.add_argument("--json",         action="store_true",
                        help="Output results as JSON (useful for scripting)")

    args = parser.parse_args()

    if not args.batch and not (args.name and args.email):
        parser.error("Provide either --name + --email for a single bot, or --batch FILE for multiple")

    realm = get_realm(args.realm_id)
    acting_user = get_acting_user(realm, args.admin_email)

    results = []

    if args.batch:
        with open(args.batch) as f:
            bots = json.load(f)
        for bot in bots:
            result = create_bot(
                name=bot["name"],
                email=bot["email"],
                realm=realm,
                acting_user=acting_user,
                dry_run=args.dry_run,
            )
            results.append(result)
    else:
        result = create_bot(
            name=args.name,
            email=args.email,
            realm=realm,
            acting_user=acting_user,
            dry_run=args.dry_run,
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
