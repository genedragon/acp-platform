---
name: webmaster
version: 6.2.1-beta
description: "Deploy static websites AND reveal.js presentations with dedicated buckets, auto asset path fixing, and deployment registry. One bucket per site, clean URLs, tracked in DynamoDB."
---

# WebMaster v6.2 (Beta)

Deploy and manage static websites **and reveal.js presentations** on AWS with automatic asset fixing, dedicated buckets, and centralized registry.

## What's New in v6.2

✅ **Agent Directive Resolution (`resolve-directives.js`)** — Pre-processing step resolves `//directive:` tags in JSON before generation. Shows mandatory preview + user confirmation before proceeding.  
✅ **`//fetch:` directive** — Downloads image/file from a known URL into `assets/`  
✅ **`//upload:` directive** — Copies a local file into the presentation assets  
✅ **`//generate:` directive** — AI image generation via **AWS Bedrock** (`stability.stable-image-core-v1:1`). Prompt-driven, cached, integrated into resolver preview.  
✅ **Directive Cache** — File-based cache in `.directive-cache/` keyed by SHA-256 hash, 7-day TTL. Pass `--fresh` to bust.  
✅ **Placeholder Fallback** — Failed resolutions never block a deploy; visible gray placeholder substituted, surfaced in preview.  
⚠️ **`//find:` directive** — Web search + best match selection. Documented, not yet implemented (roadmap).  

## What's New in v6.1

✅ **Spell Check Workflow** — Mandatory spell check step before any deploy; flag issues back to user for approval  
✅ **JSON Presentation Schema v1.1** — Index-based animation references (`text[0]`, `image[0]`) replacing brittle string matching  
✅ **Starter Templates** — `templates/presentation-starter.json` (blank deck) + `templates/instruction-site.json` (nav guide)  
✅ **Instruction Site Offering** — When starting a new presentation, offer to deploy a navigation guide first  
✅ **Desktop Layout Guidance** — 16:9 aspect ratio, layout density rules, column width ratios  
✅ **2D Navigation Standard** — Horizontal columns = top-level flow; vertical sub-slides = deep dives  
✅ **Color System Convention** — Consistent component color mapping across all slides  

## What's New in v6.2

✅ **Agent Directive Resolution** — Pre-processing step that resolves `//directive:` tags in JSON before generation. Supports `//fetch:`, `//find:`, `//generate:`, `//upload:`. Results shown in mandatory preview step with user confirmation.  
✅ **Directive Cache** — Resolution results cached in `.directive-cache/` by directive hash. Pass `--fresh` to bust cache.  
✅ **Placeholder Fallback** — Failed resolutions never block a deploy; a visible gray placeholder is substituted and surfaced in the preview.  

## What's New in v6.1

✅ **Spell Check Workflow** — Mandatory spell check step before any deploy; flag issues back to user for approval  
✅ **JSON Presentation Schema v1.1** — Index-based animation references (`text[0]`, `image[0]`) replacing brittle string matching  
✅ **Starter Templates** — `templates/presentation-starter.json` (blank deck) + `templates/instruction-site.json` (nav guide)  
✅ **Instruction Site Offering** — When starting a new presentation, offer to deploy a navigation guide first  
✅ **Desktop Layout Guidance** — 16:9 aspect ratio, layout density rules, column width ratios  
✅ **2D Navigation Standard** — Horizontal columns = top-level flow; vertical sub-slides = deep dives  
✅ **Color System Convention** — Consistent component color mapping across all slides  

## What's New in v6

✅ **Presentation Support** — Generate and deploy reveal.js presentations from JSON or Markdown  
✅ **Bundled reveal.js** — Full reveal.js 5.x dist included (MIT license, no external dependencies)  
✅ **14 Themes** — beige, black, blood, dracula, league, moon, night, serif, simple, sky, solarized, white + contrast variants  
✅ **6 Transitions** — none, fade, slide, convex, concave, zoom  
✅ **Plugins Included** — syntax highlighting, speaker notes, markdown, search, zoom, math  
✅ **Markdown Slides** — Write slides in Markdown with `---` separators  
✅ **QR Code Generation** — Inline QR codes in slides + standalone CLI tool (via `qrcode` npm, MIT)  
✅ **All v5 Features** — Dedicated buckets, auto asset fixing, CloudFront, DynamoDB registry, quality checks  

