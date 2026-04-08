# Page Archetypes

Read this file after [page-intent-planning.md](./page-intent-planning.md) has already established that the request is a high-level page-building task. Use these archetypes to produce a first-pass `pageBlueprint`, then tighten it with live schema facts.

## Management

Use when the user wants a CRUD-style business page such as "user management", "order list", or "customer admin".

Default pattern:

- one primary data block, usually `table`, `list`, or `gridCard`
- one filtering/search area, usually `filterForm`
- block-level create action, often `addNew`
- record-level actions such as `view`, `edit`, and sometimes `delete`
- popup or in-page form content for create/edit/view when the request implies a usable workflow

Typical layout:

- left filter + right primary table/list
- or top filter + bottom primary data block when vertical space is preferable

## Detail

Use when the page centers on one record and its surrounding context.

Default pattern:

- one primary `details` block
- optional supporting blocks for related records, notes, activity, or helper text
- record-scope actions when the user expects edit/view behavior

Typical layout:

- top summary/details block
- secondary rows or columns for related data blocks or notes

## Dashboard

Use when the user is asking for metrics, trends, KPIs, or overview reporting.

Default pattern:

- summary/stat blocks or charts at the top
- optional `filterForm`
- one or more charts or analytical tables
- optional markdown/action panel support blocks

Rules:

- only plan data-driven visuals that can be backed by live schema facts
- do not invent KPI semantics or aggregation columns

## Portal

Use when the page is mostly navigation, explanation, embedded content, or utility entry points.

Default pattern:

- `markdown`, `iframe`, `actionPanel`, and other non-data blocks
- optional small data widgets if the request explicitly asks for them

Rules:

- non-data blocks may remain unbound
- do not force a collection binding just because the page exists inside a data-oriented app

## Custom

Use when the request does not fit the previous archetypes cleanly.

Default pattern:

- compose the page from the minimum number of blocks that make the request explicit
- keep assumptions visible
- stop and surface unresolved ambiguity rather than pretending a stable archetype exists
