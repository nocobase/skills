# `formConcat` — Concat preview

Live preview of several fields joined together (e.g. full name)

**kind** `item` · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `fields` | fields |  |  | accepts any |
| `separator` | text |  | ` ` |  |
| `label` | text |  | `Preview` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function joined() {
  const vals = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue() : {};
  const sep = $p.separator == null ? ' ' : $p.separator;
  return ($p.fields || []).map(function (f) { return vals[f]; })
    .filter(function (v) { return v != null && v !== ''; }).join(sep);
}

function render() {
  const text = joined();
  ctx.render(
    <div style={{ padding: '4px 0' }}>
      <span style={{ color: '#888', marginRight: 8 }}>{$p.label || 'Preview'}</span>
      <b style={{ fontSize: 15 }}>{text || '—'}</b>
    </div>
  );
}

render();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = render; bm.on('formValuesChange', render); }
```
