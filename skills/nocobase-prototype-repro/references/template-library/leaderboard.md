# `leaderboard` — Leaderboard

Top N records by a numeric field: list / podium / bars / medal cards

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `labelField` | field |  |  | coll←collection |
| `valueField` | field | ✓ |  | accepts numeric, coll←collection, Records are ranked descending by this field. |
| `limit` | number |  | `5` |  |
| `prefix` | text |  |  |  |
| `variant` | styleSelect |  | `list` | opts: list/podium/bars/medalCards/numbered/top3/avatar |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
function __openRecordPopup(rec) {
  rec = rec || {};
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    ctx.openView($p.popupViewUid, { mode: 'drawer', filterByTk: rec.id, params: { filterByTk: rec.id } });
    return;
  }
  const { Descriptions } = ctx.antd;
  const keys = Object.keys(rec).filter(function (k) { const v = rec[k]; return v == null || typeof v !== 'object'; });
  ctx.viewer.drawer({
    width: '40%',
    title: 'Detail',
    content: (
      <Descriptions column={1} size="small" bordered>
        {keys.map(function (k) {
          const v = rec[k];
          return <Descriptions.Item key={k} label={k}>{v == null || v === '' ? '—' : String(v)}</Descriptions.Item>;
        })}
      </Descriptions>
    ),
  });
}
function RowClick(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={function () { __openRecordPopup(props.rec); }} style={{ display: 'block', color: 'inherit', cursor: 'pointer' }}>{props.children}</a>;
}

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function Leaderboard() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const limit = Number($p.limit) > 0 ? Number($p.limit) : 5;
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(limit);
        if (ctx.resource.setSort) ctx.resource.setSort(['-' + $p.valueField]);
        await ctx.resource.refresh();
        setRows(ctx.resource.getData() || []);
      } catch (e) { setRows([]); }
    })();
  }, []);

  const medal = function (i) {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return String(i + 1);
  };
  const fmt = function (v) {
    const n = Number(v);
    if (isNaN(n)) return v == null ? '' : String(v);
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };
  const labelOf = function (r, i) {
    const label = $p.labelField ? r[$p.labelField] : (r.title || r.name || ('#' + (r.id != null ? r.id : i)));
    return label == null || label === '' ? '—' : String(label);
  };
  const hexFade = function (hex) {
    const hx = String(hex).replace('#', '');
    if (hx.length !== 6) return T.card;
    const r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',0.1)';
  };

  if (rows == null) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>Loading…</div>;
  if (!rows.length) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>No records.</div>;

  const v = $p.variant || 'list';
  const prefix = $p.prefix || '';

  if (v === 'podium') {
    const top = rows.slice(0, 3);
    const order = top.length === 3 ? [1, 0, 2] : top.map(function (_, i) { return i; });
    const heights = { 0: 64, 1: 44, 2: 32 };
    const medalColor = { 0: '#faad14', 1: '#bfbfbf', 2: '#d48806' };
    return (
      <div style={{ padding: '14px 12px 10px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10 }}>
          {order.map(function (idx) {
            const r = top[idx];
            if (!r) return null;
            return (
              <RowClick rec={r} key={idx}>
              <div style={{ flex: 1, maxWidth: 110, textAlign: 'center' }}>
                <div style={{ fontSize: 20 }}>{medal(idx)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0' }}>{labelOf(r, idx)}</div>
                <b style={{ fontSize: 12, color: T.text }}>{prefix + fmt(r[$p.valueField])}</b>
                <div style={{ height: heights[idx], borderRadius: '6px 6px 0 0', marginTop: 6, background: medalColor[idx], opacity: 0.9 }} />
              </div>
              </RowClick>
            );
          })}
        </div>
        {rows.slice(3).map(function (r, j) {
          const i = j + 3;
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 4px', borderTop: '1px solid ' + T.border }}>
              <span style={{ width: 26, textAlign: 'center', fontSize: 12, color: T.sub, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 8px' }}>{labelOf(r, i)}</span>
              <b style={{ fontSize: 12, color: T.text, flexShrink: 0 }}>{prefix + fmt(r[$p.valueField])}</b>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'bars') {
    const max = rows.reduce(function (m, r) { const n = Number(r[$p.valueField]); return (!isNaN(n) && n > m) ? n : m; }, 0) || 1;
    return (
      <div style={{ padding: '10px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const n = Number(r[$p.valueField]);
          const w = isNaN(n) ? 0 : Math.max(2, Math.round(n / max * 100));
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 18, textAlign: 'center', fontSize: i < 3 ? 14 : 11, flexShrink: 0 }}>{medal(i)}</span>
                  <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(r, i)}</span>
                </span>
                <b style={{ color: T.text, flexShrink: 0, marginLeft: 8 }}>{prefix + fmt(r[$p.valueField])}</b>
              </div>
              <div style={{ background: T.card, borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ width: w + '%', height: '100%', background: T.primary, borderRadius: 4 }} />
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'medalCards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {rows.map(function (r, i) {
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, padding: '12px 10px', textAlign: 'center', height: '100%' }}>
              <div style={{ fontSize: i < 3 ? 22 : 15, fontWeight: 600, color: T.sub }}>{medal(i)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(r, i)}</div>
              <b style={{ fontSize: 15, color: T.primary }}>{prefix + fmt(r[$p.valueField])}</b>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  const AV_COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
  const avColor = function (s) {
    const t = (s == null ? '' : String(s));
    let n = 0;
    for (let k = 0; k < t.length; k++) n = (n + t.charCodeAt(k)) % AV_COLORS.length;
    return AV_COLORS[n];
  };
  const initials = function (s) {
    const t = (s == null ? '' : String(s)).trim();
    return t ? t.slice(0, 1).toUpperCase() : '·';
  };

  if (v === 'numbered') {
    return (
      <div style={{ padding: '4px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.primary, opacity: 0.55, width: 26, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(r, i)}</span>
              <b style={{ fontSize: 13, color: T.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{prefix + fmt(r[$p.valueField])}</b>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'top3') {
    const medalColor = { 0: '#faad14', 1: '#bfbfbf', 2: '#d48806' };
    return (
      <div style={{ padding: '4px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const top = i < 3;
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: top ? '9px 14px' : '7px 14px', background: top ? hexFade(medalColor[i]) : 'transparent', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ width: 26, textAlign: 'center', fontSize: top ? 18 : 13, fontWeight: 700, color: T.sub, flexShrink: 0 }}>{medal(i)}</span>
              <span style={{ flex: 1, fontSize: top ? 14 : 13, fontWeight: top ? 700 : 400, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(r, i)}</span>
              <b style={{ fontSize: top ? 15 : 13, color: top ? T.primary : T.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{prefix + fmt(r[$p.valueField])}</b>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'avatar') {
    return (
      <div style={{ padding: '2px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const label = labelOf(r, i);
          const c = i < 3 ? ['#faad14', '#bfbfbf', '#d48806'][i] : avColor(label);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ position: 'relative', flexShrink: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: c, color: '#fff', fontSize: 14, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{initials(label)}</span>
                <span style={{ position: 'absolute', right: -3, bottom: -3, width: 17, height: 17, borderRadius: '50%', background: T.bg, color: T.sub, fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center', border: '1px solid ' + T.border }}>{i + 1}</span>
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <b style={{ fontSize: 13, color: T.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{prefix + fmt(r[$p.valueField])}</b>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  // list (default)
  return (
    <div style={{ padding: '4px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {rows.map(function (r, i) {
        return (
          <RowClick rec={r} key={r.id != null ? r.id : i}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
            <span style={{ width: 26, textAlign: 'center', fontSize: i < 3 ? 16 : 13, fontWeight: 600, color: T.sub, flexShrink: 0 }}>{medal(i)}</span>
            <span style={{ flex: 1, fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 8px' }}>
              {labelOf(r, i)}
            </span>
            <b style={{ fontSize: 13, color: T.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {prefix + fmt(r[$p.valueField])}
            </b>
          </div>
          </RowClick>
        );
      })}
    </div>
  );
}

ctx.render(<Leaderboard />);
```
