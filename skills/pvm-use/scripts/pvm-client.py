#!/usr/bin/env python3
"""
PVM Client — Request and poll for temporary AWS permissions.

Usage:
    # Request + poll in one command
    python3 pvm-client.py request \
        --name "my-agent" \
        --action s3:GetObject \
        --resource "arn:aws:s3:::my-bucket/*" \
        --minutes 30

    # Just check status
    python3 pvm-client.py status <request_id>

    # Poll until terminal
    python3 pvm-client.py poll <request_id> --timeout 3600

Environment:
    PVM_API_BASE            — Required. API Gateway base URL
    PVM_REQUESTER_IDENTITY  — Optional. Auto-detected on EC2
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error


def get_config():
    """Load config from environment."""
    base = os.environ.get("PVM_API_BASE", "")
    if not base:
        # Try loading from config file
        config_path = os.path.join(os.path.dirname(__file__), "..", "config", "pvm.env")
        if os.path.exists(config_path):
            with open(config_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ.setdefault(key.strip(), val.strip().strip('"'))
            base = os.environ.get("PVM_API_BASE", "")
    if not base:
        print("ERROR: Set PVM_API_BASE environment variable", file=sys.stderr)
        sys.exit(1)
    return base.rstrip("/")


def detect_identity():
    """Auto-detect IAM identity from EC2 metadata."""
    identity = os.environ.get("PVM_REQUESTER_IDENTITY", "")
    if identity:
        return identity
    try:
        # IMDSv2
        token_req = urllib.request.Request(
            "http://169.254.169.254/latest/api/token",
            method="PUT",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
        )
        token = urllib.request.urlopen(token_req, timeout=2).read().decode()
        info_req = urllib.request.Request(
            "http://169.254.169.254/latest/meta-data/iam/info",
            headers={"X-aws-ec2-metadata-token": token},
        )
        info = json.loads(urllib.request.urlopen(info_req, timeout=2).read())
        return info.get("InstanceProfileArn", "unknown")
    except Exception:
        return "unknown"


def api_call(base, method, path, body=None):
    """Make an API call, return (status_code, parsed_json)."""
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            body = {"error": str(e)}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}


def cmd_request(args):
    """Submit a permission request and optionally poll."""
    base = get_config()
    identity = args.identity or detect_identity()

    permissions = []
    for action, resource in zip(args.action, args.resource):
        permissions.append({"action": action, "resource": resource})

    body = {
        "requester": {"identity": identity, "name": args.name},
        "permissions_requested": permissions,
        "expiration_minutes": args.minutes,
    }

    code, resp = api_call(base, "POST", "/permissions/request", body)
    if code < 200 or code >= 300:
        print(f"❌ Request failed (HTTP {code})")
        print(json.dumps(resp, indent=2))
        sys.exit(1)

    request_id = resp.get("request_id", "")
    print(f"✅ Request submitted")
    print(f"   Request ID: {request_id}")
    print(f"   Status: PENDING")

    if args.poll:
        print()
        return do_poll(base, request_id, args.timeout, args.interval)
    else:
        print(f"\nNext: python3 pvm-client.py poll '{request_id}'")


def cmd_status(args):
    """Check status of a request."""
    base = get_config()
    encoded = urllib.parse.quote(args.request_id, safe="")
    code, resp = api_call(base, "GET", f"/permissions/status/{encoded}")
    if code == 404:
        print(f"❌ Request not found")
        sys.exit(1)
    print(json.dumps(resp, indent=2))


def cmd_poll(args):
    """Poll until terminal state."""
    base = get_config()
    do_poll(base, args.request_id, args.timeout, args.interval)


def do_poll(base, request_id, timeout=3600, interval=10):
    """Poll loop. Returns 0 on ACTIVE, 1 on DENIED/FAILED."""
    encoded = urllib.parse.quote(request_id, safe="")
    start = time.time()
    last_status = ""

    print(f"🔍 Polling: {request_id[:80]}...")
    print(f"   Timeout: {timeout}s | Interval: {interval}s\n")

    while True:
        elapsed = time.time() - start
        if elapsed >= timeout:
            print(f"\n❌ TIMEOUT after {timeout}s")
            sys.exit(1)

        code, resp = api_call(base, "GET", f"/permissions/status/{encoded}")
        if code == 0:
            print(f"   ⚠️  Connection error, retrying...")
            time.sleep(interval)
            continue

        status = resp.get("status", "UNKNOWN").upper()

        if status != last_status:
            ts = time.strftime("%H:%M:%S")
            print(f"   {ts} Status: {status}")
            last_status = status

        if status in ("ACTIVE", "COMPLETED"):
            print(f"\n✅ Permissions GRANTED!")
            print(f"   Your IAM role now has the requested permissions.")
            sys.exit(0)
        elif status == "DENIED":
            print(f"\n❌ Request DENIED by approver")
            sys.exit(1)
        elif status == "FAILED":
            print(f"\n❌ Request FAILED: {resp.get('error_message', 'unknown')}")
            sys.exit(1)
        elif status == "REVOKED":
            print(f"\n⏰ Permissions already REVOKED (expired)")
            sys.exit(0)

        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="PVM Client — Temporary AWS permissions")
    sub = parser.add_subparsers(dest="command", required=True)

    # request
    p_req = sub.add_parser("request", help="Submit permission request")
    p_req.add_argument("--name", required=True, help="Requester name")
    p_req.add_argument("--action", required=True, action="append", help="IAM action (repeatable)")
    p_req.add_argument("--resource", required=True, action="append", help="Resource ARN (repeatable)")
    p_req.add_argument("--minutes", type=int, required=True, help="Duration after approval (5-10080)")
    p_req.add_argument("--identity", default="", help="IAM role ARN (auto-detected if omitted)")
    p_req.add_argument("--poll", action="store_true", default=True, help="Poll after submitting (default: true)")
    p_req.add_argument("--no-poll", action="store_false", dest="poll", help="Don't poll, just submit")
    p_req.add_argument("--timeout", type=int, default=3600, help="Poll timeout in seconds (default: 3600)")
    p_req.add_argument("--interval", type=int, default=10, help="Poll interval in seconds (default: 10)")

    # status
    p_stat = sub.add_parser("status", help="Check request status")
    p_stat.add_argument("request_id", help="Request ID from submission")

    # poll
    p_poll = sub.add_parser("poll", help="Poll until terminal state")
    p_poll.add_argument("request_id", help="Request ID from submission")
    p_poll.add_argument("--timeout", type=int, default=3600, help="Timeout in seconds")
    p_poll.add_argument("--interval", type=int, default=10, help="Interval in seconds")

    args = parser.parse_args()

    if args.command == "request":
        cmd_request(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "poll":
        cmd_poll(args)


if __name__ == "__main__":
    main()
