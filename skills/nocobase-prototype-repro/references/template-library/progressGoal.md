# `progressGoal` — Progress toward goal

Progress vs a target: bar / ring / gauge / segments

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `valueSource` | select |  | `aggregate` | opts: aggregate/sql/js |
| `collection` | collection |  |  |  |
| `fn` | select |  | `count` | opts: count/sum/avg/max/min |
| `field` | field |  |  | accepts numeric, coll←collection, The numeric field to aggregate. |
| `sql` | code |  | `SELECT count(*) AS value FROM users` | First cell of the first row is the value |
| `jsExpr` | code |  | `const res = await ctx.api.request({ url: 'users:list', params: { pageSize: 1 } });
return res.data.meta.count;` | Async JS with ctx available (ctx.api / ctx.sql …) — return the number |
| `target` | number | ✓ |  |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `records` | opts: records/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `label` | text |  |  |  |
| `variant` | styleSelect |  | `bar` | opts: bar/ring/gauge/segments/thermometer/steps/arc |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
async function __resolveValue() {
  const src = $p.valueSource || 'aggregate';
  if (src === 'none') return null;
  if (src === 'sql') {
    if (!$p.sqlUid) return null;
    // configurators keep the registered SQL in sync after manual edits
    if (ctx.flowSettingsEnabled && ctx.sql && ctx.sql.save) {
      try { await ctx.sql.save({ uid: $p.sqlUid, sql: $p.sql, dataSourceKey: 'main' }); } catch (e) {}
    }
    const data = await ctx.sql.runById($p.sqlUid, { type: 'selectRows' });
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object') { const k = Object.keys(row)[0]; return Number(row[k]); }
    return row == null ? null : Number(row);
  }
  if (src === 'js') {
    const fn = new Function('ctx', 'return (async function () {\n' + ($p.jsExpr || 'return null;') + '\n})()');
    const v = await fn(ctx);
    return v == null ? null : Number(v);
  }
  // aggregate
  if (!$p.collection) return null;
  ctx.initResource('MultiRecordResource');
  ctx.resource.setResourceName($p.collection);
  ctx.resource.setPageSize(!$p.fn || $p.fn === 'count' ? 1 : 500); // sum/avg over up to 500 rows
  await ctx.resource.refresh();
  const meta = ctx.resource.getMeta ? ctx.resource.getMeta() : {};
  const rows = ctx.resource.getData() || [];
  if (!$p.fn || $p.fn === 'count') return meta && meta.count != null ? meta.count : rows.length;
  const nums = rows.map(function (r) { return Number(r[$p.field]); }).filter(function (n) { return !isNaN(n); });
  if (!nums.length) return 0;
  if ($p.fn === 'sum') return nums.reduce(function (a, b) { return a + b; }, 0);
  if ($p.fn === 'avg') return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  if ($p.fn === 'max') return Math.max.apply(null, nums);
  if ($p.fn === 'min') return Math.min.apply(null, nums);
  return null;
}

async function __openListPopup() {
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    let tk = null;
    try { const r = typeof __resolveRecord === 'function' ? await __resolveRecord() : null; tk = r && r.id; } catch (e) {}
    ctx.openView($p.popupViewUid, tk != null ? { mode: 'drawer', filterByTk: tk, params: { filterByTk: tk } } : { mode: 'drawer' });
    return;
  }
  let url = null;
  try { if (typeof __popupListUrl === 'function') url = await __popupListUrl(); } catch (e) {}
  if (!url && $p.collection) url = $p.collection + ':list';
  if (!url) return;
  try {
    const res = await ctx.api.request({ url: url, params: { pageSize: 20, sort: ['-id'] } });
    const rows = (res && res.data && res.data.data) || [];
    const count = res && res.data && res.data.meta && res.data.meta.count;
    const { Empty } = ctx.antd;
    const cols = rows.length
      ? Object.keys(rows[0]).filter(function (k) { const v = rows[0][k]; return v == null || typeof v !== 'object'; }).slice(0, 5)
      : [];
    ctx.viewer.drawer({
      width: '50%',
      title: ($p.label || $p.collection || 'Records') + (count != null ? ' · ' + count : ''),
      content: rows.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>{cols.map(function (c) { return <th key={c} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #f0f0f0', color: '#888', fontWeight: 500 }}>{c}</th>; })}</tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              return <tr key={i}>{cols.map(function (c) { const v = r[c]; return <td key={c} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{v == null || v === '' ? '—' : String(v)}</td>; })}</tr>;
            })}
          </tbody>
        </table>
      ) : <Empty />,
    });
  } catch (e) { ctx.message && ctx.message.error('Load failed: ' + ((e && e.message) || e)); }
}
function ClickWrap(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={__openListPopup} style={{ display: 'block', color: 'inherit', cursor: 'pointer' }}>{props.children}</a>;
}