## Quick Start

### Deploy a Static Site (unchanged from v3)

```bash
cd ~/.openclaw/workspace-opusbot/skills/webmaster-v6-beta
node scripts/deploy.js /path/to/site my-site-name opusBot --description "My awesome site"
```

### Generate & Deploy a Presentation

**Step 1: Create a definition file** (JSON or Markdown)

**JSON format** — `slides.json`:
```json
{
  "title": "My Presentation",
  "author": "Gene",
  "slides": [
    {
      "title": "Welcome",
      "titleSize": "large",
      "subtitle": "A reveal.js presentation",
      "background": "#1a1a2e"
    },
    {
      "title": "Key Points",
      "content": [
        { "type": "list", "items": ["Point one", "Point two", "Point three"] }
      ]
    },
    {
      "title": "Code Example",
      "content": [
        { "type": "code", "language": "javascript", "code": "console.log('hello world');" }
      ]
    }
  ]
}
```

**Markdown format** — `slides.md`:
```markdown
---
title: My Presentation
author: Gene
---

# Welcome

A reveal.js presentation

---

## Key Points

- Point one
- Point two
- Point three

---

## Code Example

```javascript
console.log('hello world');
```
```

**Step 2: Generate the presentation**

```bash
node scripts/generate-presentation.js slides.json /tmp/my-preso --theme dracula --transition fade
# OR from markdown:
node scripts/generate-presentation.js --from-markdown slides.md /tmp/my-preso --theme moon
```

**Step 3: Deploy it**

```bash
node scripts/deploy.js /tmp/my-preso my-presentation opusBot --description "Q1 Review" --no-checks
```

> **Note:** Use `--no-checks` for presentations since reveal.js internal links may trigger false positives in link checking.

### Push Updates to Existing Presentation

```bash
# Regenerate with changes
node scripts/generate-presentation.js slides-updated.json /tmp/my-preso --theme dracula

# Push to existing deployment
node scripts/push.js /tmp/my-preso --site-id my-presentation-1773145000 --no-checks
```

## Presentation Features

### Slide Types

| Type | How | Example |
|------|-----|---------|
| **Title slide** | `titleSize: "large"` | Big centered title |
| **Content slide** | `content: [...]` | Text, lists, code, images |
| **Markdown slide** | `markdown: "# Title\n..."` | Raw markdown content |
| **HTML slide** | `html: "<div>..."` | Full HTML control |
| **Vertical slides** | `vertical: [slide, ...]` | Nested slide group |

### Content Block Types

```json
{ "type": "list", "items": ["a", "b"], "ordered": false }
{ "type": "code", "language": "python", "code": "print('hi')", "lineNumbers": "1-3" }
{ "type": "image", "src": "assets/photo.jpg", "alt": "desc", "width": 600 }
{ "type": "quote", "text": "To be or not to be", "cite": "Shakespeare" }
{ "type": "fragment", "text": "Appears on click", "effect": "fade-in" }
{ "type": "qr", "data": "https://example.com", "size": 300, "label": "Scan me" }
{ "type": "qr", "data": "https://example.com", "dark": "#bd93f9", "light": "transparent" }
```

### QR Code Options

| Property | Default | Description |
|----------|---------|-------------|
| `data` | (required) | URL or text to encode |
| `size` | 300 | Image size in pixels |
| `label` | — | Caption below QR code |
| `dark` | `#000000` | Module color (any hex) |
| `light` | `#FFFFFF` | Background color (hex or `transparent`) |
| `margin` | 2 | Quiet zone in modules |

### Slide Options

```json
{
  "title": "My Slide",
  "background": "#ff0000",
  "backgroundImage": "assets/bg.jpg",
  "backgroundVideo": "assets/bg.mp4",
  "backgroundIframe": "https://example.com",
  "transition": "zoom",
  "autoAnimate": true,
  "notes": "Speaker notes go here"
}
```

### Available Themes

