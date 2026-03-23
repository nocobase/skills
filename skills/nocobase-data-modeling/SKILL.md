---
name: nocobase-data-modeling
description: Create and manage NocoBase data models via MCP. Use when users want to inspect or change collections, fields, relations, or view-backed schemas in a NocoBase app.
argument-hint: "[collection-name] [operation: inspect|create|update|fields|relations|sync-view]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

Use NocoBase MCP tools to inspect and change collections, fields, relations, and view-backed schemas.

# Prerequisite

- NocoBase MCP must already be authenticated before running modeling actions.
- If MCP tools return authentication errors such as `Auth required`, do not try to sign in automatically through ad hoc requests.
- Instead, stop and ask the user to complete MCP authentication or refresh the MCP connection, then continue with the modeling workflow.

Useful references:

- MCP setup and token configuration: `nocobase-mcp-setup`
- Data modeling overview: https://docs.nocobase.com/data-sources/data-modeling
- Collection overview and collection types: https://docs.nocobase.com/data-sources/data-modeling/collection
- Collection options reference: https://docs.nocobase.com/plugin-development/server/collection-options
- Collection field overview: https://docs.nocobase.com/data-sources/data-modeling/collection-fields

# Preferred order

1. Inspect first.
   - Prefer `collections:listMeta` when available because it includes loaded collection options and field definitions.
   - Otherwise use `collections:list`, `collections:get`, and `collections/{collectionName}/fields:list`.
2. Make the smallest safe change.
   - Create collections first, then add or edit fields incrementally.
3. Use bulk sync only when appropriate.
   - Use `collections:setFields` only when replacing the full field set is intentional.
4. Verify after each modeling step.
   - Re-read the collection and field metadata.
   - Check collection titles on the collection itself, but check field labels in `uiSchema.title`.
   - For relation fields, verify the declared field and any generated foreign key or reverse field.

# Operational guidance

- Preset fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` should follow the same request shape used by the real collection manager flow when the task is meant to validate realistic modeling or ACL behavior.
- Unless the user explicitly asks for a different primary-key strategy or the table truly has unusual requirements, create `id` explicitly as a preset field instead of relying on implicit/default id generation.
- For ordinary business tables, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` are usually needed and should normally be created explicitly as preset fields too.
- A reliable general create shape for such tables is:
  - `template: "general"`
  - `logging: true` when record history matters
  - `autoGenId: false`
  - explicit preset fields in `fields`: `id`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`
- For `id`, follow the actual request shape used by collection manager flows, including interfaces such as `snowflakeId`, `uuid`, or `nanoid`.
- `collections:create`, `collections:update`, and `collections/{collectionName}/fields:update` use direct request bodies. Do not add an extra `values` wrapper.
- If a collection uses a custom primary key strategy, disable `autoGenId`, create the primary key field explicitly, and verify that the resulting collection metadata has the expected `filterTargetKey`.
- Do not treat collection-level convenience flags as a substitute for the real preset-field payload when the goal is to mirror an actual business collection definition.
- Prefer explicit relation payloads when relation behavior matters. Generated defaults are fine for ad hoc modeling, but they are harder to verify and reuse in automation.
- If reverse behavior matters, pass `reverseField` explicitly instead of assuming the server will infer the right alias or UI schema.
- On `collections:*`, `filterByTk` usually means collection name. On `collections/{collectionName}/fields:*`, it usually means the field name inside that collection. If names are unstable, use `filter` with the field `key`.
- For local option fields such as `select`, `multipleSelect`, `radioGroup`, and `checkboxGroup`, follow the collection manager request shape and put structured options in `uiSchema.enum`, usually with items like `{ value, label }`.
- If record pickers or workflow selectors show raw IDs instead of readable names, check the collection `titleField`.
- Common minimal shapes:
  - Collection: `{ name, title, fields }`
  - Field update: `{ description, uiSchema, enum, ... }`
  - Local select field: `{ name, type: "string", interface: "select", uiSchema: { "x-component": "Select", enum: [{ value, label }] } }`
- Use `dbViews:list` or `dbViews:get` before touching a view-backed collection. Treat `collections:setFields` as replacement, not patching.
- Use collection-type-specific docs before modeling non-general collections such as inheritance, tree, calendar, SQL, file, or view collections.
- For inheritance collections, keep shared fields on the parent and only child-specific fields on derived collections. Re-check query scope and selector behavior after changes because inheritance increases query complexity.
- For tree collections, treat the hierarchy as first-class structure rather than emulating it with ad hoc self-relations in a general collection.

# Common pitfalls

- Do not treat MCP authentication failures as normal API failures. Resolve authentication first.
- Do not use `collections:setFields` for small edits on ordinary collections; it can remove fields omitted from the payload.
- When changing relation fields, re-check the target collection because foreign keys and reverse fields may be created or removed as side effects.
- Deleting a relation field may leave reverse fields or foreign-key fields behind. Re-read both collections and clean up leftovers explicitly if the model should be fully removed.

# Verification checklist

- Collection exists and has expected options.
- Preset fields are added only where they are actually needed, and the primary-key strategy matches the intended creation flow.
- `filterTargetKey` and `titleField` match how the collection should be referenced in MCP queries and selectors.
- Field exists with expected `type`, `interface`, and `uiSchema.title`.
- Local option fields expose the expected labels and values in `uiSchema.enum`, not only a bare string array.
- Relation field created the expected `foreignKey`, `through`, or `reverseField`.
- View collections still match `dbViews:get` output after synchronization.
