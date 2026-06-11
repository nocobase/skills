# `quickFilter` — Quick filter

A dropdown in the toolbar that filters the table by a field’s options

**kind** `action` · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `field` | field | ✓ |  | accepts enum, A select/enum field of this table — options come from the field itself |
| `allLabel` | text |  | `All` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Select } = ctx.antd;
const { useState } = ctx.React;

// options captured from the field's native enum config at insert time
const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const FILTER_KEY = 'jsTplQuickFilter:' + $p.field;

function getInitial() {
  try {
    const fg = ctx.resource && ctx.resource.filterGroups && ctx.resource.filterGroups.get && ctx.resource.filterGroups.get(FILTER_KEY);
    const v = fg && fg[$p.field] && fg[$p.field].$eq;
    if (v != null) return v;
  } catch (e) {}
  return '__all__';
}

function QuickFilter() {
  const [val, setVal] = useState(getInitial);
  const apply = function (next) {
    setVal(next);
    if (!ctx.resource) return;
    if (next === '__all__') {
      ctx.resource.removeFilterGroup && ctx.resource.removeFilterGroup(FILTER_KEY);
    } else {
      var flt = {}; flt[$p.field] = { $eq: next };
      ctx.resource.addFilterGroup && ctx.resource.addFilterGroup(FILTER_KEY, flt);
    }
    ctx.resource.setPage && ctx.resource.setPage(1);
    ctx.resource.refresh && ctx.resource.refresh();
  };
  const options = [{ value: '__all__', label: $p.allLabel || 'All' }].concat(
    enumOpts.map(function (o) { return { value: o.value, label: o.label || String(o.value) }; })
  );
  return <Select size="small" style={{ minWidth: 130 }} value={val} onChange={apply} options={options} />;
}

ctx.render(<QuickFilter />);
```