`beige` · `black` · `black-contrast` · `blood` · `dracula` · `league` · `moon` · `night` · `serif` · `simple` · `sky` · `solarized` · `white` · `white-contrast`

### Available Transitions

`none` · `fade` · `slide` · `convex` · `concave` · `zoom`

## Commands Reference

### `generate-presentation.js` — Generate Presentation

```bash
node scripts/generate-presentation.js <definition.json> <output-dir> [options]
node scripts/generate-presentation.js --from-markdown <slides.md> <output-dir> [options]

Options:
  --theme <name>         Theme (default: black)
  --transition <type>    Transition (default: slide)
  --title <title>        Presentation title
  --author <name>        Author name
  --auto-slide <ms>      Auto-advance interval in ms
```

### `generate-qr.js` — Generate QR Codes (Standalone)

```bash
node scripts/generate-qr.js <text-or-url> [output-file] [options]
node scripts/generate-qr.js --terminal <text-or-url>

Options:
  --format png|svg|dataurl   Output format (default: png)
  --size <pixels>            Image width (default: 512)
  --terminal                 Display in terminal
  --dark <color>             Dark module color
  --light <color>            Light/background color
  --ec L|M|Q|H               Error correction level
```

### `deploy.js` — Deploy New Site/Presentation

```bash
node scripts/deploy.js <site-dir> <site-name> <owner> [options]

Options:
  --description "..."       Site description
  --custom-domain name      Custom domain (optional)
  --no-checks               Skip quality checks
```

### `push.js` — Update Existing Site/Presentation

```bash
node scripts/push.js <site-dir> [options]

Options:
  --site-id <id>            Site ID from registry
  --url <url>               Site URL (looks up in registry)
  --no-checks               Skip quality checks
```

### `list.js` — List Deployments

```bash
node scripts/list.js [options]

Options:
  --owner=NAME      Filter by owner
  --status=STATUS   Filter by status (active|archived|deleted)
```

### `registry.js` — Query Registry

```bash
node scripts/registry.js <command> [args]

Commands:
  list [--owner=NAME] [--status=STATUS]
  get <siteId>
  find-url <url>
```

## Architecture

```
Presentation Flow:
  JSON/Markdown → [resolve-directives.js] → generate-presentation.js → Static HTML + reveal.js assets → deploy.js → S3 + CloudFront

Static Site Flow (unchanged):
  HTML/CSS/JS files → deploy.js → S3 + CloudFront

Both:
  CloudFront Distribution (HTTPS)
      ↓ (OAC auth)
  S3 Bucket (Private, dedicated)
```

## File Structure

```
webmaster-v6-beta/
├── SKILL.md                          # This file
├── package.json
├── scripts/
│   ├── deploy.js                     # Deploy new site/presentation
│   ├── push.js                       # Update existing deployment
│   ├── resolve-directives.js        # ✅ Agent directive resolver (v6.2) — fetch/upload/generate implemented
│   ├── generate-presentation.js      # 🆕 Presentation generator
│   ├── generate-qr.js                # 🆕 QR code generator (standalone + embedded)
│   ├── list.js                       # List deployments
│   ├── registry.js                   # Query DynamoDB registry
│   ├── rewrite-paths.js              # Fix asset paths
│   ├── validate-assets.js            # Asset validation
│   ├── check-links.js               # Link checking
│   └── check-accessibility.js        # Accessibility checking
└── templates/
    └── reveal/                       # 🆕 Bundled reveal.js dist
        ├── reveal.js                 # Core library
        ├── reveal.css                # Core styles
        ├── reset.css                 # CSS reset
        ├── theme/                    # 14 themes
        ├── plugin/                   # Plugins (highlight, notes, markdown, search, zoom, math)
        └── LICENSE                   # MIT license
```

## reveal.js License

reveal.js is **MIT licensed** and `qrcode` (node-qrcode) is **MIT licensed** — both free for personal and commercial use.
The full license is included at `templates/reveal/LICENSE`.

**Important:** This skill bundles the open-source reveal.js framework only. It does NOT use or require slides.com (the commercial SaaS). Your presentations are your own files, deployed to your own AWS infrastructure.

## Reversibility

