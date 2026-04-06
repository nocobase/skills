# Runtime Playbook

Read this file when you already know what needs to be created, modified, or reordered, but are still unsure which `target family` it belongs to, which locator to read, or which uid should be passed into the write API. For request shapes, see [tool-shapes.md](./tool-shapes.md). For popup content and the `currentRecord` guard, see [popup.md](./popup.md). For post-write verification, see [verification.md](./verification.md). Whether `catalog` is required is governed by [normative-contract.md](./normative-contract.md).

## UID / Locator Glossary

| Name | Role | Where it goes | Typical source |
| --- | --- | --- | --- |
| `menuRouteId` | primary key of a menu node; used by `createPage(menuRouteId=...)` and `updateMenu(menuRouteId=...)` | lifecycle `requestBody` field | return value of `createMenu` / `createPage`, or menu-tree discovery result |
| `parentMenuRouteId` | primary key of the target parent `group` menu | `requestBody` field of `createMenu` / `updateMenu` | menu-tree discovery result |
| `uid` | generic node read locator; ordinary node writes also use it directly as target | root locator for `get`, or `target.uid` / root `uid` | known block / field / action / wrapper / host uid, or any node uid inside the tree returned by `get` |
| `pageSchemaUid` | read locator for a route-backed page | root locator for `get` | return value of `createPage`; page route / readback |
| `tabSchemaUid` | canonical identifier of a route-backed outer tab; in the current implementation it is both the read locator and the outer-tab write target uid | root locator for `get`, or `target.uid` / root `uid` | return value of `createPage` / `addTab`; tab route / readback |
| `routeId` | read locator for an initialized `flowPage` menu item or outer tab | root locator for `get` | return value of `createPage` / `addTab`; route readback |
| `pageUid` | write target uid for a route-backed page | `target.uid` or root `uid` | return value of `createPage`; or after `get(pageSchemaUid/routeId)`, extract the page node uid |
| `gridUid` | write target uid of `route-content` | usually `target.uid`; for reads use `get({ uid })` | return value of `createPage` / `addTab` |
| `hostUid` | read locator of a popup host node, not the popup page itself | `get({ uid: hostUid })` | uid of the action / field / block that opens the popup |
| `popupPageUid` | write target uid of the popup page | `target.uid` or `get({ uid })` | return value of a popup-capable action / record action; or from host `get` read `tree.subModels.page.uid` |
| `popupTabUid` | default write target uid of `popup-tab` | `target.uid` or `get({ uid })` | return value of a popup-capable action; popup-subtree readback |
| `popupGridUid` | default write target uid of `popup-content` | `target.uid` or `get({ uid })` | return value of a popup-capable action; popup-subtree readback |
| `pre-init ids` | page / tab / route-related ids returned by `createMenu(type="item")` before `createPage(menuRouteId=...)` finishes initialization | only allowed to continue the initialization chain; must not be used directly for page/tab lifecycle writes | return value of `createMenu(type="item")` |
| `new target` | the immediate next write target returned directly by a write API in the current execution chain, which is allowed to skip one leading `get` | not a payload field; an execution-state concept | direct return value of `createPage`, `addTab`, popup-capable actions, `addPopupTab`, etc. |

Compatibility aliases: in popup scenarios, if the live environment only exposes `tabUid`, treat it as `popupTabUid`; if it only exposes `gridUid`, treat it as `popupGridUid`. In menu discovery results, `routeId` usually becomes `menuRouteId` / `parentMenuRouteId` in menu semantics.

## Surface Families

| Family | Semantics | Default write target uid | Preferred read locator | Common use |
| --- | --- | --- | --- | --- |
| `menu-group` | `group` menu used only to organize Modern page(v2) | not applicable; always use `createMenu/updateMenu` | menu-tree readback; if needed, keep only `routeId` | create group, attach child menus, rename group |
| `menu-item` | bindable `flowPage` menu item for Modern page(v2); before `createPage`, it is still an uninitialized page | not applicable; initialization and menu movement both use lifecycle APIs | `menuRouteId` / `routeId`; `pageSchemaUid` if needed | initialize page, rename menu, move to another group |
| `page` | route-backed top-level page | `pageUid` | `pageSchemaUid`, or `routeId` if needed | `addTab`, `destroyPage`, full-page readback |
| `outer-tab` | route-backed tab under a page | `tabSchemaUid` | `tabSchemaUid` | outer-tab lifecycle, tab-surface `catalog/configure` |
| `route-content` | grid target used to keep adding content inside page / outer tab | `gridUid` | `uid = gridUid` | `catalog/compose/add*` |
| `popup-page` | popup container opened by a host action / field | `popupPageUid` | `uid = popupPageUid` | `addPopupTab`, popup-page `catalog/configure` |
| `popup-tab` | internal tab inside popup | `popupTabUid` | `uid = popupTabUid` | popup-child-tab lifecycle, popup-tab `catalog/configure` |
| `popup-content` | content grid inside popup page / popup child tab | `popupGridUid` | `uid = popupGridUid` | continue `compose/add*` inside popup |
| `node` | non-lifecycle node, such as block / field / action / wrapper / popup host | node's own `uid` | `uid = node uid` | precise reconfiguration, local readback, continue writing from popup host node |

