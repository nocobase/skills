# `formCalc` — Form calculator

Live sum/product of other form fields

**kind** `item` · **scope** `record` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `fields` | fields |  |  | accepts numeric |
| `op` | select |  | `sum` | opts: sum/product/subtract/avg |
| `label` | text |  | `Result` |  |
| `prefix` | text |  |  |  |
| `suffix` | text |  |  |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function compute() {
  const vals = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue() : {};
  const nums = ($p.fields || []).map(function (f) { return Number(vals[f]); }).filter(function (n) { return !isNaN(n); });
  if (!nums.length) return 0;
  if ($p.op === 'product') return nums.reduce(function (a, b) { return a * b; }, 1);
  if ($p.op === 'subtract') return nums.reduce(function (a, b) { return a - b; });
  if ($p.op === 'avg') return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  return nums.reduce(function (a, b) { return a + b; }, 0); // sum
}

function render() {
  const r = Math.round(compute() * 100) / 100;
  ctx.render(
    <div style={{ padding: '4px 0' }}>
      <span style={{ color: '#888', marginRight: 8 }}>{$p.label || 'Result'}</span>
      <b style={{ fontSize: 16 }}>{($p.prefix || '') + r + ($p.suffix || '')}</b>
    </div>
  );
}

render();

// live-update on form input change (de-dup the listener across re-runs)
const bm = ctx.blockModel;
if (bm && bm.on) {
  if (bm.__jsTplCalc && bm.off) bm.off('formValuesChange', bm.__jsTplCalc);
  bm.__jsTplCalc = render;
  bm.on('formValuesChange', render);
}
```
