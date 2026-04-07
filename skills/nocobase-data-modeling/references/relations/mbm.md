# Many To Many Array

Use this file only when the user explicitly wants the plugin-provided many-to-many array interface rather than the core `m2m` relation.

Plugin gate:

- confirm the many-to-many array plugin is installed and enabled first
- confirm the `mbm` interface is actually available in the current instance
- if disabled, enable it before creating the field

Direction rule:

- do not treat `mbm` as a synonym for core `m2m`
- `mbm` is a plugin-provided relation-style array interface and must be modeled only when the plugin-backed capability is intended

Modeling rule:

- if the user asked for ordinary many-to-many relation behavior, use `m2m`
- if the user explicitly asked for many-to-many array field behavior, use `mbm`

Compact payload:

```json
{
  "name": "members",
  "interface": "mbm",
  "title": "Members",
  "target": "users",
  "foreignKey": "f_members",
  "targetKey": "id"
}
```

Use this compact shape by default. The stored field metadata will include derived `type` and `uiSchema`, but they do not need to be sent in the normal request.

Configuration details:

- `type` should be `belongsToArray`
- `target` must point to the intended collection
- `foreignKey` is still required for the plugin-backed array association
- `targetKey` should point to a unique field on the target, usually `id`
- labels should come from the target title field or another readable unique field

Verification focus:

- the resulting field interface is `mbm`, not `m2m`
- the plugin-backed behavior is actually available after creation
- the field still points to the intended target and behaves like an array-backed association

Anti-drift rules:

- do not silently downgrade `mbm` to `m2m`
- do not silently upgrade `m2m` to `mbm`
- do not create this field unless plugin enablement was confirmed first
