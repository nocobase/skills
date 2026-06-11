# `formSubtotal` — Sub-table total

Sum / avg / count a sub-table column live — show it or write it back to a field

**kind** `item` · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `subtable` | association | ✓ |  | A one-/many-related sub-table edited inside this form |
| `fn` | select |  | `sum` | opts: sum/avg/count/min/max |
| `sumField` | field |  |  | accepts numeric, coll←subtable, A numeric column of the sub-table |
| `label` | text |  |  |  |
| `prefix` | text |  |  |  |
| `suffix` | text |  |  |  |
| `mode` | select |  | `display` | opts: display/writeBack |
| `targetField` | field |  |  | accepts numeric, A numeric field on the main form — filled automatically, kept read-only-i |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };
const FN_LABEL = { sum: 'Total', avg: 'Average', count: 'Count', min: 'Min', max: 'Max' };

function aggregate(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const fn = $p.fn || 'sum';
  if (fn === 'count') return list.length;
  const nums = list
    .map(function (r) { return parseFloat(r && $p.sumField ? r[$p.sumField] : NaN); })
    .filter(function (n) { return !isNaN(n); });
  if (!nums.length) return 0;
  if (fn === 'avg') return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  if (fn === 'min') return Math.min.apply(null, nums);
  if (fn === 'max') return Math.max.apply(null, nums);
  return nums.reduce(function (a, b) { return a + b; }, 0); // sum
}

function readRows() {
  try {
    const name = $p.subtable && $p.subtable.name;
    if (!name || !ctx.form || !ctx.form.getFieldsValue) return [];
    return ctx.form.getFieldsValue()[name] || [];
  } catch (e) { return []; }
}

function Subtotal() {
  const [val, setVal] = useState(0);
  useEffect(function () {
    const bm = ctx.blockModel;
    if (!bm) return undefined;
    if (bm.__subtotalH && bm.off) bm.off('formValuesChange', bm.__subtotalH);
    const handler = function () {
      const raw = aggregate(readRows());
      const rounded = ($p.fn === 'count') ? raw : Math.round(raw * 100) / 100;
      setVal(rounded);
      // write-back: push into a main-form field, GATED so the resulting
      // formValuesChange (same value) doesn't loop back through us
      if ($p.mode === 'writeBack' && $p.targetField && ctx.form && ctx.form.setFieldsValue) {
        if (ctx.model.__lastWB !== rounded) {
          ctx.model.__lastWB = rounded;
          const patch = {}; patch[$p.targetField] = rounded;
          ctx.form.setFieldsValue(patch);
        }
      }
    };
    bm.__subtotalH = handler;
    if (bm.on) bm.on('formValuesChange', handler);
    handler();
    return function () { if (bm.off) bm.off('formValuesChange', handler); };
  }, []);

  const fmt = function (n) {
    const d = ($p.fn === 'count') ? 0 : 2;
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const title = $p.label || FN_LABEL[$p.fn || 'sum'];
  const num = ($p.prefix || '') + fmt(val) + ($p.suffix ? ' ' + $p.suffix : '');

  if ($p.mode === 'writeBack') {
    return <span style={{ fontSize: 11, color: T.sub }}>{'🧮 ' + title + ' → ' + ($p.targetField || 'field') + ' = ' + num}</span>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 16px', background: T.card, borderRadius: 8, border: '1px solid ' + T.border, marginTop: 8 }}>
      <span style={{ fontSize: 13, color: T.sub, fontWeight: 500, marginRight: 12 }}>{title}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color: T.primary }}>{num}</span>
    </div>
  );
}

ctx.render(<Subtotal />);
```
