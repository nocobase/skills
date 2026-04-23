# Local Edit Quick Route

Use this file as the default first stop for normal edits on an existing live Modern page.

Stay on this route when the request is "change one part of an existing page" rather than "rebuild the whole page".

## URL-derived start uid

When the user gives a NocoBase admin URL for a precise edit on an existing page, popup, or form, derive only the start uid from the URL before the first read:

- if the URL contains one or more `view/<uid>` segments, the last `view/<uid>` wins
- if the URL has no `view/<uid>`, fallback to the `admin/<pageSchemaUid>` segment and read it with page-level `get --page-schema-uid`
- this derived uid is only the start uid for the first `flow-surfaces get` or live readback, not the final content uid
- after choosing the start uid, continue the normal live expansion through popup / template / content routing
- do not stop early on an outer `details`, `table`, or action host just because that tree is the first one you read

## Common-case flow

1. Resolve the start target first from an admin URL or explicit uid, then read that surface with `nocobase-ctl flow-surfaces get`.
2. Use `describe-surface` only when the richer public tree really helps.
3. Use `catalog` only when capability uncertainty is the blocker.
4. Choose the smallest write family that matches the intent: `compose`, `add-*`, `configure`, `update-settings`, `move-*`, or `remove-*`.
5. Keep common public keys inline when possible: `title`, `label`, `required`, `displayTitle`, simple button `type`, and similar semantic `settings` do not need a deep settings pass first.
6. For popup-capable localized writes, split opener-local config from popup-owned content: `clickToOpen`, outer `openView`, title, size, and mode stay on the opener; popup inner blocks/layout/template routing follow [popup.md](./popup.md) and [templates.md](./templates.md).
7. When no explicit `popup.template` is present on `compose` / `add-field` / `add-action` / `add-record-action`, keep `popup.tryTemplate=true` as the default execution fallback. If the first local popup should immediately become reusable, keep `popup.saveAsTemplate={ name, description }` alongside that path: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved.
8. For localized creates, after the write, read back the persisted actions, popup/template binding, and click/open behavior before planning follow-up edits.
9. When a localized write creates a new `table` / `list` / `gridCard`, supply default filters immediately with an object `filter` action carrying `settings.filterableFieldNames` and `settings.defaultFilter`.
10. When the request says “给表格 / 列表 / Grid 增加筛选”, or explicitly adds search to a table / list / Grid / card-like host, including “支持搜索 / 带搜索 / 可搜索 / searchable”, and does not explicitly mention a filter/search block or form, default to `add-action(type="filter")` on that existing data block. Do not create a `filterForm` shell unless the user explicitly asks for one. Page-noun wording such as “搜索页 / 搜索结果页” should not take this path by default, even if the same sentence also says “支持搜索”.
11. When localized work must create a `createForm`, `editForm`, `details`, or `filterForm` with a controlled inner field grid, prefer `compose` plus block-level `fieldsLayout`. It must place every keyed field exactly once, and each object cell `span` must be numeric. `addBlock` does not accept `fieldsLayout`; use it only to create the shell, then continue with lower-level field/layout writes if needed.
12. Open [tool-shapes.md](./tool-shapes.md) only when you are ready to form the exact CLI body or MCP fallback envelope.

## Minimal routing table

| Intent | Default path |
| --- | --- |
| add/update content under an existing surface | `compose` / `add-*` / `configure` / `update-settings` |
| replace existing event flow | `set-event-flows` |
| reorder/remove tabs or popup tabs | `move-tab` / `remove-tab` / `move-popup-tab` / `remove-popup-tab` |
| reorder/remove nodes | `move-node` / `remove-node` |

## Default artifact-only output

For artifact-only localized edits, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `mutation-plan.json`
- `readback-checklist.md`

The JSON can stay schematic. It only needs the target locator, chosen write family, and the minimum readback target.

## Open next only if needed

- [runtime-playbook.md](./runtime-playbook.md) for the full family / locator model
- [capabilities.md](./capabilities.md) when the main question is block vs field vs action
- [settings.md](./settings.md) only when the change no longer fits the common public semantic keys above
- [popup.md](./popup.md) when the localized edit changes popup/openView/click-to-open behavior
- [template-quick.md](./template-quick.md) if the live target already carries a template reference
- [reaction-quick.md](./reaction-quick.md) if the real request is default values, linkage, computed fields, or show/hide / disable state

## Switch away when

- the request is really whole-page create / replace -> [whole-page-quick.md](./whole-page-quick.md)
- the request is really reaction work -> [reaction-quick.md](./reaction-quick.md)
