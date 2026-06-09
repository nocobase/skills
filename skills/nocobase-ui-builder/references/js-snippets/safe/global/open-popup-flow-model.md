# global/open-popup-flow-model

## Use when

An action-style RunJS surface must open a NocoBase popup, drawer, dialog, or drilldown view that has already been resolved as a popup-capable FlowModel.

## Do not use when

No popup host/template has been created yet, the only known uid is a `ChildPageModel` / page / tab / popup subtree uid, the JS surface must render the opener control, or a native field popup / record action can satisfy the intent without JS.

## Surfaces

- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots

- `ctx.openView`
- `ctx.t`

## Contract

- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const popupFlowModelUid = 'replace-with-persisted-popup-flowmodel-uid';
const drilldownValue = 'replace-with-runtime-value';

await ctx.openView(popupFlowModelUid, {
  navigation: false,
  mode: 'drawer',
  size: 'large',
  title: ctx.t('Details'),
  defineProperties: {
    drilldownValue: {
      value: drilldownValue,
      meta: {
        title: ctx.t('Drilldown value'),
        type: 'string',
      },
    },
  },
});
```

## Editable slots

- Replace `popupFlowModelUid` with an existing popup-capable FlowModel uid from readback.
- Replace `title`, `mode`, `size`, `drilldownValue`, and `meta` with the runtime values for the opener.
- Omit `defineProperties` only when the popup does not need runtime values in block settings such as table data scopes.

## Skill-mode notes

Before using this snippet, resolve the popup through [../../../patterns/popup-openview.md](../../../patterns/popup-openview.md). Prefer a template-first host whose persisted `popupSettings.openView.uid` target points at a popup template target and keeps `popupTemplateUid` / `popupTemplateMode="reference"`. Do not replace `popupFlowModelUid` with a transient uid, `ChildPageModel`, page, tab, or popup subtree uid.
For chart/table drilldown filters, pass clicked values through `defineProperties` and reference them in the popup as top-level variables such as `{{ctx.drilldownValue}}`. Do not generate `{{ctx.view.inputArgs.params.*}}` for popup block `dataScope`.
For render-style JSBlock / JSField / JSColumn / JSItem openers, use [../render/open-popup-flow-model-button.md](../render/open-popup-flow-model-button.md) instead so the opener UI still satisfies the render contract.
