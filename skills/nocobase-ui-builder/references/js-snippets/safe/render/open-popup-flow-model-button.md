# render/open-popup-flow-model-button

## Use when

A render-style JS surface must display a button or link that opens a NocoBase popup, drawer, dialog, or drilldown view that has already been resolved as a popup-capable FlowModel.

## Do not use when

No popup host/template has been created yet, the only known uid is a `ChildPageModel` / page / tab / popup subtree uid, or the JS code is action-style and does not need to render the opener UI.

## Surfaces

- `js-model.render`

## Required ctx roots

- `ctx.libs`
- `ctx.openView`
- `ctx.render`
- `ctx.t`

## Contract

- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: rendered click handler

## Normalized snippet

```js
const popupFlowModelUid = 'replace-with-persisted-popup-flowmodel-uid';
const { Button } = ctx.libs.antd;

ctx.render(
  <Button
    type="link"
    onClick={async () => {
      await ctx.openView(popupFlowModelUid, {
        navigation: false,
        mode: 'drawer',
        size: 'large',
        title: ctx.t('Details'),
        params: {
          source: 'render-js',
        },
      });
    }}
  >
    {ctx.t('Open configured popup')}
  </Button>,
);
```

## Editable slots

- Replace `popupFlowModelUid` with an existing popup-capable FlowModel uid from readback.
- Replace `title`, `mode`, `size`, button props, and `params` with the runtime values for the opener.

## Skill-mode notes

Before using this snippet, resolve the popup through [../../../patterns/popup-openview.md](../../../patterns/popup-openview.md). Prefer a template-first host whose persisted `popupSettings.openView.uid` target points at a popup template target and keeps `popupTemplateUid` / `popupTemplateMode="reference"`. Do not replace `popupFlowModelUid` with a transient uid, `ChildPageModel`, page, tab, or popup subtree uid. If the JS block is already inside an opened popup and only needs to render the opener record, use [../scene/block/popup-record-summary.md](../scene/block/popup-record-summary.md) instead.
