# `quadrantScatter` — Quadrant matrix

Two number fields scattered into four quadrants (median split) — prioritization at a glance

**kind** `block` · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `xField` | field | ✓ |  | accepts numeric, coll←collection |
| `yField` | field | ✓ |  | accepts numeric, coll←collection |
| `labelField` | field |  |  | accepts text, coll←collection, Shown for the labeled style and on hover |
| `variant` | styleSelect |  | `tint` | opts: tint/dots/labeled/minimal |
| `title` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

function median(arr) {
  const a = arr.slice().sort(function (x, y) { return x - y; });
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

function Quad() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const fields = [$p.xField, $p.yField].concat($p.labelField ? [$p.labelField] : []);
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: 300, fields: fields } });
        setRows(((res && res.data && res.data.data) || []).filter(function (r) {
          return r[$p.xField] != null && r[$p.yField] != null;
        }));
      } catch (e) { setRows([]); }
    })();
  }, []);
  if (!rows) return <div style={{ padding: 16, color: T.sub }}>Loading…</div>;
  if (!rows.length) return <div style={{ padding: 16, color: T.sub }}>No data points</div>;

  const xs = rows.map(function (r) { return Number(r[$p.xField]) || 0; });
  const ys = rows.map(function (r) { return Number(r[$p.yField]) || 0; });
  const mx = median(xs), my = median(ys);
  const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  const W = 460, H = 260, P = 14;
  function sx(v) { return P + ((v - minX) / ((maxX - minX) || 1)) * (W - P * 2); }
  function sy(v) { return H - P - ((v - minY) / ((maxY - minY) || 1)) * (H - P * 2); }
  const variant = $p.variant || 'tint';
  const mxp = sx(mx), myp = sy(my);

  return (
    <div style={{ padding: 12, background: T.bg }}>
      {$p.title ? <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>{$p.title}</div> : null}
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block', maxWidth: W }}>
        {variant === 'tint' ? (
          <g>
            <rect x={mxp} y={0} width={W - mxp} height={myp} fill={T.primary + '14'} />
            <rect x={0} y={myp} width={mxp} height={H - myp} fill={T.sub + '0d'} />
          </g>
        ) : null}
        {variant !== 'minimal' ? (
          <g>
            <line x1={mxp} y1={0} x2={mxp} y2={H} stroke={T.border} strokeDasharray="4 4" />
            <line x1={0} y1={myp} x2={W} y2={myp} stroke={T.border} strokeDasharray="4 4" />
          </g>
        ) : null}
        {rows.slice(0, 200).map(function (r, i) {
          const x = sx(Number(r[$p.xField]) || 0);
          const y = sy(Number(r[$p.yField]) || 0);
          const hot = (Number(r[$p.xField]) || 0) >= mx && (Number(r[$p.yField]) || 0) >= my;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={hot ? 5 : 4} fill={hot ? T.primary : T.primary + '88'} stroke={T.bg} strokeWidth="1">
                <title>{($p.labelField ? (r[$p.labelField] || '') + ' · ' : '') + r[$p.xField] + ' / ' + r[$p.yField]}</title>
              </circle>
              {variant === 'labeled' && $p.labelField && r[$p.labelField] ? (
                <text x={x + 7} y={y + 3} fontSize="9" fill={T.sub}>{String(r[$p.labelField]).slice(0, 12)}</text>
              ) : null}
            </g>
          );
        })}
        <text x={W - P} y={12} fontSize="10" fill={T.sub} textAnchor="end">High {$p.yField} · High {$p.xField}</text>
        <text x={P} y={H - 4} fontSize="10" fill={T.sub}>Low {$p.yField} · Low {$p.xField}</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.sub, maxWidth: W }}>
        <span>{$p.xField} →</span>
        <span>↑ {$p.yField}</span>
      </div>
    </div>
  );
}

ctx.render(<Quad />);
```