This is a **beta skill** installed alongside the current webmaster (v5). To remove:
```bash
rm -rf ~/.openclaw/workspace-opusbot/skills/webmaster-v6-beta
```
No system packages, no EC2 changes, no side effects. The original v3 skill remains untouched.

## Permissions Required

Same as v5 — S3 (`webmaster-*`), CloudFront, DynamoDB (`webmaster-deployments`). See the main webmaster skill README for details.

---

## Agent Directive System

Directives are special string values in the slide JSON that the **agent resolves before running `generate-presentation.js`**. The script never sees directives — only the resolved real values (file paths, URLs, generated text).

### Syntax

Any string value in the JSON (in `image`, `text`, `background`, etc.) can be a directive:

```
"//directive: instruction"
```

| Directive | What it does | Status |
|-----------|-------------|--------|
| `//fetch: <url>` | Downloads the image/file at the URL, saves to `assets/` | ✅ Implemented |
| `//find: <description>` | Web-searches for a matching image, downloads best result | ⚠️ Roadmap |
| `//generate: <description>` | AI image generation via AWS Bedrock (`stability.stable-image-core-v1:1`), saves to `assets/` | ✅ Implemented |
| `//upload: <local-path>` | Copies a local file into `assets/` for inclusion in the build | ✅ Implemented |

### Examples

```json
"image": "//fetch: https://example.com/features.png"
"image": "//find: Zulip features screenshot"
"image": "//generate: cartoon lobsters in black suits with earpieces, collaborative team"
"image": "//upload: /home/ubuntu/.openclaw/workspace-botward/presentation-assets/ACP-agents.png"
"background": "//fetch: https://example.com/bg.jpg"
```

### Resolution Workflow (Step 1.5)

This step runs **after spell check, before `generate-presentation.js`**.

1. Scan all string values in the JSON for the `//` prefix
2. For each directive found, execute the resolution (download, search, generate, upload)
3. Replace the directive string with the resolved value (local asset path or URL)
4. Show a **mandatory preview** to the user and wait for confirmation before proceeding

**Preview format:**
```
Resolving directives...

  ✅ //fetch: https://example.com/features.png  → assets/zulip-features.png (258KB)
  ✅ //generate: "cartoon lobsters in suits"    → assets/generated-lobsters.png (1.2MB)
  ⚠️  //find: "OpenClaw logo"                   → NO MATCH — placeholder substituted
  ✅ //upload: /path/to/ACP-agents.png          → https://cdn.example.com/ACP-agents.png

Proceed with generation? [y/n]
```

User must confirm before `generate-presentation.js` is invoked.

### Error Handling

**Never fail hard. Never be silent.**

| Failure | Behavior |
|---------|----------|
| `//fetch:` → 404/timeout | Use placeholder; warn in preview |
| `//find:` → no relevant match | Use placeholder; warn in preview |
| `//generate:` → timeout/unavailable | Use placeholder; warn in preview |
| `//upload:` → file not found | Use placeholder; warn in preview |

**Placeholder format** (for failed image resolutions):

```html
<div style="width:100%;height:300px;background:#1e1e2e;border:2px dashed #6272a4;
            display:flex;align-items:center;justify-content:center;
            color:#6272a4;font-size:0.8em;font-family:monospace;text-align:center;padding:1em;">
  [unresolved: //find: OpenClaw logo]
</div>
```

The user sees exactly what failed and can fix the directive or provide the asset manually.

### Caching

Resolution results are cached in `.directive-cache/` in the webmaster skill directory.

- Cache key: SHA-256 hash of the full directive string (e.g., `//find: Zulip features screenshot`)
- Cache value: local asset path + original URL/source + timestamp
- Cache is **reused by default** on re-deploys

**To bypass cache:**
```bash
node scripts/resolve-directives.js slides.json --fresh
```

**Cache structure:**
```
.directive-cache/
  <hash>.json    ← { directive, resolvedPath, source, resolvedAt }
  assets/
    <hash>.<ext> ← cached asset files
```

### Implementation

**Script:** `scripts/resolve-directives.js`

