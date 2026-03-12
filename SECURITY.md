# Security Policy

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report security issues privately by emailing the maintainers or opening a GitHub Security Advisory.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch | ✅ |

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix/Patch:** Depends on severity (critical: ASAP, high: 7 days, medium: 30 days)

## Scope

In scope:
- `deploy.sh` deployment script
- CloudFormation templates
- Skills (s3-files, webmaster, pvm-use, pvm-deploy)
- Documentation that could lead to insecure configurations

Out of scope:
- Upstream components (OpenClaw, Zulip, PVM — report to their maintainers)
- Issues requiring physical access to the EC2 instance
