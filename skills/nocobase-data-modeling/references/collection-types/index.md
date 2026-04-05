# Collection Type Index

Use this file when the user is choosing or validating a collection type.

Typical intents:

- asking what collection types are supported;
- asking which collection template is common for a business object;
- deciding whether a table should be `general`, `tree`, `file`, `calendar`, or another special type;
- creating a table when the type must be chosen correctly before fields are added.

## Stable answer

Common collection types to mention first:

- `general`
- `tree`
- `file`
- `calendar`
- `sql`
- `view`
- `inherit`

Do not over-claim beyond instance capability. `sql`, `view`, and `inherit` may depend on plugins, data-source capability, or current server configuration.

## Selection rules

- `general`: ordinary business master data or transaction tables.
- `tree`: parent-child hierarchy is intrinsic to the model.
- `file`: the uploaded file itself is the primary business record.
- `calendar`: the record is mainly scheduled or displayed on calendars.
- `sql`: the collection is intentionally defined by SQL.
- `view`: the collection should synchronize from an existing database view.
- `inherit`: a parent collection defines shared fields and child collections extend it.

## Fast decision guide

- Choose `general` for customers, orders, products, invoices, tasks, leads, contracts metadata, and other ordinary business records.
- Choose `tree` for departments, categories, folders, region trees, account hierarchies, and other parent-child structures.
- Choose `file` for attachments, scanned documents, photos, certificates, vouchers, and other records where the file itself is the record.
- Choose `calendar` for events, appointments, schedules, shifts, or other records centered on calendar display and recurrence.
- Choose `sql` only when the record structure is intentionally defined by SQL rather than ordinary field-by-field modeling.
- Choose `view` only when the collection should mirror an existing database view.
- Choose `inherit` only when shared fields belong on a parent model and specialized fields belong on child models.

## Table-type anti-drift rules

- Do not default to `general` when the business behavior clearly implies `tree`, `file`, or `calendar`.
- Do not use `file` just because a table contains one attachment field. Use `file` when the file record is first-class.
- Do not use `tree` just because a table has a self-relation. Use `tree` when hierarchy is the core structure.
- Do not use `calendar` just because a table has one date field. Use `calendar` when scheduling behavior is central.

## Modeling rule

Before creating a collection:

1. pick the collection type;
2. load the matching payload reference if one exists;
3. inspect plugin capability if the type is `sql`, `view`, or `inherit`;
4. only then build the create payload.

## Collection-type references in this folder

- `general.md`
- `file.md`
- `tree.md`
- `calendar.md`
- `sql.md`
- `view.md`
- `inherit.md`

For `sql`, `view`, and `inherit`, inspect the current app capability first and then use the dedicated special-type reference instead of guessing a payload.