**Input:** path to slide JSON  
**Output:** enriched JSON (all directives replaced) written to a temp file, plus a resolution report  
**Usage:**
```bash
node scripts/resolve-directives.js slides.json /tmp/slides-resolved.json
# or with cache-busting:
node scripts/resolve-directives.js slides.json /tmp/slides-resolved.json --fresh
```

The resolved JSON is what gets passed to `generate-presentation.js`.

**Implementation status:**
| Directive | Status | Notes |
|-----------|--------|-------|
| `//fetch:` | ✅ Implemented | Downloads from URL |
| `//upload:` | ✅ Implemented | Copies local file |
| `//generate:` | ✅ Implemented | Uses AWS Bedrock `stability.stable-image-core-v1:1` |
| `//find:` | ⚠️ Roadmap | Requires `web_search` tool integration |

> **Note on `//generate:`:** Uses AWS Bedrock Stable Image Core. Prompt directly maps to the model's `textToImageParams.text`. Images saved as PNG to `assets/`. Results are cached by directive hash so repeated builds don't re-generate unnecessarily.

---

## Presentation Workflow (Step-by-Step)

Follow this order for every presentation build. Do not skip steps.

### Step 1: Spell Check ⚠️ MANDATORY on ALL text content in the JSON definition **before generating HTML**.

```bash
# Quick check: extract all text values and pipe to aspell
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[1]));
const texts = [];
JSON.stringify(data, (k, v) => { if (typeof v === 'string' && v.length > 3) texts.push(v); return v; });
console.log(texts.join('\n'));
" slides.json | aspell list
```

**If any issues are found:** Report them to the user with the flagged words and their locations. **Wait for approval before proceeding.** Do not auto-correct — word choices may be intentional.

### Step 1.5: Resolve Agent Directives ⚠️ MANDATORY (if any `//` directives present)

Scan all string values in the JSON for `//directive:` tags. If any are found, run the resolver and show the preview before continuing.

```bash
node scripts/resolve-directives.js slides.json /tmp/slides-resolved.json
# Use /tmp/slides-resolved.json for all subsequent steps
```

- If **no directives** are present, skip this step
- If directives are present, **show the preview and wait for user confirmation** before Step 3
- Do NOT pass directive strings to `generate-presentation.js` — always use the resolved output

### Step 2: Offer the Instruction Site

When starting a **new** presentation (not an update), offer:

> "Would you like me to also deploy a navigation guide for your audience? It's a short 4-slide site that introduces the arrow-key navigation, shows a deep-dive example, and demos how animations work. It takes about 2 minutes and I'll include the source JSON so your audience can see how it was built."

If accepted:
1. Copy `templates/instruction-site.json` to a working directory
2. Replace the `credits[2].link` with the actual repo URL if known
3. Generate + deploy as `{presentation-name}-guide`
4. Include the JSON file as a downloadable link in the guide's credits slide

### Step 3: Build the Presentation

```bash
node scripts/generate-presentation.js slides.json /tmp/my-preso --theme dracula --transition slide
```

### Step 4: Review Before Deploy

Open the generated HTML locally and verify:
- [ ] All slides render correctly
- [ ] Vertical/deep-dive navigation works (nested `<section>` present where expected)
- [ ] Animations fire in the correct order
- [ ] QR codes scan correctly (if used)
- [ ] Deep-dive indicator (`↓ deeper dive below`) appears on slides with sub-slides
- [ ] Speaker notes visible in presenter view (press `S`)

### Step 5: Deploy

```bash
node scripts/deploy.js /tmp/my-preso my-presentation owner --description "..." --no-checks
```

Share the CloudFront URL with the user in the active conversation topic.

---

## Presentation JSON Schema v1.1

### Top-Level Structure

```json
{
  "meta": { ... },
  "columns": [ ... ]
}
```

### `meta` Object

