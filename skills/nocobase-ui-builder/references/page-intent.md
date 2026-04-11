# High-level Page Intent -> Page DSL

Use this file to turn a high-level page request into the simplified public **page DSL**.

Use this file when the user says things like:

- "build a user management page"
- "create an order detail page"
- "make a dashboard for sales"
- "rebuild this page into two tabs"

## 1. Goal

Turn business intent into:

1. one executable **inner page DSL document**
2. and, at actual MCP write time, one **tool-call envelope** of the form `{ "requestBody": <that object> }`

This file focuses on the **inner page DSL document**. For the actual MCP call shape, always pair it with [tool-shapes.md](./tool-shapes.md).

## 2. Authoring Steps

1. Identify whether the task is **create** or **replace**.
2. Choose the simplest starting archetype from [page-archetypes.md](./page-archetypes.md).
3. Decide the minimal tab structure.
4. For each tab, decide major blocks first, then fields/actions/record actions.
5. Keep popup behavior inline under the relevant field/action/record action.
6. Assemble the final JSON page DSL from [ui-dsl.md](./ui-dsl.md), using only canonical public names.
7. Before the real `executeDsl` call, open [tool-shapes.md](./tool-shapes.md) and wrap the DSL under `requestBody` as an object.
8. If the request is ambiguous, high-impact, or destructive, show the DSL draft first.

## 3. Authoring Heuristics

- Prefer the smallest number of tabs that explains the user intent.
- Prefer one dominant archetype before mixing patterns.
- Choose major content areas first; fill in fields/actions only after the structure is stable.
- If the destination menu group already exists and is known, prefer `navigation.group.routeId` over `navigation.group.title`.
- If you intentionally rely on unique same-title reuse, keep `navigation.group` title-only.
- `navigation.group.routeId` is exact targeting only; if existing-group metadata must change, switch to the low-level `updateMenu` path instead of executeDsl.
- Do not over-specify popup content when a simple opener is enough for the request.
- For popup relation tables, prefer the canonical `associatedRecords + associationField` shape.
- On record-capable blocks, put `view` / `edit` / `updateRecord` / `delete` in `recordActions`.
- Add `key` only when layout or `field.target` truly needs a stable local identifier.
- Keep low-level selectors and internals out of the draft JSON; do not leak `uid`, `ref`, `$ref`, or other non-public write shapes.
- In test runs, do not add destructive cleanup steps unless the user explicitly asked for deletion.
- Do not stringify the final page DSL when calling MCP. The correct mental model is:
  - first author `const dsl = { ... }`
  - then call the tool with `{ requestBody: dsl }`
  - never with `{ requestBody: JSON.stringify(dsl) }`

## 4. Draft Output Pattern

When drafting first, present:

1. a short explanation of the intended page
2. the executable JSON page DSL
3. if you are about to execute immediately, the actual MCP envelope must still come from `tool-shapes.md`, not by sending the draft JSON directly
4. the assumptions outside the JSON payload

## 5. Do Not Do These

- do not invent missing schema
- do not use `executeDsl` for a tiny local edit on an existing page
- do not add assumptions into the wire payload

## 6. See Also

- For live schema facts and stop conditions, see [normative-contract.md](./normative-contract.md).
- For execution order and readback, see [execution-checklist.md](./execution-checklist.md).
