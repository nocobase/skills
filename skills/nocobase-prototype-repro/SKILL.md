---
name: nocobase-prototype-repro
description: >-
  ONLY for reproducing a specific HTML/image prototype in NocoBase — i.e. the
  user hands over an actual prototype (an HTML file, a screenshot, or a link to
  one) and wants it matched faithfully, OR points at a built page and says it
  "doesn't match the prototype / looks monotone / is ugly". There must be a
  concrete visual target and a fidelity gap. Do NOT select this skill for the
  normal build flow: "build me a CRM / inventory / app" with no prototype →
  nocobase-app-discipline; add a field, rename an action, tweak one page →
  nocobase-ui-builder directly. No prototype handed over = not this skill. It is
  a heavyweight orchestration layer that only earns its overhead when matching a
  prototype's exact look/behavior; on a generic page-build it would just get in
  the way of nocobase-ui-builder.

  When it does apply: a staged, user-confirmed workflow that turns "here is the
  prototype, build it" into 80%+ fidelity in one pass — analyze prototype →
  model + native CRUD → pick the right native block per visual region (table+JS
  column, list+JS item, grid card, kanban+JS card, calendar, chart) → close the
  gap with a screenshot-vs-prototype visual loop. Native-first; JS only for the
  kernel a native block can't express; never a full-page JS block. The actual
  flow-surfaces / RunJS mechanics live in nocobase-ui-builder; data modeling in
  nocobase-data-modeling; build discipline in nocobase-app-discipline. This skill
  orchestrates them for the prototype-reproduction case and owns the visual loop.
argument-hint: "[prototype: link|file|image] [target: new-app | existing page uid]"
allowed-tools: "shell, Read"
---

# Goal

Turn a prototype + a one-line ask into a faithful NocoBase app. This is a **meta / orchestration skill** — it sequences `nocobase-data-modeling` + `nocobase-ui-builder` + `nocobase-app-discipline` and adds the two things that decide fidelity: a **region → native-block mapping** and a **visual convergence loop**. It does not re-teach the CLI; it routes to the sibling skills for mechanics and owns only the reproduction-specific judgment.

# When to use / Non-Goals

**Hard gate (check before selecting this skill):** there must be an actual prototype in hand — an HTML file, a screenshot, or a link to one — that you are matching against. No prototype, no fidelity gap → this is **not** the skill; a plain "build me an app / a page" request belongs to `nocobase-app-discipline` (whole system) or `nocobase-ui-builder` (single page/edit). Do not let this skill shadow the normal build flow.

**Use when:**
- The user gives a prototype (HTML file, link, screenshot, or a `public/prototypes/...` URL to curl) and wants it reproduced in NocoBase.
- A page already exists but the user says it's monotone / ugly / doesn't match the prototype / a region should be a list/card/kanban instead of a table — i.e. there is a **visual target and a fidelity gap**.

**Non-Goals — hand off, do not do here:**
- Pure data modeling (collections/fields/relations with no visual target) → `nocobase-data-modeling`.
- Workflows / automations → `nocobase-workflow-manage`. ACL / permissions → `nocobase-acl-manage`. Plugin work → `nocobase-plugin-development`.
- A localized UI edit with **no visual target and no fidelity gap** (move one field, rename an action, tweak a reaction) → `nocobase-ui-builder` **directly**. This skill is only worth its overhead when you are matching a prototype's look/behavior; for a mechanical surface edit, skip straight to ui-builder.
- Whole-page authoring from a business sentence with **no** prototype → author a quick prototype first ([prototype-authoring.md](references/prototype-authoring.md)), then this skill; or if the user just wants a generic page, that's `nocobase-ui-builder`'s `applyBlueprint`.

# Router — task shape → read first

Hit one route, read its "first" doc, and only open the "then" docs when that route is still not enough. Sibling skills own the mechanics; the reference files here own the reproduction-specific judgment.

| Task shape | Read first | Then, as needed |
|---|---|---|
| Prototype handed over → reproduce end-to-end | [spec-template.md](references/spec-template.md) (Phase 1 SPEC) | [decomposition-grammar.md](references/decomposition-grammar.md), [block-recipes.md](references/block-recipes.md), [gotchas.md](references/gotchas.md), [visual-loop.md](references/visual-loop.md) |
| Existing page is monotone / ugly / off | [visual-loop.md](references/visual-loop.md) | [block-recipes.md](references/block-recipes.md), [gotchas.md](references/gotchas.md) |
| "Which block for this region?" | the **Region → native block** table below | [decomposition-grammar.md](references/decomposition-grammar.md), [block-recipes.md](references/block-recipes.md) |
| Build/edit JS, flow-surfaces, popup, chart **mechanics** + runnable CLI | `nocobase-ui-builder` (its `js.md` / `popup.md` / `chart.md` / `runjs-*` / `page-archetypes.md`) | — |
| Collections / fields / relations | `nocobase-data-modeling` | — |
| Scope discipline, seed standards, naming, final report | `nocobase-app-discipline` | — |
| No prototype given, must author one | [prototype-authoring.md](references/prototype-authoring.md) | — |
| Hand the build to another agent from a one-line prompt | [handoff.md](references/handoff.md) | — |
| Full reference list | [index.md](references/index.md) | — |

