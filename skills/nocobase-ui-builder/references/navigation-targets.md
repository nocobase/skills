# Navigation Targets

Use this file when whole-page `create` work needs menu placement, layout/workspace targeting, page identity, or route readback decisions.

## Required Portal Preflight

Before any `flow-surfaces` mutation, load and execute `nocobase-portal-manage` for the same request unless a current-request Portal Manager routing outcome already exists. Reuse an existing outcome to avoid a no-code dispatch loop. Then require one of these outcomes:

- Exactly one selected Portal whose inventory record has `portalType === "no-code"` and a non-empty `name`: continue to [Selected No-Code Portal Mapping](#selected-no-code-portal-mapping).
- Exactly one selected Portal with `portalType === "ai"`: exit UI Builder without writing and immediately continue the same request on Portal Manage's source-code implementation path. The original build request authorizes locating, editing, and testing the selected Portal source; do not ask whether to use it or create a no-code Portal.
- Exactly one selected Portal with a missing or unsupported `portalType`: exit UI Builder without writing and return to Portal Manage to choose another skill or implementation path.
- No selected Portal or multiple Portals awaiting selection: stop without writing and return to Portal Manage.
- `capabilities.multiPortal === false`: use the [Legacy Layout Lane](#legacy-layout-lane).
- Portal Manager's verified legacy Flow Surfaces signature: Portal inventory and `list-navigation-targets` are explicitly absent, while core `apply-blueprint` help and a structured Flow Surfaces read probe succeed; use the [Legacy Layout Lane](#legacy-layout-lane).

Portal count alone never enables UI Builder. The selected inventory record's `portalType` is authoritative; do not infer no-code from there being only one Portal, user wording, navigation targets, cwd, or source layout. No other capability value enables a write. In particular, `multiPortal: true`, a merely missing value, auth or server errors, or an unclear response must stop. An explicitly absent Portal/target-discovery surface is allowed only through Portal Manager's complete verified legacy probe; command absence by itself is never enough.

Exiting UI Builder is a skill handoff, not the end of the user's build task. A sole AI Portal must continue automatically through its source project with no clarification prompt.

## Selected No-Code Portal Mapping

For the no-code Portal already selected by Portal Manage, run:

```bash
nb api flow-surfaces list-navigation-targets -j
```

Filter targets by both conditions:

```text
target.kind === "portal"
target.routeName === selectedPortal.name
```

Require exactly one match and a non-empty `target.portalUid` or `target.uid`. Set `navigation.portalUid` to that Portal identifier and omit `navigation.layoutUid`.

- Ignore `targets[].default`; it never selects or substitutes a Portal.
- Ignore every `kind: "layout"` target.
- Ignore the matched Portal target's backing `layoutUid`; it is not Portal identity.
- Missing, duplicate, or empty-UID matches stop without writing and return to Portal Manage for target inspection.
- A mobile-backed no-code Portal still enters through `navigation.portalUid`, then follows the existing mobile root rule and omits `navigation.group`.
- A desktop-backed no-code Portal follows non-mobile group rules inside that Portal.

Multi-portal whole-page create must include this exact `navigation.portalUid`. It must not omit Portal navigation, set `navigation.layoutUid`, or use `admin-layout-model` as a fallback.

## Legacy Layout Lane

Use direct layout targeting only when `list-navigation-targets` explicitly returns `capabilities.multiPortal === false`.

- Desktop/admin whole-page creates target `admin-layout-model`; omit `navigation.layoutUid` for that default.
- Mobile intent targets `mobile-layout-model`. Set `navigation.layoutUid: "mobile-layout-model"`, put the root tab title/icon in `navigation.item`, and omit `navigation.group`.
- `navigation.portalUid` and `navigation.layoutUid` remain mutually exclusive.

Legacy mobile create navigation:

```json
{
  "navigation": {
    "layoutUid": "mobile-layout-model",
    "item": { "title": "Support tickets", "icon": "InboxOutlined" }
  }
}
```

## Portal Navigation Error Handoff

These single navigation errors identify a wrong target or implementation path. Do not put them into the aggregate authoring `errors[]` payload-repair loop:

- `navigation-portal-type-unsupported`: stop same-write retries, never switch to Admin, and continue through the selected AI Portal source path.
- `navigation-portal-selection-required`: stop all writes and ask the user to select a Portal through Portal Manage.
- `navigation-portal-not-found`: stop and ask the user to create or inspect the Portal through Portal Manage.
- `navigation-admin-layout-not-portal-target`: rerun Portal resolution; do not change the payload to keep writing to Admin.

## Non-mobile Group Resolution

- Prefer `navigation.group.routeId` when the destination group is already known.
- `navigation.group.routeId` wins over `title`, `icon`, `tooltip`, and `hideInMenu`; metadata on reused groups is ignored.
- `navigation.group.title` may create or reuse a non-mobile group only inside the target layout or custom portal:
  - zero visible same-title groups -> create one group in that layout
  - one visible same-title group -> reuse it and normalize to `routeId`
  - multiple visible same-title groups -> stop and require explicit `navigation.group.routeId`
- If `navigation.layoutUid` is provided with `navigation.group.routeId`, the group route must already belong to that layout.
- If `navigation.portalUid` is provided with `navigation.group.routeId`, the group route must already belong to that portal.
- Newly created non-mobile groups and top-level or second-level items need one valid semantic Ant Design icon. Mobile creates need only `navigation.item.icon`.
- If existing group metadata must change, use low-level `update-menu`; do not rely on `applyBlueprint create`.

## Multi-page Shared Groups

- Treat one user request that spans several pages as ordered single-page runs.
- If multiple ordered non-mobile page runs share the same `navigation.group.title` in the same target layout or portal, serialize them.
- On the first page, use `navigation.group.title` to create or resolve the group and capture the returned `routeId`.
- For later pages, set `navigation.group` to `{ "routeId": <captured routeId> }`; do not use title-only creation again.
- Concurrent title-only shared-group creates are forbidden.

## Duplicate Page Identity

- Non-mobile page identity is `(target layout or portal, navigation.group.routeId, page.title)` after any unique group-title resolution.
- Mobile page identity is `(mobile layout or mobile-backed portal, root, page.title)`.
- In the legacy lane, the target layout is explicit `navigation.layoutUid` when present; otherwise it is the resolved group's inherited layout for explicit `routeId`, or `admin-layout-model` for root/default creates.
- A custom workspace target is explicit `navigation.portalUid`; portal identity is never inferred from its backing `layoutUid`.
- Same target layout/portal + same group/root + same page title may be prepared as `replace` with `target.pageSchemaUid`.
- Different group, layout, or portal with the same page title is a distinct page; do not merge, reuse, or auto-replace it.

## Route Discovery And Reporting

- Desktop/admin menu discovery starts with `nb api resource list --resource 'desktopRoutes:listAccessible' --no-paginate -j`.
- Mobile page work reads the same visible route resource with layout scope `mobile-layout-model` when available, or filters fallback route reads by `uiLayouts.uid`.
- If `desktopRoutes:listAccessible` is unavailable, fall back to `nb api resource list --resource desktopRoutes --no-paginate -j --sort sort` and state that the fallback is not role-filtered.
- `navigation.group.routeId` and desktop-route `id` are navigation locators, not flow-surface `uid` values.
- Menu tree `group.id` maps to `navigation.group.routeId`; `flowPage.schemaUid` maps to page-level `pageSchemaUid`; `tabs` children are route-backed tabs, not menu items.
- Mobile page summaries should report the user-facing route under the mobile base, such as `/mobile/<pageSchemaUid>`, not `/admin/<pageSchemaUid>`.
- For a custom portal, prefer the `routePath` returned by `list-navigation-targets` when reporting the user-facing route.
