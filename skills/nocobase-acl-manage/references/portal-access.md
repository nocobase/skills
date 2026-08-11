# Portal Entry Access

Use this reference only to grant or revoke a role's ability to enter an existing custom Portal.

## Permission model

- The role relation is `roles.multiPortals` and persists through `rolesMultiPortals(roleName, multiPortalUid)`.
- Runtime discovery uses `multiPortals:listAccessible`, which returns enabled Portals granted to any current effective role.
- `root` can enter all enabled Portals.
- In union-role mode, a grant from any effective role allows entry.
- `allowNewMultiPortal` controls automatic grants when future Portals are enabled. It does not grant access to an existing Portal by itself.
- Portal-internal routes, menus, pages, regions, controls, and data actions are separate permission layers.

## Required CLI contract

The Multi-portal plugin exposes its existing association actions through Swagger, producing:

```bash
nb api acl roles multi-portals list --role-name <role_name> -j
nb api acl roles multi-portals add --role-name <role_name> --values '["<portal_uid>"]' -j
nb api acl roles multi-portals remove --role-name <role_name> --values '["<portal_uid>"]' -j
```

Do not write `rolesMultiPortals` directly. If these generated commands are absent after `nb env update <env>`, treat the capability as unavailable or stale and stop.

## Execution flow

1. Resolve the target role with `nb api acl roles get --filter-by-tk <role_name> -j`.
2. Resolve the Portal with `nb portal list -j`. Match enabled records by exact uid/name/path first, then title or business hint. Ask the user when more than one record matches.
3. Read current grants with `roles multi-portals list`.
4. Confirm the exact role, Portal title/name, Portal uid, and `allow` or `deny` outcome.
5. For `allow`, call `add` only when the uid is absent. For `deny`, call `remove` only when the uid is present.
6. Run `list` again and verify the exact uid is present or absent as requested.

An already-satisfied request is a successful no-op. Report the explicit association state, not `allowNewMultiPortal`, as evidence for an existing Portal.

## Boundary

This task does not configure what the user can see or do after entering the Portal. Use the appropriate frontend access controls for Portal-owned UI and the normal ACL data-source tasks for server resources, actions, fields, and record scopes.
