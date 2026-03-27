# GridCardBlockModel

## When to prefer it

Use `GridCardBlockModel` for:

- metric cards
- KPI surfaces
- numeric summary or overview pages

## Minimal stable tree

The default nested structure must include:

- `subModels.item.use = GridCardItemModel`
- `subModels.item.subModels.grid.use = DetailsGridModel`

The block and the item each own a different `actions` slot.

## Two action slots

### `GridCardBlockModel.subModels.actions`

Use for collection-level actions such as:

- create
- refresh
- navigation
- toolbar-style utilities

### `GridCardItemModel.subModels.actions`

Use for record-level actions such as:

- view
- edit
- delete
- record popup

## Default skill policy

1. KPI, metric-card, summary, and overview requests should treat `GridCardBlockModel` as an `insight` candidate.
2. If the request only needs a few headline metrics, prefer grid cards over charts.
3. If the request also asks for interaction, linking, guide, narrative, or custom behavior, `GridCardBlockModel + JSBlockModel` may be the main insight pair.
4. Default to `actions: []` first instead of guessing action uses.
5. If the item subtree is missing, restore `GridCardItemModel + DetailsGridModel` before configuring fields or actions.

## Guard focus

Important guard codes include:

- `GRID_CARD_ITEM_SUBMODEL_MISSING`
- `GRID_CARD_ITEM_USE_INVALID`
- `GRID_CARD_ITEM_GRID_MISSING_OR_INVALID`
- `GRID_CARD_BLOCK_ACTION_SLOT_USE_INVALID`
- `GRID_CARD_ITEM_ACTION_SLOT_USE_INVALID`

## Continue reading

- [../page-first-planning.md](../page-first-planning.md)
- [chart.md](chart.md)
- [public-blocks-inventory.md](public-blocks-inventory.md)
