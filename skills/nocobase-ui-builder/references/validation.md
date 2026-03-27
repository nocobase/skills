# Validation overview

Reference entrypoints:

- [index.md](index.md)
- [ui-api-overview.md](ui-api-overview.md) for API, route-ready, and readback rules
- [ops-and-review.md](ops-and-review.md) for logging, review, and improve rules

## Default layers

1. Structured validation: route-ready, readback, data prerequisites, sample-data readback, and payload or contract review
2. Browser runtime validation: open the page, observe the first screen, trigger actions, and smoke-test popup, details, relation, and record-action flows

Rules:

- never attach or launch a browser proactively
- only enter `browser_attach`, `smoke`, or runtime validation when the user explicitly asks for browser verification
- if browser validation is not requested, stop at route-ready, readback, and data-ready

## Dynamic planning rules

Validation uses dynamic scenarios rather than a fixed case registry:

1. identify the business domain from the request
2. choose the page archetype from the domain
3. choose the main block combination for that archetype
4. verify that the result really persisted and can read sample data

## Decision rules

### Core principles

1. Page shell creation is not validation success. By default, validation still requires route-ready, readback, and data preparation. Browser validation only continues when the user explicitly asks for it.
2. Final conclusions should follow real failure signals instead of development-mode noise.
3. If the page reliably completes the target interaction, unrelated noise must not downgrade it to failure or warning.

### Console noise rules

1. React warnings alone must not mark the page as failed.
2. React warnings alone must not block validation.
3. If a step contains both React warnings and a real runtime error, ignore the warning and record the runtime error.
4. If the only issue is a React warning, the final result should still be pass or no-issue, not warning.

### Failure signals that do count

- runtime exceptions
- unhandled promise rejections
- error boundaries
- network failures
- blank screens or empty blocks
- skeleton screens that never resolve
- unavailable critical actions
- broken data flow
- page behavior broken by payload, schema, context, or data issues

### Rendering investigation order

Start from these symptoms:

- a column shell exists but shows no real value
- a field shell exists but cannot be edited
- an action button exists but is obviously in the wrong place
- drawer, dialog, details, or table only shows shell structure without real data

Then:

1. If browser validation was not requested, skip browser symptoms and continue from route-ready, readback, and data-ready
2. If browser validation was requested, record the symptom first and classify it as `pre-open` or `post-open`
3. Read write-after-read or live tree state
4. If `createV2` just ran, verify route-ready first
5. Use the flow schema graph plus block and pattern docs to confirm the rendering contract
6. Verify whether readback violates the contract
7. Only blame case data or platform runtime after readback already satisfies the contract

## Data prerequisites and sample data

### Order of execution

1. Create or verify prerequisite data models, including fields and relations
2. Prepare prerequisite sample data
3. Verify that both main tables and relation tables already contain data
4. After UI build, verify at least one inserted dataset through query or readback. Browser verification remains optional unless requested

### Data strategy

- data preparation is part of validation, not an optional side action
- reuse similar local example designs when useful, but do not make validation depend on them
- data preparation may use any available system capability, but it must not be skipped silently
- always report a short data summary in the final result, including record counts and key relation coverage

### Minimum data bar

- prepare 3 to 6 records for each main table
- prepare 6 to 10 records for each relation table and distribute them across multiple parents
- cover 2 to 4 common statuses or business stages
- prepare at least 1 rich sample record with multiple relations
- prepare at least 1 exact-match identifier such as order number or invoice number

### Output rules

- the final report must include a standalone data-preparation result
- if the run built a page and a real page URL can be inferred, include that URL
- if browser validation was not run, explain whether data readiness was proven through query, readback, or other non-browser evidence
- if UI was built but sample data was not prepared or verified, validation is incomplete
- if data preparation was blocked by permissions or capability gaps, name the blocker explicitly
