#!/bin/bash
###############################################################################
# zulip-create-bot.sh
#
# Production-ready script for creating Zulip bot accounts via API
#
# Usage:
#   Single bot:  ZULIP_BOT_PASSWORD="..." ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot"
#   Stdin pwd:   ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --password-stdin
#   Batch mode:  ./zulip-create-bot.sh --batch bots.json
#   Dry-run:     ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --dry-run
#
# SECURITY: Passwords are never accepted via --password CLI argument (visible in
# process listings and shell history). Use ZULIP_BOT_PASSWORD env var or
# --password-stdin instead.
#
# Author: sysAdmin (ACP Bot Management)
# Version: 1.1.0
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
PASSWORD_STDIN=false
MAX_BATCH=100

# Bot password (never set via CLI arg — use env var or --password-stdin)
ZULIP_BOT_PASSWORD="${ZULIP_BOT_PASSWORD:-}"

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
        # Check file permissions — should be 0600 (owner read/write only)
        local perms
        perms=$(stat -c %a "${CONFIG_FILE}" 2>/dev/null || stat -f %A "${CONFIG_FILE}" 2>/dev/null || echo "unknown")
        if [[ "${perms}" != "600" && "${perms}" != "unknown" ]]; then
            warning "Config file ${CONFIG_FILE} has permissions ${perms} (should be 600)."
            warning "API key may be readable by other users. Fix with: chmod 600 ${CONFIG_FILE}"
        fi

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
        error "Password too short (minimum 8 characters)"
        return 1
    fi
    return 0
}

