# Example Feedback Entries

These are real examples from the ACP_FEEDBACK_LOG.md, showing different categories and how to write clear entries.

---

## Example 1: Bug (P0 — Blocker)

```markdown
### [🐛 Bug] Priority: P0 — Bedrock Opus 4.6 Token Limit Exhaustion + No Early Warning

**Reported By:** Gene  
**Date:** 2026-03-11 15:52 UTC  
**Status:** CRITICAL (second occurrence; production blocker)  
**Impact:** Tasks fail mid-execution; no recovery path  

**Context:**
opusBot was coordinating Zulip attachment testing (multi-stage task). Session ran out of tokens mid-coordination. Task abandoned; recovery required manual intervention. This is the second occurrence; indicates systemic problem, not one-off.

**Root Cause:**
- Bedrock Opus 4.6 has token limits (appears ~200K) that are reached without warning
- No early alert or graceful fallback when approaching limit
- Session continues until tokens exhausted, then fails
- No mechanism to pause/checkpoint work or switch to alternate model

**Expected Behavior:**
- Monitor token usage in real-time
- Alert when approaching 80%+ of limit
- Provide fallback/recovery options (auto-pause, switch model, save checkpoint)
- Display clear message if tokens exhausted

**Impact:**
- Severity: P0 (Production Blocker) — Unreliable task execution for complex/long workflows
- Scope: Affects any workflow using Opus 4.6 that requires sustained work
- Business risk: Can't rely on agents for multi-stage coordination

**Questions for ACP Team:**
1. Can we monitor token usage in real-time and alert before exhaustion?
2. Can we implement graceful fallback (pause, switch model, checkpoint)?
3. What's the actual token limit for Bedrock Opus 4.6?

**Next Steps:**
- [ ] Monitor token usage statistics for this session
- [ ] Implement token monitoring in gateway or runtime
- [ ] Add visible token counter/warning in agent output
- [ ] Design graceful fallback UX (pause + model switch)
```