# Why fidelity varies — the levers (internalize these)

Observed across many reproductions, in order of impact:

1. **The screenshot→compare→fix loop.** The single biggest factor. An agent that renders, **looks at its own screenshot next to the prototype**, lists the gaps, and iterates converges. One that builds and declares done plateaus at "no errors but ugly". Text-only verification proves "it renders"; only a visual pass proves "it matches". See [visual-loop.md](references/visual-loop.md).
2. **Gotchas pre-loaded.** The 10–20% that stalls weak runs is almost always the alpha-version JS sandbox + flow-surfaces JSON contract. Pre-supplying those skips ~10–20 failed attempts and stops the failure mode where the agent gives up and collapses the page into one big JS block. See [gotchas.md](references/gotchas.md).
3. **Targets bound tightly.** "Page uid X, block uid Y, do these N things, verify before done" beats "fix this page". Vague targets cause scope drift or stopping at CRUD.
4. **Right block per region.** Reaching for a table everywhere is the #1 cause of "monotone". The prototype usually wants a list of cards, a kanban, a calendar, a grid. See the Region table + [block-recipes.md](references/block-recipes.md).
5. **Model.** Stronger models recover from contract errors and can act as the visual reviewer; weaker models do well on tightly-scoped, gotcha-loaded mechanical work. Give the levers above and a mid model reproduces faithfully.

# Workflow — staged, with user-confirmation gates

Do it in order. **Stop at each ▣ CONFIRM gate and get the user's go-ahead before the next stage.** For anything beyond a small single-region tweak, plan it as a multi-round conversation rather than one silent mega-run — the user wants to steer at each big step.

**Phase 0 — Load the target.** If you already have the prototype, skip to loading it; only author one if the user gave a business sentence with no prototype ([prototype-authoring.md](references/prototype-authoring.md)). Curl/read the prototype (the **visual target**; without it, builds degrade to a generic table or one big JS block). **Check for an embedded `<script type="application/nb-spec+json">`** — if present, parse it as the **authoritative spec** (data model, per-region block, interactions, JS kernels) and honor its `notes`/`jsKernels`, instead of inferring. Load [block-recipes.md](references/block-recipes.md) + [gotchas.md](references/gotchas.md). Identify env; pass `-e <env> -y` on every `nb api`; get live page/block uids (`flow-surfaces get` / `desktopRoutes`), never trust uids from docs.

**Phase 1 — Analyze & plan → SPEC  ▣ CONFIRM.** Produce a structured SPEC from [spec-template.md](references/spec-template.md) (LLM judgment vs the rendered prototype, not a parser): data model; page list incl. the **signature page(s)**; **region → block map** (prevents "everything is a table"); and the **interaction checklist** — go region by region and list every affordance (faceted/multi-select filters with counts, status pills, search, sort, fill-the-width grid, click→popup, inline edit, drag, live refresh); each maps to a recipe, anything non-native is flagged a JS kernel. Show the SPEC, get explicit confirmation.

**Phase 2 — Model + native CRUD + seed  ▣ CONFIRM.** Build collections/fields/relations in one pass (`nocobase-data-modeling`); never edit while building. Stand up plain-native backend (Table + Filter + Add new + View/Edit; View opens a **drawer** with Details + association sub-tables via `associationName` + `sourceId={{ctx.view.inputArgs.filterByTk}}`). Seed every enum branch, ≥2 children/parent, **all-English** for public demos, and **enough density** (fill 1–2 months for a calendar — sparse reads as broken). Confirm CRUD works.

**Phase 3 — Refine to the prototype, region by region.** Native-first. For each signature region, pick its block and build it; add JS **only** for the kernel a native block can't express; **never collapse the page into one JS block**. One region at a time so each is verifiable. Mechanics + runnable snippets in [block-recipes.md](references/block-recipes.md).

**Phase 4 — Visual convergence loop  ▣ CONFIRM + report.** Render → screenshot → **compare against the prototype with a vision-capable pass** → concrete gap list → fix → re-shoot, until it matches. Reviewer may be the same agent self-checking or a separate vision model — let the model choose by situation. Full procedure in [visual-loop.md](references/visual-loop.md). Deliver the report (uids touched, what changed, gaps/tradeoffs, screenshots) and confirm.

# Region → native block (the anti-monotone table)

