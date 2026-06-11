# `heroBanner` — Gradient banner

A gradient hero banner with title, subtitle and optional live count

**kind** `block` · alsoKinds: item · **scope** `any` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `title` | text | ✓ |  |  |
| `subtitle` | text |  |  |  |
| `variant` | styleSelect |  | `default` | opts: default/split/minimal/stat-banner/outline/centered/boxed |
| `theme` | theme |  | `default` |  |
| `customGradient` | boolean |  | `false` |  |
| `customFrom` | color |  | `#4f46e5` |  |
| `customTo` | color |  | `#9333ea` |  |
| `valueSource` | select |  | `none` | opts: none/aggregate/sql/js |
| `collection` | collection |  |  |  |
| `fn` | select |  | `count` | opts: count/sum/avg/max/min |
| `field` | field |  |  | accepts numeric, coll←collection, The numeric field to aggregate. |
| `sql` | code |  | `SELECT count(*) AS value FROM users` | First cell of the first row is the value |
| `jsExpr` | code |  | `const res = await ctx.api.request({ url: 'users:list', params: { pageSize: 1 } });
return res.data.meta.count;` | Async JS with ctx available (ctx.api / ctx.sql …) — return the number |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `records` | opts: records/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |


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

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };
// legacy configs: a bare collection means "count badge"
if (!$p.valueSource && $p.collection) $p.valueSource = 'aggregate';

function gradientOf() {
  if ($p.customGradient) return 'linear-gradient(135deg,' + ($p.customFrom || '#4f46e5') + ',' + ($p.customTo || '#9333ea') + ')';
  return T.gradient || 'linear-gradient(135deg,#1677ff,#13c2c2)';
}
// the gradient still drives the accent in every layout — variant only changes structure
function primaryOf() {
  if ($p.customGradient) return $p.customFrom || '#4f46e5';
  return T.primary || '#1677ff';
}

function Comp() {
  const [count, setCount] = useState(null);
  useEffect(function () {
    if (!$p.valueSource || $p.valueSource === 'none') return;
    (async function () {
      try { setCount(await __resolveValue()); } catch (e) {}
    })();
  }, []);

  const title = $p.title || '';
  const sub = $p.subtitle || '';
  const variant = $p.variant || 'default';
  const grad = gradientOf();
  const num = count != null ? count.toLocaleString() : null;

  if (variant === 'minimal') {
    return (
      <div style={{ background: T.bg, border: '1px solid ' + T.border, borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 6, alignSelf: 'stretch', borderRadius: 4, background: grad, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: 0.2 }}>{title}</div>
          {sub ? <div style={{ fontSize: 13, color: T.sub, marginTop: 6, maxWidth: 560 }}>{sub}</div> : null}
        </div>
        {num != null ? <span style={{ fontSize: 24, fontWeight: 700, color: primaryOf(), flexShrink: 0 }}>{num}</span> : null}
      </div>
    );
  }

  if (variant === 'outline') {
    return (
      <div style={{ background: T.bg, border: '2px solid transparent', borderRadius: 12, padding: '22px 26px', position: 'relative', backgroundImage: 'linear-gradient(' + T.bg + ',' + T.bg + '),' + grad, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: 0.2 }}>{title}</div>
        {sub ? <div style={{ fontSize: 13, color: T.sub, marginTop: 6, maxWidth: 560 }}>{sub}</div> : null}
        {num != null ? (
          <span style={{ position: 'absolute', right: 22, top: 20, background: grad, color: '#fff', borderRadius: 16, padding: '4px 14px', fontSize: 14, fontWeight: 700 }}>{num}</span>
        ) : null}
      </div>
    );
  }

  if (variant === 'split') {
    return (
      <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid ' + T.border, minHeight: 96 }}>
        <div style={{ width: 150, background: grad, position: 'relative', flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          {num != null ? <span style={{ color: '#fff', fontSize: 30, fontWeight: 800, zIndex: 1 }}>{num}</span> : <span style={{ color: '#fff', fontSize: 30, zIndex: 1 }}>★</span>}
        </div>
        <div style={{ flex: 1, background: T.bg, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{title}</div>
          {sub ? <div style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>{sub}</div> : null}
        </div>
      </div>
    );
  }

  if (variant === 'stat-banner') {
    return (
      <div style={{ background: grad, borderRadius: 12, padding: '20px 26px', color: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ position: 'absolute', left: -30, bottom: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ minWidth: 0, zIndex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>{title}</div>
          {sub ? <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6, maxWidth: 460 }}>{sub}</div> : null}
        </div>
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '12px 20px', zIndex: 1, flexShrink: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{num != null ? num : '—'}</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>total</div>
        </div>
      </div>
    );
  }

  if (variant === 'centered') {
    return (
      <div style={{ background: grad, borderRadius: 12, padding: '28px 26px', color: '#fff', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
        <div style={{ position: 'absolute', left: -40, top: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'absolute', right: -40, bottom: -50, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        {num != null ? <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, zIndex: 1, position: 'relative' }}>{num}</div> : null}
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 0.2, marginTop: num != null ? 6 : 0, zIndex: 1, position: 'relative' }}>{title}</div>
        {sub ? <div style={{ fontSize: 13, opacity: 0.85, marginTop: 7, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', zIndex: 1, position: 'relative' }}>{sub}</div> : null}
      </div>
    );
  }

  if (variant === 'boxed') {
    return (
      <div style={{ background: T.bg, border: '1px solid ' + T.border, borderRadius: 14, padding: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ background: grad, borderRadius: 10, padding: '20px 22px', color: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'absolute', right: -24, top: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2 }}>{title}</div>
            {sub ? <div style={{ fontSize: 13, opacity: 0.85, marginTop: 5 }}>{sub}</div> : null}
          </div>
          {num != null ? (
            <span style={{ background: '#fff', color: primaryOf(), borderRadius: 12, padding: '8px 16px', fontSize: 22, fontWeight: 800, lineHeight: 1, zIndex: 1, flexShrink: 0 }}>{num}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // default — full gradient hero with floating bubbles + corner badge
  return (
    <div style={{ background: grad, borderRadius: 12, padding: '22px 26px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', right: 40, bottom: -50, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>{title}</div>
      {sub ? <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6, maxWidth: 560 }}>{sub}</div> : null}
      {num != null ? (
        <span style={{ position: 'absolute', right: 22, top: 20, background: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: '4px 14px', fontSize: 14, fontWeight: 700 }}>
          {num}
        </span>
      ) : null}
    </div>
  );
}

ctx.render(<ClickWrap><Comp /></ClickWrap>);
```