```json
{
  "title": "string",
  "author": "string",
  "event": "string (optional)",
  "aspect_ratio": "16:9 | 4:3",
  "theme": "black | dracula | moon | night | ...",
  "transition": "slide | fade | convex | concave | zoom | none",
  "transition_speed": "fast | normal | slow",
  "colors": {
    "background": "#hex",
    "text_primary": "#hex",
    "text_muted": "#hex",
    "accent_1": "#hex",
    "accent_2": "#hex",
    "accent_3": "#hex",
    "highlight": "#hex",
    "card_bg": "#hex",
    "card_border": "#hex"
  },
  "reveal_config": {
    "hash": true,
    "controls": true,
    "controlsTutorial": true,
    "progress": true,
    "slideNumber": "c/t",
    "overview": true,
    "touch": true,
    "navigationMode": "default"
  }
}
```

### `columns` Array — 2D Navigation Structure

Each element in `columns` is a **horizontal column** (one step in the left/right flow).

A column with **one slide** = a single horizontal slide (no deep dives):
```json
{
  "id": "col-1",
  "slides": [
    { "id": "title", "type": "title", ... }
  ]
}
```

A column with **multiple slides** = top-level slide + vertical deep dives:
```json
{
  "id": "col-2",
  "_has_deep_dive": true,
  "_deep_dive_hint": "↓ deeper dive below",
  "slides": [
    { "id": "2",  "type": "section-intro", ... },   ← top-level (horizontal)
    { "id": "2a", "type": "deep-dive", ... },        ← first deep dive (down)
    { "id": "2b", "type": "deep-dive", ... }         ← second deep dive (down again)
  ]
}
```

The **first slide** in a multi-slide column is the top-level (horizontal) slide. Subsequent slides are vertical sub-slides, accessed with the down arrow.

### Slide `type` Values

| type | Layout intent |
|------|--------------|
| `title` | Opening slide — large headline, presenter info |
| `section-intro` | Top-level section overview — icons/cards + minimal text |
| `deep-dive` | Sub-slide with more content — bullets + visual |
| `narrative` | Story/emotional slide — paragraph fragments, no bullets |
| `grid-cards` | 2×N icon/label grid — principles, features |
| `demo-transition` | Flow diagram — step-by-step colored boxes |
| `cta` | Call to action — links, QR code, contact cards |
| `content` | General content — mixed text/visuals |
| `credits` | Credits/attribution slide |

### Slide `layout` Values

| layout | Description |
|--------|-------------|
| `centered` | Single centered content block |
| `centered-split` | Text left, visual right (title style) |
| `left-visual-right-text` | Visual 40–45%, text 55–60% |
| `left-text-right-visual` | Text 55–60%, visual 40–45% |
| `two-columns` | Equal two-column split |
| `three-columns` | Three equal columns |
| `three-cards-wide` | Three card objects, desktop-spaced |
| `2x3-grid` | Two rows, three columns |
| `2x2-agent-cards` | Two-by-two large agent cards |
| `flow-diagram-centered` | Horizontal step-flow centered |
| `timeline-layout` | Horizontal phase timeline |
| `full-centered-story` | Full-bleed narrative text |
| `top-framing-bottom-cta` | Top: industry context; bottom: CTA cards |

### `content` Fields

```json
{
  "headline": "string | null",
  "subheadline": "string (optional)",
  "text": ["string", "string", ...],        ← bullet list items
  "fragments": [                             ← narrative fragment reveals
    { "text": "string", "style": "normal | muted | large-bold-highlight" }
  ],
  "columns": [                               ← for multi-column layouts
    { "icon": "emoji", "label": "string", "description": "string", "color": "#hex" }
  ],
  "cards": [                                 ← for card-grid layouts
    { "icon": "emoji", "name": "string", "tagline": "string", "accent_color": "#hex" }
  ],
  "grid": [                                  ← for 2xN grid layouts
    { "icon": "emoji", "name": "string", "descriptor": "short phrase" }
  ],
  "flow": {                                  ← for demo-transition slides
    "type": "horizontal-flow",
    "steps": [
      { "label": "string", "actor": "string", "color": "#hex" }
    ]
  },
  "visual": { ... },                         ← visual element description (see below)
  "qr_code": {                               ← QR code block
    "url": "https://...",
    "label": "string",
    "position": "bottom-right | center | bottom-left"
  },
  "footer": "string (optional)",
  "highlight": "string (optional)",
  "badge": { "text": "string", "color": "#hex" }
}
```

### Animation Schema v1.1 (Index-Based)

