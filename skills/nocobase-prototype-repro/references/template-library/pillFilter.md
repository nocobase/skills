# `pillFilter` — Button filter group

Pill buttons from a field’s options that filter the table

**kind** `action` · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `field` | field | ✓ |  | accepts enum, A select/enum field of this table — buttons come from its options |
| `multiple` | boolean |  | `false` |  |
| `allLabel` | text |  | `All` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState } = ctx.React;

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const FILTER_KEY = 'jsTplPillFilter:' + $p.field;
const COLOR = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d' };

function PillFilter() {
  const multi = !!$p.multiple;
  // survive remounts (the toolbar remounts on each table refresh)
  const [sel, setSel] = useState(ctx.model.__pillSel != null ? ctx.model.__pillSel : (multi ? [] : '__all__'));

  function push(values) {
    if (!ctx.resource) return;
    if (!values.length) {
      ctx.resource.removeFilterGroup && ctx.resource.removeFilterGroup(FILTER_KEY);
    } else {
      var flt = {};
      flt[$p.field] = values.length === 1 ? { $eq: values[0] } : { $in: values };
      ctx.resource.addFilterGroup && ctx.resource.addFilterGroup(FILTER_KEY, flt);
    }
    ctx.resource.setPage && ctx.resource.setPage(1);
    ctx.resource.refresh && ctx.resource.refresh();
  }

  const apply = function (next) {
    if (multi) {
      let arr;
      if (next === '__all__') arr = [];
      else {
        const cur = Array.isArray(sel) ? sel : [];
        arr = cur.indexOf(next) >= 0 ? cur.filter(function (v) { return v !== next; }) : cur.concat([next]);
      }
      setSel(arr); ctx.model.__pillSel = arr;
      push(arr);
      return;
    }
    setSel(next);
    ctx.model.__pillSel = next;
    push(next === '__all__' ? [] : [next]);
  };

  const pills = [{ value: '__all__', label: $p.allLabel || 'All', color: null }].concat(enumOpts);

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {pills.map(function (o) {
        const active = multi
          ? (o.value === '__all__' ? (Array.isArray(sel) && sel.length === 0) : Array.isArray(sel) && sel.indexOf(o.value) >= 0)
          : sel === o.value;
        const accent = (o.color && COLOR[o.color]) || '#1677ff';
        return (
          <span
            key={String(o.value)}
            onClick={function () { apply(o.value); }}
            style={{
              cursor: 'pointer', padding: '2px 12px', borderRadius: 14, fontSize: 12, userSelect: 'none',
              border: '1px solid ' + (active ? accent : '#d9d9d9'),
              background: active ? accent : '#fff',
              color: active ? '#fff' : 'rgba(0,0,0,0.72)',
            }}
          >
            {o.label || String(o.value)}
          </span>
        );
      })}
    </span>
  );
}

ctx.render(<PillFilter />);
```
