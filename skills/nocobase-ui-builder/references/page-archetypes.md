# Page Archetypes

Use these archetypes as first-pass patterns when converting business intent into the simplified public page blueprint.

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

## 6. Multi-Workbench Whole-page

Use when one page needs several coordinated work areas instead of one dominant CRUD block.

Typical pattern:

- top filter forms that drive one or more central tables
- middle paired tables or details/table workbenches for adjacent entities
- bottom quick create forms or helper forms for high-frequency actions
- popup chains anchored to the owning table/details block, not scattered across the page
- top-level `reaction.items[]` kept in the same whole-page blueprint when the interaction belongs to the page being created now
- trigger this archetype from root-page density, not popup depth alone
- keep it on the same whole-page route as simpler pages; this is a pattern, not a separate staged workflow

## 7. Selection Rule

Choose the simplest archetype that explains the user intent. Archetypes are starting patterns for public whole-page structure, not rigid templates and not low-level mutation plans.
