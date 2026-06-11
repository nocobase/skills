# `distribution` — Distribution bars

Group records by a field and show bars / pills / columns / donut (top N)

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `field` | field | ✓ |  | coll←collection, Rows are grouped by this field (enum / select / text). |
| `limit` | number |  | `8` |  |
| `label` | text |  |  |  |
| `variant` | styleSelect |  | `bars` | opts: bars/pills/columns/donut/stacked/radial/lollipop |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

// native option labels/colors of the chosen field, captured at insert time
const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const ANTD_COLORS = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d', default: T.primary };
function optOf(rawKey) {
  return enumOpts.find(function (o) { return String(o.value) === rawKey; });
}

function Distribution() {
  const [items, setItems] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        await ctx.resource.refresh();
        const rows = ctx.resource.getData() || [];
        const counts = {};
        rows.forEach(function (r) {
          let v = r[$p.field];
          if (v == null || v === '') v = '(empty)';
          v = String(v);
          counts[v] = (counts[v] || 0) + 1;
        });
        let arr = Object.keys(counts).map(function (k) {
          const o = optOf(k);
          return {
            label: (o && o.label) || k,
            color: (o && o.color && (ANTD_COLORS[o.color] || o.color)) || T.primary,
            count: counts[k],
          };
        });
        arr.sort(function (a, b) { return b.count - a.count; });
        const limit = Number($p.limit) > 0 ? Number($p.limit) : 8;
        arr = arr.slice(0, limit);
        setItems(arr);
      } catch (e) { setItems([]); }
    })();
  }, []);

  if (items == null) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>Loading…</div>;
  if (!items.length) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>No data.</div>;

  const max = items.reduce(function (m, it) { return it.count > m ? it.count : m; }, 0) || 1;
  const total = items.reduce(function (s, it) { return s + it.count; }, 0) || 1;
  const v = $p.variant || 'bars';
  const titleEl = $p.label ? (<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div>) : null;

  if (v === 'pills') {
    return (
      <div style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.map(function (it, i) {
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 14, background: T.card, border: '1px solid ' + T.border, fontSize: 12, color: T.text }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{it.label}</span>
                <b style={{ color: T.text }}>{it.count}</b>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (v === 'columns') {
    return (
      <div style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110, paddingTop: 6 }}>
          {items.map(function (it, i) {
            const h = Math.max(6, Math.round(it.count / max * 84));
            return (
              <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <b style={{ fontSize: 11, color: T.text, marginBottom: 3 }}>{it.count}</b>
                <div style={{ width: '100%', height: h, background: it.color, borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: 11, color: T.sub, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{it.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (v === 'donut') {
    const R = 52, SW = 18, C = 2 * Math.PI * R;
    let off = 0;
    const segs = items.map(function (it) {
      const frac = it.count / total;
      const seg = { frac: frac, color: it.color, off: off };
      off += frac;
      return seg;
    });
    return (
      <div style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
            <svg width="130" height="130">
              {segs.map(function (s, i) {
                return (
                  <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={s.color} strokeWidth={SW}
                    strokeDasharray={(s.frac * C) + ' ' + C} strokeDashoffset={-s.off * C} transform="rotate(-90 65 65)" />
                );
              })}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, color: T.text }}>{total}</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            {items.map(function (it, i) {
              const pct = Math.round(it.count / total * 100);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  <b style={{ color: T.text }}>{it.count}</b>
                  <span style={{ color: T.sub, width: 36, textAlign: 'right' }}>{pct + '%'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (v === 'stacked') {
    return (
      <div style={{ padding: '12px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', background: T.card }}>
          {items.map(function (it, i) {
            const pct = it.count / total * 100;
            return (
              <div key={i} title={it.label} style={{ width: pct + '%', background: it.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, overflow: 'hidden' }}>
                {pct >= 9 ? Math.round(pct) + '%' : ''}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
          {items.map(function (it, i) {
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.sub }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color, flexShrink: 0 }} />
                <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{it.label}</span>
                <b style={{ color: T.text }}>{it.count}</b>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (v === 'radial') {
    const rings = items.slice(0, 5);
    const SW = 11, GAP = 4, base = 16;
    const maxR = base + (rings.length - 1) * (SW + GAP);
    const size = (maxR + SW / 2 + 4) * 2;
    const cx = size / 2;
    return (
      <div style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size}>
              {rings.map(function (it, i) {
                const r = base + i * (SW + GAP);
                const C = 2 * Math.PI * r;
                const frac = it.count / max;
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cx} r={r} fill="none" stroke={T.card} strokeWidth={SW} />
                    <circle cx={cx} cy={cx} r={r} fill="none" stroke={it.color} strokeWidth={SW} strokeLinecap="round"
                      strokeDasharray={(frac * C) + ' ' + C} transform={'rotate(-90 ' + cx + ' ' + cx + ')'} />
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            {rings.map(function (it, i) {
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  <b style={{ color: T.text }}>{it.count}</b>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (v === 'lollipop') {
    return (
      <div style={{ padding: '10px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        {items.map(function (it, i) {
          const w = Math.max(4, it.count / max * 100);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span style={{ width: '32%', fontSize: 12, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{it.label}</span>
              <div style={{ flex: 1, position: 'relative', height: 14, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 0, width: w + '%', height: 3, background: it.color, borderRadius: 2 }} />
                <span style={{ position: 'absolute', left: 'calc(' + w + '% - 6px)', width: 12, height: 12, borderRadius: '50%', background: it.color, boxShadow: '0 0 0 3px ' + T.bg }} />
              </div>
              <b style={{ width: 38, textAlign: 'right', fontSize: 12, color: T.text, flexShrink: 0 }}>{it.count}</b>
            </div>
          );
        })}
      </div>
    );
  }

  // bars (default)
  return (
    <div style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {titleEl}
      {items.map(function (it, i) {
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, color: T.sub }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{it.label}</span>
              <b style={{ color: T.text }}>{it.count}</b>
            </div>
            <div style={{ background: T.card, borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: (it.count / max * 100) + '%', height: '100%', background: it.color, borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<Distribution />);
```
