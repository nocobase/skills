# High-level Page Intent -> Page DSL

Use this file to turn a high-level page request into the simplified public **page DSL**.

Use this file when the user says things like:

- "build a user management page"
- "create an order detail page"
- "make a dashboard for sales"
- "rebuild this page into two tabs"

## 1. Goal

Turn business intent into one executable JSON page document for `executeDsl`.

## 2. Authoring Steps

1. Identify whether the task is **create** or **replace**.
2. Choose the simplest starting archetype from [page-archetypes.md](./page-archetypes.md).
3. Decide the minimal tab structure.
4. For each tab, decide major blocks first, then fields/actions/record actions.
5. Keep popup behavior inline under the relevant field/action/record action.
6. Assemble the final JSON page DSL from [ui-dsl.md](./ui-dsl.md).
7. If the request is ambiguous, high-impact, or destructive, show the DSL draft first.

## 3. Authoring Heuristics

- Prefer the smallest number of tabs that explains the user intent.
- Prefer one dominant archetype before mixing patterns.
- Choose major content areas first; fill in fields/actions only after the structure is stable.
- Do not over-specify popup content when a simple opener is enough for the request.

## 4. Draft Output Pattern

When drafting first, present:

1. a short explanation of the intended page
2. the executable JSON page DSL
3. the assumptions outside the JSON payload

## 5. Do Not Do These

- do not invent missing schema
- do not use `executeDsl` for a tiny local edit on an existing page
- do not add assumptions into the wire payload

## 6. See Also

- For live schema facts and stop conditions, see [normative-contract.md](./normative-contract.md).
- For execution order and readback, see [execution-checklist.md](./execution-checklist.md).
