# Chart validation

Read [chart.md](./chart.md) first for chart tasks. Read this file only after you are already inside the chart topic and need to maintain the chart skill contract, design a validation matrix, or add negative-case regressions. For runtime DSL, `query / visual / events`, and readback rules, see [chart-core.md](./chart-core.md).

## Contents

1. Recommended contract-validation cases
2. More complex contract-validation matrix

## Recommended contract-validation cases

After finishing a chart configuration, the skill should at minimum perform contract/readback validation in the following order:

1. **builder + basic base chart**
   - `query.mode = "builder"`
   - `visual.mode = "basic"`
   - `readback` should show `query.collectionPath`

2. **SQL chart persistence**
   - `query.mode = "sql"`
   - Do not only check `stepParams.query.sql`
   - Also confirm that the SQL has been persisted into `flowSql`
   - Prefer reading `context(path="chart")` once more to confirm that `queryOutputs` and mappings are consistent

3. **filter-target boundary for builder / SQL**
   - A builder chart can act as a filter-form target
   - After switching to SQL, the filter target should become invalid / detached
   - After switching back to builder, the filter target should become available again

4. **custom `visual.raw`**
   - Run `ChartOptionModel` compatibility validation before the write
   - After the write, confirm that compatibility validation passed and the related option config was persisted

5. **negative cases**
   - mixing `configure` with `query / visual / events`
   - invalid `heightMode`
   - `visual.mappings.*` referencing a query output that does not exist
   - builder aggregate-measure sorting / custom-alias sorting
   - All of them should return 400 rather than leaving partially broken configuration behind

## More complex contract-validation matrix

In addition to the 5 base groups above, also consider these:

6. **builder collection switch**
   - Start with `employees`
   - Then switch to `departments`
   - Update `query` and `visual.mappings` in the same write
   - The previous `measures / dimensions / sorting / filter` should not contaminate the new collection

7. **builder aggregate / alias sorting negative case**
   - `measures = [{ field: "amount", aggregation: "sum", alias: "totalAmount" }]`
   - `sorting = [{ field: "totalAmount", direction: "desc" }]`
   - Expect 400
   - `sorting.field = "amount"` should also expect 400
   - These cases are explicitly unsupported by the current contract, not "probably usable"

8. **chart filter-target roundtrip**
   - Bind a builder chart to a filter form
   - Confirm the filter target detaches after switching to SQL
   - Confirm the filter target becomes bindable again after switching back to builder

9. **custom + events combination**
   - `visual.mode = "custom"`
   - Configure `events.raw` at the same time
   - Verify that both the event code and the event configuration were persisted

10. **SQL durable**
   - After creating an SQL chart, you must confirm that `flowSql` has been persisted
   - Do not judge success only by in-memory fields from the first write response

11. **SQL alias case sensitivity**
   - Test both of these in SQL:
     - `count(*) as employeecount`
     - `count(*) as "employeeCount"`
   - Compare them against `context(path="chart").chart.queryOutputs`
   - `visual.mappings` must strictly reference the real output names returned by readback / context

12. **SQL runtime-context risky path**
   - SQL contains template variables / `ctx` / liquid binds
   - Expect `context(path="chart").chart.riskyPatterns` to return preview risk hints
   - The skill must not invent `visual.mappings` without a `queryOutputs` basis
   - Expect the flow to close via `readback`, or to stop at the query stage

13. **SQL runtime-context preview unavailable**
   - SQL contains template variables, liquid binds, or `ctx.*`
   - Expect `context(path="chart")` to have no stable `queryOutputs`, but to expose the corresponding `riskyPatterns`
   - The skill must not blindly configure `visual.mappings` without an output basis
