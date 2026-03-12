# Product Roadmap

**Last Updated:** 2026-03-12
**Product:** Agentic Collaboration Platform (ACP)
**Status:** Phase 0 — Foundation (Active)

---

## Vision

A self-hosted, open-source platform where humans and AI agents collaborate in structured channels. Deploy on your infrastructure, customize for any use case—from personal "second brain" to enterprise teams to temporary event workspaces.

---

## Phase 0: Foundation (Weeks 1-4) — Q2 2026
**Goal:** Single-repo deployment that "just works"

- [ ] Unified GitHub repo: `acp-platform`
- [ ] `deploy.sh` → running platform in 20 mins
- [ ] Core: OpenClaw + Zulip + Bedrock
- [ ] Sandbox isolation functional
- [ ] S3 file storage
- [ ] Basic IAM security
- [ ] Documentation: deployment guide, architecture

**Success:** External deployer completes setup in <30 minutes

---

## Phase 1: Collaboration Features (Weeks 5-8) — Q2 2026
**Goal:** Seamless human-to-human + human-to-agent collaboration

- [ ] P2P chat configuration (per-instance toggles)
- [ ] Event mode templates (conference, wedding, group travel)
- [ ] Role-based permissions (admin, member, guest)
- [ ] Agent visibility controls
- [ ] Audit logs for team/event modes
- [ ] Zulip customization guide

---

## Phase 2: Extensibility & Skills (Weeks 9-12) — Q3 2026
**Goal:** Infinite extensibility via skills and MCPs

- [ ] Skill marketplace (browse, install, share)
- [ ] MCP registry
- [ ] Core skill library (10+ production-ready skills)
- [ ] Skill development kit (SDK, templates, testing)
- [ ] Community contribution pipeline

---

## Phase 3: Enterprise Features (Weeks 13-20) — Q3 2026
**Goal:** Enterprise-ready for team/org deployments

- [ ] SSO/SAML (Okta, Auth0)
- [ ] Compliance toolkit (GDPR, SOC2, HIPAA guides)
- [ ] Multi-tenant architecture
- [ ] Cost monitoring agent
- [ ] Backup/restore automation
- [ ] High-availability (multi-AZ)

---

## Phase 4: Multi-Cloud (Weeks 21-28) — Q4 2026
**Goal:** Deploy anywhere

- [ ] Azure deployment guide + automation
- [ ] GCP deployment guide + automation
- [ ] On-prem Kubernetes
- [ ] Hybrid cloud (agent federation)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Repo name: `acp-platform` | Product-focused, not component-specific |
| 2026-03-09 | License: Apache 2.0 | Enterprise-trusted, patent protection, permissive |
| 2026-03-09 | Three deployment modes | Personal/Team/Event cover the full use-case spectrum |
| 2026-03-09 | P2P chat fully configurable per-instance | Event deployments need per-case customization |
| 2026-03-09 | AWS-first, cloud-agnostic by design | Fastest path to working product; multi-cloud in Phase 4 |
