# `highlightNumber` — Threshold highlight

Color a number good/bad against a threshold — plain, badge, mini-bar or trend arrow

**kind** `column` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `field` | field | ✓ |  | accepts numeric, coll←collection |
| `threshold` | number | ✓ |  |  |
| `goodWhen` | select |  | `gte` | opts: gte/lte |
| `variant` | styleSelect |  | `plain` | opts: plain/badge/bar/arrow/dotPrefix/pillBg |
| `barMax` | number |  |  | Value treated as a full bar; defaults to 2× threshold |
| `theme` | theme |  | `default` |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on this table |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
async function __resolveRecord() {
  let r = null;
  try { const p = await ctx.getVar('ctx.popup'); r = (p && p.record) || null; } catch (e) {}
  if (!r) { try { r = await ctx.getVar('ctx.record'); } catch (e) {} }
  if (!r) r = ctx.record || null;
  if (!r && $p.collection && $p.recordId != null && $p.recordId !== '') {
    try {
      const res = await ctx.api.request({ url: $p.collection + ':get', params: { filterByTk: $p.recordId } });
      r = (res && res.data && res.data.data) || null;
    } catch (e) {}
  }
  return r;
}

const { useState: __useState, useEffect: __useEffect } = ctx.React;
function useRecord() {
  const [rec, setRec] = __useState(ctx.record || ctx.model.__rec || null);
  __useEffect(function () {
    if (ctx.record) { ctx.model.__rec = ctx.record; return; }
    (async function () {
      const r = await __resolveRecord();
      if (r) { ctx.model.__rec = r; setRec(r); }
    })();
  }, []);
  return rec;
}

function openRowPopup() {
  const rec = ctx.record || ctx.model.__rec || {};
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    ctx.openView($p.popupViewUid, {
      mode: 'drawer',
      collectionName: (ctx.collection && ctx.collection.name) || $p.collection,
      filterByTk: rec.id,
      params: { filterByTk: rec.id },
    });
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
function Click(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={openRowPopup} style={{ display: 'inline-block', color: 'inherit' }}>{props.children}</a>;
}
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const GOOD = '#52c41a', BAD = '#f5222d';
function Cell() {
  const rec = useRecord();
  const raw = rec ? rec[$p.field] : null;
  const val = Number(raw);
  if (raw == null || raw === '' || isNaN(val)) return <span style={{ color: T.sub }}>—</span>;
  const t = Number($p.threshold) || 0;
  const good = $p.goodWhen === 'lte' ? val <= t : val >= t;
  const color = good ? GOOD : BAD;
  const txt = val.toLocaleString();
  const v = $p.variant || 'plain';
  if (v === 'badge') {
    return <Click><span style={{ color: '#fff', background: color, borderRadius: 10, padding: '1px 9px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{txt}</span></Click>;
  }
  if (v === 'arrow') {
    return <Click><b style={{ color: color, fontVariantNumeric: 'tabular-nums' }}>{($p.goodWhen === 'lte' ? (good ? '▼ ' : '▲ ') : (good ? '▲ ' : '▼ ')) + txt}</b></Click>;
  }
  if (v === 'bar') {
    const max = Number($p.barMax) || (t * 2) || (Math.abs(val) || 1);
    const pct = Math.min(100, Math.max(0, Math.round((val / max) * 100)));
    return (
      <Click>
        <span style={{ display: 'inline-block', minWidth: 90 }}>
          <b style={{ color: color, fontVariantNumeric: 'tabular-nums' }}>{txt}</b>
          <span style={{ display: 'block', height: 5, borderRadius: 3, background: T.card, marginTop: 3 }}>
            <span style={{ display: 'block', width: pct + '%', height: '100%', borderRadius: 3, background: color }} />
          </span>
        </span>
      </Click>
    );
  }
  if (v === 'dotPrefix') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <b style={{ color: color, fontVariantNumeric: 'tabular-nums' }}>{txt}</b>
        </span>
      </Click>
    );
  }
  if (v === 'pillBg') {
    const tint = good ? 'rgba(82,196,26,0.14)' : 'rgba(245,34,45,0.12)';
    return <Click><span style={{ color: color, background: tint, borderRadius: 7, padding: '1px 9px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{txt}</span></Click>;
  }
  // plain (default)
  return <Click><b style={{ color: color, fontVariantNumeric: 'tabular-nums' }}>{txt}</b></Click>;
}
ctx.render(<Cell />);
```
