#!/bin/bash
###############################################################################
# zulip-create-bot.sh
# 
# Production-ready script for creating Zulip bot accounts via API
# 
# Usage:
#   Single bot:  ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --password "TempPass2026!"
#   Batch mode:  ./zulip-create-bot.sh --batch bots.json
#   Dry-run:     ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --password "TempPass2026!" --dry-run
#
# Author: sysAdmin (ACP Bot Management)
# Version: 1.0.0
# Date: 2026-03-14
###############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ZULIP_SITE="${ZULIP_SITE:-https://acp.wardcrew.org}"
ZULIP_API_USER="${ZULIP_API_USER:-sysAdmin-bot@acp.wardcrew.org}"
ZULIP_API_KEY="${ZULIP_API_KEY:-}"
CONFIG_FILE="${HOME}/.zuliprc"
LOG_FILE="${HOME}/.openclaw/workspace-sysadmin/logs/zulip-create-bot.log"
BATCH_MODE=false
DRY_RUN=false
VERBOSE=false

# Initialize counters
CREATED=0
FAILED=0
SKIPPED=0

###############################################################################
# Utility Functions
###############################################################################

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

info() {
    echo -e "${BLUE}ℹ${NC} $@"
    log "INFO" "$@"
}

success() {
    echo -e "${GREEN}✓${NC} $@"
    log "SUCCESS" "$@"
}

error() {
    echo -e "${RED}✗${NC} $@" >&2
    log "ERROR" "$@"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $@"
    log "WARNING" "$@"
}

die() {
    error "$@"
    exit 1
}

