# JS Block

## Introduction

The JS Block is a highly flexible "custom rendering block" that allows you to write JavaScript directly to generate interfaces, bind events, call data APIs, or integrate third-party libraries. It is suitable for personalized visualizations, temporary experiments, and lightweight extension scenarios that are difficult to cover with built-in blocks.

> Local skill note: treat this page as a product/runtime reference. Validate final code with [js.md](../../../../js.md) and [runjs-runtime.md](../../../../runjs-runtime.md). Under this skill, do not emit direct `ctx.openView(...)` as the final answer; prefer popup actions, field popups, or event flows outside the JS snippet.

## Runtime Context API

The JS Block's runtime context has common capabilities injected and can be used directly:

- `ctx.element`: The DOM container of the block (safely wrapped as ElementProxy), supporting `innerHTML`, `querySelector`, `addEventListener`, etc.
- `ctx.request(options)` / `ctx.api.request(options)`: Send HTTP requests. Under skill-mode, prefer full `http/https` URLs.
- `ctx.requireAsync(url)`: Asynchronously loads an AMD/UMD library by URL.
- `ctx.importAsync(url)`: Dynamically imports an ESM module by URL.
- `ctx.openView`: Opens a configured view (popup/drawer/page) in the product runtime, but this skill does not accept direct `ctx.openView(...)` as final output.
- `ctx.initResource(...)` + `ctx.resource` or `ctx.makeResource(...)`: Access data as a resource.
- `ctx.i18n.t()` / `ctx.t()`: Built-in internationalization capability.
- `ctx.onRefReady(ctx.ref, cb)`: Renders after the container is ready to avoid timing issues.
- `ctx.libs.React` / `ctx.libs.ReactDOM` / `ctx.libs.antd` / `ctx.libs.antdIcons` / `ctx.libs.dayjs` / `ctx.libs.lodash` / `ctx.libs.math` / `ctx.libs.formula`: Built-in React, ReactDOM, Ant Design, Ant Design icons, dayjs, lodash, math.js, and formula.js libraries for JSX rendering, date-time utilities, data manipulation, and mathematical operations. (`ctx.React` / `ctx.ReactDOM` / `ctx.antd` are kept for compatibility.)
- `ctx.render(vnode)`: Renders a React element, HTML string, or DOM node to the default container `ctx.element`. Multiple calls will reuse the same React Root and overwrite the container's existing content.

## Adding a Block

You can add a JS Block to a page or a popup.

![jsblock-add-20251029](https://static-docs.nocobase.com/jsblock-add-20251029.png)


## Editor and Snippets

The JS Block's script editor supports syntax highlighting, error hints, and built-in code snippets (Snippets), allowing you to quickly insert common examples such as rendering charts, binding button events, loading external libraries, rendering React/Vue components, timelines, information cards, etc.

- `Snippets`: Opens the list of built-in code snippets. You can search and insert a selected snippet into the code editor at the current cursor position with one click.
- `Run`: Directly runs the code in the current editor and outputs the execution logs to the `Logs` panel at the bottom. It supports displaying `console.log/info/warn/error`, and errors will be highlighted with links to the specific row and column.


![jsblock-toolbars-20251029](https://static-docs.nocobase.com/jsblock-toolbars-20251029.png)


Additionally, the product UI can invoke the built-in AI employee to help draft or revise scripts. That product page is not included in this local snapshot.

## Runtime Environment and Security

- **Container**: The system provides a secure DOM container `ctx.element` (ElementProxy) for the script, which only affects the current block and does not interfere with other areas of the page.
- **Sandbox**: The script runs in a controlled environment. `window`/`document`/`navigator` use secure proxy objects, allowing common APIs while restricting risky behaviors.
- **Re-rendering**: The block automatically re-renders when it is hidden and then shown again (to avoid re-executing the initial mount script).

## Common Usage (Simplified Examples)

### 1) Render React (JSX)

```js
const { Button } = ctx.libs.antd;
ctx.render(
  <div style={{ padding: 12 }}>
    <Button type="primary" onClick={() => ctx.message.success(ctx.t('Clicked!'))}>
      {ctx.t('Click')}
    </Button>
  </div>
);
```

### 2) API Request Template

```js
const resp = await ctx.request({
  url: 'https://jsonplaceholder.typicode.com/users?_limit=10',
  method: 'get',
});
const rows = Array.isArray(resp?.data) ? resp.data : [];
ctx.render(
  <div style={{ padding: 12 }}>
    <div style={{ fontWeight: 600, marginBottom: 8 }}>{ctx.t('Fetched users')}</div>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(rows.slice(0, 3), null, 2)}
    </pre>
  </div>
);
```

### 3) Load ECharts and Render

```js
const echarts = await ctx.requireAsync('https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js');
if (!echarts) throw new Error('ECharts not loaded');

function ChartView() {
  const ref = ctx.libs.React.useRef(null);

  ctx.libs.React.useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      title: { text: ctx.t('ECharts') },
      xAxis: {},
      yAxis: {},
      series: [{ type: 'bar', data: [5, 12, 9] }],
    });
    chart.resize();
    return () => chart.dispose();
  }, []);

  return <div ref={ref} style={{ height: 360, width: '100%' }} />;
}

ctx.render(<ChartView />);
```

### 4) Skill-mode Feedback

```js
const { Button } = ctx.libs.antd;

function FeedbackBlock() {
  return (
    <Button
      type="primary"
      onClick={() => ctx.message.success(ctx.t('Finished'))}
    >
      {ctx.t('Run action')}
    </Button>
  );
}

ctx.render(<FeedbackBlock />);
```

### 5) Load Data through a Resource

```js
ctx.initResource('APIResource');
ctx.resource.setURL('https://jsonplaceholder.typicode.com/users/1');
await ctx.resource.refresh();
ctx.render(
  <pre style={{ padding: 12, background: '#f5f5f5', borderRadius: 6, margin: 0 }}>
    {JSON.stringify(ctx.resource.getData(), null, 2)}
  </pre>
);
```

## Notes

- It is recommended to use trusted CDNs for loading external libraries.
- **Selector Usage Advice**: Prioritize using `class` or `[name=...]` attribute selectors. Avoid using fixed `id`s to prevent conflicts from duplicate `id`s when using multiple blocks or popups.
- **Event Cleanup**: Since the block may re-render multiple times, event listeners should be cleaned up or deduplicated before binding to avoid repeated triggers. You can use a "remove then add" approach, a one-time listener, or a flag to prevent duplicates.

## Related Documents

- [Variables and Context](../../variables.md)
- [Linkage Rule](../../linkage-rule.md)
- [ctx.openView() runtime reference](../../../runjs/context/open-view.md)