# Resolve password for a single bot (single-bot mode only).
# Priority: ZULIP_BOT_PASSWORD env var → stdin (if --password-stdin) → interactive TTY prompt.
# Passwords in batch files (JSON/CSV) are used directly from the file.
resolve_single_bot_password() {
    local email=$1

    if [[ -n "${ZULIP_BOT_PASSWORD}" ]]; then
        echo "${ZULIP_BOT_PASSWORD}"
        return 0
    fi

    if [[ "${PASSWORD_STDIN}" == "true" ]]; then
        # Read from stdin (e.g. echo "mypass" | ./script --password-stdin ...)
        IFS= read -r password
        echo "${password}"
        return 0
    fi

    # Interactive fallback — prompt via TTY so it works even when stdin is piped
    local password
    read -s -r -p "Password for ${email}: " password </dev/tty
    echo "" >/dev/tty
    echo "${password}"
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

    local response
    response=$(curl -s -X GET "${ZULIP_SITE}/api/v1/users" \
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

    local response
    response=$(curl -s -X POST "${ZULIP_SITE}/api/v1/users" \
        -u "${ZULIP_API_USER}:${ZULIP_API_KEY}" \
        --data-urlencode "email=${email}" \
        --data-urlencode "password=${password}" \
        --data-urlencode "full_name=${full_name}")

    debug "API Response: ${response}"

    if echo "${response}" | grep -q '"result":"success"'; then
        local user_id
        user_id=$(echo "${response}" | grep -o '"user_id":[0-9]*' | cut -d':' -f2)
        success "Bot created: ${email} (User ID: ${user_id})"
        ((CREATED++))
        return 0
    else
        local error_msg
        error_msg=$(echo "${response}" | grep -o '"msg":"[^"]*' | cut -d'"' -f4)
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

    local count
    count=$(python3 -c "import json; print(len(json.load(open('${json_file}'))))" 2>/dev/null || echo "0")

    if [[ "${count}" == "0" ]]; then
        die "Invalid or empty JSON file: ${json_file}"
    fi

    if [[ "${count}" -gt "${MAX_BATCH}" ]]; then
        die "Batch file contains ${count} entries, exceeding --max-batch limit of ${MAX_BATCH}. Increase --max-batch or split into smaller files."
    fi

    info "Found ${count} bots to create"

    # Extract fields and call create_bot for each entry
    while IFS='|' read -r email password name; do
        [[ -z "${email}" ]] && continue
        create_bot "${email}" "${password}" "${name}"
    done < <(python3 -c "
import json, sys
with open('${json_file}') as f:
    bots = json.load(f)
for b in bots:
    # Skip _WARNING or other metadata keys
    if not isinstance(b, dict) or 'email' not in b:
        continue
    print('{}|{}|{}'.format(b.get('email',''), b.get('password',''), b.get('name','')))
")
}

create_from_csv() {
    local csv_file=$1

    if [[ ! -f "${csv_file}" ]]; then
        die "CSV file not found: ${csv_file}"
    fi

    info "Loading bots from ${csv_file}..."

    # Count non-comment, non-header lines
    local count
    count=$(grep -v '^#' "${csv_file}" | tail -n +2 | grep -c '\S' || true)

    if [[ "${count}" -gt "${MAX_BATCH}" ]]; then
        die "Batch file contains ${count} entries, exceeding --max-batch limit of ${MAX_BATCH}. Increase --max-batch or split into smaller files."
    fi

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
    done < <(grep -v '^#' "${csv_file}" | tail -n +2)
}

###############################################################################
# Help & Usage
###############################################################################

usage() {
    cat << 'USAGE'
zulip-create-bot.sh - Create Zulip bot accounts programmatically

USAGE:
    Single bot (env):   ZULIP_BOT_PASSWORD="..." ./zulip-create-bot.sh --email EMAIL --name NAME
    Single bot (stdin): ./zulip-create-bot.sh --email EMAIL --name NAME --password-stdin
    From JSON:          ./zulip-create-bot.sh --batch bots.json
    From CSV:           ./zulip-create-bot.sh --batch bots.csv
    Dry-run:            ./zulip-create-bot.sh --email EMAIL --name NAME --dry-run

OPTIONS:
    --email EMAIL          Bot email address (e.g., testbot@acp.wardcrew.org)
    --name NAME            Bot display name (e.g., "Test Bot")
    --password-stdin       Read bot password from stdin (for single-bot mode)
    --batch FILE           Load bots from JSON or CSV file
    --max-batch N          Maximum bots per run (default: 100)
    --dry-run              Show what would be created without making changes
    --verbose              Enable debug output
    --help                 Show this help message

ENVIRONMENT VARIABLES:
    ZULIP_SITE             Zulip server URL (default: https://acp.wardcrew.org)
    ZULIP_API_USER         API user email (default: from ~/.zuliprc)
    ZULIP_API_KEY          API key (required; can be set or use ~/.zuliprc)
    ZULIP_BOT_PASSWORD     Bot password for single-bot mode (preferred over --password-stdin)

SECURITY NOTES:
    ⚠️  Passwords are NEVER accepted via --password CLI argument. The --password
    argument was intentionally removed because CLI arguments are visible in process
    listings (ps aux) and stored in shell history, exposing credentials to other
    system users.

    Instead, use one of:
      1. ZULIP_BOT_PASSWORD env var (preferred for scripting/CI)
      2. --password-stdin flag (pipe from a secrets manager or read interactively)
      3. Interactive prompt (TTY, if neither env var nor --password-stdin is used)

    For batch mode (--batch), passwords are read from the JSON/CSV file.
    Ensure those files are chmod 600 and never committed to version control.

    ~/.zuliprc should be chmod 600 — the script will warn if it is not.

EXAMPLES:
    # Single bot via env var (recommended for scripts)
    ZULIP_BOT_PASSWORD="$(pass show bots/testbot)" \
        ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot"

    # Single bot via stdin
    echo "my-secure-password" | \
        ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --password-stdin

    # Test without creating
    ./zulip-create-bot.sh --email testbot@acp.wardcrew.org --name "Test Bot" --dry-run

    # Create multiple bots from JSON (passwords in file)
    ./zulip-create-bot.sh --batch bots.json

    # Create multiple bots from CSV
    ./zulip-create-bot.sh --batch bots.csv --verbose

JSON FILE FORMAT:
    [
      {"email": "bot1@acp.wardcrew.org", "name": "Bot One", "password": "STRONG_UNIQUE_PASSWORD"},
      {"email": "bot2@acp.wardcrew.org", "name": "Bot Two", "password": "ANOTHER_STRONG_PASSWORD"}
    ]

CSV FILE FORMAT:
    # Comments supported — lines starting with # are ignored
    email,name,password
    bot1@acp.wardcrew.org,Bot One,STRONG_UNIQUE_PASSWORD
    bot2@acp.wardcrew.org,Bot Two,ANOTHER_STRONG_PASSWORD

REQUIREMENTS:
    - Zulip admin account with 'can_create_users' permission
    - Valid API key (from ~/.zuliprc or ZULIP_API_KEY)
    - curl, python3
    - bash 4.0+

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
            --password-stdin)
                PASSWORD_STDIN=true
                shift
                ;;
            --batch)
                BATCH_MODE=true
                BATCH_FILE="$2"
                shift 2
                ;;
            --max-batch)
                MAX_BATCH="$2"
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
            --password)
                die "--password CLI argument is not supported (credential exposure risk). Use ZULIP_BOT_PASSWORD env var or --password-stdin instead."
                ;;
            *)
                error "Unknown option: $1"
                usage
                ;;
        esac
    done

    info "=== Zulip Bot Creation Tool v1.1.0 ==="

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
        if [[ -z "${EMAIL:-}" ]] || [[ -z "${NAME:-}" ]]; then
            error "Missing required arguments for single bot creation (--email and --name)"
            usage
        fi

        PASSWORD=$(resolve_single_bot_password "${EMAIL}")
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
