# `formToggleBlocks` — Show / hide block by value

Watch a form field and hide or show another block

**kind** `item` · **scope** `collection` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `watchField` | field | ✓ |  | A field of this form |
| `targetUid` | targetBlock | ✓ |  |  |
| `mode` | select |  | `hideWhenSet` | opts: hideWhenSet/showWhenSet/showWhenEquals |
| `matchValue` | fieldValue |  |  | field←watchField |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function hasVal(v) {
  if (v == null) return false;
  if (typeof v === 'object') return v.id != null || Object.keys(v).length > 0;
  return String(v).trim() !== '';
}

function render() {
  let v = null;
  try { v = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue()[$p.watchField] : null; } catch (e) {}
  let hide = false;
  if ($p.mode === 'showWhenSet') hide = !hasVal(v);
  else if ($p.mode === 'showWhenEquals') {
    const cur = (v && typeof v === 'object' && v.id != null) ? v.id : v;
    hide = String(cur) !== String($p.matchValue);
  } else hide = hasVal(v); // hideWhenSet
  // hide via a rendered <style> on the grid item — no DOM manipulation needed
  ctx.render(hide
    ? <style>{'[data-grid-item-uid="' + $p.targetUid + '"]{display:none!important;}'}</style>
    : null);
}

render();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = render; bm.on('formValuesChange', render); }
```