Notes: `menu-group` has no corresponding flow tree, so do not treat it like a normal `get -> tree -> nodeMap` surface. Before `createPage(menuRouteId=...)`, `menu-item` only allows `createPage` / `updateMenu`. `pre-init ids` are never write-ready targets before initialization finishes. In the current implementation, `tabSchemaUid` is both the read locator and write target uid for `outer-tab`; if live facts clearly differ, follow the live environment.

## Title / Icon Quick Matrix

| Natural language | Default visible slot | Family | Preferred API / path | Note |
| --- | --- | --- | --- | --- |
| menu title / menu icon / left-navigation icon | left menu | `menu-item` / `menu-group` | `updateMenu` | even for a route-backed page, modify the page entry first; do not jump to tab |
| page content title / page top title / header title | page header title | `page` | page `configure` | this is the title-text path, not the page-top icon path |
| page top icon / header icon / header icon | page header icon | `page` | inspect render chain first | do not promise visible effect by default; only continue after confirming that the header consumes `icon` |
| tab title / tab icon | outer tab | `outer-tab` | `updateTab` | requires explicit tab clues, or a clear `tabSchemaUid` / `RootPageTabModel` |
| title / icon of a tab inside popup | popup tab | `popup-tab` | `updatePopupTab` | requires popup-tab clues, or a clear `ChildPageTabModel` |
| page title / page icon with no position clue | default to page entry | `menu-item` | `updateMenu` | default guess is menu entry; must not silently default to `updateTab` |

- `page.icon` is not a synonym for the left-menu icon.
- `page.icon` is also not the default visible path of a page-header icon. Only promise visible effect after confirming that the header render chain consumes it.
- Without explicit tab clues, do not default to `updateTab` just because the page is route-backed.

## Distinguishing `outer-tab` vs `popup-tab`

- `get(...).tree.use = RootPageTabModel` -> `outer-tab`
- `get(...).tree.use = ChildPageTabModel` -> `popup-tab`
- uid directly returned as `tabSchemaUid` from `createPage` / `addTab` -> `outer-tab`
- uid directly returned by `addPopupTab` or from popup-subtree readback -> `popup-tab`
- Seeing only `kind = "tab"` is not enough to choose an API. You must confirm either `tree.use` or the uid source first.

## Default Write Flow

1. **Discover parent menu by menu title**: `desktop_routes_list_accessible(tree=true)`. Only accept a uniquely matched `group`. Also remember that it only shows the menu tree visible to the current role, so you must not infer "system does not exist" from "not visible here".
2. **Create a menu group**: `createMenu(type="group")`. If a page will be created under this group next, reuse the returned `routeId` as `parentMenuRouteId`.
3. **Create a complete page**: `createMenu(type="item", parentMenuRouteId=...) -> createPage(menuRouteId=routeId)`. The `pre-init ids` returned from `createMenu(type="item")` may only continue the initialization chain. When continuing to add content, take the `gridUid` returned by `createPage` and run `[decide whether to append catalog by normative contract] -> compose/add* + settings/configure -> readback`.
4. **Compatibility-mode create page first, then move it into menu**: `createPage` without `menuRouteId` is only allowed when the user explicitly accepts the side effects of a standalone / compat page. If the user also wants it mounted under a menu, run `updateMenu` afterwards.
5. **Add an `outer-tab` to an existing `page`**: read back the `page` first, get `pageUid`, then call `addTab(target.uid = pageUid)`.
6. **Small adjustment or precise append on an existing target**: `get -> [decide whether to append catalog by normative contract] ->` prefer `compose/add*` first, then consider `configure/updateSettings`. Only use `setLayout/setEventFlows` when the user explicitly accepts whole replacement and you have already read the full current state. Only use `apply/mutate` when the public entry points cannot express the change and the user explicitly accepts the blast radius.
7. **Write into an existing popup subtree**: if the current execution chain did not directly receive popup uids, read back the popup subtree first from `hostUid` or `popupPageUid`. For the record-popup `currentRecord` guard, see [popup.md](./popup.md).

## Prompt Regression Examples

- `add a small icon to this page` -> defaults to `menu-item -> updateMenu`
- `change the icon of the left menu title` -> `menu-item -> updateMenu`
- `change the page-top title text` -> `page -> configure`
- `change the page-top icon` -> inspect the render chain first; do not promise visible effect by default
- `change the icon of this tab` -> `outer-tab -> updateTab`
- `change the icon of the tab inside popup` -> `popup-tab -> updatePopupTab`
- `add an icon to the page title` -> default to handling it as a menu entry, and explain in commentary first that this is the default guess
