# Phase 4: JS Implementation

## Tools

| Tool | Purpose |
|------|---------|
| nb_auto_js(prefix) | Auto-generate column/item JS + task table |
| nb_find_placeholders(scope) | Discover all JS placeholders |
| nb_inject_js(uid, code, event_name?) | Replace one placeholder |
| nb_inject_js_dir(dir_path) | Batch inject all JS files |

## CRITICAL: nb_inject_js REJECTS stub code

Code with <30 chars of non-comment content → ERROR. Write real, working JS.

## Step 4.1: Auto-Generate + Deploy [sequential]

1. `nb_auto_js("{prefix}")` — auto-fills columns/items from templates
2. `nb_inject_js_dir("js/")` — batch deploy. Stubs will fail (expected).
3. Copy remaining `[todo]` task table to `notes.md`.

## Step 4.2: Read HTML Prototypes [if available]

Read HTML prototypes for core pages (e.g. `customers.html`, `opportunities.html`).
These are your visual spec — JS must match these prototypes.

## Step 4.3: Implement ALL [todo] items

Read `ref/js-patterns.md` — it contains the full API reference and 7 copy-paste code templates.

For each `[todo]`: write real JS, call `nb_inject_js(uid, code)`, mark `[x]`.

Priority: blocks > items > events.

**If many [todo] items (10+)**: use cluster/subagent mode — spawn one Task per item.

If `nb_inject_js` rejects your code, the error message will explain the reason. Check the "Common Mistakes and Fixes" table at the top of `ref/js-patterns.md` for the correct approach.

## Step 4.4: Verify [sequential]

1. `nb_find_placeholders("{PREFIX}")` — must return empty.
2. `nb_inspect_all("{PREFIX}")` — blocks should have `[JS Nc]` where N > 100.
3. Update notes.md: `## Status: Phase 4 complete`, `## Next: phases/phase-5-workflows.md`

## After Phase 4

Summarize to user: JS blocks implemented (count), any failures.
Ask: "All JS visualizations are implemented. Refresh the browser to check. Any charts need adjusting?"
Wait for user response.

Next → `phases/phase-5-workflows.md` (Phase 5/6 can run in parallel)
