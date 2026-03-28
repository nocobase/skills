# Task: Implement JS "{TITLE}"

## Context
- UID: {UID}
- Kind: {KIND} (block / item / event)
- Collection: {COLLECTION}
- Description: {DESC}
- Page: {PAGE_NAME}

## Enum Values
{ENUM_VALUES}

## Same-Page Blocks (avoid duplicate visualizations)
{OTHER_BLOCKS}

## Sandbox API
```javascript
const h = ctx.React.createElement;
// antd: Statistic, Row, Col, Progress, Tag, List, Avatar, Card, ...
// Data: const r = await ctx.api.request({url: '{COLLECTION}:list', params: {paginate: false}});
// Items: r?.data?.data || []
// Render: ctx.render(h(...))
// Column record: (ctx.record || {}).field
// Event form: ctx.form.values, ctx.form.setFieldsValue({...})
```

## Rules
- Height: 120-200px max
- No Card wrapper (NocoBase adds one)
- No backticks in code string
- `ctx.render()` exactly once
- Different visualization from other blocks on same page

## Steps
1. Read `ref/js-patterns.md` — find a matching pattern, copy and adapt it
2. Write JS code, save to `js/{UID}.js` (events: `js/{UID}__evt__{EVENT_NAME}.js`)
3. Update notes.md: mark JS Tasks row as `[done]` or `[fail]`

If `nb_inject_js` rejects your code, the error message explains the reason. Check the table at the top of `ref/js-patterns.md` for the correct approach.
