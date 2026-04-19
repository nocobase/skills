# High-level Page Intent -> Page Blueprint

Use this file to turn a business-language page request into the simplified public page blueprint used by `applyBlueprint`.

Start with [whole-page-quick.md](./whole-page-quick.md) when the route is still being chosen or the request looks common-case. Come here once whole-page routing is already confirmed and you need the full authoring flow, the page shape is mixed or uncommon, or the task has reached the real authoring / write-preparation stage.

Do not use this as the first stop for a standard single-tab management, detail, or dashboard draft.

This file is for the inner page document only. For the actual CLI raw body and MCP fallback envelope, pair it with [tool-shapes.md](./tool-shapes.md). For template choices, keep [templates.md](./templates.md) as the planning source of truth.

## Goal

Turn business intent into:

1. one executable inner page blueprint document
2. one ASCII-first preview rendered from that same blueprint
3. one CLI raw body for `nocobase-ctl flow-surfaces apply-blueprint`
4. and, only in MCP fallback, `{ "requestBody": <that same object> }`

## Route

Use this file only when the task is whole-page authoring. If the request is really a small change on an existing page, switch to [runtime-playbook.md](./runtime-playbook.md) instead.

## Authoring Flow

1. Identify whether the request is `create` or `replace`.
2. If one request spans several pages, split it into ordered single-page runs first.
3. Start from the smallest useful pattern in [page-archetypes.md](./page-archetypes.md).
4. Default a normal single-page request to exactly one tab unless the user explicitly asked for multiple route-backed tabs.
5. Remove placeholder tabs and placeholder `markdown` / note / banner blocks unless the user explicitly asked for them.
6. Decide major blocks first, then fields and actions.
7. If the draft contains a repeat-eligible popup / block / fields scene, or one strong standard reusable scene, and you are actually deciding whether to bind / reuse / standardize a template-backed scene, probe [templates.md](./templates.md) before locking in that reusable path.
8. Contextual `list-templates` is mandatory for those reusable scenes; keyword-only search stays discovery-only. Fresh one-off pages with explicit local popup / block content, no existing template reference, and no reuse / save-template ask should stay inline and skip template routing.
9. When no explicit `popup.template` is present, keep `popup.tryTemplate=true` as the execution fallback. Local popup content may remain as the fallback when present.
10. If the user explicitly wants the new local popup itself to become reusable immediately, or the first repeated popup seed already exists as local popup content and probing found no usable template, prefer `popup.saveAsTemplate={ name, description }`. It requires explicit local `popup.blocks` and cannot be combined with `popup.template` or `popup.tryTemplate`.
11. Assemble the final blueprint using [page-blueprint.md](./page-blueprint.md).
12. Before the real write, run the local prepare-write gate (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and confirm:
    - tabs count matches the request
    - every `tab.blocks` is non-empty
    - no block contains `layout`
    - block `key` values are unique
    - every chosen field has a non-empty live `interface`
    - every custom `edit` popup contains exactly one `editForm`
13. Show one ASCII-first prewrite preview from [ascii-preview.md](./ascii-preview.md) before the first `applyBlueprint`.
14. Then open [tool-shapes.md](./tool-shapes.md) and send the blueprint itself as the CLI raw body. Only in MCP fallback should that same object be wrapped under `requestBody`.

## Heuristics

- Prefer the minimum number of tabs that explains the page.
- Side-by-side blocks, relation tables, and deep popups normally stay inside one tab, not in separate route-backed tabs.
- Users may describe blocks, relations, and actions in business language only. Infer the minimum executable structure instead of expanding into a rigid pseudo-spec.
- Prefer `navigation.group.routeId` when the destination group is already known.
- If visible same-title groups already exist, reuse one; do not create another same-title group just to disambiguate.
- If the user says clicking a shown record or relation record opens details, prefer a field popup rather than inventing a button.
- Keep `fields[]` as simple strings unless a field object is actually needed.
- Omit `layout` when it is not essential or not fully decided.
- Keep low-level selectors such as `uid`, `ref`, or `$ref` out of the blueprint.

## Prewrite Output

Before the first whole-page `applyBlueprint`, present:

1. a short explanation of the intended page
2. one ASCII wireframe rendered from the same blueprint
3. assumptions only when they matter
4. the executable JSON blueprint only when the user explicitly asks for it or a technical review still needs it

## Reaction Intent

- if the structure is being built now, keep reaction logic in blueprint `reaction.items[]`
- if the page already exists, do `getReactionMeta` first and write through the matching `set*Rules`

Keep detailed reaction payload shapes in [reaction.md](./reaction.md).
