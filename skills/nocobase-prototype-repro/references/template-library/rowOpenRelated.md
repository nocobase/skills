# `rowOpenRelated` — Open related

A row button that opens a drawer listing related records

**kind** `action` · **scope** `record` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled from context when possible |
| `relation` | association | ✓ |  | coll←collection, A to-many relation defined on this collection |
| `label` | text |  | `Related` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Button, List, Spin, Empty } = ctx.antd;
const { useState, useEffect } = ctx.React;

function RelatedDrawer(props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  useEffect(function () {
    let alive = true;
    // native association resource — no foreign-key knowledge needed
    ctx.api.request({ url: $p.relation.source + '/' + props.recordId + '/' + $p.relation.name + ':list', params: { pageSize: 200 } })
      .then(function (res) { if (!alive) return; setRows((res && res.data && res.data.data) || []); setLoading(false); })
      .catch(function (e) { if (!alive) return; setErr((e && e.message) || 'Load failed'); setLoading(false); });
    return function () { alive = false; };
  }, [props.recordId]);

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
  if (err) return <div style={{ padding: 24, color: '#cf1322' }}>{err}</div>;
  if (!rows.length) return <Empty description="No related records" />;

  const titleOf = function (r) {
    const tf = $p.relation && $p.relation.titleField;
    if (tf && r[tf] != null) return String(r[tf]);
    return '#' + (r.id != null ? r.id : '');
  };
  return <List size="small" bordered dataSource={rows} renderItem={function (r) { return <List.Item key={r.id}>{titleOf(r)}</List.Item>; }} />;
}

function OpenRelatedBtn() {
  function open() {
    const rec = ctx.record || {};
    if (rec.id == null) { ctx.message && ctx.message.error('No record id'); return; }
    if (!$p.relation) { ctx.message && ctx.message.error('Relation not configured'); return; }
    ctx.viewer.drawer({ title: ($p.label || 'Related') + (($p.relation && $p.relation.label) ? ' · ' + $p.relation.label : ''), width: '56%', content: <RelatedDrawer recordId={rec.id} /> });
  }
  return <Button type="link" onClick={open}>{$p.label || 'Related'}</Button>;
}

ctx.render(<OpenRelatedBtn />);
```
