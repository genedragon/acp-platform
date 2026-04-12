# Log Entry Template

Use this format for every feedback entry in ACP_FEEDBACK_LOG.md:

```markdown
### [Category] Priority: [P0/P1/P2/P3] — [Brief Title]

**Reported By:** [User or Bot]  
**Date:** YYYY-MM-DD HH:MM UTC  
**Status:** Open / In Review / Resolved  
**Topic:** [#channel / topic-name] (if applicable)

**Context:**
[What happened, how to reproduce, expected vs actual behavior]

**Impact:**
[Who/what is affected, severity, scope]

**Questions/Next Steps:**
[What we need to know or do next]
```

## Detailed Guidance

### Header Line
```
### [🐛 Bug] Priority: P1 — S3 Upload Fails on 403 Access Denied
```
- Use category symbol (🐛/✨/🧩/📖/❓/🔒)
- Include priority (P0–P3)
- Write brief, scannable title (7–10 words max)

### Metadata (Always Include)
```
**Reported By:** Gene
**Date:** 2026-03-15 14:30 UTC
**Status:** Open
**Topic:** #acp-agentic-compute-platform / webMaster (optional; skip if DM-only)
```

### Context Section
Explain what happened in 2–3 sentences:
- **What:** "opusBot attempted to upload a file to S3"
- **How to reproduce:** "Run `message action=send media=<HTTP_URL> channel=zulip`"
- **Expected:** "File appears in Zulip as attachment"
- **Actual:** "Message sent; no attachment; no error"

### Impact Section
Answer: Who cares? Why does this matter?
- **Scope:** Affects file sharing in Zulip (all bots)
- **Severity:** Medium (workaround: use S3 directly)
- **Blockers:** Any skill needing to share files

### Questions / Next Steps
**For investigations:** List open questions
```
**Questions:**
1. Does media= work for streams but NOT DMs?
2. Are pre-signed URLs expiring before upload?
3. Should the plugin return an error instead of silent success?
```

**For bugs:** List what needs fixing
```
**Next Steps:**
- [ ] Test media= with stream targets
- [ ] Check plugin logs for upload failures
- [ ] Verify pre-signed URL accessibility
- [ ] Review Zulip API responses
```

**For features:** List design questions
```
**Needed Decisions:**
1. What Bedrock services are highest priority? (images, audio, data?)
2. Should results go to S3 or inline?
3. Which models to support in Phase 0?
```

---

## Tips for Good Entries

✅ **DO:**
- Be specific (include error messages, timestamps, links)
- Include reproduction steps (so anyone can verify)
- Note scope (how many bots/users affected?)
- Link related entries (`see entry: "..."`)
- Use code blocks for errors, logs, examples
- Include successful workarounds (if any)

❌ **DON'T:**
- Vague titles ("Something broke" → bad; "S3 Upload Returns 403" → good)
- Missing context (no reproduction steps = hard to debug)
- Assume everyone knows the system (explain briefly)
- Write paragraphs (use bullet points for scanability)
- Propose solutions as facts (suggest, don't assert)

---

## Entry Lifecycle

### 1. Initial Report (Open)
```
**Status:** Open
**Questions:** [What we need to know]
**Next Steps:** [ ] Test X [ ] Review code [ ] Ask user for more info
```

### 2. Under Investigation (In Review)
```
**Status:** In Review
**Findings:** [What we've discovered so far]
**Next Steps:** [ ] Confirm root cause [ ] Design fix [ ] Implement
```

### 3. Resolved
```
**Status:** Resolved
**Root Cause:** [Why it happened]
**Fix Applied:** [What was changed]
**Verification:** [How we confirmed it's fixed]
```

### 4. Documented Pattern (Closed + Reference)
```
**Status:** Documented Pattern
**Pattern:** [Recurring issue identified]
**Prevention:** [How to avoid in future]
**Related Entries:** [Other similar issues]
```

---

## Examples

See `example-entries.md` for real entries from past feedback.
