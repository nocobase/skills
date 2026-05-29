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

await ctx.openView(popupFlowModelUid, {
  navigation: false,
  mode: 'drawer',
  size: 'large',
  title: ctx.t('Details'),
  params: {
    source: 'runjs',
  },
});
```

## Editable slots

- Replace `popupFlowModelUid` with an existing popup-capable FlowModel uid from readback.
- Replace `title`, `mode`, `size`, and `params` with the runtime values for the opener.

## Skill-mode notes

Before using this snippet, resolve the popup through [../../../patterns/popup-openview.md](../../../patterns/popup-openview.md). Prefer a template-first host whose persisted `popupSettings.openView.uid` target points at a popup template target and keeps `popupTemplateUid` / `popupTemplateMode="reference"`. Do not replace `popupFlowModelUid` with a transient uid, `ChildPageModel`, page, tab, or popup subtree uid.
For render-style JSBlock / JSField / JSColumn / JSItem openers, use [../render/open-popup-flow-model-button.md](../render/open-popup-flow-model-button.md) instead so the opener UI still satisfies the render contract.
