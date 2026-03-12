#!/usr/bin/env python3
"""
PVM Agent Polling Script

Simple example of how an agent polls the Permissions Vending Machine
to wait for approval and verify revocation.

Usage:
    python3 pvm_agent_poll.py <request_id>

Configuration:
    APPROVAL_TIMEOUT_SECONDS - Must match state machine WaitForApproval TimeoutSeconds
                                Current: 3600s (1 hour)
                                Location: docs/step-functions-state-machine.json
"""

import sys
import time
import requests
from datetime import datetime, timedelta, timezone

# PVM API endpoint
API_BASE = "https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/prod"

# ⚠️  IMPORTANT: Must match WaitForApproval TimeoutSeconds in state machine
APPROVAL_TIMEOUT_SECONDS = 3600  # 1 hour = 3600 seconds

def log(msg):
    """Print with immediate flush for real-time output"""
    print(msg)
    sys.stdout.flush()

def poll_status(request_id):
    """Poll for permission status"""
    try:
        response = requests.get(f"{API_BASE}/permissions/status/{request_id}")
        if response.status_code == 404:
            log(f"❌ Request {request_id} not found")
            return None
        if response.status_code == 403:
            log(f"❌ 403 Forbidden - API Gateway route not configured")
            log(f"   Check that GET /permissions/status/{{requestId}} route exists")
            return None
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as e:
        log(f"⚠️  HTTP Error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except requests.RequestException as e:
        log(f"⚠️  Error polling status: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        log("Usage: python3 pvm_agent_poll.py <request_id>")
        sys.exit(1)
    
    request_id = sys.argv[1]
    start_time = time.time()
    timeout_at = start_time + APPROVAL_TIMEOUT_SECONDS
    
    log(f"🔍 Monitoring request: {request_id}")
    log(f"⏰ Timeout: {APPROVAL_TIMEOUT_SECONDS}s ({int(APPROVAL_TIMEOUT_SECONDS/3600)} hours)\n")
    
    # Phase 1: Wait for approval/grant
    log("📊 Phase 1: Waiting for approval...")
    
    while True:
        # Check timeout
        if time.time() > timeout_at:
            log(f"\n❌ TIMEOUT: No approval received within {int(APPROVAL_TIMEOUT_SECONDS/3600)} hours")
            log(f"   Polling script timed out (matches state machine timeout)")
            sys.exit(1)
        
        status_data = poll_status(request_id)
        
        if not status_data:
            log("⚠️  Failed to get status, retrying in 10s...")
            time.sleep(10)
            continue
        
        status = status_data.get('status', '').upper()  # Normalize to uppercase
        log(f"   Status: {status}")
        
        # Check for failure states
        if status in ['FAILED', 'REVOCATION_FAILED']:
            log(f"\n❌ Request FAILED")
            log(f"   Error: {status_data.get('error_message', 'Unknown error')}")
            log(f"   Failed at: {status_data.get('failed_at', 'Unknown time')}")
            sys.exit(1)
        
        if status == 'ACTIVE':
            log(f"\n✅ Permission ACTIVE (granted) at {status_data.get('granted_at')}")
            expires_at_str = status_data.get('expires_at')
            
            # Phase 2: Use permissions (simulated)
            log(f"\n🎉 Phase 2: Using permissions...")
            log(f"   Expiration: {expires_at_str}")
            log(f"   You can now use the granted IAM permissions!")
            log("\n✅ Monitoring complete - permissions granted successfully!")
            sys.exit(0)
            
        elif status == 'DENIED':
            log(f"\n❌ Permission DENIED")
            sys.exit(1)
        
        elif status == 'REVOKED':
            log(f"\n✅ Permission already REVOKED at {status_data.get('revoked_at')}")
            log("   Lifecycle complete.")
            sys.exit(0)
        
        # Keep polling for PENDING/AWAITING_APPROVAL states
        time.sleep(10)

if __name__ == '__main__':
    main()
