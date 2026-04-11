# Page Archetypes

Use these archetypes as first-pass patterns when converting business intent into the simplified page DSL.

## 1. Management Page

Best for list/search/record-management scenarios.

Typical pattern:

- one or more tabs
- filter form + table, or table alone
- record actions such as `view`, `edit`, `destroy`
- optional `addNew`

## 2. Detail Page

Best for a single entity view.

Typical pattern:

- details block
- optional related-record tabs
- optional edit action / popup

## 3. Dashboard Page

Best for overview/monitoring.

Typical pattern:

- summary cards / chart blocks / markdown / js blocks
- usually fewer CRUD actions
- often multi-tab only when there are clearly separate domains

## 4. Portal / Static Page

Best for mostly static content.

Typical pattern:

- markdown, iframe, jsBlock, actionPanel
- little or no collection binding

## 5. Custom Mixed Page

Use when no archetype dominates.

Typical pattern:

- combine data-bound and non-data blocks deliberately
- keep tabs minimal
- keep popup semantics close to the opener

## 6. Selection Rule

Choose the simplest archetype that explains the user intent. Archetypes are starting patterns, not rigid templates.
