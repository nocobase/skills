# SPEC template — prototype → buildable spec (Phase 1)

Fill this out by **reading the rendered prototype** (open it, look at it) plus the business ask. This is an LLM judgment task — do not parse the DOM for conclusions; a parser can dump facts but cannot decide "this is a faceted filter that drives the grid". The value of this template is a **fixed format + a forced checklist** so nothing high-value gets skipped (the asset-catalog miss — no facet rail, no pills — was a skipped checklist, not a missing block).

Produce one `SPEC.md`, show it, get confirmation, then build. Keep it concrete; uids get filled in during the build.

---

```markdown
# SPEC — <module name>

Prototype: <url>   Env: <env>   Prefix: <xxx_>

## 1. Data model
<collection>(template, titleField=<f>):
  - <field>  <interface>  <enum values / notes>
  - <relation> m2o/o2m/m2m → <target> (fk <role>_id; reverse hasMany <name>)
Relations / reverse fields listed explicitly.

## 2. Pages
- <Master list page> per main table (Table + Filter + Add + inline View/Edit; View=drawer with Details + assoc sub-tables)
- <Signature page(s)> — the screen the prototype is actually about

## 3. Region → block map (per signature page)
| Region (what the prototype shows) | Block | JS kernel? |
|---|---|---|
| ... | ... | ... |
(use the SKILL region table; name the exact recipe)

## 4. Interaction checklist  ← do NOT skip; go region by region
For every region, mark each affordance present in the prototype and how it maps:
- [ ] faceted / multi-select filter (with counts?)  → JS facet rail (§3b)
- [ ] status / quick-filter pills                   → pill bar (click-to-filter)
- [ ] free-text search                              → which block / where
- [ ] sort control                                  → block setting / control
- [ ] responsive grid that fills width / reflows    → List + CSS auto-fill (§3)
- [ ] click row/card → detail                       → native popup via ViewActionModel
- [ ] inline edit / status toggle / checkbox-writes → record action / JS write
- [ ] drag (kanban / reorder)                        → Kanban / native
- [ ] live refresh / countdown / "now" line          → per-row setInterval JS
- [ ] big-number KPIs / charts                       → Chart / JS KPI block
Anything not covered by a native block → flag as a JS kernel and name the recipe.

## 5. JS kernels (the hard bits)
List each JS block / JS item / JS field renderer to build and why a native block can't do it.

## 6. Seed plan
Cover every enum branch; ≥2 children per parent; all-English; dense enough for any calendar/board/catalog so it doesn't read as empty.

## 7. Known gaps / tradeoffs (predicted)
Native limits you expect to hit (alpha pie-not-donut, calendar month-only, etc.) and the planned fallback.
```

---

## Why a template, not an analyzer script

A deterministic script that *outputs requirements* is brittle: prototype→intent is semantic, so heuristics misclassify and actively mislead. Keep deterministic code for mechanical steps (screenshot / compare / verify). Keep analysis LLM-driven with this fixed template — deterministic **format**, not deterministic **logic**. If a script helps at all, it should only **extract facts** (repeated card structures, text, color tokens, interactive elements) as raw material — never conclusions.
