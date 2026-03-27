# DetailsBlockModel

## Applies to

- `DetailsBlockModel`
- `DetailsGridModel`

Typical targets:

- main-record details pages
- details content inside drawer or dialog
- details blocks that also host actions or relation tables

## Pre-write checklist

1. Read the `DetailsBlockModel` schema
2. Confirm the record-context source
3. If the details block also hosts relation tables, read [../patterns/relation-context.md](../patterns/relation-context.md)
4. If the details block also hosts actions, read [../patterns/popup-openview.md](../patterns/popup-openview.md) and [../patterns/record-actions.md](../patterns/record-actions.md)

## Minimal success tree

- `DetailsBlockModel`
- explicit `resourceSettings` or `filterByTk` source
- `subModels.grid`
- at least one visible child inside the grid: detail fields, actions, or business sub-blocks

## Done criteria

- the details block can bind to a real sample record
- the report can name which sample record it is
- an empty title plus an empty grid is only a shell, not a usable details block
- if the user asked for actions or relation tables inside details, report their status separately
- never report "details ready" when only the shell exists

## Common traps

- no explicit record context
- only `DetailsGridModel` exists, but no field or child node exists inside it
- relation tables inside details have an unclear filter
- the block assumes implicit `ctx.record` without proving where that context comes from
- actions exist but do not open the correct record

## Related patterns

- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/record-actions.md](../patterns/record-actions.md)

## Fallback policy

- if record context is still unstable, keep the blocker explicit rather than faking success
- if the main details body persists but relation tables or actions are unstable, report them separately
