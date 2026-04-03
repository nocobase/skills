# Relation Fields

Use this file for:

- relation-type selection
- any request that creates or updates relation fields
- any debugging task where relation direction or reverse fields might be wrong

This file is now the relation-reference entry point. Use it to choose the correct relation family first, then open the matching detailed file for canonical payloads.

## Stable answer

The four core relation types to mention first are:

- `belongsTo`
- `hasOne`
- `hasMany`
- `belongsToMany`

But the important part is not only the type name. You must also get these parameters right:

- `target`
- `foreignKey`
- `sourceKey`
- `targetKey`
- `through`
- `otherKey`
- `reverseField`

## Direction rules

- `m2o` creates `type: "belongsTo"` on the current collection. The foreign key lives on the current collection.
- `o2m` creates `type: "hasMany"` on the current collection. The foreign key lives on the target collection.
- `o2o` may create either `belongsTo` or `hasOne` depending on direction. Do not guess; inspect the intended owner side.
- `m2m` creates `type: "belongsToMany"` and needs a through table plus two foreign keys.

## Relation detail priority

When relation fields are in scope, check these in order:

1. relation direction
2. target collection
3. key placement such as `foreignKey`, `sourceKey`, and `targetKey`
4. through-table shape for many-to-many
5. reverse-field naming and UI schema

## Verification rules

After creating a relation field, verify:

- the source field exists with the expected `interface` and `type`
- the expected `foreignKey` exists on the correct side
- `through` and `otherKey` exist for `belongsToMany`
- the reverse field exists when one was requested
- `uiSchema.x-component-props.fieldNames.label` points to a readable field, not an accidental raw id

## Anti-drift rules

- Do not decide relation direction from business nouns alone.
- Do not omit `through`, `foreignKey`, or `otherKey` on `belongsToMany` when behavior must be predictable.
- Do not assume reverse-field naming is always inferred correctly.
- If the user asks for relation-field test tables, explicitly verify every generated relation after creation.
- Do not let relation detail distract from getting the collection type and field types right first.

## Detailed relation references

- `references/relations/index.md`
- `references/relations/m2o.md`
- `references/relations/o2m.md`
- `references/relations/o2o.md`
- `references/relations/m2m.md`
- `references/relations/mbm.md`
