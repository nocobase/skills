# Runtime Playbook

This file provides the family / locator / write-target mental model for the skill.

Start with [local-edit-quick.md](./local-edit-quick.md) when the request looks like a normal localized edit and you only need the default route first. Come here when the family / locator model itself is the blocker.

Agent-facing front door for flow-surfaces is `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs`. The operation names below are stable wrapper subcommands; discover wrapper usage with `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs <subcommand> --help`.

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

- menu question -> `nb api desktop-routes list-accessible`
- normal page/popup inspection -> wrapper `get`
- richer public surface snapshot -> wrapper `describe-surface`
- capability uncertainty -> wrapper `catalog`
- reaction-capability uncertainty -> wrapper `get-reaction-meta`
- context-variable uncertainty -> wrapper `context` as lower-level supplement

## 3. Default Write Routing

| user intent | default write path |
| --- | --- |
| create one whole page | wrapper `apply-blueprint` |
| replace/rebuild one whole page | wrapper `apply-blueprint` |
| whole-page interaction / reaction authoring | wrapper `apply-blueprint` |
| create/move menu only | wrapper `create-menu` / `update-menu` |
| add/update content under an existing surface | wrapper `compose` / `add-*` / `configure` / `update-settings` |
| replace one existing full grid layout | wrapper `set-layout` |
| edit content under an existing template reference | `get` current target -> resolve [templates.md](./templates.md) routing -> template source write, host-local config write, popup-template switch, or explicit `convert-template-to-copy` |
| replace existing instance-level event flows | wrapper `set-event-flows` |
| localized reaction edit | wrapper `get-reaction-meta` -> matching `set-*` rules |
| reorder/remove tab or popup tab | wrapper `move-tab` / `remove-tab` / `move-popup-tab` / `remove-popup-tab` |
| reorder/remove node | wrapper `move-node` / `remove-node` |
| initialize a menu item into a page | wrapper `create-page` |

For whole-page create / replace, author from the draft blueprint first, then run the mandatory local prepare-write gate before the first remote write; the actual `apply-blueprint` body must be the returned `result.cliBody`. A successful `apply-blueprint` response is the default stop point. Run follow-up `get` only when follow-up localized work or explicit inspection needs live structure. When that happens, use pageSchemaUid/live uids for the downstream localized work.

## 4. Targeting Notes

- `create-menu(type="item")` returns pre-init ids. The item is not a write-ready page until `create-page(menuRouteId=...)` finishes.
- desktop-route `id` and `navigation.group.routeId` are navigation locators, not flow-surface `uid` values.
- For precise localized edits from an admin URL, parse the URL into a start uid first. If the path contains any `view/<uid>` segments, the last `view/<uid>` wins; otherwise fallback to the `admin/<pageSchemaUid>` segment and read it with page-level `get --page-schema-uid`.
- A URL-sourced start uid is not the final content uid. After selecting it, continue normal live expansion with `get`, popup subtree / template-reference checks, and the localized write-family decision.
- Example: `/admin/<page>/view/<outerView>/filterbytk/1/view/<innerView>/filterbytk/1` starts from `<innerView>`, not `<outerView>`. The final editable content still comes from live tree and template routing.
- when follow-up reads are needed after `create-page`, `apply-blueprint` create, or menu-tree discovery, normalize to `pageSchemaUid` first for page-level `get`.
- only after `get` / `describe-surface` / create responses return a live `uid` should that value feed `catalog`, `context`, `get-reaction-meta`, `compose`, `configure`, `add*`, or `remove*`.
- `applyBlueprint(mode="replace")` targets a page by `target.pageSchemaUid`, not by patch-style change selectors.
- public `applyBlueprint` is key-oriented and structure-first: layout and in-document targeting use local `key`, whole-page interaction logic may live only in top-level `reaction.items[]`, and you must not author `uid`, `ref`, or `$ref` selectors there.
- public `applyBlueprint.reaction.items[]` also uses same-run local keys / bind keys, not live uids.
- low-level `set-layout` is different: `target.uid` is the live grid uid, `rows` is `Record<string, string[][]>`, each inner array stacks live child `uid`s inside one column cell, `[[uidA], [uidB]]` means two columns, and `[[uidA, uidB]]` means one stacked column.
- After low-level writes return uids for new tabs/popups/nodes, reuse those uids directly for downstream steps.
- Do not invent `"root"` as a flow-surfaces uid. If a low-level tool needs `target.uid` / `locator.uid`, first obtain a real uid from `get`, `describe-surface`, or a previous create response.

Artifact-only locator handoffs should use direct machine-readable fields, not only prose keys. `locator-map.json` should keep navigation, page, and live write targets as separate top-level branches:

```json
{
  "navigation": { "routeId": "route-id-placeholder" },
  "page": { "pageSchemaUid": "page-schema-placeholder" },
  "liveTargets": [
    { "role": "table", "uid": "live-target-uid-placeholder" }
  ]
}
```

Do not put `navigation.routeId` or `page.pageSchemaUid` only inside explanatory maps such as `locatorSemantics`; the direct fields are the contract future tooling can read. If the live uid is not known yet, use a non-empty placeholder that makes the missing readback explicit, then block downstream writes until real `liveTargets[].uid` values are read.

## 5. Practical Rules

- If the request sounds like a **whole page**, route to page blueprint authoring first.
- If the request sounds like **change one part of an existing page**, route to low-level APIs.
- If a localized edit hits an existing template reference, route through [templates.md](./templates.md) before writing: template-owned edits default to the template source, host/openView config stays local, page-scoped wording alone does not justify `copy`, and unresolved scope should be clarified instead of auto-detaching.
- If the request is about an existing target's event flow or `Execute JavaScript` step, route to `get` / `describe-surface` readback first, then `set-event-flows` with the full `flowRegistry`.
- If the request is about default values, linkage, computed fields, show/hide, required/disabled, or action state, route to reaction authoring before considering raw configure keys.
- For localized reaction work, do not start from `context`; start from `get-reaction-meta` and use `context` only when raw variable paths are still missing.
- If the request crosses families or the target is not unique, narrow the target before writing.
