# `card` — Card list

A card grid built from a collection’s fields

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `titleField` | field |  |  | coll←collection |
| `fields` | fields |  |  | coll←collection |
| `pageSize` | number |  | `12` |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Card, Row, Col, Empty } = ctx.antd;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function show(rec, name) {
  const v = rec ? rec[name] : undefined;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName($p.collection);
ctx.resource.setPageSize($p.pageSize || 12);
await ctx.resource.refresh();
const rows = ctx.resource.getData() || [];

ctx.render(
  <div style={{ padding: 12, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
    {rows.length
      ? <Row gutter={[16, 16]}>
          {rows.map(function (rec, i) {
            return (
              <Col key={i} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  title={$p.titleField ? show(rec, $p.titleField) : ('#' + (rec.id != null ? rec.id : i))}
                  style={{ background: T.card, border: '1px solid ' + T.border }}
                  styles={{ header: { color: T.text, borderBottom: '1px solid ' + T.border }, body: { color: T.text } }}
                >
                  {($p.fields || []).map(function (f) {
                    return (
                      <div key={f} style={{ fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: T.sub }}>{f}: </span>{show(rec, f)}
                      </div>
                    );
                  })}
                </Card>
              </Col>
            );
          })}
        </Row>
      : <Empty />}
  </div>
);
```
