---
title: Many-to-many and through
description: Boundaries for many-to-many relation tables, through fields, member editing, and relation selectors.
---

# Many-to-many and through

## Applies to

- many-to-many member tables
- through-field display
- relation-record editing such as "add member" or "edit role"
- relation selectors inside popup flows

## Core rules

- distinguish target-table fields from through-table fields
- seeing target-table data is not proof that through fields are also usable
- when an action edits a through record, state clearly whether it edits the target record or the join record

## Minimum success standard

A many-to-many relation table is only complete when the run can answer:

- who the parent record is
- which resource the relation table is reading
- whether through fields are really visible
- whether add-member or edit-role actions target the correct action tree

## Common mistakes

- showing only target-table fields while ignoring through fields
- a selector popup opens, but nobody knows which table the result writes back to
- an edit action exists, but it actually edits the user record instead of the membership record

## Known limits

- many-to-many flows are usually more fragile than one-to-many flows
- when the current API cannot express the relation block correctly, report it as a blocker instead of pretending a normal table is complete

## Related docs

- [../blocks/table.md](../blocks/table.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [relation-context.md](relation-context.md)
- [record-actions.md](record-actions.md)
