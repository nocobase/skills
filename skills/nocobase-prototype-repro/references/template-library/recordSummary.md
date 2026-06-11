# `recordSummary` — Record summary

Show the current record’s fields as a key/value card (popup / form)

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | The popup record’s collection — used to populate the field picker |
| `fields` | fields |  |  | coll←collection |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `title` | text |  |  |  |
| `columns` | select |  | `1` | opts: 1/2 |
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

const { Descriptions, Empty, Spin } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function show(rec, name) {
  const v = rec ? rec[name] : undefined;
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Comp() {
  const [rec, setRec] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(function () {
    (async function () {
      const rec = await __resolveRecord();
      setRec(rec);
      setReady(true);
    })();
  }, []);

  if (!ready) return <Spin />;
  if (!rec) return <Empty description="No record" />;

  let names = $p.fields && $p.fields.length ? $p.fields : null;
  if (!names) {
    names = Object.keys(rec).filter(function (k) {
      return k !== 'createdAt' && k !== 'updatedAt' && k !== 'createdById' && k !== 'updatedById';
    });
  }

  return (
    <div style={{ background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, padding: 12 }}>
      {$p.title ? <div style={{ fontWeight: 600, color: T.text, marginBottom: 8 }}>{$p.title}</div> : null}
      <Descriptions column={$p.columns || 1} size="small" bordered>
        {names.map(function (f) {
          return <Descriptions.Item key={f} label={f}>{show(rec, f)}</Descriptions.Item>;
        })}
      </Descriptions>
    </div>
  );
}

ctx.render(<Comp />);
```
