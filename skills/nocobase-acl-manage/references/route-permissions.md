# Route Permissions

Route permissions are separate from system snippets and table ACL.

Common desktop route operations:

- `roles.desktopRoutes:add`
- `roles.desktopRoutes:remove`
- `roles.desktopRoutes:set`
- `roles.desktopRoutes:list`
- `desktopRoutes:listAccessible`

Treat route permissions as menu/page visibility controls.

Use this layer when the task is about:

- visible menus
- accessible pages
- desktop/mobile navigation boundaries
- role-specific entry points into a business app

Configuration rule:

- For realistic business roles, explicitly decide whether route permissions are:
  - granted and bound to specific routes
  - intentionally empty because the instance has no routes yet
  - intentionally deferred because pages are not created yet

Do not silently skip route permissions when the task is about a real user-facing role.
