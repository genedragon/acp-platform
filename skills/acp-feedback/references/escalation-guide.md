# Escalation Guide

When should you escalate feedback vs. continue collecting/logging?

## Escalation Thresholds

### **Escalate Immediately (P0)**

**DO:** Message Gene directly (DM or @mention in topic)

When:
- System is down or data is lost
- Security breach or credential exposure
- Production blocker (agents can't work)
- Requires urgent decision-making from Gene

**Example:** "Bedrock tokens exhausted mid-task; tasks failing. Need urgent decision on token limit strategy."

**Format:**
```
@**Gene|11** [P0 URGENT] [Category] — [Title]

[2–3 sentence summary with impact]

Suggested action: [What should happen next]

ASAP?
```

---

### **Escalate + Log (P1 High)**

**DO:** Log in ACP_FEEDBACK_LOG.md + mention in relevant topic (don't DM)

When:
- Major feature broken (workaround exists, but significant impact)
- Recurring pattern (happened multiple times)
- Blocking skill development or workflows
- Requires design decision from Gene

**Example:** "opusBot keeps sending messages to wrong Zulip topic; Gene has to manually move them."

**Format:**
```
Logged in ACP_FEEDBACK_LOG.md (entry: "opusBot Topic Discipline Bug")

@**Gene|11** — New P1 feedback: [Title]
See: #**acp-agentic-compute-platform>feedback** for full context
```

---

### **Just Log (P2–P3)**

**DO:** Log in ACP_FEEDBACK_LOG.md; no mention needed

When:
- Workaround exists and is documented
- Nice-to-have enhancement
- Isolated incident (not recurring)
- Low user impact

**Example:** "Documentation missing on how to configure default model; user can work around by manually setting model each session."

---

## How to Choose

Ask yourself:

1. **Is this blocking work right now?**
   - YES → P0 or P1 (escalate)
   - NO → P2 or P3 (log only)

2. **Has this happened before?**
   - YES, repeatedly → P1 (mention to Gene)
   - NO, first time → P2 or P3 (log only)

3. **Does Gene need to make a decision?**
   - YES (design, priority, approach) → Escalate + log
   - NO (engineering only) → Log only

4. **Could this affect other users/bots?**
   - YES → P1 (mention to Gene)
   - NO → P2 or P3 (log only)

---

## Escalation Template

When escalating, use this structure:

```markdown
[PRIORITY] [CATEGORY] — [Title]

**Impact:** [Who/what is affected, why urgent]

**Summary:** [2–3 sentence problem statement]

**Suggested Action:** [What should happen next]

**Full Context:** See entry in ACP_FEEDBACK_LOG.md
```

---

## Examples

### ✅ Good P0 Escalation (DM)
```
@**Gene|11** [P0 URGENT] 🐛 Bug — Bedrock Token Exhaustion Blocks Complex Tasks

**Impact:** Second occurrence; tasks fail mid-execution with no recovery path.

**Summary:** Opus 4.6 model reaches token limit without warning. Session ends abruptly. No graceful degradation or fallback.

**Suggested Action:** 
1. Implement real-time token monitoring
2. Alert when approaching 80% limit
3. Offer auto-fallback to Sonnet 4.5

Full context: ACP_FEEDBACK_LOG.md entry "Bedrock Opus 4.6 Token Limit Exhaustion"
```

### ✅ Good P1 Escalation (Topic @mention)
```
@**Gene|11** — New P1 feedback logged: opusBot Topic Discipline

**Summary:** opusBot repeatedly sends messages to general topic instead of active topic. Gene has to manually move ~6 messages per occurrence.

**Pattern:** Happened twice in last 4 hours. Systematic issue, not one-off.

**Next step:** Investigate opusBot's threadId capture logic.

See: #**acp-agentic-compute-platform>feedback-investigation** for full entry
```

### ✅ Good P2 Logging (No Escalation)
```
Logged: "How to Set Session Default Model to Match Current Model"
Category: 📖 Docs gap
Priority: P2 (workaround exists: manually set model each session)
```

---

## When NOT to Escalate

- Feature request that's nice-to-have (not blocking) → Log only
- Isolated bug with clear workaround → Log only
- Documentation gap that doesn't block current work → Log only
- One-time issue that seems resolved → Log only, mention if it recurs

---

## Special Cases

### Recurring Issues (Pattern Recognition)

If same issue appears 2+ times in feedback log:
- Escalate as "Recurring Issue" (even if individually P2)
- Tag as systemic problem
- Include all occurrences with dates

**Example:**
```
[P1] Recurring Issue — Zulip Topic Discipline

This is the 3rd occurrence of bots posting to wrong topic:
- opusBot (2026-03-13 multiple times)
- botWard (2026-03-11 earlier)
- sysAdmin (2026-03-11 boot hook, resolved)

Pattern suggests systematic issue in message tool or bot response logic.
```

### Related Issues

If feedback relates to earlier entries:
- Cross-reference in ACP_FEEDBACK_LOG.md
- Consider if escalation changes based on pattern
- Use related entries to build case for urgency

**Example:**
```
Related entries:
- "PVM State Machine Approval Polling Miss" (2026-03-09) — also blocking automation
- "Webmaster Skill Missing CloudFront/S3 Standard Pattern" (2026-03-09) — larger pattern

Combined pattern suggests skill/automation infrastructure gaps.
```

---

## After Escalation

Once you escalate, track the response:

1. **Gene acknowledges:** Log response in feedback entry
2. **Gene creates task/PR:** Link in feedback entry
3. **Team starts work:** Update entry to "In Progress"
4. **Issue resolved:** Update entry to "Resolved" with outcome
5. **Lessons learned:** Note in MEMORY.md if recurring pattern

---

## Your Role After Escalation

- ✅ DO: Answer questions, provide clarification
- ✅ DO: Monitor for related issues, mention if pattern emerges
- ✅ DO: Update feedback entry as status changes
- ❌ DON'T: Chase Gene for action (trust the process)
- ❌ DON'T: Re-escalate same issue (mention once per update)
- ❌ DON'T: Debug beyond providing context (that's the team's job)

---

## Feedback Workflow Diagram

```
Issue Reported
    ↓
Clarify & Gather Context
    ↓
Categorize (Bug/Feature/Skill/Docs/Investigation)
    ↓
Assign Priority (P0–P3)
    ↓
Decision Tree:
    ├─ P0 (blocker) → Escalate DM to Gene + Log
    ├─ P1 (high) → @mention in topic + Log
    └─ P2–P3 (medium/low) → Log only
    ↓
Log in ACP_FEEDBACK_LOG.md
    ↓
(Wait for response or update if pattern recurs)
    ↓
Update entry status as work progresses
    ↓
Mark Resolved when complete
```
