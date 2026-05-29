# JS Model Render

Use this surface for JS models whose main job is to render content in a block, field, item, or column.

## Contract

- Editor scene in the bundled product reference snapshot: `jsModel`
- Public writeback path for new `jsBlock`: inline `settings.code/settings.version`, or whole-page `assets.scripts.<key>.code` referenced by block `script`.
- Public configure path for existing `jsBlock`: direct `changes.code/changes.version`.
- Internal readback may contain `stepParams.jsSettings.runJs`; do not copy that persisted shape into public write requests.
- Validation style: render
- `ctx.render(...)` is required on the directly executed top-level path.
- Do not wrap all render logic in an uncalled function or callback; move that body to top-level code.
- Do not rely on top-level `return` for rendering.
- Exact modelUse still matters; use `JSBlockModel`, `JSFieldModel`, `JSEditableFieldModel`, `JSItemModel`, `FormJSFieldItemModel`, `JSColumnModel`, or `JSItemActionModel`.
- Default UI library policy: render React JSX with Ant Design components from `ctx.libs.antd` / `ctx.libs.antdIcons`.
- Use external UI libraries only when the requested UI needs capabilities Ant Design does not provide.

## Minimal examples

First-hop safe snippets:

- [scene/block/text-summary](../js-snippets/safe/scene/block/text-summary.md)
- [scene/detail/status-tag](../js-snippets/safe/scene/detail/status-tag.md)
- [render/helper-from-form-value](../js-snippets/safe/render/helper-from-form-value.md)

For popup / drawer / dialog / drilldown opener intent, use the popup scene hint in the snippet manifest and [render/open-popup-flow-model-button](../js-snippets/safe/render/open-popup-flow-model-button.md). The rendered control should only call `ctx.openView(triggerUid, ...)` after a template-first popup-capable FlowModel exists. For render blocks already inside an opened popup that display the opener record, keep using [scene/block/popup-record-summary](../js-snippets/safe/scene/block/popup-record-summary.md).

Example:

```js
const record = (await ctx.getVar('ctx.record')) || {};
const text = String(record.title ?? record.name ?? '-');
const { Typography } = ctx.libs.antd;

ctx.render(<Typography.Text>{text}</Typography.Text>);
```

Prefer Ant Design components such as `Typography`, `Tag`, `Space`, `List`, `Card`, `Alert`, `Empty`, `Statistic`, and `Table` before raw HTML strings or custom-styled DOM.

## Record Context

| recordSemantic | Use this ctx path | Notes |
| --- | --- | --- |
| `popup-opener-record` | `await ctx.getVar('ctx.popup.record...')` | Standalone JSBlock in a popup that displays the record used to open the popup. |
| `host-record` | `await ctx.getVar('ctx.record...')` | JS field/column/item is hosted by the data record itself. |
| `inner-row-record` | `await ctx.getVar('ctx.record...')` | JS code belongs to a nested table/list row inside the popup, not the popup opener. |
| `parent-popup-record` | `await ctx.getVar('ctx.popup.parent.record...')` | Nested popup needs the outer popup record. |

For popup-level render blocks that display the record that opened the popup, prefer [scene/block/popup-record-summary](../js-snippets/safe/scene/block/popup-record-summary.md) over host-record snippets. Do not use that render-helper snippet as a popup opener.

## What to open next

- Exact model constraints -> [../js-models/index.md](../js-models/index.md)
- Render contract -> [../js-models/rendering-contract.md](../js-models/rendering-contract.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after backend `repairClass` failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
