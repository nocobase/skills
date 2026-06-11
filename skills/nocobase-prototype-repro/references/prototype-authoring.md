# Prototype authoring (optional front-half)

**Skip this whole page if the user already handed you a prototype HTML/image/link.** This is only for the case where you must *design* the prototype first from a business ask. Keep it light — a prototype is a visual target, not a deliverable; don't over-engineer it.

## When to author vs skip

- **Have a prototype already** → go straight to SKILL.md Phase 0. Done here.
- **Only a business sentence, no prototype** → make a quick one before reproducing, so the build has a visual target (without one, builds degrade to a generic table).

## What to produce

One **self-contained HTML** (no CDN, inline CSS/JS), 1440px, English mock data dense enough to look real (table ≥10 rows, cards ≥8, calendar/board filled). It only needs to *look* right and be static — no real logic.

Then embed the spec so reproduction doesn't have to guess:

```html
<script type="application/nb-spec+json">
{ "collections": [ {name, fields[], enums} ],
  "regions":     [ {label, block, jsSlots[], behaviors[]} ],
  "interactions":[ "facet multi-select drives grid", "click card → drawer", ... ],
  "jsKernels":   [ "live phone preview bound to form values", ... ],
  "notes":       [ "container native, content JS", ... ] }
</script>
```
Use the [decomposition-grammar.md](decomposition-grammar.md) vocabulary for `regions` (container × JS slots × behaviors). Copy the shape from an existing prototype (e.g. `04-social-media-calendar.html`) rather than inventing one.

## Keep it diverse

The one thing worth deliberate effort: **don't make every app look the same.** Pick an archetype + palette that fits the domain, and vary it across a set:

- dashboard (KPI + charts) · card catalog (facet rail + grid) · kanban board · calendar/schedule · 3-pane inbox (list + detail + side) · wizard/composer (form + live preview) · dark wallboard (NOC/SLA/quality) · tree + records · analytics (multi-chart) · portal/landing (hero + cards).
- Differentiate near-duplicate domains by **viewpoint**, not just color (e.g. ticket *inbox* vs ticket *escalation pipeline*; expense *applicant* vs *finance* view).

## That's it

Don't add more rules than this. A tighter prototype + a correct nb-spec beats a long authoring checklist. The reproduction half (SKILL.md Phases 1–4) carries the real standardization.