| Prototype region looks like… | Use | JS kernel? |
|---|---|---|
| **Form** — compose / create / edit, with custom controls or a live preview | **native Form block** with **JS items / JS actions nested inside** (pills, counter, live preview bound to form values). **Not** a freestanding JSBlock form. | yes — items/preview |
| Spreadsheet / dense rows of fields | **Table** | optional: one **JS column** (whole-record cell) for a rich first column |
| Feed / list of **cards**, contacts, activity, "currently X" | **List + JS item** (whole-record renderer per row); single-column card feed | yes — the card body |
| **Catalog with left facet rail + status pills + grid** | **Rich catalog archetype**: JS facet rail (multi-select + counts) + status pill bar + **List + JS card + CSS auto-fill grid**, cross-filtered. `block-recipes.md §3b` | yes — facets, pills, card |
| **Responsive card grid that fills the width** | **List + JS card + CSS auto-fill** (`repeat(auto-fill, minmax(280px,1fr))`). `block-recipes.md §3` | yes — the card body |
| Plain fixed-breakpoint card grid (no facets, no fill) | **GridCard + JS card** — `add-field --renderer js` on GridCardItemModel, remove sibling DetailsItemModel nodes, `showLabel:false`. `block-recipes.md §3` | yes — the card body |
| Photo / avatar **gallery**, people directory (native fields only) | **GridCard** (native fields, no JS) | optional |
| **Board** with status columns, pipeline | **Kanban**, `groupField=<status>`; card field limit 2 → add a **JS card field** | yes — the card |
| **Calendar** / schedule / room booking by day | **Calendar** (`startField/endField/titleField`) | rarely |
| **Charts**, KPIs, analytics dashboard | **Chart** (builder for single-table aggregates; custom raw ECharts for gauge/heatmap). Big-number KPI → small JS block | KPI only |
| **Tree** / org chart / nested categories | **Tree** block | no |
| **Filter bar** that drives another region | **FilterForm** + cross-block filter | sometimes |
| Quick-filter pills / custom control on a data block | **JS item in the block's top-right toolbar** (`add-action --use JSItemActionModel`) | yes — the toolbar widget |
| Detail **drawer/popup** on click | native popup via a real **ViewActionModel** (`ctx.openView(<viewActionUid>, {filterByTk})`) | n/a |
| Custom viz with NO data container: glowing map, kiosk, gauge, standalone feed | **JS block** (the *only* legitimate freestanding-JS case) | yes |

**The container/content split (the core rule).** For **any region backed by data** the **container is always a native block** (Form/Table/List/GridCard/Kanban/Calendar) — it gives resource binding, CRUD, filter, pagination, ACL for free. **JS only renders the content *inside*** that container: a JS item (form field / list card), JS column (table cell), JS field (whole-record card), JS action (button), or a JS item in the top-right toolbar (pills / custom controls). Reproduce the prototype's exact look *inside* the native container; never throw the container away. A **freestanding JS block** is reserved for a region with *no* data container (map, kiosk, gauge). **Any non-native or interactive element MUST be a JS item/block — never skipped, never faked with a static native field** (a live phone-preview in a composer is a JS item bound to `ctx.form.getFieldsValue()` + `formValuesChange`, not a static card).

# Hard rules

- **Container native, content JS.** Every data region's container is a native block; JS only renders *inside* it. Never replace a native data container with a freestanding JS block (reserved for data-less visuals). Never one page = one JS block.
- Edit deployed JS via `curl flowModels:save` (flat full-field upsert, preserves `parentId`). **Never `flowModels:update`** (clears parentId, node vanishes).
- After any add/remove block, sync the grid's **v2 `props.layout` + legacy `props.rows` + `stepParams.gridSettings.grid`** consistently, or the client throws a false "Collection may have been deleted".
- JS sandbox: `ctx.libs.React/antd/antdIcons` in JSFieldModel (not `ctx.antdIcons`); no `window`/`document`/`localStorage`; no local var named `location`; font strings can't contain spaces (`SFMono-Regular`); read whole record via `ctx.getVar('ctx.record')`. Full list: [gotchas.md](references/gotchas.md).
- Every select→Tag/color mapping must fall back to the raw value for unknown enums (else "Tag not found" at render).
- **Done = verified**: Playwright in a fresh no-cache browser with injected `localStorage NOCOBASE_TOKEN`, open `/admin/<pageSchemaUid>`, confirm every block renders, no console/page errors, interactions work — *and* a visual pass vs the prototype.

# Reference index

Full list with "read first / then" routing in [index.md](references/index.md). The reproduction-specific docs: [spec-template.md](references/spec-template.md) · [decomposition-grammar.md](references/decomposition-grammar.md) · [block-recipes.md](references/block-recipes.md) · [visual-loop.md](references/visual-loop.md) · [gotchas.md](references/gotchas.md) · [prototype-authoring.md](references/prototype-authoring.md) · [handoff.md](references/handoff.md).
