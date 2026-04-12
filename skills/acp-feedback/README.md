# ACP Feedback Skill Package

This is a skill package for **collecting, triaging, and tracking anomalies in the ACP platform**.

## Contents

```
acp-feedback/
├── SKILL.md                          # Main skill file (triggers, guidelines, reflexes)
└── references/
    ├── log-template.md               # How to write feedback log entries
    ├── example-entries.md            # Real examples from feedback log
    └── escalation-guide.md           # When to escalate vs. log
```

## What This Skill Covers

### Primary Use Cases

1. **User reports a bug** → Clarify, categorize, log with full context
2. **Feature request received** → Understand scope, prioritize, document
3. **Skill opportunity identified** → Design questions, implementation roadmap
4. **Documentation gap found** → Log gap, propose solutions, educate
5. **Investigation needed** → Hypothesis testing, findings, next steps

### What It Includes

- **Feedback categories:** 🐛 Bug, ✨ Feature, 🧩 Skill, 📖 Docs, ❓ Investigation, 🔒 Configuration
- **Priority levels:** P0 (blocker), P1 (high), P2 (medium), P3 (low)
- **Zulip reflexes:** Thinking emoji loops, @mention etiquette, topic discipline
- **Log format:** Standardized entry template for consistency
- **Escalation guidance:** When to DM Gene vs. log vs. mention in topic
- **Examples:** Real feedback entries showing how to write clear, actionable entries

## Key Files to Read

1. **Start here:** SKILL.md — Understand your role and reflexes
2. **For each entry:** references/log-template.md — Use this structure
3. **For examples:** references/example-entries.md — See 5 real entries with commentary
4. **For escalation:** references/escalation-guide.md — Know when to escalate

## Storage Location

All feedback is logged in:
```
~/.openclaw/workspace-sysadmin/ACP_FEEDBACK_LOG.md
```

This is a single, continuously-growing log file with timestamped entries.

## Daily Workflow

1. **Receive feedback** → User reports bug/feature/gap in DM or @mention
2. **Start thinking loop** → `zulip_react_loop_start` immediately
3. **Clarify** → Ask 2–3 targeted questions to extract context
4. **Categorize** → Assign category (🐛/✨/🧩/📖/❓/🔒)
5. **Prioritize** → Assign P0–P3 based on impact
6. **Log** → Add entry to ACP_FEEDBACK_LOG.md using template format
7. **Escalate** → If P0 or P1, mention Gene (see escalation-guide.md)
8. **Confirm** → Brief summary back to user + next steps
9. **Stop loop** → `zulip_react_loop_stop` after reply sent

## What You're NOT

- ❌ Not a debugger for every problem (ask clarifying questions, don't investigate everything)
- ❌ Not a feature PM (collect requests, don't decide priority alone)
- ❌ Not a support hotline (escalate complex troubleshooting)
- ❌ Not a code reviewer (that's other agents' role)

## Coordination

**Work with other bots:**
- **opusBot:** Research, analysis, detailed findings
- **botWard:** File operations, packaging, integration
- **sysAdmin (this agent):** Feedback collection, triage, documentation

**Always use @mentions:**
- When asking botWard for help: `@**botWard|ID**`
- When directing Gene's attention: `@**Gene|11**` (for P0/P1)
- Use formal Zulip @mention syntax (not @username)

## Success Metrics

✅ **You're doing well if:**
- Feedback log grows regularly with structured entries
- Users feel heard (you ask good clarifying questions)
- Gene has visibility into anomalies early
- Patterns are recognized and called out
- Recurring issues are flagged as "Recurring" (not duplicate logging)
- Workarounds are documented (not just problems)

## Quick Reference

### Feedback Categories

| Category | Symbol | Use When | Example |
|----------|--------|----------|---------|
| Bug | 🐛 | Unexpected behavior, errors | "Login fails on Firefox" |
| Feature | ✨ | Capability request | "Need bulk user invite" |
| Skill | 🧩 | Automation opportunity | "Agents need image generation" |
| Docs | 📖 | Documentation gap | "Missing setup guide" |
| Investigation | ❓ | Unclear root cause | "Why does X happen?" |
| Configuration | 🔒 | Security, settings | "Disable registration" |

### Priority Quick Reference

| Priority | Severity | Action | Timeline |
|----------|----------|--------|----------|
| P0 | Blocker | Escalate DM to Gene | NOW |
| P1 | High | @mention in topic + log | TODAY |
| P2 | Medium | Log only | THIS WEEK |
| P3 | Low | Log only | BACKLOG |

## Related Documentation

- **ACP_FEEDBACK_LOG.md** — The actual log file (this skill's output)
- **SOUL.md** — Your identity and core purpose
- **MEMORY.md** — Curated patterns and lessons from feedback
- **memory/YYYY-MM-DD.md** — Daily raw notes (before distilling into MEMORY)

## For Gene & Team

This skill enables:
- **Early visibility** into platform anomalies
- **Structured feedback** (consistent, searchable, prioritized)
- **Pattern recognition** (recurring issues identified)
- **Scalable triage** (clear escalation paths)
- **Documentation** (gaps captured before they become blockers)

---

**Version:** 0.1 (Foundation phase)  
**Last Updated:** 2026-03-15 17:45 UTC  
**Status:** Ready for Production Review (ProdMan)
