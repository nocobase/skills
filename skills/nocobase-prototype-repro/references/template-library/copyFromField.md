# `copyFromField` — Copy field value

One-way mirror: copy a source field into a target field on change

**kind** `item` · **scope** `record` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `sourceField` | field | ✓ |  |  |
| `targetField` | field | ✓ |  |  |
| `label` | text |  | `Sync` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function syncAndRender() {
  const vals = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue() : {};
  const src = vals[$p.sourceField];
  const tgt = vals[$p.targetField];
  let didSync = false;
  if ($p.sourceField && $p.targetField && $p.sourceField !== $p.targetField && src !== tgt) {
    var o = {}; o[$p.targetField] = src;
    ctx.form.setFieldsValue(o);
    didSync = true;
  }
  ctx.render(
    <div style={{ padding: '4px 0', fontSize: 12, color: '#888' }}>
      <span style={{ marginRight: 6 }}>{$p.label || 'Sync'}</span>
      <span>{$p.sourceField + ' → ' + $p.targetField}</span>
      {didSync ? <span style={{ color: '#52c41a', marginLeft: 8 }}>{'✓'}</span> : null}
    </div>
  );
}

syncAndRender();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = syncAndRender; bm.on('formValuesChange', syncAndRender); }
```