**Why this is good:**
- Concrete impact (production blocker, second occurrence)
- Clear expected vs. actual behavior
- Specific questions for the team
- Reproducible (second incident means it's systematic)

---

## Example 2: Investigation (P2 — Medium)

```markdown
### [❓ Investigation] Priority: P2 — Zulip Bot Admin Permissions Don't Enable Privileged API Operations

**Reported By:** Gene  
**Date:** 2026-03-08 14:12 UTC  
**Status:** Open  
**Topic:** DM conversation; messages 2930–2958

**Context:**
Gene wanted to automate Zulip channel creation and management from OpenClaw via bot API. The workflow:
1. Request: Create private channel "bots-n-skills" with subscribed members
2. Initial attempt: POST to `/api/v1/streams` failed with "Method Not Allowed" even though sysAdmin-bot had admin role
3. Hypothesis: Admin role might unlock privileged APIs
4. Test: Gene promoted sysAdmin-bot to Administrator in Zulip UI
5. Result: Role updated, but POST still returns "Method Not Allowed"

**Findings:**
- Before admin promotion: `is_admin: false`, `role: 400` (member)
- After admin promotion: `is_admin: true`, `role: 200` (admin)
- **API behavior unchanged:** POST still rejects with "Method Not Allowed"
- Root cause likely: Reverse proxy or HTTP method restrictions at proxy level, not application auth

**Impact:**
- **Blocker for Zulip automation:** Cannot create channels autonomously via bot token
- **Security vs. usability tradeoff:** Even admin bots can't perform privileged operations
- **Scope:** Any automation relying on bot token for Zulip admin tasks will face this limitation

**Questions:**
1. Is this a Zulip server misconfiguration, or intentional security design?
2. Can user tokens (not bot tokens) make the same POST requests?
3. What's the recommended approach for Zulip automation in ACP environments?

**Workarounds Identified:**
1. Manual UI creation — Create channels in UI manually; bot subscribes after
2. User token approach — Use a user token instead of bot token (if available)
3. External service wrapper — Build thin API wrapper with elevated credentials

**Next Steps:**
- [ ] Test if Zulip user token can POST to `/api/v1/streams`
- [ ] Check Zulip & nginx logs for why POST is blocked
- [ ] Document recommended Zulip automation patterns for ACP
- [ ] Design secure bot/admin workflow for channel management
```

**Why this is good:**
- Shows hypothesis testing (tried admin role, didn't work)
- Clear findings section (before/after auth states)
- Multiple workarounds identified
- Actionable next steps for investigation

---

## Example 3: Feature Request (P1)

```markdown
### [✨ Feature] Priority: P1 — Amazon Bedrock Skill: Non-LLM Capabilities (Image Generation, etc.)

**Reported By:** Gene  
**Date:** 2026-03-12 07:43 UTC  
**Status:** Open (Roadmap)  
**Topic:** #acp-agentic-compute-platform / presentation prep v2

**Context:**
Gene observed a critical gap while building the webmaster skill: **Models (agents) have no standardized way to call Amazon Bedrock services other than LLM inference.**

Examples of needed non-LLM Bedrock capabilities:
- 🖼️ Image generation (DALL-E, Stable Diffusion via Bedrock)
- 🎵 Audio synthesis/generation
- 📊 Data analysis tools

**Concrete Example:**
botWard needed to generate "lobster agents in suits collaborating on technical work" for presentation slides. Had to build custom logic or workaround. Workflow blocked.

**Why This Matters:**
1. Skill extensibility — Skills can't be truly "multi-modal" without image gen
2. User experience — Agents feel limited; can't solve full problems
3. Competitive differentiation — LLM + multimodal is more powerful
4. Developer friction — Each agent needing image gen has to learn it independently

**Proposed Solution:**
New OpenClaw skill: "Amazon Bedrock" with image generation as Phase 0 MVP.

**Supported Services (Phase 1):**
- ✅ Image generation (Titan, Stable Diffusion via Bedrock)
- ⏳ Audio synthesis (phase 2)
- ⏳ Data processing (phase 2)

**Questions for Gene:**
1. Priority: Is this a blocker for webmaster v6/v7, or future roadmap?
2. Scope: Just image generation, or plan for broader Bedrock services?
3. Model selection: Which Bedrock image models should we prioritize?

**Impact:**
- Enables: Multi-modal workflows (text + images + audio)
- Unblocks: webmaster skill image generation, presentation automation
- Differentiator: ACP becomes "LLM + multimodal" instead of "LLM-only"
- Scope: Benefits all skills needing generative media

**Next Steps:**
- [ ] Gene clarifies priority and scope
- [ ] Research Bedrock image generation APIs
- [ ] Design skill architecture
- [ ] Implement Phase 0 MVP
- [ ] Test: Generate images, verify S3 upload works
```

**Why this is good:**
- Concrete use case (presentation slides)
- Prioritization framework (Phase 0/1/2)
- Clear success criteria (what Phase 0 MVP includes)
- Business impact (competitive differentiation)

---

## Example 4: Skill Opportunity (🧩)

```markdown
### [🧩 Skill] Priority: P1 — Bot File Attachment Best Practices for Zulip DMs & Topics

**Reported By:** Gene  
**Date:** 2026-03-11 14:49 UTC  
**Status:** Open

**Context:**
Gene asks: "Do we have an issue or issues focused on making sure bots know how to properly attach files in DMs and topic chats in Zulip?"

**The Gap:**
Currently, there is **no documented guidance** on how bots should attach files when sending messages to Zulip DMs or topics. This is a blocker for:
- Bots sending logs, reports, or generated files to users
- Multi-agent coordination (sharing work products)
- Workflow automation (uploading results, artifacts)

**Questions Needing Answers:**
1. What is the correct API for file uploads in Zulip?
2. How should bots reference uploaded files in messages?
3. What are the gotchas? (file permissions, expiry, size limits, rate limits)
4. DM vs. Topic differences?
5. Zulip vs. OpenClaw message tool differences?

**Impact:**
- **Workflow blocker:** Any bot needing to share files is stuck
- **Quality gap:** Bots can't reliably send reports, logs, or artifacts
- **User friction:** Gene has to ask for workarounds
- **Scope:** Affects all bots in the workspace

**Potential Solutions:**
1. Document Zulip file upload API
2. Create "Zulip File Attachments" skill with helper functions
3. Update OpenClaw message tool (if needed) with file support
4. Update agent prompts with file sharing best practices

**Testing Checklist:**
- [ ] Upload a text file to Zulip via DM (verify accessible)
- [ ] Upload a text file to Zulip via topic (verify all subscribers can access)
- [ ] Upload large file (~100MB)
- [ ] Test file permissions (can other users see/download?)
- [ ] Test expiry (does file persist indefinitely?)

**Next Steps:**
- [ ] Research Zulip API for file upload endpoints
- [ ] Test file uploads in DM and topic contexts
- [ ] Document findings (API, gotchas, examples)
- [ ] Create skill or update agent instructions
- [ ] Test end-to-end: bot uploads file → user receives attachment
```

**Why this is good:**
- User question framed as skill opportunity
- Research questions clearly outlined
- Testing plan included (shows rigor)
- Multiple potential solutions listed (not prescriptive)

---

## Example 5: Documentation Gap (📖)

```markdown
### [📖 Docs] Priority: P2 — How to Set Session Default Model to Match Current Model

**Reported By:** botWard (via Gene)  
**Date:** 2026-03-10 18:07 UTC  
**Status:** Open

**Context:**
After `/reset`, botWard's session started with:
- **Current model:** `amazon-bedrock/us.anthropic.claude-sonnet-4-6`
- **Default model:** `amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0`

botWard's question: "How do I set default and current model to be the same?"

**Root Cause:**
Documentation gap—no clear guidance on:
1. Where/how to configure default model for a session
2. How `/reset` determines which model to use
3. How to override default model on session spawn
4. Difference between user-level, workspace-level, and session-level defaults

**Impact:**
- UX friction: Users expect consistency but get surprise model downgrades
- Unclear configuration: No documented way to "lock" a session to specific model
- Scope: Affects any agent spawning new sessions who wants deterministic model selection

**Questions:**
1. Is there a per-session model override mechanism?
2. Should there be a way to set "sticky" default for a user/workspace?
3. Is the fallback to `global.claude-haiku` intentional?
4. How should `/reset` behave—preserve model, reset to default, or reset to system default?

**Potential Solutions:**
1. Document session model configuration in user guide
2. Add `/model` command to query/set session default persistently
3. Update `/reset` behavior to preserve model by default
4. Add model selection to session spawn (runtime parameter)

**Next Steps:**
- [ ] Clarify `/reset` model selection logic
- [ ] Document where to set default model
- [ ] Test: spawn session with explicit model; verify it persists through `/reset`
- [ ] Create user-facing guide: "How to set and lock your preferred model"
```

**Why this is good:**
- Clear user question (concrete pain point)
- Root cause identified (missing docs, unclear mechanism)
- Questions for clarification (not just assumptions)
- Multiple potential fixes (not just one answer)

