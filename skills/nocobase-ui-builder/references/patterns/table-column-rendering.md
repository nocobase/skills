---
title: Table column rendering
description: Completion criteria for real visible data columns, default display-model mapping, and the boundaries of relation-path columns.
---

# Table column rendering

## Applies to

This document covers normal `TableColumnModel + subModels.field` data columns. If the column is `JSColumnModel`, read [../js-models/js-column.md](../js-models/js-column.md) and [../js-models/rendering-contract.md](../js-models/rendering-contract.md) first.

Typical problems:

- the column shell exists, but the page shows no real value
- `TableColumnModel` is persisted, but `subModels.field` is missing
- field-type to display-model mapping is unclear
- relation paths such as `customer.name` are unstable
- relation-title columns are asked to own click-to-open by default

## Decision rule

When the user asks to show real values in a table, the column is complete only when:

1. the column itself exists
2. `stepParams.tableColumnSettings.width.width` exists, or readback at least shows `props.width`
3. `subModels.field` exists and uses a stable display field model

A column shell without `subModels.field` is only a partial structural result.
If width is missing, NocoBase runtime returns early in `getColumnProps()`, so the field may still appear inside `Fields` while the actual column does not render.

## Minimal flow-tree shape

At minimum:

- `use: TableColumnModel`
- `stepParams.fieldSettings.init.fieldPath`
- `stepParams.tableColumnSettings.width.width`
- `subModels.field.use = <Display*FieldModel>`

## Default mapping

When schema explicitly allows the model:

- text, titles, codes, and simple labels -> `DisplayTextFieldModel`
- select, enum, or status -> `DisplayEnumFieldModel`
- numeric and amount fields -> `DisplayNumberFieldModel`
- date or time fields -> a matching date or time display model
- booleans -> `DisplayCheckboxFieldModel`

If schema does not clearly allow a display model, do not guess.

## Relation paths and dotted paths

For paths such as `customer.name`:

- first prove that the path is resolvable under current collection metadata and schema
- then prove that the chosen display model is correct for that path
- if only the relation field is known but the title path is not stable, do not create a shell and report success

When displaying relation titles in table or details contexts:

- keep the parent collection binding
- use the full dotted path
- explicitly add `associationPathName`
- do not split the binding into `target collection + associationPathName + simple fieldPath`

Fallback order:

1. if display only, keep dotted path + `associationPathName`
2. if click-to-open is also required, fall back to the native relation-column solution with title display + openView
3. otherwise report the relation-path column as unstable

## Post-write checks

Confirm that:

- each target column uses `TableColumnModel`
- each target column persists a renderable width
- each target column has `subModels.field.use`
- `subModels.field.stepParams.fieldSettings.init.fieldPath` matches the column target

If any item is missing, report "column shell created, data column incomplete".

## Common mistakes

- persisting only `TableColumnModel`
- omitting `tableColumnSettings.width.width`, which makes the column invisible even though `Fields` still lists it
- keeping the display model only in settings without creating `subModels.field`
- sacrificing visible data columns because popup or action flows are more complex
- binding a relation field directly into `DisplayTextFieldModel(fieldPath=<relationField>)`
- using `customer.name` without `associationPathName`
- using `customer.name` without verifying metadata and schema
- making a dotted relation-title column responsible for click-to-open
- defaulting to JS columns after a dotted-path issue

## Related docs

- [../blocks/table.md](../blocks/table.md)
- [clickable-relation-column.md](clickable-relation-column.md)
- [popup-openview.md](popup-openview.md)
- [relation-context.md](relation-context.md)
