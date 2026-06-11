# `linkedList` — Linked master list

Click a row → target blocks filter to that record (master / detail)

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | The master records shown in this list |
| `titleField` | field | ✓ |  | coll←collection |
| `subtitleField` | field |  |  | coll←collection |
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `targetField` | field | ✓ |  | coll←target:targets, The target-side field that stores this record’s id (e.g. customer_id) |
| `limit` | number |  | `10` |  |
| `label` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const __FKEY = 'jsTpl:' + (ctx.model && ctx.model.uid);
function __targets() {
  const v = $p.targets;
  return (Array.isArray(v) ? v : v ? [v] : [])
    .map(function (uid) { return ctx.getModel(uid); })
    .filter(function (t) { return t && t.resource; });
}
function applyFilter(filter, keySuffix) {
  const key = __FKEY + (keySuffix ? ':' + keySuffix : '');
  __targets().forEach(function (t) {
    try {
      if (filter) t.resource.addFilterGroup(key, filter);
      else if (t.resource.removeFilterGroup) t.resource.removeFilterGroup(key);
      t.resource.setPage && t.resource.setPage(1);
      t.resource.refresh && t.resource.refresh();
    } catch (e) {}
  });
}

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function Comp() {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(ctx.model.__sel != null ? ctx.model.__sel : null);

  useEffect(function () {
    (async function () {
      try {
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: Number($p.limit) || 10, sort: ['-id'] } });
        setRows((res && res.data && res.data.data) || []);
      } catch (e) { setRows([]); }
    })();
  }, []);

  const choose = function (rec) {
    const next = sel != null && rec && String(sel) === String(rec.id) ? null : (rec ? rec.id : null);
    setSel(next);
    ctx.model.__sel = next; // survive remounts
    if (next == null) applyFilter(null);
    else { const f = {}; f[$p.targetField] = { $eq: next }; applyFilter(f); }
  };

  if (rows == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;

  return (
    <div style={{ background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 8px' }}>
        <span style={{ fontWeight: 600, color: T.text, flex: 1 }}>{$p.label || $p.collection}</span>
        {sel != null ? (
          <a onClick={function () { choose(null); }} style={{ fontSize: 12, color: T.primary }}>✕ Clear</a>
        ) : (
          <span style={{ fontSize: 11, color: T.sub }}>click to filter</span>
        )}
      </div>
      {rows.map(function (r, i) {
        const active = sel != null && String(sel) === String(r.id);
        const title = $p.titleField ? r[$p.titleField] : ('#' + r.id);
        const sub = $p.subtitleField ? r[$p.subtitleField] : null;
        return (
          <div
            key={r.id != null ? r.id : i}
            onClick={function () { choose(r); }}
            style={{
              padding: '8px 14px', cursor: 'pointer',
              borderLeft: active ? '3px solid ' + T.primary : '3px solid transparent',
              background: active ? T.card : 'transparent',
              borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.primary : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title == null || title === '' ? '—' : String(title)}
              </span>
              {active ? <span style={{ color: T.primary, fontSize: 12, marginLeft: 8 }}>✓</span> : null}
            </div>
            {sub != null && sub !== '' ? (
              <div style={{ fontSize: 11.5, color: T.sub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(sub)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<Comp />);
```
