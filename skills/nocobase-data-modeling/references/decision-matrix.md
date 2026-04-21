# Decision Matrix

Use this file first when the user request is still ambiguous.

This file does not replace the detailed references. Its job is to route the skill to the right reference path as quickly as possible.

## First question: what is the main risk?

Choose the first matching row.

| User intent or risk | Open first | Then open |
| --- | --- | --- |
| "What table type should this be?" | `references/collection-types/index.md` | the matching `references/collection-types/*.md` file |
| "Can you make sure the fields are correct?" | `references/field-capabilities.md` | the matching `references/fields/*.md` file |
| "Can you make sure the relation is correct?" | `references/relation-fields.md` | the matching `references/relations/*.md` file |
| "Give me a whole working schema" | `references/collection-types/index.md` and `references/field-capabilities.md` | then `references/relation-fields.md`, then `references/model-packs/*.md` only as an integration check |
| "How do I verify this model is really correct?" | `references/verification-playbook.md` | then the relevant collection, field, or relation reference |
| "What mutation sequence should I use?" | `references/cli-mutation-sequences.md` | then the relevant schema reference |
| "I need a special derived model" | `references/collection-types/sql.md`, `references/collection-types/view.md`, or `references/collection-types/inherit.md` | `references/verification-playbook.md` |
| "This depends on a plugin-provided table or field" | `references/plugin-provided-capabilities.md` | then the relevant collection, field, relation, or mutation reference |

## Second question: is the request about one table or multiple tables?

### One table

Usually open in this order:

1. `references/collection-types/index.md`
2. matching `references/collection-types/*.md`
3. `references/field-capabilities.md`
4. matching `references/fields/*.md`
5. `references/verification-playbook.md`

### Multiple tables

Usually open in this order:

1. `references/collection-types/index.md`
2. `references/field-capabilities.md`
3. `references/relation-fields.md`
4. `references/plugin-provided-capabilities.md` when needed
5. matching `references/model-packs/*.md` only for end-to-end comparison
6. `references/verification-playbook.md`

## Third question: is the collection ordinary or special?

### Ordinary collections

Use when the model is:

- `general`
- `tree`
- `file`
- `calendar`

Recommended route:

1. collection type reference
2. field family reference
3. relation family reference if needed
4. verification playbook

### Special collections

Use when the model is:

- `sql`
- `view`
- `inherit`

Recommended route:

1. special collection reference
2. upstream dependency inspection
3. CLI mutation sequence
4. verification playbook

Special-case blocker for `view`:

- if upstream view inspection does not find the database view, stop the `view` path;
- do not fabricate a `view` collection and do not auto-fallback to `general`.

## Fast routing by user phrasing

Use these shortcuts when the user wording is clear.

### Table-type wording

Examples:

- which table type
- should this be general or tree
- should this be file or attachment
- should this be sql or view

Open:

1. `references/collection-types/index.md`
2. matching collection-type file

If the question is specifically `sql` vs `view`:

- `view` requires an existing upstream database view;
- if no upstream view exists, route away from `view` instead of force-creating it.

### Field-type wording

Examples:

- field types
- interfaces
- payload shape
- enum options
- datetime field
- createdBy or updatedBy

Open:

1. `references/field-capabilities.md`
2. matching `references/fields/*.md`

### Relation wording

Examples:

- belongsTo or hasMany
- foreign key on which side
- reverse field
- through table

Open:

1. `references/relation-fields.md`
2. matching `references/relations/*.md`

### Whole-schema wording

Examples:

- complete schema
- all tables
- make sure the whole model is right
- end-to-end example

Open:

1. `references/collection-types/index.md`
2. `references/field-capabilities.md`
3. `references/relation-fields.md`
4. `references/model-packs/index.md`
5. matching `references/model-packs/*.md`

### Verification wording

Examples:

- how do I confirm this is correct
- what should I read back
- how do I verify after create

Open:

1. `references/verification-playbook.md`

### Execution wording

Examples:

- what sequence should I use
- inspect then create then verify
- how do I patch the model safely

Open:

1. `references/cli-mutation-sequences.md`
2. then the relevant collection, field, or relation reference

### Plugin-backed capability wording

Examples:

- comments
- china region
- chinaRegions
- attachment URL
- attachment URL
- many-to-many array
- plugin-provided field

Open:

1. `references/plugin-provided-capabilities.md`
2. then the matching detailed reference

## Hard routing rules

- If the main risk is table shape, do not start with relation details.
- If the main risk is field correctness, do not stay at the collection-type layer.
- If the main risk is relation direction, inspect both collections before changing anything.
- If the user asks for a whole schema, do not jump straight to a model pack before deriving table, field, and relation decisions.
- If the user asks whether the model is correct, route to verification before proposing more mutations.
- If a model pack conflicts with lower-level references, the lower-level references win.

## Default route when still unsure

If the user request is broad and ambiguous, use this default order:

1. `references/collection-types/index.md`
2. `references/field-capabilities.md`
3. `references/relation-fields.md`
4. `references/model-packs/index.md`
5. `references/verification-playbook.md`

This default order keeps the skill aligned with its main priority:

1. correct table type
2. correct field payload
3. correct relation structure
4. correct whole-schema structure
5. verified outcome
