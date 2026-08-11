# NocoBase Runtime

Use the current Portal project as the source of truth because template APIs can evolve. Inspect existing providers and examples before relying on a symbol or file path.

## Data and API

- Confirm collection names, fields, associations, option values, primary keys, and actions from real metadata or responses.
- When the CLI exposes it, inspect available API documents with `nb api swagger list -j`, then fetch the narrowest useful contract with commands such as `nb api swagger get --namespace collections/orders -j` or `nb api swagger get --namespace plugins/ai -j`.
- Fetch the complete document with `nb api swagger get -j` only for genuinely cross-cutting work; avoid loading the full schema for a single collection or plugin.
- If a server-backed feature has no reliable implementation example in the current project, Swagger discovery is mandatory before implementation. Confirm that the relevant path and operation exist and inspect its parameters, request body, response schema, and permission-related description before deciding the feature is feasible.
- If the required operation is not present in the available Swagger namespaces, do not invent a route or infer support from a similarly named API. Report the missing contract and determine whether the task needs a backend or plugin change.
- If `nb api swagger` is unavailable, report the missing CLI capability. Continue from project code or generated commands only when a reliable existing implementation already establishes the contract; without such an example, do not claim feasibility until Swagger can be read. Do not replace the authenticated CLI path with an ad hoc unauthenticated curl command.
- If the API documentation plugin is disabled, tell the user it must be enabled; do not enable it implicitly.
- Prefer the existing Refine data provider for standard list, get, create, update, and delete behavior.
- Use the existing NocoBase client for custom actions instead of creating another HTTP client.
- Preserve data-source metadata, pagination, filters, sorters, appends, and record-level allowed actions supported by the existing provider.
- Do not hard-code development servers, credentials, tokens, user identities, or speculative response shapes.
- Handle pending, empty, error, validation, unauthorized, and success states explicitly.

Swagger confirms paths, methods, parameters, request bodies, and responses. Collection metadata remains the source for field meaning, associations, option labels and values, and UI behavior. Reconcile both when implementing a business feature; do not assume either one alone defines the complete product model.

If the required backend collection or field does not exist, use `nocobase-data-modeling`; do not emulate persistent business data in local state.

## Aggregation and charts

Use the collection `query` action for KPIs, charts, grouped summaries, and other server-scale aggregation. Do not fetch an entire `list` result and aggregate it in the browser. When no reliable example exists, confirm the collection fields and `query` operation in metadata and Swagger before implementation.

Test the aggregation contract with the CLI first:

```bash
# One KPI: total order count
nb api resource query \
  --resource orders \
  --measures '[{"field":["id"],"aggregation":"count","alias":"order_count"}]'

# Grouped chart: order count by status
nb api resource query \
  --resource orders \
  --measures '[{"field":["id"],"aggregation":"count","alias":"order_count"}]' \
  --dimensions '[{"field":["status"],"alias":"status"}]' \
  --orders '[{"field":["status"],"alias":"status","order":"asc"}]'
```

The action is `POST /<resource>:query`. Its payload can include `measures`, `dimensions`, `orders`, `filter`, `having`, `limit`, `offset`, and `timezone`. Use `aggregation` for measure functions and `order` for sort direction; prefer array field paths such as `["owner", "nickname"]`. Give measures and dimensions stable aliases, especially when output, ordering, or `having` refers to them. Pass timezone through the existing client's `x-timezone` convention and non-main data sources through `x-data-source`.

After the CLI result is correct, implement the same request through the Portal's existing NocoBase client. Server ACL still applies. If grouped totals look suspicious, verify filters, joins, aliases, timezone boundaries, and totals against a focused query before rendering the chart.

## Authentication and identity

- Reuse the Portal authentication provider and NocoBase token storage conventions.
- Preserve session sharing behavior across the main application and sub-app paths.
- Reuse dynamic authentication adapters when the login page supports them.
- Customize one authenticator through its adapter boundary, or replace the complete login composition while preserving the runtime contract.
- Never store real credentials in source or add a parallel token store.

## ACL and roles

- Use the existing ACL store/provider and access components.
- Use the existing role hook when the UI needs current effective roles.
- Do not treat roles as a substitute for resource/action permission evaluation.
- Consume record-level allowed actions returned through the data layer for row controls.
- Coordinate server policy changes through `nocobase-acl-manage`.

## System settings and i18n

- Reuse the shared System Settings bootstrap and existing i18n runtime.
- Put application copy into the project's locale resources. For a complete system build, provide at least the Portal's supported source locales instead of leaving user-facing business copy scattered as JSX literals.
- Use consistent business terminology in menus, titles, buttons, empty states, errors, and confirmations.
- Do not initialize a second i18next instance inside a feature.

Follow the current template's registration pattern. Application-owned translations normally live in `src/locales/en-US.ts` and `src/locales/zh-CN.ts`, with `src/locales/index.ts` registering the namespace. Keep stable, semantic keys in both bundles:

```ts
// src/locales/en-US.ts
export const starter = {
  "crm.customers.title": "Customers",
  "crm.customers.empty": "No customers yet",
} as const;

// src/locales/zh-CN.ts
export const starter = {
  "crm.customers.title": "客户",
  "crm.customers.empty": "暂无客户",
} as const;
```

Use Refine's existing translator in components and include a readable fallback:

```tsx
const translate = useTranslate();

return (
  <h1>
    {translate("crm.customers.title", { ns: "starter" }, "Customers")}
  </h1>
);
```

Localize resource navigation through route metadata so the menu and page use the same term:

```tsx
resource: {
  meta: {
    label: "Customers",
    i18nKey: "crm.customers.title",
    i18nOptions: { ns: "starter" },
  },
}
```

Follow an installed extension's own namespace when editing or wrapping that extension; do not move its keys into `starter`. Localize menu labels, page titles, field labels, actions, validation, empty/error states, confirmations, notifications, and AI entry/result copy. Keep identifiers, API field names, option values, and route paths out of translation resources.

## Portal base and assets

- Use the project's Portal basename/runtime configuration for route construction.
- Ensure routes work when mounted below paths such as `/x/<portal>` or an app-specific subpath.
- Use the existing asset URL helper for images and static files that must respect the deployment base.
- Test direct navigation and refresh under the actual basename; root-only development is insufficient evidence.
