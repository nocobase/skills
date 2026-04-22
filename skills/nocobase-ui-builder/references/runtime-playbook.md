# Runtime Playbook

This file provides the family / locator / write-target mental model for the skill.

Start with [local-edit-quick.md](./local-edit-quick.md) when the request looks like a normal localized edit and you only need the default route first. Come here when the family / locator model itself is the blocker.

Canonical front door is `nocobase-ctl`. The operation names below are the stable runtime families; discover the exact generated command shape through `nocobase-ctl flow-surfaces --help`.

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

- menu question -> `nocobase-ctl desktop-routes list-accessible`
- normal page/popup inspection -> `nocobase-ctl flow-surfaces get`
- richer public surface snapshot -> `nocobase-ctl flow-surfaces describe-surface`
- capability uncertainty -> `nocobase-ctl flow-surfaces catalog`
- reaction-capability uncertainty -> `nocobase-ctl flow-surfaces get-reaction-meta`
- context-variable uncertainty -> `nocobase-ctl flow-surfaces context` as lower-level supplement

## 3. Default Write Routing

| user intent | default write path |
| --- | --- |
| create one whole page | `nocobase-ctl flow-surfaces apply-blueprint` |
| replace/rebuild one whole page | `nocobase-ctl flow-surfaces apply-blueprint` |
| whole-page interaction / reaction authoring | `nocobase-ctl flow-surfaces apply-blueprint` |
| create/move menu only | `nocobase-ctl flow-surfaces create-menu` / `update-menu` |
| add/update content under an existing surface | `nocobase-ctl flow-surfaces compose` / `add-*` / `configure` / `update-settings` |
| edit content under an existing template reference | `get` current target -> resolve [templates.md](./templates.md) routing -> template source write, host-local config write, popup-template switch, or explicit `convert-template-to-copy` |
| replace existing instance-level event flows | `nocobase-ctl flow-surfaces set-event-flows` |
| localized reaction edit | `nocobase-ctl flow-surfaces get-reaction-meta` -> matching `set-*` rules |
| reorder/remove tab or popup tab | `nocobase-ctl flow-surfaces move-tab` / `remove-tab` / `move-popup-tab` / `remove-popup-tab` |
| reorder/remove node | `nocobase-ctl flow-surfaces move-node` / `remove-node` |
| initialize a menu item into a page | `nocobase-ctl flow-surfaces create-page` |

For whole-page create / replace, author from the draft blueprint first, then run the mandatory local prepare-write gate before the first remote write; the actual `apply-blueprint` body must be the returned `result.cliBody`.

## 4. Targeting Notes

- `create-menu(type="item")` returns pre-init ids. The item is not a write-ready page until `create-page(menuRouteId=...)` finishes.
- desktop-route `id` and `navigation.group.routeId` are navigation locators, not flow-surface `uid` values.
- after `create-page`, `apply-blueprint` create, or menu-tree discovery, normalize to `pageSchemaUid` first for page-level `get`.
- only after `get` / `describe-surface` / create responses return a live `uid` should that value feed `catalog`, `context`, `get-reaction-meta`, `compose`, `configure`, `add*`, or `remove*`.
- `applyBlueprint(mode="replace")` targets a page by `target.pageSchemaUid`, not by patch-style change selectors.
- public `applyBlueprint` is key-oriented and structure-first: layout and in-document targeting use local `key`, whole-page interaction logic may live only in top-level `reaction.items[]`, and you must not author `uid`, `ref`, or `$ref` selectors there.
- public `applyBlueprint.reaction.items[]` also uses same-run local keys / bind keys, not live uids.
- After low-level writes return uids for new tabs/popups/nodes, reuse those uids directly for downstream steps.
- Do not invent `"root"` as a flow-surfaces uid. If a low-level tool needs `target.uid` / `locator.uid`, first obtain a real uid from `get`, `describe-surface`, or a previous create response.

## 5. Practical Rules

- If the request sounds like a **whole page**, route to page blueprint authoring first.
- If the request sounds like **change one part of an existing page**, route to low-level APIs.
- If a localized edit hits an existing template reference, route through [templates.md](./templates.md) before writing: template-owned edits default to the template source, host/openView config stays local, page-scoped wording alone does not justify `copy`, and unresolved scope should be clarified instead of auto-detaching.
- If the request is about an existing target's event flow or `Execute JavaScript` step, route to `get` / `describe-surface` readback first, then `set-event-flows` with the full `flowRegistry`.
- If the request is about default values, linkage, computed fields, show/hide, required/disabled, or action state, route to reaction authoring before considering raw configure keys.
- For localized reaction work, do not start from `context`; start from `get-reaction-meta` and use `context` only when raw variable paths are still missing.
- If the request crosses families or the target is not unique, narrow the target before writing.