**Use index references, not text strings.** This makes animations robust to text edits.

```json
"animations": [
  {
    "click": 1,
    "elements": ["text[0]"],
    "effect": "appear"
  },
  {
    "click": 2,
    "elements": ["text[1]", "text[2]"],
    "effect": "appear"
  }
]
```

**Element reference syntax:**

| Reference | Targets |
|-----------|---------|
| `text[0]` | First item in `content.text` array |
| `text[1]` | Second item in `content.text` array |
| `text[*]` | All items in `content.text` array |
| `text[0-2]` | Items 0, 1, and 2 (range notation) |
| `image[0]` | First item in `content.images` array |
| `card[0]` | First item in `content.cards` array |
| `fragment[0]` | First item in `content.fragments` array |
| `column[1]` | Second item in `content.columns` array |

**Available effects:** `appear`, `fade-in`, `fade-out`, `highlight-red`, `highlight-green`, `highlight-blue`, `strike`, `grow`, `shrink`

**Example — staggered list:**
```json
"text": ["First point", "Second point", "Third point"],
"animations": [
  { "click": 1, "elements": ["text[0]"],        "effect": "appear" },
  { "click": 2, "elements": ["text[1]"],        "effect": "appear" },
  { "click": 3, "elements": ["text[2]"],        "effect": "appear" }
]
```

**Example — reveal all at once:**
```json
"animations": [
  { "click": 1, "elements": ["text[*]"], "effect": "appear" }
]
```

**In `notes`, use `[CLICK]` to mark where each animation fires:**
```json
"speaker_notes": "Opening statement. [CLICK] First point appears — explain it. [CLICK] Second point. [CLICK] Third point — this is the punchline."
```

---

## Desktop Layout Guidelines

For laptop/projector presentations (16:9):

| Rule | Value |
|------|-------|
| Aspect ratio | `16:9` |
| Slide padding | `60px 80px` |
| Max content width | `1100px` (centered) |
| Split layouts | Visual: 40–45% / Text: 55–60% |
| Card gap | `24px` |
| Heading font size | `2.4em` |
| Body font size | `1.1em` |

**Content density per slide type:**

| Slide type | Max text | Visual requirement |
|-----------|----------|--------------------|
| Top-level section intro | 1 headline + 3 labels max | Required: icon cluster or diagram |
| Deep dive | 3–5 bullets | Recommended: supporting visual |
| Narrative story | 3–5 short paragraphs | None — breathing room is the design |
| Grid/cards | Name + 3-word descriptor per cell | Icons required |
| Flow diagram | Step labels only | Diagram IS the content |

---

## Instruction Site

When starting a **new** presentation build, offer to deploy a companion navigation guide for the audience. This is a 4-slide site covering:

1. Welcome + navigation diagram (arrow keys)
2. Left/right flow + deep dive demo (with a working deep-dive sub-slide)
3. Animation demo (live example of `text[0]` appearing on click)
4. Credits (reveal.js MIT, OpenClaw, Webmaster Skill) + link to the JSON template

**Template:** `templates/instruction-site.json`

**How to deploy the instruction site:**

```bash
# 1. Copy the template
cp templates/instruction-site.json /tmp/nav-guide.json

# 2. (Optional) update credits.link with actual repo URL

# 3. Generate
node scripts/generate-presentation.js /tmp/nav-guide.json /tmp/nav-guide-site --theme black

# 4. Deploy
node scripts/deploy.js /tmp/nav-guide-site {presentation-name}-guide {owner} --description "Navigation guide for {presentation-name}" --no-checks
```

The instruction site **always includes a copy of `presentation-starter.json`** as a downloadable file, so the audience can see how the presentation was structured.

---

## Starter Templates

### `templates/presentation-starter.json`

Blank starter deck with annotated examples of every layout type, animation syntax, and config option. Share this directly with users who want to provide their own slide content or iterate on an existing deck.

### `templates/instruction-site.json`

The navigation guide template. Self-contained, deployable as-is. Includes working animation demo. See "Instruction Site" section above.

---

## Communication Standards (Multi-Agent Workflows)

