# ACL Safety And Debug

## Role selection security

- Current role is resolved from `X-Role`, the user’s assigned roles, and the system role mode.
- If a requested role does not belong to the user, middleware rejects it.
- In `default` mode, asking for union role does not behave like true union mode.

Always inspect current role context before treating access behavior as an ACL data bug.

## Association operation safety

Association operations such as `add`, `set`, `remove`, and `toggle` are checked separately.

To allow association mutation safely:

- the user must effectively have update permission on the source resource
- if the ACL params include a whitelist, the association field must be present in it
- if the ACL params include a scope filter, the source record must match that scope

Do not assume record update permission automatically implies unrestricted association mutation.

## Association payload sanitization

Create and update requests that contain association values are sanitized by ACL middleware.

Implications:

- disallowed association writes may be removed from the payload instead of behaving like a simple scalar-field denial
- relation updates need to be explicitly covered by the permitted action config
- if the user reports “association data silently not saved”, inspect ACL first, not only form payloads
- a relation field being present in view permissions does not imply it may be changed in create/update payloads
- relation-field update permission should be read as association-change permission for ordinary form submissions

## Association endpoints use source update permission

Dedicated association actions such as `add`, `set`, `remove`, and `toggle` are not checked as simple target-resource writes.

They are effectively governed by:

- update permission on the source resource
- association field presence in whitelist, when a whitelist exists
- source-record scope matching, when a scope filter exists

Implications:

- a role may be able to view both sides of a relation but still be unable to attach/detach records
- target-resource permission alone does not authorize source-side association mutation
- when debugging association action 403s, inspect the source resource update ACL first

## Field-to-append transformation for read operations

For view/export actions, association fields in requested `fields` may be moved into `appends` by ACL middleware.

Implications:

- relation visibility problems can come from field permission config, not only from query shape
- when debugging missing relation data, inspect both allowed `fields` and relation access

## Own-scope prerequisites

`view:own`, `update:own`, and similar scope-driven behavior only work when the collection has suitable ownership semantics, typically fields such as `createdById`.

If the collection lacks ownership fields:

- own-scope rules may yield empty accessible sets
- allowedActions metadata may omit update ability even though the role config looks correct

Coordinate with data modeling before using own-record permissions broadly.

## Snippet permissions are high leverage

Snippets can bypass normal collection-by-collection reasoning.

Use snippets only when the user explicitly wants broad API capability. Do not use snippet grants as a shortcut for routine business-role configuration.

When the task is about plugin/configuration visibility, prefer managing snippets directly instead of inferring equivalent table or route permissions.

High-risk examples:

- `ui.*` grants interface-configuration capability.
- `pm` grants plugin install/activate/disable capability.
- `pm.*` grants plugin-configuration capability.
- `app` grants cache-clear and application-restart capability.

Implication:

- if the target role is an ordinary end-user or business operator role, these snippets should normally stay denied unless the user explicitly wants configuration authority.

## Route permissions are independent

Desktop/mobile route bindings are not the same thing as snippets or table ACL.

Implications:

- a role can have the right table permission but still fail to see the target page because the route is missing
- a role can keep a visible page while the underlying table action is denied
- route debugging should inspect both role route bindings and `listAccessible` results

## Scoped action verification caveat

Some API responses may return the correct `scopeId` while the appended `scope` object is incomplete or empty.

When validating scoped permissions:

- trust `scopeId` on the action first
- then re-read the scope record itself
- do not treat an empty appended `scope` payload as proof that the stored scope is missing

## Built-in scope safety

`all` and `own` are built-in data-source scopes.

Implications:

- they should not be recreated as business scopes
- they should not be edited or deleted as part of normal role configuration
- if custom business scopes appear to replace them in the UI, inspect the client-side protection logic before changing data

## Scope variable source of truth

When documenting or debugging ACL scope variables, prefer the frontend variable selector as the user-facing source of truth.

Practical rule:

- document `$user` and `$nRole`
- do not lead users toward deprecated variable aliases in new guidance
- when a proposed variable path is uncertain, confirm that the path is selectable from the ACL scope editor or resolvable from the current user's schema path

Implications:

- if a scope uses `$user`, the referenced fields and relation paths must actually exist on `users`
- if a role rule tries to use `own` for a non-creator business boundary, the design is wrong even if the syntax is valid

## Common Pitfalls

- Treating a role as "configured" after only setting action names without deciding field lists, scopes, route access, and system snippets.
- Leaving global strategy empty without confirming that independent permissions intentionally cover all required collections.
- Leaving field lists empty by accident and thereby granting full-field access where the business expected tighter control.
- Leaving scopes empty by accident and thereby granting full-row access where the business expected organizational isolation.
- Treating union-role behavior as a role-definition problem before checking system role mode.
- Treating route visibility as a data-table ACL bug before checking route bindings.
- Configuring `*:own` on collections that do not have ownership fields.
- Locking down fields without checking whether the target action supports field configuration.
- Assuming association updates follow the same permission path as scalar updates.
- Using resource-level overrides everywhere instead of keeping most permissions in the global strategy.
- Reusing a scope filter across collections without confirming field compatibility.
- Debugging missing relation data only from the UI side while ACL is stripping association visibility.
- Compensating for a missing resource-level tool by granting a broad global strategy. If precise resource actions are the real requirement, fix the swagger/tool coverage first.
