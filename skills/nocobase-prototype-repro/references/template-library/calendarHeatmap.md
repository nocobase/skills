# `calendarHeatmap` — Calendar heatmap

GitHub-style daily activity grid from a date field

**kind** `block` · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `dateField` | field |  |  | accepts date, coll←collection, Defaults to createdAt |
| `weeks` | number |  | `16` |  |
| `label` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Tooltip } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function Heat() {
  const [days, setDays] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        if (ctx.resource.setSort) ctx.resource.setSort(['-' + ($p.dateField || 'createdAt')]);
        await ctx.resource.refresh();
        const rows = ctx.resource.getData() || [];
        const counts = {};
        rows.forEach(function (r) {
          const d = new Date(r[$p.dateField || 'createdAt']);
          if (isNaN(d.getTime())) return;
          const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
          counts[key] = (counts[key] || 0) + 1;
        });
        setDays(counts);
      } catch (e) { setDays({}); }
    })();
  }, []);

  if (days == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;

  const weeks = Math.max(4, Math.min(32, Number($p.weeks) || 16));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // align grid to end on today's week (columns = weeks, rows = 7 days)
  const cols = [];
  let max = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(today.getTime() - (w * 7 + d) * 86400000);
      const key = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      const n = days[key] || 0;
      if (n > max) max = n;
      col.push({ key: key, n: n, label: dt.toLocaleDateString() });
    }
    cols.push(col);
  }
  const shade = function (n) {
    if (!n) return T.card;
    const t = Math.min(1, n / (max || 1));
    // pale → deep green (GitHub style)
    const r2 = Math.round(235 - t * 195), g2 = Math.round(245 - t * 75), b2 = Math.round(235 - t * 175);
    return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
  };

  return (
    <div style={{ padding: '14px 16px', overflowX: 'auto', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
      <div style={{ display: 'flex', gap: 3 }}>
        {cols.map(function (col, ci) {
          return (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {col.map(function (cell) {
                return (
                  <Tooltip key={cell.key} title={cell.label + ' · ' + cell.n}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: shade(cell.n), display: 'block' }} />
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: 8 }}>last {weeks} weeks · max {max}/day</div>
    </div>
  );
}

ctx.render(<Heat />);
```