When building presentations via multi-agent coordination (e.g., opusBot specs, botWard builds):

1. **Always stay in the agreed topic.** Do not post updates to other topics or channels.
2. **Always @mention the recipient** when your message requires a response from another agent or person. Bots only activate on mentions.
3. **Pre-build checklist:** Confirm all capabilities before starting (2D nav support, QR generation, asset paths) to avoid mid-build surprises.
4. **Share the URL in the same topic** as soon as deployment is confirmed.
5. **Spell check first.** Flag issues to the human before proceeding. Never auto-correct.

---

## Lessons Learned (from ACP Presentation Build, March 2026)

### Lesson 1: 2D Navigation Needs Explicit `<section>` Nesting

`generate-presentation.js` must produce `<section>` elements nested inside `<section>` elements for vertical navigation to work. A flat `columns` array is not enough — the generator must output:

```html
<section>  <!-- horizontal column -->
  <section>...</section>  <!-- top-level (shown horizontally) -->
  <section>...</section>  <!-- deep dive 1 (shown vertically) -->
  <section>...</section>  <!-- deep dive 2 (shown vertically) -->
</section>
```

If the generator only supports flat arrays, build the HTML directly from the JSON spec.

### Lesson 2: Deep-Dive Indicator Is Essential UX

Without a `↓ deeper dive below` hint, users don't know vertical navigation is available. Add it to every top-level slide that has sub-slides:

```html
<div style="position:absolute; bottom:0.8em; right:2em; font-size:0.65em; 
            color:#8b949e; letter-spacing:0.08em; text-transform:uppercase;">
  ↓ deeper dive
</div>
```

Remove it on deep-dive sub-slides (they don't need it).

### Lesson 3: Top-Level Slides Must Be Self-Contained

Top-level (horizontal) slides are viewed by everyone. Keep them scannable in 5 seconds: 1 headline + icon labels only. No bullets. The bullets belong in the sub-slides below.

### Lesson 4: Consistent Color Coding Across Slides

Pick a color per concept/component and use it consistently throughout. In the ACP deck: OpenClaw=blue, Zulip=green, sBrain=purple. When a color appears in a diagram, it means the same thing it means in a card or a tag. Don't vary.

### Lesson 5: Narrative Slides Need Room to Breathe

The vendor lock-in story slide works because it's intentionally sparse — dark background, centered text, one fragment per click, no competing visual elements. Resist the urge to add icons or bullets to these slides.

### Lesson 6: Animation References Must Be Index-Based

Old method (fragile — breaks when text is edited):
```json
"elements": ["First bullet point here"]
```

New method (robust):
```json
"elements": ["text[0]"]
```

Always use the new method. Document `[CLICK]` in speaker notes to mark animation trigger points.

### Lesson 7: Always Confirm Capabilities Before Building

Before starting a presentation build, confirm with the builder:
- Does your generator support nested `<section>` for 2D nav?
- Can you embed/inline SVG files from local paths?
- Can you generate QR codes inline?

Discovering limitations mid-build costs more time than the upfront confirmation.

---

## Next Steps

- [ ] **Implement `//find:` directive** — web search + best-match image download (requires `web_search` tool integration)
- [ ] **Instruction site: keep directive docs off intro deck** — advanced directive system is too much for first-time users; roadmap feature to add an "advanced" section to the nav guide
- [ ] Update `generate-presentation.js` to support 2D `columns` schema (nested `<section>` output)
- [ ] Add `--type presentation` flag to `deploy.js` for streamlined presentation deploys
- [ ] Implement index-based animation rendering in the generator
- [ ] Add `--instruction-site` flag to auto-deploy nav guide alongside any new presentation
- [ ] Add PDF export helper (Chrome print-to-PDF automation)
- [ ] Promote to stable after `generate-presentation.js` is updated for v1.1 schema
- [ ] Add spell check script (`check-spelling.js`) as first step in the workflow

---

**Version:** 6.2.1-beta  
**Last Updated:** 2026-03-12  
**Status:** Beta 🧪  
**Based on:** WebMaster v5 (stable, GitHub) + reveal.js 5.x (MIT)  
**Schema:** Presentation JSON v1.1
