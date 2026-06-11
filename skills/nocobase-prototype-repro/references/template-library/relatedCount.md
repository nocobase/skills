# `relatedCount` — Related count

A big number — count of related records for this record (popup / form)

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | The popup record’s collection |
| `relation` | association | ✓ |  | coll←collection, A to-many relation defined on this collection |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `label` | text |  |  |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `records` | opts: records/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `theme` | theme |  | `default` |  |


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

// popup lists the RELATION records (not the base collection)
async function __popupListUrl() {
  const rec = await __resolveRecord();
  if (rec && rec.id != null && $p.relation) return $p.relation.source + '/' + rec.id + '/' + $p.relation.name + ':list';
  return null;
}

const { Spin } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function Comp() {
  const [count, setCount] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const rec = await __resolveRecord();
        const id = rec && rec.id;
        if (id == null || !$p.relation) { setCount(0); return; }
        const res = await ctx.api.request({
          url: $p.relation.source + '/' + id + '/' + $p.relation.name + ':list',
          params: { pageSize: 1 },
        });
        const c = res && res.data && res.data.meta && res.data.meta.count;
        setCount(c != null ? c : ((res && res.data && res.data.data) || []).length);
      } catch (e) {
        ctx.message && ctx.message.error('Load failed: ' + ((e && e.message) || e));
        setCount(0);
      }
    })();
  }, []);

  if (count === null) return <Spin />;
  return (
    <div style={{ padding: '16px 18px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>{$p.label || ($p.relation && $p.relation.label) || ''}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1 }}>{Number(count).toLocaleString('en-US')}</div>
      <div style={{ marginTop: 10, height: 3, width: 44, borderRadius: 2, background: T.primary }} />
    </div>
  );
}

ctx.render(<ClickWrap><Comp /></ClickWrap>);
```
