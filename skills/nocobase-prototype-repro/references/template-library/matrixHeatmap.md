# `matrixHeatmap` — Matrix heatmap

Row × column matrix with color-graded cells (count or average)

**kind** `block` · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `rowField` | field | ✓ |  | coll←collection |
| `colField` | field | ✓ |  | coll←collection |
| `valueField` | field |  |  | accepts numeric, coll←collection, Empty = count of records per cell |
| `label` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function heat(v, max) {
  if (v == null || max <= 0) return T.card;
  const t = Math.max(0, Math.min(1, v / max));
  // white-blue → deep blue gradient
  const c = Math.round(235 - t * 165);
  return 'rgb(' + (c - 30) + ',' + c + ',255)';
}

function Comp() {
  const [data, setData] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        await ctx.resource.refresh();
        const rows = ctx.resource.getData() || [];
        const cells = {}; const rowsSet = []; const colsSet = [];
        rows.forEach(function (r) {
          const rk = String(r[$p.rowField] == null || r[$p.rowField] === '' ? '—' : r[$p.rowField]);
          const ck = String(r[$p.colField] == null || r[$p.colField] === '' ? '—' : r[$p.colField]);
          if (rowsSet.indexOf(rk) < 0) rowsSet.push(rk);
          if (colsSet.indexOf(ck) < 0) colsSet.push(ck);
          const key = rk + '\u0001' + ck;
          if (!cells[key]) cells[key] = { n: 0, sum: 0 };
          cells[key].n += 1;
          const v = Number(r[$p.valueField]);
          if (!isNaN(v)) cells[key].sum += v;
        });
        setData({ cells: cells, rows: rowsSet.sort().slice(0, 12), cols: colsSet.sort().slice(0, 8) });
      } catch (e) { setData({ cells: {}, rows: [], cols: [] }); }
    })();
  }, []);

  if (data == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;
  if (!data.rows.length) return <div style={{ padding: 12, color: T.sub }}>No data.</div>;

  const valOf = function (rk, ck) {
    const c = data.cells[rk + '\u0001' + ck];
    if (!c) return null;
    return $p.valueField ? (c.n ? c.sum / c.n : null) : c.n;
  };
  let max = 0;
  data.rows.forEach(function (rk) { data.cols.forEach(function (ck) { const v = valOf(rk, ck); if (v != null && v > max) max = v; }); });

  return (
    <div style={{ padding: '14px 16px', overflowX: 'auto', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
      <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            <th />
            {data.cols.map(function (ck) {
              return <th key={ck} style={{ fontSize: 11, fontWeight: 600, color: T.sub, padding: '2px 6px', textAlign: 'center' }}>{ck}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {data.rows.map(function (rk) {
            return (
              <tr key={rk}>
                <td style={{ fontSize: 12, fontWeight: 600, color: T.sub, padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>{rk}</td>
                {data.cols.map(function (ck) {
                  const v = valOf(rk, ck);
                  const txt = v == null ? '' : ($p.valueField ? (Math.round(v * 10) / 10) : v);
                  return (
                    <td key={ck}>
                      <div style={{ background: heat(v, max), color: v != null && v / (max || 1) > 0.55 ? '#fff' : '#555', borderRadius: 6, minWidth: 44, padding: '8px 0', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                        {txt}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

ctx.render(<Comp />);
```
