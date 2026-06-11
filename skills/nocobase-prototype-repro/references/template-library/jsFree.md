# `jsFree` — Custom JS

Free-form JavaScript — starts from a working skeleton

**kind** `block` · alsoKinds: item · **scope** `any` · **category** Custom · **rawCode**

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `code` | code | ✓ | `const { Card } = ctx.antd;
const { useState, useEffect } = ctx.React;

function MyBlock() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      // ctx.initResource('MultiRecordResource');
      // ctx.resource.setResourceName('your_collection');
      // await ctx.resource.refresh();
      // setRows(ctx.resource.getData() || []);
    })();
  }, []);

  return (
    <Card size="small" title="Custom JS block">
      Edit me — {rows.length} rows loaded.
    </Card>
  );
}

ctx.render(<MyBlock />);` | Runs in the page sandbox: ctx.api / ctx.resource / ctx.render / ctx.antd / ctx.React |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
/* unused — rawCode */
```
