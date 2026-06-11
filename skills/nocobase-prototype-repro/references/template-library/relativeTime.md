# `relativeTime` — Relative time

“3 hours ago” style time, full timestamp on hover — text, badge, dot or icon

**kind** `column` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `field` | field | ✓ |  | accepts date, coll←collection |
| `variant` | styleSelect |  | `text` | opts: text/badge/dot/icon/colored/fullDate |
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

const { Tooltip } = ctx.antd;
function rel(v) {
  const d = new Date(v); if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const past = diff >= 0; const a = Math.abs(diff);
  const m = Math.floor(a / 60000), h = Math.floor(a / 3600000), dd = Math.floor(a / 86400000);
  let s;
  if (a < 60000) s = 'just now';
  else if (m < 60) s = m + 'm';
  else if (h < 24) s = h + 'h';
  else if (dd < 30) s = dd + 'd';
  else return d.toLocaleDateString();
  return a < 60000 ? s : (past ? s + ' ago' : 'in ' + s);
}
function Cell() {
  const rec = useRecord();
  const val = rec ? rec[$p.field] : null;
  if (!val) return <span style={{ color: T.sub }}>—</span>;
  const r = rel(val) || String(val);
  const full = String(new Date(val).toLocaleString());
  const v = $p.variant || 'text';
  let inner;
  if (v === 'badge') {
    inner = <span style={{ fontSize: 12, color: T.primary, background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: '1px 9px' }}>{r}</span>;
  } else if (v === 'dot') {
    inner = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.text }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.primary }} />{r}
      </span>
    );
  } else if (v === 'icon') {
    inner = <span style={{ color: T.text }}>🕑 {r}</span>;
  } else if (v === 'colored') {
    const days = Math.abs(Date.now() - new Date(val).getTime()) / 86400000;
    const ageColor = days < 1 ? '#52c41a' : days < 7 ? '#faad14' : '#f5222d';
    inner = <span style={{ fontWeight: 600, color: ageColor }}>{r}</span>;
  } else if (v === 'fullDate') {
    inner = <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>{full}</span>;
  } else {
    inner = <span style={{ color: T.text }}>{r}</span>;
  }
  const tip = v === 'fullDate' ? r : full;
  return <Click><Tooltip title={tip}>{inner}</Tooltip></Click>;
}
ctx.render(<Cell />);
```
