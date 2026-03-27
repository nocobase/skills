---
title: Relation context
description: Context and filtering rules for relation tables, relation blocks inside details, popup child tables, and through relations.
---

# Relation context

## Applies to

- relation tables inside details
- relation sub-tables inside popup flows
- relation-field filters
- one-to-many, many-to-many, and through flows

## Core rules

1. Check collection and field metadata before writing relation filters
2. relation or data-scope conditions must use `{ path, operator, value }`, not `{ field, operator, value }`
3. Derive logical field names from relation semantics and metadata rather than binding raw foreign keys
4. Child-side `belongsTo` filters must not use a bare association plus a scalar operator; prefer `foreignKey`, otherwise `<belongsToField>.<targetKey>`
5. Only upgrade to `resourceSettings.init.associationName + sourceId` when the parent-to-child relation resource is already verified
6. `associationName` must not be guessed from a child-side `belongsTo(parent)` field name
7. Details pages, popup pages, and table rows all have different context sources
8. Run [payload-guard.md](payload-guard.md) before persistence; do not continue after a blocker

## Common context sources

| Scenario | Stable source |
| --- | --- |
| table row opens details | expand by the current record's `filterTargetKey` |
| popup page hosts a child table | use verified `associationName + sourceId`, otherwise keep a metadata-derived child-side logical filter |
| details block hosts a relation table | derive the relation filter from the proven details record id |
| through relation | confirm the parent record id first, then confirm the through-table filter field |

## Minimum success standard

A relation table is only complete when:

- `collectionName` is explicit
- the relation filter or `associationName + sourceId` contract is explicit
- any `associationName + sourceId` usage can explain how `associationName` was verified
- the run can explain which parent and child sample records it should hit

## Common mistakes

- binding physical foreign keys before checking metadata
- using a bare `belongsTo` path such as `order` with `$eq`
- assuming `ctx.record` always exists inside a details block
- reusing outer page context inside popup relation tables
- rewriting to `associationName + sourceId` before the relation resource is proven
- writing a child `belongsTo` field name directly as `associationName`
- seeing the target table but missing through fields entirely

## Known limits

- many relation flows still depend on instance-specific physical foreign-key naming
- complex relation paths and through-field rendering remain more fragile than simple one-to-many flows
- without browser replay, the final result can only claim "flow tree persisted", not guaranteed runtime correctness

## Related docs

- [../blocks/filter-form.md](../blocks/filter-form.md)
- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [payload-guard.md](payload-guard.md)
- [popup-openview.md](popup-openview.md)
- [many-to-many-and-through.md](many-to-many-and-through.md)
