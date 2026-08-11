# JS Snippets

This directory is the canonical local snippet library for JS / RunJS authoring.

## Tiers

- `safe`: first-hop examples. These are short, source-backed, and ready to adapt.
- `guarded`: second-hop examples. Use only when the safe tier does not cover the intent and the risk is acceptable.
- `advanced`: reserved for complex examples. Do not use as first-hop material.

## Retrieval Order

1. Lock the authoring surface in [../js-surfaces/index.md](../js-surfaces/index.md).
2. Read [catalog.json](./catalog.json) for the matching `safe` snippet ID.
3. Open exactly one snippet doc and edit only the documented slots.
4. Use the snippet as guidance and write through `nb api flow-surfaces <action>`. If the response returns `errors[]`, fix the payload and retry.

## Filter Operator Gate

If the selected snippet contains an editable filter, load the `nocobase-utils` skill with topic `filter`, then read [Filter Condition Format](../../../nocobase-utils/references/filter/index.md) before changing its field or operator. Resolve the replacement field's live frontend interface/type and reselect the operator from that field group's allowlist; do not assume the template's operator remains valid after changing the field. Date comparisons never use the number-only `$lt`, `$lte`, `$gt`, or `$gte` operators.

`catalog.json` is the machine-readable index for snippet retrieval. Use these fields directly:

- `sceneHints`: narrow block/detail/form/table/event-flow selection before reading the doc.
- `modelUses`: model profiles keyed by surface.
- `offlineSafe`: prefer `true` snippets when the code should not depend on remote network calls.
- `preferredForIntents`: the one to three intent tags this snippet should win for.

## Boundaries

- Snippets here are final-code examples, not upstream capability inventory.
- Upstream capability lookup remains in [../js-reference-index.md](../js-reference-index.md).
- First-hop surface recommendations remain in [../js-surfaces/snippet-manifest.json](../js-surfaces/snippet-manifest.json).
