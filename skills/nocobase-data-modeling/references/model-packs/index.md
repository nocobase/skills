# Model Pack Index

Use this folder when the user needs complete multi-table examples rather than isolated collection or field fragments.

These model packs are secondary references. They are for validating three things together after the lower-level schema has already been derived:

- the correct collection type
- the correct field payloads
- the correct relation direction

Authority rule:

1. collection-type references win over model packs
2. field references win over model packs
3. relation references win over model packs
4. plugin-gate references win over model packs

Use a pack only after the table, field, relation, and plugin decisions are already justified from the primary references.

Compact modeling reminder:

- model packs often contain expanded or read-back style structures;
- do not copy them directly into a compact `collections apply` or `fields apply` request;
- first reduce them to compact payloads that keep only collection template, business fields, relation intent, and the small set of non-derivable options.

Current packs:

- `orders.md`: transactional model with `customers`, `orders`, and `order_items`
- `person-students.md`: inheritance model with `person` and `students`
- `contracts-files.md`: general plus file-centered model with `contracts` and `contract_files`
- `calendar-appointments.md`: calendar model with recurrence and appointment datetime fields
- `tree-categories.md`: tree model with structural parent and children fields
- `sql-view-analytics.md`: comparison pack for choosing `sql` versus `view`

Recommended use:

1. choose the collection type file first
2. choose the field-family references for the fields in scope
3. choose the relation-family references for the links in scope
4. apply plugin-gate references when relevant
5. use the model pack only to validate how the tables fit together end to end

Do not copy a model pack blindly. Adjust names, labels, and optional fields to the user's domain, but keep the structural pattern intact.

Do not use a model pack as a shortcut to skip field-level or relation-level reasoning.
