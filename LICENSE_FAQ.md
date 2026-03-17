# License FAQ

Answers to common questions about the ACP Platform license.

---

## Is ACP open source?

**Not yet, but it will be.**

ACP uses the [Business Source License 1.1 (BSL 1.1)](LICENSE), which is *source-available* — the full source code is public, readable, and forkable, but it is not OSI-certified "open source." The license itself acknowledges this distinction.

**On the Change Date (four years from each release), the license automatically converts to [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)** — a fully open-source, permissive license with no restrictions.

---

## Can I use ACP commercially?

**Yes — for virtually all commercial uses.**

The Additional Use Grant explicitly permits production use, including:

- ✅ Deploying ACP internally at your company (any size)
- ✅ Using ACP to run your business operations
- ✅ Offering consulting or professional services *using* ACP
- ✅ Modifying ACP for your own internal needs
- ✅ Self-hosting for teams, departments, or events

The base BSL text mentions "non-production" use, but **our Additional Use Grant extends this to production use**. The grant is part of the license — it's not a separate agreement or a promise; it's legally binding.

---

## What is NOT allowed?

There is exactly one restriction:

> ❌ You may not offer the Licensed Work to third parties on a hosted or embedded basis in order to compete with the Licensor's paid version(s) of the Licensed Work.

In plain English: you cannot offer ACP as a SaaS product to third parties.

**What this does NOT restrict:**
- Running ACP on your own infrastructure for your own use
- Charging for services, consulting, or integrations built on top of ACP
- Reselling hardware/deployments that include ACP (as long as the ACP instance serves your own needs, not offered as a service to others)

---

## Why BSL instead of Apache 2.0 or MIT?

ACP's core functionality could easily be offered by large cloud providers (AWS, Azure, GCP) as a managed service — capturing value without contributing back. BSL 1.1 prevents that scenario while keeping the source fully accessible to everyone else.

The 4-year auto-conversion to Apache 2.0 means this protection is temporary. Once the ecosystem matures, ACP becomes fully open source automatically.

This was chosen as a **two-way door**: we can loosen the terms at any time (e.g., switch to Apache 2.0 early), but we cannot tighten a permissive license later without community backlash.

---

## Can I fork ACP?

**Yes.** You can fork, modify, and redistribute ACP — as long as:

1. You include the original license (BSL 1.1) and attribution
2. Your fork does not violate the Additional Use Grant (i.e., don't offer it as a SaaS product)

After the Change Date, forks are governed by Apache 2.0 with no restrictions.

---

## What happens on the Change Date?

The Change Date is set to **four years after each release**. On that date, **all restrictions in the BSL license are lifted** and the code is relicensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).

After the Change Date:
- ✅ The SaaS restriction no longer applies — anyone can offer ACP as a hosted service
- ✅ No attribution or license-preservation requirements beyond Apache 2.0's minimal terms
- ✅ The code is fully open source by any definition, including OSI's
- ✅ No action required from you — the license conversion is automatic

Releases roll over progressively, so the codebase becomes fully Apache 2.0 over time as each release reaches its Change Date.

---

## I'm still not sure if my use case is allowed. Who do I ask?

Open a [GitHub Discussion](https://github.com/genedragon/acp-platform/discussions) or email [hello@wardcrew.org](mailto:hello@wardcrew.org). We're happy to clarify.

If your use case is legitimate and the license language is causing confusion, we'd also welcome a PR to improve this FAQ.

---

*This FAQ is provided for informational purposes and does not constitute legal advice. The [LICENSE](LICENSE) file is the authoritative document.*
