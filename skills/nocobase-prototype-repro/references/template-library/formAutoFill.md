# `formAutoFill` — Auto-fill from lookup

When a field changes, look up a record and fill sibling fields

**kind** `item` · **scope** `record` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `watchField` | field | ✓ |  | When this form field changes… |
| `lookupCollection` | collection | ✓ |  |  |
| `matchField` | field | ✓ |  | coll←lookupCollection, …find the record where this field equals the trigger value |
| `copyFields` | fields | ✓ |  | coll←lookupCollection, Copied into same-named form fields |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState } = ctx.React;

async function maybeFill() {
  let v = null;
  try { v = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue()[$p.watchField] : null; } catch (e) {}
  if (v && typeof v === 'object' && v.id != null) v = v.id;
  // GATE: only when the trigger value actually changed — setFieldsValue below
  // re-fires formValuesChange, but the trigger value is unchanged then, so we exit.
  if (v === ctx.model.__last) return;
  ctx.model.__last = v;
  if (v == null || String(v).trim() === '') { renderNote(''); return; }
  try {
    var flt = {}; flt[$p.matchField] = { $eq: v };
    const res = await ctx.api.request({ url: $p.lookupCollection + ':list', params: { filter: flt, pageSize: 1 } });
    const rec = ((res && res.data && res.data.data) || [])[0];
    if (!rec) { renderNote('no match'); return; }
    var patch = {};
    ($p.copyFields || []).forEach(function (f) { if (rec[f] !== undefined) patch[f] = rec[f]; });
    if (Object.keys(patch).length && ctx.form && ctx.form.setFieldsValue) ctx.form.setFieldsValue(patch);
    renderNote('filled ' + Object.keys(patch).length + ' field(s)');
  } catch (e) {
    renderNote('lookup failed');
  }
}

function renderNote(txt) {
  ctx.render(<span style={{ fontSize: 11, color: '#bbb' }}>{'🪄 ' + (txt || 'auto-fill ready')}</span>);
}

function onChange() { maybeFill(); }

renderNote('');
maybeFill();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = onChange; bm.on('formValuesChange', onChange); }
```
