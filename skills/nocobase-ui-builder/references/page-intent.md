# High-level Page Intent -> Page Blueprint

Use this file to turn a high-level page request into the simplified public **page blueprint**.

Use this file when the user says things like:

- "build a user management page"
- "create an order detail page"
- "make a dashboard for sales"
- "rebuild this page into two tabs"

## 1. Goal

Turn business intent into:

1. one executable **inner page blueprint document**
2. and, at actual CLI write time, one raw JSON request body for `nocobase-ctl flow-surfaces apply-blueprint`
3. and, only in MCP fallback, one **tool-call envelope** of the form `{ "requestBody": <that same object> }`

This file focuses on the **inner page blueprint document**. For the actual CLI/API payload shape, always pair it with [tool-shapes.md](./tool-shapes.md).

## 2. Authoring Steps

1. Identify whether the task is **create** or **replace**.
2. If one user request spans several pages, split it into an ordered page plan first. Each page still becomes one executable inner page blueprint document and one actual `applyBlueprint` run.
3. Choose the simplest starting archetype from [page-archetypes.md](./page-archetypes.md).
4. Decide the minimal tab structure. For a normal single-page request, default to exactly **one tab** unless the user explicitly asked for multiple route-backed tabs.
5. Remove any placeholder `Summary` / `Later` / `备用` tab or explanatory `markdown` / note / banner block unless the user explicitly asked for it.
6. For each tab, decide major blocks first, then fields/actions/record actions.
7. Keep popup behavior inline under the relevant field/action/record action while drafting, but hand any reusable popup / block / fields scene to [templates.md](./templates.md) before treating inline content as final.
8. Assemble the final JSON page blueprint from [page-blueprint.md](./page-blueprint.md), using only canonical public names.
9. Before the real `applyBlueprint` call, run the local prepare-write gate (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and then run the authoring self-check: tabs count matches the request, every `tab.blocks` is non-empty, there is no empty / placeholder tab, no placeholder `markdown` / note / banner block exists, no block object contains `layout`, every `tab.layout` / `popup.layout` is an object when present, block `key` values are unique, every field named in blueprint `fields[]` has a non-empty live `interface`, every field entry stays a simple string unless `popup` / `target` / `renderer` / field-specific `type` is actually required, and every custom `edit` popup contains exactly one `editForm`. If the gate catches extra outer tabs, stringified body content, illegal tab keys, block-level `layout`, or broken custom `edit` popups, rewrite locally before the real write.
10. Then open [tool-shapes.md](./tool-shapes.md) and prepare the blueprint as the raw CLI JSON body. Only in MCP fallback should that same object be wrapped under `requestBody`.
11. Before the first `applyBlueprint` on any whole-page task, show one ASCII-first prewrite preview from [ascii-preview.md](./ascii-preview.md). Prefer the same local prepare-write gate because it emits that preview and the normalized CLI body together. If the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first, stop after that preview; otherwise continue immediately.

## 3. Authoring Heuristics

- Prefer the smallest number of tabs that explains the user intent.
- A normal single-page request defaults to one tab unless the user explicitly asks for multiple route-backed tabs.
- Side-by-side blocks, relation tables, and deep popup chains are layout inside one tab, not a reason to create extra tabs.
- Users may describe only blocks, relations, and actions in business language. Infer the minimal reasonable structure, but do not silently expand the request into an exact pseudo-spec with extra tabs, full field lists, or rigid layout unless the intent or live facts require it.
- Do not carry empty / placeholder tabs in a single-page draft just to "leave room" for later edits.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks just to explain future work.
- Prefer one dominant archetype before mixing patterns.
- Choose major content areas first; fill in fields/actions only after the structure is stable.
- If the destination menu group already exists and is known, prefer `navigation.group.routeId` over `navigation.group.title`.
- If you intentionally rely on unique same-title reuse, keep `navigation.group` title-only.
- If one or more visible same-title menu groups already exist, do **not** create another same-title group just to avoid ambiguity; reuse one existing group instead. Prefer an exact known `routeId`; otherwise use this deterministic rule and mention that chosen routeId in the prewrite preview: first prefer a same-title group already containing the target page title, then fall back to the visible top-level same-title group with the smallest `sort`, tie-break by the smallest route id.
- `navigation.group.routeId` is exact targeting only; if existing-group metadata must change, switch to the low-level `updateMenu` path instead of applyBlueprint.
- Do not over-specify popup content when a simple opener is enough for the request.
- Whole-page `create` / `replace` should still probe templates for reusable scenes. For repeat-eligible popup / block / fields scenes, and for single standard reusable scenes with strong opener/resource context, contextual `list-templates` is mandatory before binding one template or finalizing inline content. A missing live `target.uid` only means template planning must use the strongest planned opener/resource context available, and keyword-only search remains discovery-only.
- Repeated-scene detection, contextual availability, ranking, bootstrap/save/convert behavior, and later-page rebinding all stay in [templates.md](./templates.md). This file only decides when whole-page authoring should branch into that template path.
- Default blueprint `fields[]` entries to simple strings. Only upgrade a field entry to an object when `popup`, `target`, `renderer`, or field-specific `type` is actually required.
- If the user says clicking a shown record / relation record opens details, prefer a field object with inline `popup` so the field itself is the opener. Only switch to an action / recordAction when the requirement explicitly says button / action column.
- For popup relation tables, prefer the canonical `associatedRecords + associationField` shape.
- On record-capable blocks, put `view` / `edit` / `updateRecord` / `delete` in `recordActions`.
- Add `key` only when layout or `field.target` truly needs a stable local identifier.
- In whole-page `replace`, those explicit keys only need same-run stability. Prefer role-suffixed or page-scoped names such as `mainTab`, `usersTableBlock`, `createFormBlock`, `submitAction`, and `maintainAction` over bare generic names like `main`, `usersTable`, or `submit`, because existing pages may otherwise fail first write with duplicate-key backend errors.
- Keep low-level selectors and internals out of the draft JSON; do not leak `uid`, `ref`, `$ref`, or other non-public write shapes.
- If layout is not essential or not fully decided, omit it rather than inventing a string or block-level `layout`.
- For whole-page authoring, default to **ASCII-first** prewrite output rendered from the same blueprint, even when you will execute immediately after it. The preview must still appear before the first write. Keep popup expansion depth at exactly one level, and do not dump JSON unless the user asks for it or a technical review still needs it.
- Before first write, run the local prepare-write gate, then self-check tabs count, non-empty `tab.blocks`, no empty tabs, no placeholder `markdown` / note / banner block, no block-level `layout`, unique block `key` values, simple-string `fields[]` by default, and exactly one `editForm` in every custom `edit` popup. If the gate or self-check fails, rewrite the blueprint before the first write.
- If the page request also includes interaction logic, add it as top-level `reaction.items[]` in the same blueprint instead of inventing a second whole-page write.
- In test runs, do not add destructive cleanup steps unless the user explicitly asked for deletion.
- Do not stringify the final page blueprint. The correct mental model is:
  - first author `const blueprint = { ... }`
  - then pass that object as raw JSON through CLI `--body` / `--body-file`
  - only in MCP fallback call the tool with `{ requestBody: blueprint }`
  - never with `{ requestBody: JSON.stringify(blueprint) }`

## 4. Prewrite Output Pattern

Before the first whole-page `applyBlueprint`, present:

1. a short explanation of the intended page
2. one ASCII wireframe rendered from the same blueprint
3. the assumptions outside the JSON payload only when they matter
4. the executable JSON page blueprint only when the user explicitly asks for it, or when a technical review is still needed
5. if the request needs review, stop after the preview; otherwise continue immediately to execution
6. when executing, the actual CLI request body must still come from `tool-shapes.md`; only MCP fallback uses the extra `{ requestBody: ... }` envelope

## 5. Interaction / Reaction Intent

Map common user language like this:

- "default value", "initially fill", "预填" -> `setFieldValueRules`
- "when A changes, compute B/C", "联动赋值", "自动计算" -> `setFieldLinkageRules`
- "hide/show this table/block", "根据条件显示区块" -> `setBlockLinkageRules`
- "disable/hide this button", "按钮不可点" -> `setActionLinkageRules`

Whole-page rule:

- if the structure is being built now, keep the interaction logic inside blueprint `reaction.items[]`

Localized rule:

- if the page already exists, do `getReactionMeta` first, then the matching `set*Rules` write

Keep detailed reaction payload shapes, host-target rules, and guardrails in [reaction.md](./reaction.md) instead of duplicating them here.

## 6. Do Not Do These

- do not invent missing schema
- do not use `applyBlueprint` for a tiny local edit on an existing page
- do not add assumptions into the wire payload

## 7. See Also

- For live schema facts and stop conditions, see [normative-contract.md](./normative-contract.md).
- For execution order and readback, see [execution-checklist.md](./execution-checklist.md).
- For ASCII-first prewrite output, see [ascii-preview.md](./ascii-preview.md).
