# FilterFormBlockModel

## Applies to

- `FilterFormBlockModel`
- `FilterFormGridModel`
- `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`

Typical targets:

- top-of-list filters
- main-record filters above a details page
- a stable query entrypoint linked to a main table or relation table

## When to use it

- the user explicitly asks to filter by order number, status, customer, date, and similar fields
- a validation case must prove the page is not an empty shell
- the main data block is known and needs a stable filter entrypoint rather than a generic free-form shell

## Pre-write checklist

1. Read schema for `FilterFormBlockModel`, `FilterFormItemModel`, and the target filter field models
2. Confirm the target block `uid`
3. Confirm field metadata for every requested filter field
4. If relation fields or record pickers are involved, read [../patterns/relation-context.md](../patterns/relation-context.md)

## Minimal success tree

- `FilterFormBlockModel`
- `subModels.grid`
- at least one `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`
- every filter item explicitly points to a target block such as `defaultTargetUid`
- the containing `BlockGridModel` persists a top-level `filterManager`

## Done criteria

- every requested key filter item is persisted, not just an empty grid
- every filter item binds a real `fieldPath`
- `subModels.field.use` and `filterFormItemSettings.init.filterField` are both derived from field metadata
- submit and reset actions exist
- `subModels.actions[*].use` must come from the filter-form action family, not generic `ActionModel`
- the target table or block is traceable
- `BlockGridModel.filterManager` links every filter item to a real target with metadata-aligned `filterPaths`
- validation output should identify which sample data the filters should hit
- pre-write audit must pass [../patterns/payload-guard.md](../patterns/payload-guard.md)

## Common traps

- only a `FilterFormBlockModel` shell exists with no item or action
- filter items exist but are not bound to a target block
- only `defaultTargetUid` exists and `filterManager` is missing
- relation filters guess `fieldPath` or `fieldNames`
- relation `foreignKey` is bound directly as `fieldPath`
- dates or numbers fall back to a plain text input
- dotted scalar paths use the whole path as `descriptor.name` instead of the leaf field
- "filter block persisted" is misreported as "filtering works"

## Related patterns

- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/payload-guard.md](../patterns/payload-guard.md)
- [table.md](table.md)

## Fallback policy

- if a complex filter field is still ambiguous, keep only the simple stable filters
- if the target block `uid` is not stable yet, do not fake linkage
- in validation, if the final filters still cannot hit sample data, the case is incomplete
