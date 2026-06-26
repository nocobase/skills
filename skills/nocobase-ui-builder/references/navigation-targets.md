# Navigation Targets

Use this file when whole-page `create` work needs menu placement, layout targeting, page identity, or route readback decisions.

## Target Layout

- Default whole-page creates target desktop/admin layout `admin-layout-model`; omit `navigation.layoutUid` for that default.
- Mobile page intent (`移动端页面`, `手机端`, `mobile page`, `mobile layout`) targets `mobile-layout-model`.
- For mobile creates, set `navigation.layoutUid: "mobile-layout-model"`, put the visible root tab title/icon in `navigation.item`, and omit `navigation.group`.
- Mobile creates are root mobile tab pages. Do not invent or reuse a shared menu group for them.

Mobile create navigation:

```json
{
  "navigation": {
    "layoutUid": "mobile-layout-model",
    "item": { "title": "Support tickets", "icon": "InboxOutlined" }
  }
}
```

## Non-mobile Group Resolution

- Prefer `navigation.group.routeId` when the destination group is already known.
- `navigation.group.routeId` wins over `title`, `icon`, `tooltip`, and `hideInMenu`; metadata on reused groups is ignored.
- `navigation.group.title` may create or reuse a non-mobile group only inside the target layout:
  - zero visible same-title groups -> create one group in that layout
  - one visible same-title group -> reuse it and normalize to `routeId`
  - multiple visible same-title groups -> stop and require explicit `navigation.group.routeId`
- If `navigation.layoutUid` is provided with `navigation.group.routeId`, the group route must already belong to that layout.
- Newly created non-mobile groups and top-level or second-level items need one valid semantic Ant Design icon. Mobile creates need only `navigation.item.icon`.
- If existing group metadata must change, use low-level `update-menu`; do not rely on `applyBlueprint create`.

## Multi-page Shared Groups

- Treat one user request that spans several pages as ordered single-page runs.
- If multiple ordered non-mobile page runs share the same `navigation.group.title` in the same target layout, serialize them.
- On the first page, use `navigation.group.title` to create or resolve the group and capture the returned `routeId`.
- For later pages, set `navigation.group` to `{ "routeId": <captured routeId> }`; do not use title-only creation again.
- Concurrent title-only shared-group creates are forbidden.

## Duplicate Page Identity

- Non-mobile page identity is `(target layout, navigation.group.routeId, page.title)` after any unique group-title resolution.
- Mobile page identity is `(mobile layout, root, page.title)`.
- The target layout is explicit `navigation.layoutUid` when present; otherwise it is the resolved group's inherited layout for explicit `routeId`, or `admin-layout-model` for root/default creates.
- Same layout + same group/root + same page title may be prepared as `replace` with `target.pageSchemaUid`.
- Different group or different layout with the same page title is a distinct page; do not merge, reuse, or auto-replace it.

## Route Discovery And Reporting

- Desktop/admin menu discovery starts with `nb api resource list --resource 'desktopRoutes:listAccessible' --no-paginate -j`.
- Mobile page work reads the same visible route resource with layout scope `mobile-layout-model` when available, or filters fallback route reads by `uiLayouts.uid`.
- If `desktopRoutes:listAccessible` is unavailable, fall back to `nb api resource list --resource desktopRoutes --no-paginate -j --sort sort` and state that the fallback is not role-filtered.
- `navigation.group.routeId` and desktop-route `id` are navigation locators, not flow-surface `uid` values.
- Menu tree `group.id` maps to `navigation.group.routeId`; `flowPage.schemaUid` maps to page-level `pageSchemaUid`; `tabs` children are route-backed tabs, not menu items.
- Mobile page summaries should report the user-facing route under the mobile base, such as `/mobile/<pageSchemaUid>`, not `/admin/<pageSchemaUid>`.
