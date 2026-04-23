# Verification Playbook

Use this file after any collection or field mutation.

The goal is not only to confirm that the request returned success. The goal is to prove that the resulting metadata matches the intended model.

## Verification order

After creating or updating a model, verify in this order:

1. collection-level structure
2. primary-key strategy
3. preset and audit fields
4. business scalar fields
5. choice and structured fields
6. relation fields
7. special-template behavior

Do not jump directly to relation details if the base collection shape is still wrong.

## Core read-back pattern

Prefer this sequence:

1. `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`
2. `nb api data-modeling collections fields list --collection-name <collection> -j` when you need a field-focused follow-up

Prefer `collections get --appends fields` as the main verification readback because it keeps the collection-level shape and field metadata together in one CLI path.

Plugin-gated failure rule:

- if a requested plugin-backed field was not created because the plugin was unavailable, that is not a modeling success;
- the correct outcome is to report the exact required plugin, not to verify a guessed substitute field.
- if a plugin-backed field was created but its required backing collection or resource is missing, that is also a modeling failure, not a partial success.

## Collection-level checks

Verify these first:

- `name`
- `title`
- `template`
- `view`
- `filterTargetKey`
- `titleField`
- collection options that control special behavior such as `tree`, `inherits`, `sql`, `view`, or schema-related settings

Common failures:

- collection created as `general` when it should be `tree`, `file`, `calendar`, `sql`, `view`, or `inherit`
- expected template option missing
- correct title stored on the wrong level

## Primary-key checks

Verify:

- there is exactly one intended primary-key strategy
- the primary-key field uses the expected `interface`
- the primary-key field uses the expected `type`
- `primaryKey`, `allowNull`, and `autoIncrement` match the intended strategy

Typical checks by strategy:

- `snowflakeId`: `type = "snowflakeId"`, `primaryKey = true`, `autoIncrement = false`
- `id`: `type = "bigInt"`, `primaryKey = true`, `autoIncrement = true`
- `uuid`: `type = "uuid"`, `primaryKey = true`
- `nanoid`: `type = "nanoid"`, `primaryKey = true`

Failure pattern:

- multiple id-like fields exist because the model mixed explicit id fields with template defaults or convenience flags

## Preset-field checks

For preset fields, verify the actual field metadata instead of assuming the collection-level flags worked.

Typical preset-field checks:

- `createdAt`: `interface = "createdAt"`, `type = "date"`, `field = "createdAt"`
- `updatedAt`: `interface = "updatedAt"`, `type = "date"`, `field = "updatedAt"`
- `createdBy`: `interface = "createdBy"`, `type = "belongsTo"`, `target = "users"`, `foreignKey = "createdById"`
- `updatedBy`: `interface = "updatedBy"`, `type = "belongsTo"`, `target = "users"`, `foreignKey = "updatedById"`

Failure patterns:

- the field exists but with the wrong interface
- the foreign key exists but the relation field is missing
- the collection-level flag was set but the resulting field metadata is incomplete for the intended modeling standard

## Scalar and choice-field checks

For each business field, verify:

- `name`
- `interface`
- `type`
- `uiSchema.title`
- `uiSchema.x-component`
- validator props when needed
- `defaultValue` when needed
- `uiSchema.enum` for local choice fields

Examples:

- `email` must include the email validator behavior
- `integer` must stay integer-oriented, not just numeric-looking
- `multipleSelect` and `checkboxGroup` must preserve empty-array defaults when intended

Failure patterns:

- field exists but drifted to a weaker interface
- enum field exists without enum options
- multi-valued field exists without a stable empty-state default

## Relation checks

After any relation mutation, verify both collections, not just the source collection.

For all relation families, verify:

- source field exists
- expected relation `type` exists
- target collection is correct
- key placement is correct
- reverse field exists when requested

Family-specific checks:

- `m2o`: foreign key lives on the current collection
- `o2m`: foreign key lives on the target collection
- `o2o`: owner side is explicit and foreign key exists on only one side
- `m2m`: `through`, `foreignKey`, and `otherKey` are all correct

Failure patterns:

- relation appears on one side only when bidirectional behavior was required
- reverse field was auto-generated with an unusable name
- label field points to raw `id` even though a readable title field exists

## Template-specific checks

### General

Verify:

- the collection is not accidentally using a special template
- preset fields and ordinary business fields are both present

### Tree

Verify:

- `parentId` exists
- `parent` exists with `treeParent: true`
- `children` exists with `treeChildren: true`
- both structural relation fields target the same collection

Failure pattern:

- a normal self-relation was created instead of the tree structure

### File

Verify:

- built-in file metadata fields still exist
- storage relation exists and points to `storages`
- file baseline fields were not replaced by ad hoc business fields

Failure pattern:

- a `general` table with URL-like fields was created instead of a real file collection

### Calendar

Verify:

- the collection uses the calendar template
- template-default recurrence fields exist when the built-in calendar template is intended
- business datetime fields such as `startAt` and `endAt` are separate and correctly typed

Failure pattern:

- a date-centric table was created without actual calendar semantics

### SQL

Verify:

- `template = "sql"`
- SQL is stored and accepted
- the declared fields match the projected columns or aliases

Failure pattern:

- field definitions and SQL projection drift out of sync

### View

Verify:

- the bound database view exists
- synchronized fields match `dbViews:get`
- application-side metadata does not drift away from the actual view columns

Failure pattern:

- the collection metadata survives, but the upstream view structure changed and the fields no longer match
- the collection was created as `template = "view"` even though `dbViews:list` or `dbViews:get` could not confirm the upstream database view

### Inherit

Verify:

- `inherits` points to the expected parent or parents
- inherited fields are present on the child metadata
- child-specific fields remain separate

Failure pattern:

- the child duplicates parent fields manually instead of inheriting them

## Title and label checks

Do not confuse these:

- collection display title belongs on the collection
- field display title belongs in `uiSchema.title`
- record picker readability depends on label fields and title-related metadata

Failure pattern:

- relation or picker fields show raw ids because the readable label configuration was never checked

## Minimal verification checklist

When time is tight, still verify at least:

1. the collection template is correct
2. the primary key is correct
3. the high-risk fields are correct
4. every relation key is on the correct side
5. template-specific structural fields exist

If any of these fail, treat the model as not done.
