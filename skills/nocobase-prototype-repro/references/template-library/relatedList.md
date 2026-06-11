# `relatedList` — Related list

List records of one of this record’s relations (popup / form)

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | The popup record’s collection |
| `relation` | association | ✓ |  | coll←collection, A to-many relation defined on this collection |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `limit` | number |  | `10` |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
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

const { List, Empty, Spin, Typography } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function label(rec) {
  const tf = $p.relation && $p.relation.titleField;
  if (tf && rec[tf] != null && rec[tf] !== '') {
    const v = rec[tf];
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return '#' + (rec.id != null ? rec.id : '');
}

function Comp() {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(function () {
    (async function () {
      try {
        const rec = await __resolveRecord();
        const id = rec && rec.id;
        if (id == null || !$p.relation) { setReady(true); return; }
        // native association resource — no foreign-key knowledge needed
        const res = await ctx.api.request({
          url: $p.relation.source + '/' + id + '/' + $p.relation.name + ':list',
          params: { pageSize: $p.limit || 10, sort: ['-id'] },
        });
        setRows((res && res.data && res.data.data) || []);
      } catch (e) {
        ctx.message && ctx.message.error('Load failed: ' + ((e && e.message) || e));
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <Spin />;
  if (!rows.length) return <Empty description="No related records" />;

  return (
    <div style={{ background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, padding: '4px 12px' }}>
      <List
        size="small"
        dataSource={rows}
        renderItem={function (rec) {
          return <List.Item key={rec.id}><RowClick rec={rec}><Typography.Text>{label(rec)}</Typography.Text></RowClick></List.Item>;
        }}
      />
    </div>
  );
}

ctx.render(<Comp />);
```
