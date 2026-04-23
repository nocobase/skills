# Value-return RunJS

Use this surface when RunJS must compute a value instead of performing side effects. Typical hosts are field/default/copy rules with `value.source = "runjs"` and custom variables under `variables[].runjs`.

## Contract

- Editor scene is usually `formValue`; `customVariable` currently reuses `eventFlow`, but the runtime contract is still value-return.
- Writeback path in this skill: `value.source="runjs"` or `variables[].runjs`
- Validation style: value-return
- A top-level `return` is required.
- `ctx.render(...)` is forbidden on this surface.
- Final payload rules still live in [../reaction.md](../reaction.md).

## Minimal examples

First-hop safe snippets:

- [value-return/subtotal](../js-snippets/safe/value-return/subtotal.md)
- [value-return/total-with-tax](../js-snippets/safe/value-return/total-with-tax.md)
- [value-return/copy-single-field](../js-snippets/safe/value-return/copy-single-field.md)

Example A:

```js
const amount = Number(ctx.formValues?.amount || 0);
return amount;
```

Example B:

```js
const amount = Number(ctx.formValues?.amount || 0);
const taxRate = Number(ctx.formValues?.taxRate || 0);
return amount + amount * taxRate;
```

The bundled product snapshot and local validator both reinforce the same rule: use a top-level `return` to output the value.

## What to open next

- `ctx.*` lookup -> [../js-reference-index.md](../js-reference-index.md)
- Field/default/linkage payload rules -> [../reaction.md](../reaction.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