const { Progress } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function ProgressGoal() {
  const [current, setCurrent] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const v = await __resolveValue();
        setCurrent(v == null ? 0 : v);
      } catch (e) { setCurrent(0); }
    })();
  }, []);

  const target = Number($p.target) || 0;
  const cur = current == null ? 0 : current;
  const pct = target > 0 ? Math.round(cur / target * 100) : 0;
  const clamped = Math.min(pct, 100);
  const done = pct >= 100;
  const accent = done ? '#52c41a' : T.primary;
  const fmt = function (n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const v = $p.variant || 'bar';
  const titleEl = $p.label ? (<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: T.text }}>{$p.label}</div>) : null;
  const caption = (
    <div style={{ marginTop: 6, fontSize: 13, color: T.sub }}>
      <b style={{ color: T.text }}>{current == null ? '—' : fmt(cur)}</b>
      {' / '}{fmt(target)}{'  ('}{pct}{'%)'}
    </div>
  );

  if (v === 'ring') {
    const R = 46, SW = 12, C = 2 * Math.PI * R;
    return (
      <div style={{ padding: '12px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', width: 116, height: 116, flexShrink: 0 }}>
            <svg width="116" height="116">
              <circle cx="58" cy="58" r={R} fill="none" stroke={T.card} strokeWidth={SW} />
              <circle cx="58" cy="58" r={R} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - clamped / 100)} transform="rotate(-90 58 58)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: accent }}>{pct + '%'}</div>
          </div>
          <div style={{ fontSize: 13, color: T.sub }}>
            <b style={{ color: T.text, fontSize: 18, display: 'block' }}>{current == null ? '—' : fmt(cur)}</b>
            <span>{'of ' + fmt(target)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (v === 'gauge') {
    const R = 54, SW = 14, C = Math.PI * R; // half circle
    return (
      <div style={{ padding: '12px 16px 6px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ position: 'relative', width: 150, height: 84, margin: '0 auto' }}>
          <svg width="150" height="84" viewBox="0 0 150 84">
            <path d={'M 16 75 A ' + R + ' ' + R + ' 0 0 1 134 75'} fill="none" stroke={T.card} strokeWidth={SW} strokeLinecap="round" />
            <path d={'M 16 75 A ' + R + ' ' + R + ' 0 0 1 134 75'} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - clamped / 100)} />
          </svg>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', fontSize: 22, fontWeight: 700, color: accent }}>{pct + '%'}</div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: T.sub, marginTop: 2 }}>
          <b style={{ color: T.text }}>{current == null ? '—' : fmt(cur)}</b>{' / ' + fmt(target)}
        </div>
      </div>
    );
  }

  if (v === 'segments') {
    const N = 10;
    const filled = Math.round(clamped / 100 * N);
    return (
      <div style={{ padding: '12px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: N }).map(function (_, i) {
            return <div key={i} style={{ flex: 1, height: 14, borderRadius: 3, background: i < filled ? accent : T.card }} />;
          })}
        </div>
        {caption}
      </div>
    );
  }

  if (v === 'thermometer') {
    return (
      <div style={{ padding: '12px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ position: 'relative', width: 18, height: 96, flexShrink: 0 }}>
            <div style={{ position: 'absolute', left: 4, top: 0, width: 10, height: 80, borderRadius: 5, background: T.card }} />
            <div style={{ position: 'absolute', left: 4, bottom: 16, width: 10, height: Math.max(4, clamped / 100 * 80), borderRadius: 5, background: accent }} />
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: 18, height: 18, borderRadius: '50%', background: accent }} />
          </div>
          <div style={{ flex: 1, fontSize: 13, color: T.sub }}>
            <b style={{ color: accent, fontSize: 24, display: 'block', lineHeight: 1 }}>{pct + '%'}</b>
            <span style={{ display: 'block', marginTop: 6 }}><b style={{ color: T.text }}>{current == null ? '—' : fmt(cur)}</b>{' / ' + fmt(target)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (v === 'steps') {
    const N = 5;
    const filled = clamped / 100 * N;
    return (
      <div style={{ padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {Array.from({ length: N }).map(function (_, i) {
            const on = i < Math.round(filled);
            return (
              <ctx.React.Fragment key={i}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? accent : T.bg, border: on ? 'none' : '2px solid ' + T.border, color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                {i < N - 1 ? <span style={{ flex: 1, height: 3, borderRadius: 2, background: i < Math.round(filled) - 1 ? accent : T.card }} /> : null}
              </ctx.React.Fragment>
            );
          })}
        </div>
        {caption}
      </div>
    );
  }

  if (v === 'arc') {
    const R = 50, SW = 12;
    const sweep = 270; // degrees of the open arc
    const C = 2 * Math.PI * R;
    const arcLen = C * (sweep / 360);
    return (
      <div style={{ padding: '12px 16px 6px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {titleEl}
        <div style={{ position: 'relative', width: 128, height: 128, margin: '0 auto' }}>
          <svg width="128" height="128">
            <circle cx="64" cy="64" r={R} fill="none" stroke={T.card} strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={arcLen + ' ' + C} transform="rotate(135 64 64)" />
            <circle cx="64" cy="64" r={R} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={(arcLen * clamped / 100) + ' ' + C} transform="rotate(135 64 64)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: accent, lineHeight: 1 }}>{pct + '%'}</div>
              <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{current == null ? '—' : fmt(cur)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // bar (default)
  return (
    <div style={{ padding: '12px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {titleEl}
      <Progress percent={clamped} status={done ? 'success' : 'active'} strokeColor={T.primary} />
      {caption}
    </div>
  );
}

ctx.render(<ClickWrap><ProgressGoal /></ClickWrap>);
```
