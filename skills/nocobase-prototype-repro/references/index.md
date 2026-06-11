---
title: nocobase-prototype-repro reference index
description: Hit one quick route first, then drill down as needed; don't load everything at once.
---

# nocobase-prototype-repro reference index

Hit one quick route and read its "read first". Only open the "then" docs when that route still isn't enough. For mechanics, go to the sibling skills (`nocobase-ui-builder` / `nocobase-data-modeling` / `nocobase-app-discipline`); this folder holds only the reproduction-specific judgment.

## Quick Routes

| Task shape | Read first | Then, as needed |
| --- | --- | --- |
| Prototype handed over, reproduce end-to-end | [spec-template.md](spec-template.md) | [decomposition-grammar.md](decomposition-grammar.md), [block-recipes.md](block-recipes.md), [gotchas.md](gotchas.md), [visual-loop.md](visual-loop.md) |
| Existing page is monotone / ugly / off | [visual-loop.md](visual-loop.md) | [block-recipes.md](block-recipes.md), [gotchas.md](gotchas.md) |
| Which block for this region? | the **Region → native block** table in SKILL.md | [decomposition-grammar.md](decomposition-grammar.md), [block-recipes.md](block-recipes.md) |
| Concrete JSON / RunJS snippet for a block | [block-recipes.md](block-recipes.md) | `nocobase-ui-builder`'s `js.md` / `popup.md` / `chart.md` |
| No prototype, must author one first | [prototype-authoring.md](prototype-authoring.md) | — |
| Hand the build to another agent (one-line prompt + one link) | [handoff.md](handoff.md) | — |
| Hit an alpha sandbox / flow-surfaces contract trap | [gotchas.md](gotchas.md) | `nocobase-ui-builder`'s gotcha/contract docs |

## File list

| File | Contents |
| --- | --- |
| [spec-template.md](spec-template.md) | Phase 1 SPEC template + interaction checklist (list every affordance per region) |
| [decomposition-grammar.md](decomposition-grammar.md) | the closed-set grammar: region = container × JS slots × behaviors |
| [block-recipes.md](block-recipes.md) | runnable JSON / CLI snippet per region → native block (§ numbers referenced by the SKILL.md Region table) |
| [visual-loop.md](visual-loop.md) | the screenshot → compare → fix convergence loop + reviewer-role routing |
| [gotchas.md](gotchas.md) | alpha sandbox + contract-trap registry (most-hit during reproduction) |
| [prototype-authoring.md](prototype-authoring.md) | quickly author one when there's no prototype (incl. embedded nb-spec) |
| [handoff.md](handoff.md) | cross-agent handoff via one-line prompt + one link + embedded-spec best practice |
