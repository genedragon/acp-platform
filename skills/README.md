# Skills Library

This directory contains OpenClaw skills bundled with ACP.

## Included Skills

| Skill | Version | Purpose |
|-------|---------|---------|
| [s3-files](s3-files/) | 1.x | Upload/download files via S3 pre-signed URLs |
| [webmaster](webmaster/) | 6.x | Deploy static sites + presentations to S3/CloudFront |
| [pvm-use](pvm-use/) | 1.x | Request temporary IAM permissions (agent-facing) |
| [pvm-deploy](pvm-deploy/) | 1.x | Deploy PVM backend infrastructure (admin-facing) |
| [zulip-etiquette](zulip-etiquette/) | 1.x | Zulip conventions and best practices for agents |

## Installing a Skill

```bash
# Copy skill to your OpenClaw skills directory
cp -r skills/s3-files ~/.openclaw/skills/

# Install dependencies
cd ~/.openclaw/skills/s3-files
npm install  # if applicable

# Configure (never commit config.json with real values)
cp config.json.example config.json
# Edit config.json with your settings
```

## Adding Community Skills

Community skills go in a separate registry (coming in Phase 2).

To propose a skill for the core library, open a GitHub issue with the `skill` label.

## Skill Development

Each skill has a `SKILL.md` that OpenClaw reads to understand how to use the skill.
The SKILL.md is the agent's instruction manual for that skill.

See [docs/skill-development.md](../docs/skill-development.md) (coming soon) for how to author skills.
