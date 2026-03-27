---
title: Tree tables and self-relations
description: Notes for tree-table mode, self-referential hierarchical data, and add-child actions.
---

# Tree tables and self-relations

## Applies to

- `TableBlockModel` tree-table mode
- self-referential data
- actions such as "add child" that depend on parent context

## Core rules

- verify that the collection really has a self-relation
- verify that the table really needs `treeTable` settings
- parent context must be explicit; never assume the current record always includes parent data

## Minimum success standard

A tree-table flow is only complete when it can answer:

- whether tree-table settings persisted
- whether known hierarchical samples map to the table correctly
- what parent context an add-child action receives

## Common mistakes

- building a normal table but describing it as a tree table
- having a self-relation but no tree-table configuration
- add-child actions with no parent context

## Known limits

- tree tables depend heavily on runtime expansion logic
- without browser replay, the final result can only claim flow-tree persistence and sample mapping, not guaranteed UI expansion correctness

## Related docs

- [../blocks/table.md](../blocks/table.md)
- [record-actions.md](record-actions.md)
- [relation-context.md](relation-context.md)
