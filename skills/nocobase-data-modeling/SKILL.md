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
- Canonical create payload examples by collection type:
  - `references/collection-types/general.md`
  - `references/collection-types/file.md`
  - `references/collection-types/tree.md`

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

- Choose the collection type before designing fields. Do not default to `general` until you have checked whether the business object is actually hierarchical, calendar-oriented, file-oriented, SQL-backed, or view-backed.
- Common collection-type selection rules:
  - `general`: ordinary transactional or master-data tables with custom business fields and relations.
  - `tree`: hierarchical data such as departments, categories, region trees, or any structure where parent/child semantics are core to the model.
  - `calendar`: date-centric business objects that are primarily scheduled or displayed on calendars.
  - `file`: attachment, upload, document, image, scan, or archive records where the file itself is a first-class object.
  - `sql`: SQL-defined collections whose schema/query logic is intentionally driven by SQL rather than ordinary field-by-field modeling.
  - `view`: database-view-backed read models or reporting/query projections that should sync from an existing database view.
- For attachments, scans, certificates files, photos, contracts, and similar file-centric records, prefer a `file` collection instead of modeling them as a `general` collection unless the user explicitly wants to decouple metadata from the file storage object.
- A `general` collection with `fileName`, `fileUrl`, or `storageName` fields can be acceptable only when the design intentionally stores external file metadata rather than using NocoBase's file collection semantics. Treat this as an explicit design choice, not the default.
- A reliable file-collection create shape should mirror the real collection-manager request body instead of assuming `template: "file"` will always inject every expected field automatically.
- Preset fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` should follow the same request shape used by the real collection manager flow when the task is meant to validate realistic modeling or ACL behavior.
- Unless the user explicitly asks for a different primary-key strategy or the table truly has unusual requirements, you must create `id` explicitly as a preset field instead of relying on implicit/default id generation.
- Treat explicit preset `id` as the default rule, not an optional improvement.
- For ordinary business tables, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` are usually needed and should normally be created explicitly as preset fields too.
- A reliable general create shape for such tables is:
  - `template: "general"`
  - `logging: true` when record history matters
  - `autoGenId: false`
  - explicit preset fields in `fields`: `id`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`
- Append business fields after these preset fields unless the user explicitly wants a different layout.
- When the task is validating realistic file modeling, start from this file-collection baseline and append business-specific relation or classification fields after the built-in file fields.
- Keep large canonical payloads in the `references/collection-types/` folder. `SKILL.md` should explain selection and rules; the reference files should hold reusable request bodies for each collection type.
- For `id`, follow the actual request shape used by collection manager flows, including interfaces such as `snowflakeId`, `uuid`, or `nanoid`.
- `collections:create`, `collections:update`, and `collections/{collectionName}/fields:update` use direct request bodies. Do not add an extra `values` wrapper.
- If a collection uses a custom primary key strategy, disable `autoGenId`, create the primary key field explicitly, and verify that the resulting collection metadata has the expected `filterTargetKey`.
- Do not treat collection-level convenience flags as a substitute for the real preset-field payload when the goal is to mirror an actual business collection definition.
- If the created collection does not expose the expected explicit preset `id` field after re-reading metadata, treat that as a modeling failure and correct it before continuing with downstream ACL or workflow setup.
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
- For file collections, model the uploaded file as the primary record. Add business relations around that file record instead of replacing the file collection with a plain general table unless the business requirement clearly calls for metadata-only storage.

# Common pitfalls

- Do not treat MCP authentication failures as normal API failures. Resolve authentication first.
- Do not use `collections:setFields` for small edits on ordinary collections; it can remove fields omitted from the payload.
- When changing relation fields, re-check the target collection because foreign keys and reverse fields may be created or removed as side effects.
- Deleting a relation field may leave reverse fields or foreign-key fields behind. Re-read both collections and clean up leftovers explicitly if the model should be fully removed.

# Verification checklist

- Collection exists and has expected options.
- The collection uses an explicit preset `id` field unless the user explicitly requested a different primary-key strategy.
- Preset audit fields are added where the business model actually needs them, and the primary-key strategy matches the intended creation flow.
- `filterTargetKey` and `titleField` match how the collection should be referenced in MCP queries and selectors.
- Field exists with expected `type`, `interface`, and `uiSchema.title`.
- Local option fields expose the expected labels and values in `uiSchema.enum`, not only a bare string array.
- Relation field created the expected `foreignKey`, `through`, or `reverseField`.
- View collections still match `dbViews:get` output after synchronization.
