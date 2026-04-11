# Runtime Playbook

This file provides the family / locator / write-target mental model for the skill.

## 1. Common Families

- `menu-group`: a menu group in the left navigation
- `menu-item`: a page entry in the left navigation
- `page`: the route-backed page root
- `outer-tab`: a route-backed tab under a page
- `route-content`: the block grid inside an outer tab
- `popup-page`: popup root page
- `popup-tab`: popup child tab
- `popup-content`: popup grid/content area
- `node`: a normal block / field / action node

## 2. Default Read Routing

- menu question -> `desktop_routes_list_accessible(tree=true)`
- normal page/popup inspection -> `get`
- richer public surface snapshot -> `describeSurface`
- capability uncertainty -> `catalog`
- context-variable uncertainty -> `context`

## 3. Default Write Routing

| user intent | default write path |
| --- | --- |
| create one whole page | `executeDsl(mode="create")` |
| replace/rebuild one whole page | `executeDsl(mode="replace")` |
| create/move menu only | `createMenu` / `updateMenu` |
| add/update content under an existing surface | `compose` / `add*` / `configure` / `updateSettings` |
| reorder/remove tab or popup tab | `moveTab` / `removeTab` / `movePopupTab` / `removePopupTab` |
| reorder/remove node | `moveNode` / `removeNode` |
| initialize a menu item into a page | `createPage(menuRouteId=...)` |

## 4. Targeting Notes

- `createMenu(type="item")` returns pre-init ids. The item is not a write-ready page until `createPage(menuRouteId=...)` finishes.
- `executeDsl(mode="replace")` targets a page by `target.pageSchemaUid`, not by patch-style change selectors.
- public `executeDsl` is structure-only: layout and in-document targeting use local `key`; do not author `uid`, `ref`, or `$ref` selectors there.
- After low-level writes return uids for new tabs/popups/nodes, reuse those uids directly for downstream steps.

## 5. Practical Rules

- If the request sounds like a **whole page**, route to page DSL authoring first.
- If the request sounds like **change one part of an existing page**, route to low-level APIs.
- If the request crosses families or the target is not unique, narrow the target before writing.
