#!/bin/bash
# =============================================================================
# ACP Platform Deployment Script
# Agentic Collaboration Platform — AWS-first deployment
#
# Usage:
#   ./deploy.sh --mode=personal   # Single-user second-brain
#   ./deploy.sh --mode=team       # Team/org collaboration workspace
#   ./deploy.sh --mode=event      # Temporary event deployment
#
# Requirements:
#   - AWS CLI configured (aws configure)
#   - EC2 key pair in target region
#   - Bedrock model access enabled
#
# License: Apache 2.0
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Defaults ─────────────────────────────────────────────────────────────────
DEPLOY_MODE="${DEPLOY_MODE:-personal}"
AWS_REGION="${AWS_REGION:-us-west-2}"
STACK_NAME="${STACK_NAME:-acp-platform}"
KEY_PAIR="${KEY_PAIR:-}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.large}"  # Graviton ARM — 20-40% cheaper
ENABLE_PVM="${ENABLE_PVM:-true}"
ENABLE_ZULIP="${ENABLE_ZULIP:-true}"
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-false}"

# ─── Parse args ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --mode=*)       DEPLOY_MODE="${arg#*=}" ;;
    --region=*)     AWS_REGION="${arg#*=}" ;;
    --stack=*)      STACK_NAME="${arg#*=}" ;;
    --key-pair=*)   KEY_PAIR="${arg#*=}" ;;
    --no-pvm)       ENABLE_PVM="false" ;;
    --no-zulip)     ENABLE_ZULIP="false" ;;
    --skip-preflight) SKIP_PREFLIGHT="true" ;;
    --help|-h)      show_help; exit 0 ;;
  esac
done

# ─── Functions ────────────────────────────────────────────────────────────────
log()    { echo -e "${BLUE}[ACP]${NC} $*"; }
ok()     { echo -e "${GREEN}✅${NC} $*"; }
warn()   { echo -e "${YELLOW}⚠️${NC}  $*"; }
error()  { echo -e "${RED}❌${NC} $*" >&2; exit 1; }
section(){ echo -e "\n${BOLD}── $* ────────────────────────────────────────${NC}"; }

show_help() {
  cat <<EOF
ACP Platform Deployment Script

Usage: ./deploy.sh [options]

Options:
  --mode=MODE         Deployment mode: personal|team|event (default: personal)
  --region=REGION     AWS region (default: us-west-2)
  --stack=NAME        CloudFormation stack name (default: acp-platform)
  --key-pair=NAME     EC2 key pair name (required)
  --no-pvm            Skip PVM (Permissions Vending Machine) deployment
  --no-zulip          Skip Zulip deployment (OpenClaw only)
  --skip-preflight    Skip preflight checks (not recommended)
  --help              Show this help

Deployment Modes:
  personal  Single-user second-brain. Minimal security posture.
            OpenClaw + Zulip + S3, optional PVM.
  team      Team/org collaboration. Strict security, sandbox required.
            Full stack: OpenClaw + Zulip + PVM + audit logging.
  event     Temporary deployment. Configurable P2P chat, time-limited.
            OpenClaw + Zulip + PVM, auto-teardown option.

Examples:
  ./deploy.sh --mode=personal --key-pair=my-key
  ./deploy.sh --mode=team --region=us-east-1 --key-pair=my-key
  AWS_REGION=eu-west-1 ./deploy.sh --mode=event --key-pair=my-key

EOF
}

# ─── Input validation ────────────────────────────────────────────────────────
validate_inputs() {
  # Validate deployment mode
  case "${DEPLOY_MODE}" in
    personal|team|event) ;;
    *) error "Invalid mode: '${DEPLOY_MODE}'. Use: personal|team|event" ;;
  esac

  # Validate AWS region format (e.g. us-west-2, eu-central-1)
  [[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] \
    || error "Invalid AWS region format: '${AWS_REGION}' (expected e.g. us-west-2)"

  # Validate stack name (alphanumeric + hyphens only, CloudFormation requirement)
  [[ "${STACK_NAME}" =~ ^[a-zA-Z][a-zA-Z0-9-]{0,127}$ ]] \
    || error "Invalid stack name: '${STACK_NAME}' (alphanumeric + hyphens, start with letter)"

  # Validate key pair name if provided (no shell metacharacters)
  if [ -n "${KEY_PAIR}" ]; then
    [[ "${KEY_PAIR}" =~ ^[a-zA-Z0-9_.\ -]+$ ]] \
      || error "Invalid key pair name: '${KEY_PAIR}' (alphanumeric, dots, underscores, hyphens, spaces only)"
  fi
}

