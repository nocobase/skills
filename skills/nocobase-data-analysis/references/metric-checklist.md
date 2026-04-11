# Metric Checklist

Use this checklist before finalizing any business analysis result.

## Metric type

Confirm which metric the user actually wants:

- total count of records
- distinct count of entities such as customers, owners, or accounts
- sum of a numeric field such as amount or revenue
- average, min, or max of a numeric field

Do not assume `count(records)` when the user may mean `count(distinct customer)` or `sum(amount)`.

## Time scope

Confirm the time scope when the question may depend on recency:

- all time
- today
- yesterday
- last 7 days
- last 30 days
- month to date
- quarter to date
- year to date
- custom range

Also confirm which time field controls the scope.

## Status scope

Check whether the metric should include or exclude:

- archived
- inactive
- canceled
- lost
- success or closed
- draft or temporary records

If the user does not specify, explain the default interpretation you used.

## Null handling

Decide whether null values matter for interpretation:

- include null as its own bucket when it indicates missing data
- suppress null only when it is genuinely irrelevant

If null is excluded, say so.

## Reconciliation

When returning grouped results:

- compare grouped totals with the grand total
- explain any mismatch
- check whether the mismatch is caused by null buckets, ACL scope, joins, or filters

## Data source and ACL scope

Always verify:

- which data source supplied the result
- whether the current role may only see a subset of records

State these caveats when they could affect interpretation.

## Query validation

Before trusting an aggregate result:

- verify `measures[].aggregation`
- verify `orders[].order`
- verify the dimension field path
- verify the relation label field if grouping by a related record

If the output looks like record IDs instead of aggregates, re-run the query and cross-check with `resource_list`.
