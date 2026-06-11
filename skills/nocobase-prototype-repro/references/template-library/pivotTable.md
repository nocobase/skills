# `pivotTable` — Pivot table

Cross-tab aggregation: rows × columns with count / sum / avg cells, totals and heat coloring

**kind** `block` · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `rowField` | field | ✓ |  | coll←collection, Enum / text field — one table row per value |
| `colField` | field | ✓ |  | coll←collection, Enum / text field — one table column per value |
| `valueMode` | select |  | `count` | opts: count/sum/avg |
| `numField` | field |  |  | accepts numeric, coll←collection |
| `limit` | number |  | `8` |  |
| `variant` | styleSelect |  | `heat` | opts: heat/plain/zebra/bars |
| `title` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };


function labelOf(enumList, v) {
  if (v === null || v === undefined || v === '') return '—';
  const hit = (enumList || []).find(function (o) { return String(o.value) === String(v); });
  return hit ? hit.label : String(v);
}

function fmt(n) {
  if (n === null || n === undefined) return '';
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Pivot() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const fields = [$p.rowField, $p.colField];
        if (($p.valueMode === 'sum' || $p.valueMode === 'avg') && $p.numField) fields.push($p.numField);
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: 800, fields: fields } });
        setRows((res && res.data && res.data.data) || []);
      } catch (e) { setRows([]); }
    })();
  }, []);
  if (!rows) return <div style={{ padding: 16, color: T.sub }}>Loading…</div>;

  const mode = $p.valueMode || 'count';
  const cell = {}; const rowTotals = {}; const colTotals = {}; const cnt = {};
  rows.forEach(function (r) {
    const rk = String(r[$p.rowField] ?? '—');
    const ck = String(r[$p.colField] ?? '—');
    const v = mode === 'count' ? 1 : Number(r[$p.numField]) || 0;
    const k = rk + '\u0001' + ck;
    cell[k] = (cell[k] || 0) + v;
    cnt[k] = (cnt[k] || 0) + 1;
    rowTotals[rk] = (rowTotals[rk] || 0) + v;
    colTotals[ck] = (colTotals[ck] || 0) + v;
  });
  if (mode === 'avg') {
    Object.keys(cell).forEach(function (k) { cell[k] = cell[k] / cnt[k]; });
  }
  const rks = Object.keys(rowTotals).sort(function (a, b) { return rowTotals[b] - rowTotals[a]; }).slice(0, $p.limit || 8);
  const cks = Object.keys(colTotals).sort(function (a, b) { return colTotals[b] - colTotals[a]; }).slice(0, 8);
  const maxCell = Math.max.apply(null, [1].concat(rks.map(function (rk) {
    return Math.max.apply(null, [0].concat(cks.map(function (ck) { return cell[rk + '\u0001' + ck] || 0; })));
  })));

  const variant = $p.variant || 'heat';
  function cellStyle(v, ri) {
    const base = { padding: '6px 10px', textAlign: 'right', fontSize: 12, color: T.text, borderBottom: '1px solid ' + T.border };
    if (variant === 'heat' && v) {
      const a = Math.min(0.85, 0.08 + 0.77 * (v / maxCell));
      return Object.assign(base, { background: T.primary + Math.round(a * 255).toString(16).padStart(2, '0'), color: a > 0.45 ? '#fff' : T.text, fontWeight: 600 });
    }
    if (variant === 'zebra' && ri % 2) return Object.assign(base, { background: T.card });
    return base;
  }

  return (
    <div style={{ padding: 12, background: T.bg }}>
      {$p.title ? <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 8 }}>{$p.title}</div> : null}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: T.sub, borderBottom: '2px solid ' + T.border }}>{''}</th>
              {cks.map(function (ck) {
                return <th key={ck} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: T.sub, borderBottom: '2px solid ' + T.border, whiteSpace: 'nowrap' }}>{labelOf($p.colField__enum, ck)}</th>;
              })}
              <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.text, borderBottom: '2px solid ' + T.border }}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {rks.map(function (rk, ri) {
              return (
                <tr key={rk}>
                  <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, color: T.text, borderBottom: '1px solid ' + T.border, whiteSpace: 'nowrap' }}>{labelOf($p.rowField__enum, rk)}</td>
                  {cks.map(function (ck) {
                    const v = cell[rk + '\u0001' + ck] || 0;
                    return (
                      <td key={ck} style={cellStyle(v, ri)}>
                        {variant === 'bars' && v ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 36, height: 5, borderRadius: 3, background: T.card, overflow: 'hidden', display: 'inline-block' }}>
                              <span style={{ display: 'block', width: Math.max(6, Math.round((v / maxCell) * 100)) + '%', height: '100%', background: T.primary }} />
                            </span>
                            {fmt(v)}
                          </span>
                        ) : (v ? fmt(v) : <span style={{ color: T.border }}>·</span>)}
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.primary, borderBottom: '1px solid ' + T.border }}>{fmt(rowTotals[rk])}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: T.text }}>Σ</td>
              {cks.map(function (ck) {
                return <td key={ck} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.primary }}>{fmt(colTotals[ck])}</td>;
              })}
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: T.primary }}>
                {fmt(rks.reduce(function (s, rk) { return s + rowTotals[rk]; }, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

ctx.render(<Pivot />);
```
