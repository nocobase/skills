# JS Reference Index

Read this file when you need the bundled JS reference docs for capability discovery, `ctx.*` API lookup, or scenario examples. If the main problem is still surface selection, go back first to [js-surfaces/index.md](./js-surfaces/index.md).

This file is the bridge between two layers:

- Surface-first layer in [js-surfaces/index.md](./js-surfaces/index.md): choose the exact RunJS authoring scene first.
- Canonical snippet layer in [js-snippets/index.md](./js-snippets/index.md): grab the smallest `safe` final-code example before opening upstream docs.
- Bundled product reference snapshot in [`../runtime/reference-assets/upstream-js/`](../runtime/reference-assets/upstream-js/interface-builder/runjs.md): product/runtime capability docs copied into this skill and lightly adapted with skill-mode guardrails, useful for examples, `ctx` APIs, and scenario descriptions.
- Skill contract in [js.md](./js.md), [runjs-runtime.md](./runjs-runtime.md), and [reaction.md](./reaction.md): validator rules, model selection, CLI/runtime constraints, and actual write payload rules.

The bundled product reference snapshot is still only a progressive-disclosure reference layer. It does **not** replace the skill write contract.

## Quick Route

| Need | Read first | Then |
| --- | --- | --- |
| which RunJS authoring surface this write belongs to | [js-surfaces/index.md](./js-surfaces/index.md) | [js-snippets/catalog.json](./js-snippets/catalog.json) |
| which JS authoring surface exists at all | [upstream-js/interface-builder/runjs.md](../runtime/reference-assets/upstream-js/interface-builder/runjs.md) | [upstream-js/runjs/index.md](../runtime/reference-assets/upstream-js/runjs/index.md) |
| JS Block code | [upstream-js/interface-builder/blocks/other-blocks/js-block.md](../runtime/reference-assets/upstream-js/interface-builder/blocks/other-blocks/js-block.md) | specific `ctx` pages under [`upstream-js/runjs/context/`](../runtime/reference-assets/upstream-js/runjs/context/render.md) |
| JS Action code | [upstream-js/interface-builder/actions/types/js-action.md](../runtime/reference-assets/upstream-js/interface-builder/actions/types/js-action.md) | [upstream-js/runjs/context/request.md](../runtime/reference-assets/upstream-js/runjs/context/request.md), [upstream-js/runjs/context/form.md](../runtime/reference-assets/upstream-js/runjs/context/form.md), [upstream-js/runjs/context/resource.md](../runtime/reference-assets/upstream-js/runjs/context/resource.md) as needed |
| action-bar custom JS item | [upstream-js/interface-builder/actions/types/js-item.md](../runtime/reference-assets/upstream-js/interface-builder/actions/types/js-item.md) | matching `ctx` pages under [`upstream-js/runjs/context/`](../runtime/reference-assets/upstream-js/runjs/context/render.md) |
| form custom JS item | [upstream-js/interface-builder/fields/specific/js-item.md](../runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-item.md) | [upstream-js/runjs/context/form.md](../runtime/reference-assets/upstream-js/runjs/context/form.md) and [upstream-js/runjs/context/render.md](../runtime/reference-assets/upstream-js/runjs/context/render.md) |
| JS Field / editable field | [upstream-js/interface-builder/fields/specific/js-field.md](../runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-field.md) | [upstream-js/runjs/context/get-value.md](../runtime/reference-assets/upstream-js/runjs/context/get-value.md), [upstream-js/runjs/context/set-value.md](../runtime/reference-assets/upstream-js/runjs/context/set-value.md), [upstream-js/runjs/context/form.md](../runtime/reference-assets/upstream-js/runjs/context/form.md) |
| JS Column | [upstream-js/interface-builder/fields/specific/js-column.md](../runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-column.md) | [upstream-js/runjs/context/render.md](../runtime/reference-assets/upstream-js/runjs/context/render.md), [upstream-js/runjs/context/resource.md](../runtime/reference-assets/upstream-js/runjs/context/resource.md) |
| Event Flow `Execute JavaScript` | [upstream-js/interface-builder/event-flow.md](../runtime/reference-assets/upstream-js/interface-builder/event-flow.md) | return to [settings.md](./settings.md) for `set-event-flows` before writing |
| Linkage / field values / action state JS | [upstream-js/interface-builder/linkage-rule.md](../runtime/reference-assets/upstream-js/interface-builder/linkage-rule.md) | [upstream-js/interface-builder/blocks/block-settings/field-linkage-rule.md](../runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/field-linkage-rule.md), [upstream-js/interface-builder/blocks/block-settings/block-linkage-rule.md](../runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/block-linkage-rule.md), [upstream-js/interface-builder/actions/action-settings/linkage-rule.md](../runtime/reference-assets/upstream-js/interface-builder/actions/action-settings/linkage-rule.md), then [reaction.md](./reaction.md) |
| available variables in UI-builder scenarios | [upstream-js/interface-builder/variables.md](../runtime/reference-assets/upstream-js/interface-builder/variables.md) | relevant `ctx` pages when code needs the runtime equivalent |

