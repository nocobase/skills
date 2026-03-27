---
title: Public block inventory and structural blind spots
description: Static inventory of public root blocks that can be added through Add block, plus the structure details that are still easy to misread from schema-first discovery alone.
---

# Public block inventory and structural blind spots

This file answers two questions:

1. which public root blocks can usually be added through Add block
2. which structural details still remain easy to misread when the skill only uses schema-first discovery

## Inventory

Known `publicTreeRoots` in the checked-in snapshot:

- `ActionPanelBlockModel`
- `ChartBlockModel`
- `CommentsBlockModel`
- `CreateFormModel`
- `DetailsBlockModel`
- `EditFormModel`
- `FilterFormBlockModel`
- `GridCardBlockModel`
- `IframeBlockModel`
- `JSBlockModel`
- `ListBlockModel`
- `MapBlockModel`
- `MarkdownBlockModel`
- `ReferenceBlockModel`
- `TableBlockModel`

## What to look for

For each public block family, track:

- the default UI shell shape
- the structure points that are still hard to infer from the skill alone
- concrete improvements that belong in docs, guards, or recipes

## High-risk examples

### `ActionPanelBlockModel`

- action-slot allowed uses are not the same as table or details actions
- the step-param path for layout and ellipsis is easy to misplace
- add guard coverage for `subModels.actions` allowed uses

### `ChartBlockModel`

- usable chart configuration lives under `chartSettings`, not only `resourceSettings`
- query mode and option mode must be explicit
- add discovery and guard coverage whenever the request clearly targets charts

### `CommentsBlockModel`

- only valid for comment-template collections
- `subModels.items` is required for visible output

### `CreateFormModel` and `EditFormModel`

- UI-legal shells are not the same as minimally usable business forms
- fillable forms still need submit actions, field subtrees, and stable context

### `DetailsBlockModel`

- `subModels.grid` is mandatory
- action slots and relation context have separate contracts

### `FilterFormBlockModel`

- items need both `filterField` and `subModels.field`
- a usable filter block also needs `filterManager`

### `GridCardBlockModel`

- block-level actions and item-level actions have different semantics
- nested `item -> grid` structure is easy to miss

## Use this document as a static aid, not a runtime source of truth

The authoritative runtime source is still:

- [../flow-schemas/index.md](../flow-schemas/index.md)
- `PostFlowmodels_schemabundle`
- `PostFlowmodels_schemas`

Use this file to remember where schema-first discovery still leaves structural blind spots.
