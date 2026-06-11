# `treeFilter` — Tree filter

A side tree of a field’s options that filters a target block

**kind** `block` · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targetUid` | targetBlock | ✓ |  |  |
| `field` | field | ✓ |  | coll←target:targetUid, A field of the target block’s collection; its options become tree n |
| `title` | text |  |  |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Tree, Empty } = ctx.antd;
const { useState, useEffect } = ctx.React;

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const FILTER_KEY = 'jsTplTreeFilter:' + (ctx.model && ctx.model.uid);

function target() { return $p.targetUid ? ctx.getModel($p.targetUid) : null; }

function applyValue(v) {
  const t = target();
  if (!t || !t.resource) { ctx.message && ctx.message.warning('Target block not found'); return; }
  if (v == null || v === '__all__') {
    t.resource.removeFilterGroup && t.resource.removeFilterGroup(FILTER_KEY);
  } else {
    var flt = {}; flt[$p.field] = { $eq: v };
    t.resource.addFilterGroup && t.resource.addFilterGroup(FILTER_KEY, flt);
  }
  t.resource.setPage && t.resource.setPage(1);
  t.resource.refresh && t.resource.refresh();
}

function TreeFilter() {
  // options: prefer the field's native enum; otherwise build from live distinct values
  const [nodes, setNodes] = useState(enumOpts.length ? enumOpts.map(function (o) { return { title: o.label || String(o.value), key: String(o.value) }; }) : null);
  useEffect(function () {
    if (nodes != null) return;
    (async function () {
      try {
        const t = target();
        const coll = t && t.collection && t.collection.name;
        if (!coll) { setNodes([]); return; }
        const res = await ctx.api.request({ url: coll + ':list', params: { pageSize: 200, fields: [$p.field] } });
        const rows = (res && res.data && res.data.data) || [];
        const seen = {};
        rows.forEach(function (r) { const v = r[$p.field]; if (v != null && v !== '') seen[String(v)] = true; });
        setNodes(Object.keys(seen).sort().map(function (v) { return { title: v, key: v }; }));
      } catch (e) { setNodes([]); }
    })();
  }, []);

  if (nodes == null) return <div style={{ padding: 12, color: '#999' }}>Loading…</div>;
  if (!nodes.length) return <Empty description="No options" />;

  const data = [{ title: '📂 ' + ($p.title || 'All'), key: '__all__', children: nodes }];

  return (
    <div style={{ padding: '8px 4px' }}>
      <Tree
        defaultExpandAll
        blockNode
        selectable
        treeData={data}
        onSelect={function (keys) { applyValue(keys && keys.length ? keys[0] : '__all__'); }}
      />
    </div>
  );
}

ctx.render(<TreeFilter />);
```
