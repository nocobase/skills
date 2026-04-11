# Analysis Patterns

Use these patterns to classify a business analysis request before querying.

## Overview

Use for questions such as:

- current overview of leads and users
- what is the current business snapshot
- summarize the current pipeline

Typical outputs:

- total count by collection
- status breakdown
- owner distribution
- source distribution

Typical query shapes:

- total count: `count(id)`
- grouped count by status
- grouped count by owner label
- grouped count by source

## Distribution

Use when the user wants a categorical breakdown rather than a timeline.

Typical dimensions:

- status
- owner
- assignee
- team
- department
- source
- industry
- priority

Typical checks:

- keep the null bucket if it is meaningful
- sort by count desc for top-heavy categories
- reconcile grouped totals with overall totals

## Funnel

Use when records move through business stages and the user cares about progression.

Typical dimensions:

- lead status
- opportunity stage
- ticket state
- order status

Typical outputs:

- count by stage
- proportion by stage
- top drop-off or concentration point

Typical caveats:

- confirm whether terminal stages such as archived, canceled, or lost should be included
- confirm whether the user wants current state only or transitions over time

## Trend

Use when the user asks about growth, decline, recent change, or a historical pattern.

Typical time fields:

- `createdAt`
- `updatedAt`
- `closedAt`
- `paidAt`
- another business-specific date field

Typical outputs:

- daily count
- weekly count
- monthly count
- trend by status or owner over time

Typical checks:

- confirm the time range
- confirm the time grain
- confirm the time field

## Ranking

Use when the user wants top contributors or top categories.

Typical examples:

- top owners by lead count
- top sources by converted opportunities
- top accounts by order amount

Typical outputs:

- top N rows
- share of total
- optional tail summary for the remaining rows

## Quality Check

Use when the user wants to inspect data completeness or suspicious records.

Typical checks:

- missing owner
- missing source
- null-heavy fields
- stale records not updated recently
- records stuck in one status for too long
- orphaned relations

Typical approach:

- count total affected records
- group by the suspicious field when useful
- provide a few representative examples with `resource_list`
