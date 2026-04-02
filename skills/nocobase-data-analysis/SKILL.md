---
name: nocobase-data-analysis
description: Query and analyze business data in NocoBase via MCP. Use when users want current counts, grouped breakdowns, owner/source distributions, or business summaries across collections, with main data source first and fallback discovery to other enabled data sources.
---

# Goal

Use NocoBase MCP tools to locate the right collection, query business data safely, and produce reliable summaries or grouped analysis.

# Prerequisite

- NocoBase MCP must already be reachable and authenticated.
- If MCP returns authentication errors such as `Auth required`, stop and ask the user to refresh MCP authentication before continuing.

# Default strategy

1. Inspect the data source path first.
2. Prefer the `main` data source.
3. If the target collection is not in `main`, inspect other enabled data sources.
4. Once the collection is located, use that `dataSource` explicitly in every subsequent `resource_*` call.
5. Prefer `resource_query` for counts and grouped analysis only after confirming the query parameter contract.
6. Fall back to `resource_list` plus manual counting when query results are suspicious or need cross-checking.

Useful references:

- `references/analysis-patterns.md` for common business analysis shapes
- `references/metric-checklist.md` for metric definition and scope checks
- `references/entity-mapping.md` for mapping business terms to collections and fields

# Data source discovery

- If the user explicitly names a data source, use it directly.
- Otherwise start with `main`.
- When the target collection is not found in `main`, call `data_sources:list_enabled` and inspect other enabled data sources one by one.
- If multiple data sources contain the same collection name:
  - default to `main` when `main` is one of them;
  - otherwise present the candidates and explain which one you are using.
- In the final answer, state which data source was used.

# Collection discovery

- If the user gives a collection name, verify it exists before querying.
- If the user uses business terms such as "leads", "users", "orders", or "opportunities", inspect collection metadata to map the business term to the actual collection name.
- Prefer `collections:listMeta` for a fast overview.
- Then use `collections:get` with `appends: ["fields"]` when you need exact field names, relation targets, or enum options.
- Use `references/entity-mapping.md` as a reusable heuristic for common business nouns and likely field categories.

# Query contract checks

Before using `resource_query`, verify the request shape matches the real backend contract:

- `measures[].aggregation`, not `aggregate`
- `orders[].order`, not `direction`
- `field` should usually be passed as a field path array such as `["id"]` or `["owner", "nickname"]`
- Use `alias` whenever the result will be referenced in output or `having`

Correct examples:

```json
{
  "resource": "lead",
  "dataSource": "main",
  "measures": [
    { "aggregation": "count", "field": ["id"], "alias": "lead_count" }
  ]
}
```

```json
{
  "resource": "lead",
  "dataSource": "main",
  "dimensions": [
    { "field": ["status"], "alias": "status" }
  ],
  "measures": [
    { "aggregation": "count", "field": ["id"], "alias": "lead_count" }
  ],
  "orders": [
    { "field": ["status"], "alias": "status", "order": "asc" }
  ]
}
```

# Recommended workflow

## 1. Confirm reachability

- Use `auth:check`.
- If authentication fails, stop.

## 2. Find the collection

- First inspect `main`.
- If not found, inspect other enabled data sources.
- Read fields before querying if field names or relations are uncertain.

## 3. Start with simple counts

- Use `resource_query` with a single `count(id)` measure.
- Keep the first query minimal so you can validate the result shape quickly.

## 4. Add grouped analysis

Common grouped views:

- by status
- by owner
- by source
- by department
- by created date or month

For relation labels, use field paths such as:

- `["owner", "nickname"]`
- `["mainDepartment", "title"]`

## 5. Cross-check when needed

Re-check with `resource_list` when:

- the grouped rows look duplicated unexpectedly;
- the numeric result looks like record IDs instead of counts;
- totals do not match between summary and grouped output;
- the collection may be affected by ACL scope or hidden filters.

When cross-checking:

- fetch enough rows to cover the visible dataset or use pagination;
- count and group manually from the returned records;
- compare the manual result with `resource_query`.

## 6. Present the result

Report:

- the collection used;
- the data source used;
- the total count;
- the key grouped breakdowns;
- any caveat such as ACL scope, null values, or fallback to manual verification.

# Analysis entry points

Classify the user request before querying:

- `overview` for current totals and main distributions
- `distribution` for grouped counts by status, owner, source, team, or department
- `funnel` for stage-based business progression
- `trend` for date or month-based change over time
- `ranking` for top owners, sources, accounts, or products
- `quality-check` for missing values, null-heavy fields, suspicious statuses, or orphaned relations

Use `references/analysis-patterns.md` for the recommended query shapes for each pattern.

# Metric definition checks

Before returning an answer, verify the metric scope:

- what time range is included
- which time field drives the range
- whether the metric is total count, distinct count, sum, or average
- whether archived, inactive, null, or other terminal states should be included
- whether grouped totals reconcile with the grand total

Use `references/metric-checklist.md` when the user request is ambiguous or the metric may be interpreted in more than one way.

# Common pitfalls

- Do not assume the collection is in `main`; check `main` first, then search other enabled data sources.
- Do not omit `dataSource` after the collection has been located.
- Do not use `aggregate` in query measures; the backend expects `aggregation`.
- Do not use `direction` in query orders; the backend expects `order`.
- Do not assume suspicious aggregate output is correct.
- If a "count" result looks like `36`, `54`, `80`, or another plausible record ID, verify whether aggregation was actually applied.
- Relation label grouping requires the real relation path and target field, not guessed labels.

# Verification checklist

- MCP is authenticated.
- The collection exists in the chosen data source.
- The fields used in `dimensions`, `measures`, `orders`, and `filter` actually exist.
- `resource_query` uses `aggregation` and `order`.
- Summary totals match grouped totals, or any mismatch is explained.
- The final answer states the data source and any verification fallback used.
