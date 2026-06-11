# `charCounter` — Character counter

Live remaining-characters counter for a text field

**kind** `item` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `field` | field | ✓ |  | accepts text |
| `max` | number |  | `200` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function render() {
  const vals = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue() : {};
  const v = vals[$p.field];
  const n = v == null ? 0 : String(v).length;
  const max = Number($p.max) || 0;
  const over = max > 0 && n > max;
  ctx.render(
    <div style={{ padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: over ? '#cf1322' : '#888' }}>
        <b style={{ color: over ? '#cf1322' : 'inherit' }}>{n}</b>{' / ' + max}
      </span>
      {over ? <span style={{ color: '#cf1322', marginLeft: 8 }}>{'over by ' + (n - max)}</span> : null}
    </div>
  );
}

render();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = render; bm.on('formValuesChange', render); }
```
