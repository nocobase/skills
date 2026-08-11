# Routing and Access

## URL-first surfaces

Give every meaningful surface a stable route:

```text
/orders
/orders/create
/orders/:id
/orders/:id/edit
/orders/:id/refunds/:refundId
```

- A list-originated create, detail, or edit surface may render as a dialog or drawer.
- The same URL must remain meaningful when opened directly or refreshed.
- Browser Back and Forward must open and close the correct surface.
- Closing should return to the originating route when known and to a safe parent route otherwise.
- Model nested drawers and subpages as nested routes instead of local boolean state.
- Prefer the installed URL-backed route surface components. Wrap or re-export them from application code when customization is needed; do not fork their source by default.
- Preserve unsaved-change protection when navigation can discard edits.
- Treat the page that opens a child surface as its route host. Use relative child paths and navigation so opening shared create, edit, show, or related-record content does not switch to another resource page.
- Preserve the complete host URL, including search and hash, in navigation state. Use it for `closeTo` and fall back to the resolved parent route when the child URL was opened directly.

Do not use local `open` state as the only identity for a business detail, editor, or other shareable surface.

## Refine resource actions and presentation

`resourceAction` assigns a nested path to the parent Refine resource's `create`, `edit`, or `show` URL. It does not submit data, apply ACL, close navigation, or select a visual surface.

| Intended result | Required pattern |
|---|---|
| Keep the list and open an overlay | Use the default automatic resource outlet; the action element itself must render `RouteDrawer` or `RouteDialog`. |
| Replace the list with a full page | Set `outlet: "manual"` on the resource route and use an application-owned layout that renders or consumes `useOutlet()`. |
| Custom provider, boundary, or nested layer | Use `outlet: "manual"` and place the outlet at the required boundary. |

Never put a plain full-page form or detail component directly in an automatic `resourceAction` outlet; React Router will append it below the list. Inspect `src/extensions/nocobase-users-example/app-routes.tsx` and its create, edit, and show components for the canonical automatic drawer pattern. For surfaces opened from multiple hosts, inspect Scenario 6, **Contextual child routes**, under `/dev/route-surfaces` and the installed route-surfaces Resource Action Guide. Keep the action's `CanAccess`, close lifecycle, and unsaved-change guard with the route surface.

## Contextual child surfaces

Register one canonical `resourceAction` path for each resource action. Other hosts that open the same business surface own ordinary relative child routes and must not register duplicate `resourceAction` entries:

```tsx
{
  name: "customers",
  path: "/customers",
  element: <CustomerList />,
  resource: { meta: { label: "Customers" } },
  children: [
    {
      name: "customers.edit",
      path: "edit/:id",
      resourceAction: "edit",
      element: <CustomerEditRoute returnTo="list" />,
    },
    {
      name: "customers.show",
      path: "show/:id",
      resourceAction: "show",
      element: <CustomerShowRoute />,
      children: [
        {
          name: "customers.show.edit",
          path: "edit",
          element: <CustomerEditRoute returnTo="show" />,
        },
      ],
    },
  ],
}
```

- From the list, open `edit/:id` or `show/:id` relative to the list host.
- From `CustomerShowRoute`, open `edit` relative to the detail host. Reuse the editor content, but keep the detail route mounted behind it.
- A routed drawer or dialog that owns deeper children must render `useOutlet()` and pass that node through its `nested` prop.
- When opening the child, store `pathname + search + hash` as the return URL in navigation state. Keep that return URL stable while deeper child routes mount.
- On close, prefer the stored return URL. If navigation state is absent after direct open or refresh, resolve the immediate safe parent route.
- Do not call a fixed helper such as `navigate("/customers/edit/42")` from another page merely because Refine exposes that canonical URL.

## Navigation

- Every visible leaf item must have a real route and renderable page.
- Every page intended for sidebar navigation must also declare a Refine `resource` with appropriate menu metadata; defining only `element` and `path` creates a reachable route, not a menu item.
- In a compatible Portal Template, define application-owned business routes once in `src/routes.tsx` with `defineAppRoutes`. Add a `resource` entry when the route belongs in Refine navigation, and mark only the canonical create, edit, or show children with `resourceAction`; let the route runtime derive both the Refine resource paths and React Router routes. Contextual duplicates under other hosts remain ordinary child routes.
- Put route-level role constraints in `access.roles`. Nested routes inherit parent constraints. Do not repeat the same roles in Resource metadata or a manually written route guard; the runtime applies the complete route access chain to menu visibility and direct URL access.
- Use a group only when it contains useful visible children.
- Never leave placeholder or empty groups in a production menu.
- Keep labels, icons, ordering, selected state, and collapsed behavior consistent.
- Build the menu around user tasks, not every backend collection.
- Filter inaccessible leaves and then remove groups with no remaining visible children.
- Compare the planned page inventory with the rendered sidebar for representative roles before completion; do not leave a primary workspace, dashboard, or business page discoverable only by manually entering its URL.
- When replacing the starter application, set `registryRoutesEnabled` to `false` in `src/routes.tsx`. This unregisters Registry-contributed main routes, Refine resources, and navigation while retaining installed extension source, providers, authentication adapters, and the `/dev` showcases. Define the real application's routes in the same file.

## Access-control layers

Design each layer explicitly:

| Layer | Expected frontend behavior |
|---|---|
| Navigation | Hide inaccessible menu entries and empty groups |
| Route | Block manually entered URLs and render a deliberate denied state or safe redirect |
| Page | Guard the complete page before protected data or actions render |
| Region | Do not render the denied region; keep unrelated allowed content visible |
| Action | Hide or disable each protected action according to the established product convention |
| Role | Use explicit role constraints only for genuinely role-specific experiences |
| Resource/action | Evaluate the NocoBase resource and action permission through the existing access runtime |
| Record | Respect allowed actions returned for each record |

Use the Portal's real access components and hooks, including its `CanAccess`-style boundary, page/region guards, resource/action evaluator, and effective-role hook. Inspect their current signatures rather than guessing props.

- Use `AclPage` only when denial applies to the complete page; provide a deliberate denied fallback.
- Use one `AclRegion` per independently protected panel, and do not start that panel's protected query when access is denied.
- Use `AclField` around the exact field or field group; choose hidden, read-only, or another safe fallback according to the workflow.
- Use `CanAccess` or the Portal's ACL-aware Create, Show, Edit, and Delete components for controls and record operations, including record identity when record-level permission applies.

The centralized route `access` field currently covers role constraints. Keep resource/action, region, field, and record checks in their dedicated ACL boundaries close to the protected query or UI.

Avoid scattered checks such as `role === "admin"`. Centralize access intent at navigation, route, page, region, and action boundaries.

Frontend access control improves navigation and prevents misleading interaction; it does not secure the API. NocoBase server ACL must reject unauthorized reads and writes even when a user constructs a request manually.

## Verification matrix

For protected work, verify at least:

- one allowed role;
- one denied role or permission state;
- direct URL access while denied;
- menu visibility after permissions load;
- unrelated page regions remaining intact;
- protected buttons and record actions;
- expired or missing authentication.