debug() {
    if [[ "${VERBOSE}" == "true" ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $@"
        log "DEBUG" "$@"
    fi
}

###############################################################################
# Configuration & Validation
###############################################################################

load_config() {
    if [[ -f "${CONFIG_FILE}" ]]; then
        debug "Loading config from ${CONFIG_FILE}"
        # Parse zuliprc file
        ZULIP_API_USER=$(grep -m1 "^email = " "${CONFIG_FILE}" | cut -d' ' -f3- || echo "${ZULIP_API_USER}")
        ZULIP_API_KEY=$(grep -m1 "^api_key = " "${CONFIG_FILE}" | cut -d' ' -f3- || echo "${ZULIP_API_KEY}")
        ZULIP_SITE=$(grep -m1 "^site = " "${CONFIG_FILE}" | cut -d' ' -f3- || echo "${ZULIP_SITE}")
    fi
}

validate_config() {
    if [[ -z "${ZULIP_API_KEY}" ]]; then
        die "API key not configured. Set ZULIP_API_KEY env var or create ~/.zuliprc"
    fi
    
    if [[ -z "${ZULIP_API_USER}" ]]; then
        die "API user not configured. Set ZULIP_API_USER env var or create ~/.zuliprc"
    fi
    
    debug "Zulip Site: ${ZULIP_SITE}"
    debug "Zulip API User: ${ZULIP_API_USER}"
}

validate_email() {
    local email=$1
    if [[ ! "${email}" =~ ^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        error "Invalid email format: ${email}"
        return 1
    fi
    return 0
}

validate_password() {
    local password=$1
    if [[ ${#password} -lt 8 ]]; then
        error "Password too short (minimum 8 characters): ${password}"
        return 1
    fi
    return 0
}

###############################################################################
# API Operations
###############################################################################

test_api_access() {
    info "Testing API access..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        info "[DRY-RUN] Would test API access (skipped)"
        return 0
    fi
    
    local response=$(curl -s -X GET "${ZULIP_SITE}/api/v1/users" \
        -u "${ZULIP_API_USER}:${ZULIP_API_KEY}" 2>/dev/null || echo "")
    
    if echo "${response}" | grep -q "result.*success"; then
        success "API access verified"
        return 0
    else
        die "API access test failed. Check credentials and permissions."
    fi
}

create_bot() {
    local email=$1
    local password=$2
    local full_name=$3
    
    # Validation
    if ! validate_email "${email}"; then
        error "Skipping bot creation for ${email}"
        ((FAILED++))
        return 1
    fi
    
    if ! validate_password "${password}"; then
        error "Skipping bot creation for ${email}"
        ((FAILED++))
        return 1
    fi
    
    info "Creating bot: ${email} (${full_name})"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        info "[DRY-RUN] Would create bot:"
        info "  Email: ${email}"
        info "  Name: ${full_name}"
        info "  Password: ••••••••"
        ((CREATED++))
        return 0
    fi
    
    local response=$(curl -s -X POST "${ZULIP_SITE}/api/v1/users" \
        -u "${ZULIP_API_USER}:${ZULIP_API_KEY}" \
        --data-urlencode "email=${email}" \
        --data-urlencode "password=${password}" \
        --data-urlencode "full_name=${full_name}")
    
    debug "API Response: ${response}"
    
    if echo "${response}" | grep -q '"result":"success"'; then
        local user_id=$(echo "${response}" | grep -o '"user_id":[0-9]*' | cut -d':' -f2)
        success "Bot created: ${email} (User ID: ${user_id})"
        ((CREATED++))
        return 0
    else
        local error_msg=$(echo "${response}" | grep -o '"msg":"[^"]*' | cut -d'"' -f4)
        error "Failed to create ${email}: ${error_msg}"
        ((FAILED++))
        return 1
    fi
}

###############################################################################
# Batch Operations
###############################################################################

create_from_json() {
    local json_file=$1
    
    if [[ ! -f "${json_file}" ]]; then
        die "JSON file not found: ${json_file}"
    fi
    
    info "Loading bots from ${json_file}..."
    
    # Parse JSON and create bots
    # Expected format: [{"email": "bot@domain", "name": "Bot Name", "password": "pwd"}, ...]
    local count=$(python3 -c "import json; print(len(json.load(open('${json_file}'))))" 2>/dev/null || echo "0")
    
    if [[ "${count}" == "0" ]]; then
        die "Invalid or empty JSON file: ${json_file}"
    fi
    
    info "Found ${count} bots to create"
    
    python3 << 'PYTHON_EOF' "${json_file}" "${DRY_RUN}"
import json
import sys

json_file = sys.argv[1]
dry_run = sys.argv[2] == "true"

with open(json_file, 'r') as f:
    bots = json.load(f)

# Extract and pass to bash function
for bot in bots:
    email = bot.get('email', '')
    password = bot.get('password', '')
    name = bot.get('name', '')
    
    print(f"{email}|{password}|{name}")
PYTHON_EOF
}

create_from_csv() {
    local csv_file=$1
    
    if [[ ! -f "${csv_file}" ]]; then
        die "CSV file not found: ${csv_file}"
    fi
    
    info "Loading bots from ${csv_file}..."
    
    # Skip header line, parse CSV (email,name,password)
    local count=$(tail -n +2 "${csv_file}" | wc -l)
    info "Found ${count} bots to create"
    
    while IFS=',' read -r email name password; do
        # Skip empty lines and comments
        [[ -z "${email}" ]] && continue
        [[ "${email}" =~ ^# ]] && continue
        
        # Trim whitespace
        email=$(echo "${email}" | xargs)
        name=$(echo "${name}" | xargs)
        password=$(echo "${password}" | xargs)
        
        create_bot "${email}" "${password}" "${name}"
    done < <(tail -n +2 "${csv_file}")
}

###############################################################################
# Help & Usage
###############################################################################

usage() {
    cat << 'USAGE'
zulip-create-bot.sh - Create Zulip bot accounts programmatically

USAGE:
    Single bot:   ./zulip-create-bot.sh --email EMAIL --name NAME --password PASSWORD
    From JSON:    ./zulip-create-bot.sh --batch bots.json
    From CSV:     ./zulip-create-bot.sh --batch bots.csv
    Dry-run:      ./zulip-create-bot.sh --email EMAIL --name NAME --password PASSWORD --dry-run

OPTIONS:
    --email EMAIL          Bot email address (e.g., testbot@acp.wardcrew.org)
    --name NAME            Bot display name (e.g., "Test Bot")
    --password PASSWORD    Bot password (minimum 8 characters)
    --batch FILE           Load bots from JSON or CSV file
                          JSON format: [{"email": "...", "name": "...", "password": "..."}, ...]
                          CSV format: email,name,password (one per line, with header)
    --dry-run              Show what would be created without making changes
    --verbose              Enable debug output
    --help                 Show this help message

ENVIRONMENT VARIABLES:
    ZULIP_SITE             Zulip server URL (default: https://acp.wardcrew.org)
    ZULIP_API_USER         API user email (default: from ~/.zuliprc)
    ZULIP_API_KEY          API key (required; can be set or use ~/.zuliprc)

EXAMPLES:
    # Create a single bot
    ./zulip-create-bot.sh --email mybot@acp.wardcrew.org --name "My Bot" --password "TempPass2026!"
    
    # Test without creating
    ./zulip-create-bot.sh --email mybot@acp.wardcrew.org --name "My Bot" --password "TempPass2026!" --dry-run
    
    # Create multiple bots from JSON
    ./zulip-create-bot.sh --batch bots.json
    
    # Create multiple bots from CSV
    ./zulip-create-bot.sh --batch bots.csv --verbose

JSON FILE FORMAT:
    [
      {"email": "bot1@acp.wardcrew.org", "name": "Bot One", "password": "TempPass2026!"},
      {"email": "bot2@acp.wardcrew.org", "name": "Bot Two", "password": "TempPass2026!"}
    ]

CSV FILE FORMAT:
    email,name,password
    bot1@acp.wardcrew.org,Bot One,TempPass2026!
    bot2@acp.wardcrew.org,Bot Two,TempPass2026!

REQUIREMENTS:
    - Zulip admin account with 'can_create_users' permission
    - Valid API key (from ~/.zuliprc or ZULIP_API_KEY)
    - curl command
    - bash 4.0+

PERMISSIONS:
    If you get "User not authorized to create users", the API user needs the
    can_create_users permission. Request from Zulip admin:
    
    sudo -u zulip /home/zulip/deployments/current/manage.py change_user_role \
        <email> can_create_users -r <realm_id>

USAGE
    exit 0
}

###############################################################################
# Main
###############################################################################

main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "${LOG_FILE}")"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --email)
                EMAIL="$2"
                shift 2
                ;;
            --name)
                NAME="$2"
                shift 2
                ;;
            --password)
                PASSWORD="$2"
                shift 2
                ;;
            --batch)
                BATCH_MODE=true
                BATCH_FILE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                error "Unknown option: $1"
                usage
                ;;
        esac
    done
    
    info "=== Zulip Bot Creation Tool v1.0.0 ==="
    
    # Load and validate configuration
    load_config
    validate_config
    
    # Test API access
    test_api_access
    
    # Process based on mode
    if [[ "${BATCH_MODE}" == "true" ]]; then
        if [[ "${BATCH_FILE}" == *.json ]]; then
            create_from_json "${BATCH_FILE}"
        elif [[ "${BATCH_FILE}" == *.csv ]]; then
            create_from_csv "${BATCH_FILE}"
        else
            die "Unsupported batch file format. Use .json or .csv"
        fi
    else
        # Single bot mode
        if [[ -z "${EMAIL:-}" ]] || [[ -z "${NAME:-}" ]] || [[ -z "${PASSWORD:-}" ]]; then
            error "Missing required arguments for single bot creation"
            usage
        fi
        
        create_bot "${EMAIL}" "${PASSWORD}" "${NAME}"
    fi
    
    # Summary
    echo ""
    info "=== Summary ==="
    success "Created: ${CREATED}"
    if [[ ${FAILED} -gt 0 ]]; then
        error "Failed: ${FAILED}"
    fi
    if [[ ${SKIPPED} -gt 0 ]]; then
        warning "Skipped: ${SKIPPED}"
    fi
    
    if [[ ${FAILED} -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# Run main function
main "$@"