## `ctx.*` Lookup

When you already know the scenario and only need a specific runtime API:

- rendering: [ctx.render()](../runtime/reference-assets/upstream-js/runjs/context/render.md), [ctx.element](../runtime/reference-assets/upstream-js/runjs/context/element.md)
- form state: [ctx.form](../runtime/reference-assets/upstream-js/runjs/context/form.md), [ctx.getValue()](../runtime/reference-assets/upstream-js/runjs/context/get-value.md), [ctx.setValue()](../runtime/reference-assets/upstream-js/runjs/context/set-value.md)
- requests/resources: [ctx.request()](../runtime/reference-assets/upstream-js/runjs/context/request.md), [ctx.initResource()](../runtime/reference-assets/upstream-js/runjs/context/init-resource.md), [ctx.resource](../runtime/reference-assets/upstream-js/runjs/context/resource.md), [ctx.makeResource()](../runtime/reference-assets/upstream-js/runjs/context/make-resource.md)
- navigation/view metadata: [ctx.route](../runtime/reference-assets/upstream-js/runjs/context/route.md), [ctx.router](../runtime/reference-assets/upstream-js/runjs/context/router.md), [ctx.view](../runtime/reference-assets/upstream-js/runjs/context/view.md)
- external modules/libs: [ctx.importAsync()](../runtime/reference-assets/upstream-js/runjs/context/import-async.md), [ctx.requireAsync()](../runtime/reference-assets/upstream-js/runjs/context/require-async.md), [ctx.libs](../runtime/reference-assets/upstream-js/runjs/context/libs.md)
- feedback/i18n: [ctx.message](../runtime/reference-assets/upstream-js/runjs/context/message.md), [ctx.notification](../runtime/reference-assets/upstream-js/runjs/context/notification.md), [ctx.t()](../runtime/reference-assets/upstream-js/runjs/context/t.md), [ctx.i18n](../runtime/reference-assets/upstream-js/runjs/context/i18n.md)
- model/context shape: [ctx.model](../runtime/reference-assets/upstream-js/runjs/context/model.md), [ctx.blockModel](../runtime/reference-assets/upstream-js/runjs/context/block-model.md), [ctx.collection](../runtime/reference-assets/upstream-js/runjs/context/collection.md), [ctx.collectionField](../runtime/reference-assets/upstream-js/runjs/context/collection-field.md)

## Skill-Mode Rewrites

When reading the bundled reference docs, rewrite the following patterns before you treat them as final skill output:

- strict render models must end in an explicit `ctx.render(...)`; do not ship examples that only mutate `ctx.element.innerHTML`, `replaceChildren(...)`, or DOM nodes without a final render call
- do not emit `ctx.openView(...)` as final code under this skill; the local validator blocks it. Prefer field popup / popup action / event-flow configuration outside JS
- for `ctx.request()` / `ctx.api.request()`, use `http/https` URLs under skill-mode; for NocoBase resource access prefer `ctx.initResource(...) + ctx.resource` or `ctx.makeResource(...)`
- prefer `ctx.initResource(...)` + `ctx.resource` over upstream examples that use `ctx.createResource(...)` or `ctx.useResource(...)`

## Progressive Disclosure Order

1. Start in [js.md](./js.md) to decide the validator boundary and high-level contract.
2. Pick the exact authoring surface in [js-surfaces/index.md](./js-surfaces/index.md).
3. Open [js-snippets/catalog.json](./js-snippets/catalog.json) and one safe snippet doc.
4. Open the matching bundled scenario page under [`../runtime/reference-assets/upstream-js/interface-builder/`](../runtime/reference-assets/upstream-js/interface-builder/runjs.md) only for missing capability detail.
5. Open only the needed `ctx` pages under [`../runtime/reference-assets/upstream-js/runjs/context/`](../runtime/reference-assets/upstream-js/runjs/context/render.md).
6. Return to [runjs-runtime.md](./runjs-runtime.md) before validation.
7. Return to [settings.md](./settings.md) before any event-flow write.
8. Return to [reaction.md](./reaction.md) before any linkage / field-value / action-state write.

## Important Boundary

- The bundled product reference snapshot describes product/runtime behavior and authoring examples.
- The skill contract is stricter in several places: validator gate, runtime-model choice, skill-mode network policy, and strict `ctx.render(...)` requirements. Those rules stay in [js.md](./js.md) and [runjs-runtime.md](./runjs-runtime.md).
- Event Flow `Execute JavaScript` and linkage-rule pages are reference material for author intent and available context, not the final write contract for this skill.
- For actual field value, linkage, block linkage, or action linkage payloads, [reaction.md](./reaction.md) remains authoritative.