# ─── Preflight checks ─────────────────────────────────────────────────────────
preflight_checks() {
  section "Preflight Checks"

  # AWS CLI
  if ! command -v aws &>/dev/null; then
    error "AWS CLI not found. Install: https://aws.amazon.com/cli/"
  fi
  ok "AWS CLI found: $(aws --version 2>&1 | head -1)"

  # AWS credentials
  if ! aws sts get-caller-identity &>/dev/null; then
    error "AWS credentials not configured. Run: aws configure"
  fi
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  ok "AWS credentials valid — Account: ${ACCOUNT_ID}"

  # Region
  ok "Region: ${AWS_REGION}"

  # Key pair
  if [ -z "${KEY_PAIR}" ]; then
    warn "No --key-pair specified. You'll need SSH access."
    warn "To specify: ./deploy.sh --key-pair=<your-key-name>"
  else
    if ! aws ec2 describe-key-pairs --key-names "${KEY_PAIR}" --region "${AWS_REGION}" &>/dev/null; then
      error "Key pair '${KEY_PAIR}' not found in region ${AWS_REGION}"
    fi
    ok "Key pair '${KEY_PAIR}' verified"
  fi

  # Bedrock access check
  log "Checking Bedrock model access..."
  if aws bedrock list-foundation-models --region "${AWS_REGION}" &>/dev/null; then
    ok "Bedrock access confirmed"
  else
    warn "Bedrock access check failed — ensure Bedrock is enabled in ${AWS_REGION}"
    warn "See: https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html"
  fi

  # Disk space (local, not EC2)
  AVAIL_KB=$(df . | tail -1 | awk '{print $4}')
  if [ "${AVAIL_KB}" -lt 1048576 ]; then
    warn "Low local disk space (${AVAIL_KB}KB available). Recommend 1GB+ free."
  fi

  ok "Preflight checks complete"
}

# ─── Deploy OpenClaw on AWS (CloudFormation) ──────────────────────────────────
deploy_openclaw() {
  section "Deploying OpenClaw on AWS"

  TEMPLATE_FILE="cloud/cloudformation/acp-stack.yaml"
  if [ ! -f "${TEMPLATE_FILE}" ]; then
    error "CloudFormation template not found: ${TEMPLATE_FILE}"
  fi

  PARAMS="ParameterKey=DeploymentMode,ParameterValue=${DEPLOY_MODE}"
  if [ -n "${KEY_PAIR}" ]; then
    PARAMS="${PARAMS} ParameterKey=KeyPairName,ParameterValue=${KEY_PAIR}"
  fi
  PARAMS="${PARAMS} ParameterKey=InstanceType,ParameterValue=${INSTANCE_TYPE}"
  PARAMS="${PARAMS} ParameterKey=EnablePVM,ParameterValue=${ENABLE_PVM}"

  log "Deploying CloudFormation stack: ${STACK_NAME}"
  aws cloudformation deploy \
    --template-file "${TEMPLATE_FILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --parameter-overrides ${PARAMS} \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset

  ok "CloudFormation stack deployed"

  # Get outputs
  EC2_PUBLIC_IP=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" \
    --output text 2>/dev/null || echo "")

  EC2_HOSTNAME=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='PublicDNS'].OutputValue" \
    --output text 2>/dev/null || echo "")

  if [ -n "${EC2_PUBLIC_IP}" ]; then
    ok "EC2 instance: ${EC2_PUBLIC_IP} (${EC2_HOSTNAME})"
    export ACP_EC2_IP="${EC2_PUBLIC_IP}"
    export ACP_EC2_HOSTNAME="${EC2_HOSTNAME}"
  fi
}

# ─── Deploy Zulip ─────────────────────────────────────────────────────────────
deploy_zulip() {
  section "Deploying Zulip"
  log "See: docs/deployment-guide.md#zulip for full Zulip setup"
  log "Zulip will be installed on the EC2 instance via user-data script"
  # TODO: Zulip deployment automation (Phase 0 milestone)
  ok "Zulip deployment configuration queued"
}

# ─── Deploy PVM ───────────────────────────────────────────────────────────────
deploy_pvm() {
  if [ "${ENABLE_PVM}" != "true" ]; then
    log "PVM skipped (--no-pvm)"
    return
  fi

  section "Deploying PVM (Permissions Vending Machine)"
  log "See: skills/pvm-deploy/SKILL.md for PVM deployment instructions"
  # TODO: Automated PVM deployment (Phase 0 milestone)
  ok "PVM deployment instructions: skills/pvm-deploy/"
}

# ─── Summary ──────────────────────────────────────────────────────────────────
print_summary() {
  section "Deployment Summary"
  echo ""
  echo -e "${BOLD}  ACP Platform deployed!${NC}"
  echo ""
  echo "  Mode:     ${DEPLOY_MODE}"
  echo "  Region:   ${AWS_REGION}"
  echo "  Stack:    ${STACK_NAME}"
  if [ -n "${ACP_EC2_HOSTNAME:-}" ]; then
    echo ""
    echo "  Access:"
    echo "    OpenClaw: https://${ACP_EC2_HOSTNAME}"
    echo "    Zulip:    https://${ACP_EC2_HOSTNAME} (after Zulip setup)"
    echo "    SSH:      ssh -i ~/.ssh/${KEY_PAIR}.pem ubuntu@${ACP_EC2_IP}"
  fi
  echo ""
  echo "  Next steps:"
  echo "    1. Follow docs/deployment-guide.md to complete Zulip setup"
  echo "    2. Configure your first agent in OpenClaw"
  echo "    3. Install skills from skills/ directory"
  if [ "${ENABLE_PVM}" = "true" ]; then
    echo "    4. Complete PVM setup: skills/pvm-deploy/SKILL.md"
  fi
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     ACP — Agentic Collaboration Platform  ║${NC}"
  echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
  echo ""
  log "Mode: ${DEPLOY_MODE} | Region: ${AWS_REGION}"

  validate_inputs

  if [ "${SKIP_PREFLIGHT}" != "true" ]; then
    preflight_checks
  fi

  deploy_openclaw
  deploy_zulip
  deploy_pvm
  print_summary
}

main "$@"
