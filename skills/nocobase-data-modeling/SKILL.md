---
name: nocobase-data-modeling
description: Create and manage NocoBase data models via MCP. Use when users want to inspect or change collections, fields, relations, or view-backed schemas in a NocoBase app.
argument-hint: "[collection-name] [operation: inspect|create|update|fields|relations|sync-view]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

Use NocoBase MCP tools to inspect and change collections, fields, relations, and view-backed schemas.

Open `references/decision-matrix.md` first when the user request is broad, ambiguous, or could match more than one modeling path.

# Dependency Gate

- Related helper skills: `nocobase-mcp-setup`, `nocobase-workflow-manage`.
- Check whether NocoBase MCP tools are reachable before planning write operations.
- If MCP is not configured, guide the user to use `nocobase-mcp-setup`.
- If MCP tools return authentication errors such as `Auth required`, stop and ask the user to complete MCP authentication or refresh the MCP connection before continuing.
- If the modeling task is driven by workflow requirements, `nocobase-workflow-manage` may be used later to wire the resulting collections into workflow triggers and nodes.
- For plugin-provided tables or field interfaces, check `references/plugin-provided-capabilities.md` before planning mutations.

# Mandatory MCP Gate

Confirm the NocoBase MCP server is reachable and authenticated before attempting any collection or field mutation. Do not proceed with model changes until MCP exposes the relevant collection and field endpoints.

# Hard Rules

1. **Never choose a collection type from the name alone**. Decide `general`, `tree`, `file`, `calendar`, `sql`, `view`, or `inherit` from business behavior and built-in structure.
2. **Never guess missing field parameters**. If a field shape is uncertain, inspect existing collection metadata, plugin capability, or the bundled references first.
3. **Always treat table type as the first correctness gate**. A wrong collection template is a bigger modeling error than a missing relation alias.
4. **Always treat field payload completeness as the second correctness gate**. A field is not correct unless its `interface`, `type`, required `uiSchema`, enum, default state, and preset parameters all match the intended interface contract.
5. **Never wrap collection or field payloads in a redundant `values` object** when the current endpoint expects a direct request body. `collections:create`, `collections:update`, and `collections/{collectionName}/fields:update` use direct request bodies.
6. **Never rely blindly on template side effects** when the task is validating modeling quality. Prefer explicit payloads over optimistic assumptions about injected fields.
7. **Always create or confirm the collection before polishing relations**. Table structure and scalar field correctness come first; relation detail comes after the base table is sound.
8. **Always treat `collections:setFields` as replacement, not patching**. Do not use it for small edits unless full replacement is intended.
9. **Always verify after mutation**. Re-read collection and field metadata after every create, update, or delete step.
10. **Never weaken the schema into plain text substitutes** for files, hierarchy, or structured selectors unless the user explicitly wants that as the final design.
11. **Always gate plugin-provided features before use**. If the requested table, field interface, or backing resource comes from a plugin, confirm the plugin is installed and enabled first.
12. **If a required plugin is disabled, enable it before modeling against it**. Do not create fake substitute tables or weaker fallback fields just to proceed.
13. **For `view` collections, the upstream database view is a hard prerequisite**. If `dbViews:list` or `dbViews:get` does not find it, stop. Do not fabricate a `view` collection and do not fall back to `general`.
14. **If a plugin-backed field cannot be enabled through the current path, stop and tell the user exactly which plugin is required**. Do not hard-build a guessed replacement field.
15. **Never use guessed plugin identifiers for plugin-management actions**. Inspect the app's actual plugin list first and use the runtime plugin `name` returned by the instance, not a derived npm package name.
16. **If plugin enablement returns `plugin name invalid`, treat that as a plugin-name resolution failure**. Go back to plugin inspection, resolve the real runtime plugin `name`, and do not continue with any schema mutation until that gate is clean.
17. **For MCP plugin-management actions, use the parameter shape expected by the endpoint**. Do not send plugin enablement in `requestBody.name` when the endpoint expects `filterByTk`.

# Scope Priority

This skill should prioritize these risks in this order:

1. wrong collection type;
2. wrong field interface or field type;
3. missing field parameters;
4. relation direction and reverse-field details.

Required reference loading by modeling intent:

- If the task is mainly about creating the right table shape, read `references/collection-types/index.md` and the matching collection-type file first.
- If the task is mainly about creating the right field set or avoiding field-type drift, read `references/field-capabilities.md` first.
- After opening `references/field-capabilities.md`, continue into the matching `references/fields/*.md` file for the actual field family in scope.
- Use `references/relation-fields.md` when relation fields are actually in scope, but do not let relation detail distract from collection and field correctness.
- After opening `references/relation-fields.md`, continue into the matching `references/relations/*.md` file for the specific relation family in scope.
- When the user needs a whole working schema, derive it from collection, field, relation, and plugin references first. Use `references/model-packs/*.md` only as integration examples after the lower-level schema decisions are already made.
- When the requested feature is plugin-backed, read `references/plugin-provided-capabilities.md` before schema mutation.

# Orchestration Process

## Planning Phase

Before making MCP write calls, clarify these points:

1. **Business object**: what does the table represent?
2. **Collection type**: is it `general`, `tree`, `file`, `calendar`, `sql`, `view`, or `inherit`?
3. **Primary-key strategy**: explicit `id`, `snowflakeId`, `uuid`, `nanoid`, or another confirmed strategy?
4. **Required fields**: which scalar, choice, datetime, rich text, media, and system fields are required?
5. **Relations**: which related collections exist, and which side owns the foreign key?
6. **Plugin dependency**: does any requested field, resource, or table depend on a plugin-provided capability?
7. **Verification target**: after mutation, which metadata fields prove the model is correct?

Summarize the intended model in natural language before making destructive or broad schema changes.

Then map the requested action to the corresponding MCP-exposed endpoint:

- Collection discovery and metadata inspection -> `collections:listMeta`, `collections:list`, `collections:get`
- Field discovery -> `collections/{collectionName}/fields:list`, `collections/{collectionName}/fields:get`
- Collection creation and updates -> `collections:create`, `collections:update`
- Field creation and updates -> `collections/{collectionName}/fields:create`, `collections/{collectionName}/fields:update`
- Field replacement -> `collections:setFields`
- View synchronization and inspection -> `dbViews:list`, `dbViews:get`, plus the relevant collection sync endpoint exposed by the instance

Use `references/mcp-mutation-sequences.md` when the user needs an execution pattern for inspect -> mutate -> read-back, not just a target schema.

## Inspect First

1. Inspect first.
   - Prefer `collections:listMeta` when available because it includes loaded collection options and field definitions.
   - Otherwise use `collections:list`, `collections:get`, and `collections/{collectionName}/fields:list`.
2. Choose the collection type before designing fields.
   - Do not default to `general` until you have checked whether the business object is hierarchical, calendar-oriented, file-oriented, SQL-backed, inherited, or view-backed.
   - Load `references/collection-types/index.md` and then the matching collection-type file.

## Creating a New Collection

1. **Choose the collection type first**
   - `general` for ordinary business records
   - `tree` for parent-child structure
   - `file` when the file itself is first-class
   - `calendar` when scheduling behavior is central
   - `sql`, `view`, `inherit` only after confirming instance capability
2. **Build the baseline collection payload**
   - Start from the matching reference file, not from memory
   - Confirm whether preset fields come from explicit field payloads or collection-level flags for that template
3. **Build the field list**
   - For every field, determine `interface`, `type`, `uiSchema`, `defaultValue`, enum, and preset parameters from `references/field-capabilities.md`
   - Then load the matching family reference in `references/fields/` for the concrete payload snippets
   - Do not proceed with partial shapes such as interface-only definitions when the current API path requires complete parameters
   - Do not start from a model pack and backfill field logic afterward
4. **Create the collection**
   - Use `collections:create` with a direct request body
5. **Add or adjust fields incrementally**
   - Use field create or update operations for targeted changes
   - Use `collections:setFields` only when full replacement is intentional
6. **Verify**
   - Re-read the collection and field metadata
   - Confirm type, title, template structure, and every field's actual metadata
   - Follow `references/verification-playbook.md` for the verification order and template-specific checks

## Model-Pack Use Rule

Use model packs as end-to-end comparison material, not as the primary modeling source.

Required order:

1. decide collection type
2. derive field payloads from the field references
3. derive relation payloads from the relation references
4. apply plugin gates when relevant
5. only then compare against a model pack if a multi-table example is still helpful

Hard constraints:

- Do not start with a model pack when the user is testing table correctness, field correctness, relation correctness, or plugin-backed capability correctness.
- Do not copy a model pack verbatim just because the business wording sounds similar.
- If a model pack conflicts with collection, field, relation, or plugin references, the lower-level references win.
- Prefer verification targets and explicit payloads over broad example reuse.

## Editing an Existing Collection

1. **Fetch the current collection and fields**
   - Use `collections:get` plus `collections/{collectionName}/fields:list`
2. **Identify the smallest safe change**
   - Add missing fields
   - Update drifted field payloads
   - Replace fields only when patching is insufficient
3. **Edit in the correct order**
   - Fix collection type assumptions first
   - Fix primary key and preset-field strategy second
   - Fix scalar and choice fields third
   - Fix relation fields after base table correctness is stable
4. **Verify**
   - Re-read modified metadata after each step
   - Use `references/verification-playbook.md` when the mutation touched templates, preset fields, or relations

## View-Backed and Special Collections

- For `view`, inspect `dbViews:list` or `dbViews:get` before changing fields.
- If the upstream database view is missing, stop and tell the user to create the view first or switch the plan to `sql` or an ordinary collection only if that is the real intent.
- Do not create a fake `view` collection just because the requested name sounds like a reporting object.
- For `sql`, `view`, and `inherit`, confirm plugin and instance capability before creating anything.
- Do not invent payloads for unsupported special collection types.
- After synchronization, verify the resulting collection still matches the upstream view or special model contract.

# Collection-Type Rules

Common selection rules:

- `general`: ordinary transactional or master-data tables with custom business fields and relations.
- `tree`: hierarchical data such as departments, categories, regions, and nested directories.
- `calendar`: date-centric business objects that are primarily scheduled or shown on calendars.
- `file`: attachment, upload, document, image, scan, voucher, contract, or archive records where the file itself is a first-class object.
- `sql`: SQL-defined collections whose query logic is intentionally driven by SQL rather than ordinary field-by-field modeling.
- `view`: database-view-backed read models or reporting projections that should sync from an existing database view.
- `inherit`: inheritance-based models where shared fields belong on the parent and only specific fields belong on child collections.

Collection-type safeguards:

- For file-centric business objects, prefer a real `file` collection over a `general` collection with URL or path text fields.
- For tree semantics, use `tree` rather than emulating hierarchy with ad hoc self-relations in a general collection.
- If the business object is an ordinary business record with custom fields, start from `general`.
- If the business object is primarily an uploaded file record, start from `file`.
- If the business object is fundamentally hierarchical, start from `tree`.
- If the business object is fundamentally schedule-oriented, start from `calendar`.
- If the request sounds like a report, projection, or read model but no real upstream database view exists, do not choose `view` by name alone. Re-evaluate whether the correct target is `sql` or an ordinary collection.

# Preset-Field Rules

- Unless the user explicitly asks for another primary-key strategy, create `id` explicitly instead of relying on implicit id generation.
- For ordinary business collections, explicitly include `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` unless the business model clearly does not need them.
- For realistic modeling validation, collection-level convenience flags are not enough when the resulting metadata must mirror a real collection-manager payload.
- If the created collection does not expose the expected explicit preset `id` field after verification, treat that as a modeling failure and fix it before continuing.

# Field Rules

- Use `references/field-capabilities.md` for interface-to-type mapping.
- Treat field creation accuracy as a primary objective, not a secondary detail.
- For plugin-provided interfaces such as `chinaRegion`, attachment-adjacent interfaces, or `mbm`, confirm plugin capability first.
- Try to enable the required plugin first when the instance exposes plugin management.
- If enablement is unavailable or fails, report the exact plugin package name to the user and stop that part of the modeling flow.
- For each field, verify the minimum complete shape before sending the create call: `name`, `interface`, `type`, and any required `uiSchema`, `defaultValue`, enum, or preset-field parameters.
- For ordinary scalar fields, the default expectation is:
  - a concrete `type`;
  - a `uiSchema.title`;
  - a concrete `uiSchema.x-component`;
  - any validator or component props required by that interface.
- For local choice fields such as `select`, `multipleSelect`, `radioGroup`, and `checkboxGroup`, put structured options in `uiSchema.enum`, usually `{ value, label }` objects.
- Do not reduce multi-select or checkbox-group fields to `type: json` unless the selected interface explicitly allows that and the payload shape still matches the interface contract.
- For full-field-table tasks, do not stop at a heuristic subset. Use the reference file as the source of truth for what is supported.
- For preset fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`, prefer known-good explicit payloads instead of convenience flags whenever modeling accuracy matters.
- If the user asks for a broad or vague model, accuracy still wins over speed. A smaller correct field set is better than a larger guessed field set.

# Relation Rules

- Use `references/relation-fields.md` before creating relation fields.
- Then load the matching relation-family reference in `references/relations/` for the concrete ownership pattern.
- For plugin-provided array-like relation interfaces such as `mbm`, check `references/plugin-provided-capabilities.md` first instead of assuming core `m2m`.
- The four core relation types are `belongsTo`, `hasOne`, `hasMany`, and `belongsToMany`.
- The important part is not only the type name. You must get direction, `foreignKey`, `sourceKey`, `targetKey`, `through`, `otherKey`, and `reverseField` correct.
- Prefer explicit relation payloads when relation behavior matters.
- If reverse behavior matters, pass `reverseField` explicitly instead of assuming the server will infer the correct alias.
- When changing relation fields, verify both source and target collections because reverse fields and foreign keys may be created or removed as side effects.

# Error Handling

- **MCP returns 400/422**: inspect the error carefully. Common causes are wrong collection template, unsupported field interface, missing enum payload, incomplete preset-field parameters, or invalid relation keys. Correct the payload and retry.
- **MCP returns 401/403**: stop modeling operations and ask the user to restore MCP authentication.
- **Collection creation succeeds but fields drift**: re-read the metadata immediately and correct the actual field definitions instead of assuming the request was applied as intended.
- **Special collection creation fails**: re-check plugin or data-source capability before retrying.
- **Relation mutation leaves artifacts**: re-read both source and target collections, then clean up leftover reverse fields or foreign keys explicitly.

# Verification Checklist

After completing any modeling operation, verify:

1. The collection exists and has the intended template or structural options.
2. The collection uses the intended primary-key strategy.
3. Preset audit fields are added where the business model needs them.
4. `filterTargetKey` and `titleField` match how the collection should be referenced.
5. Every field exists with the expected `type`, `interface`, `uiSchema.title`, and any required `defaultValue`, enum, or preset-field parameter.
6. Local choice fields expose the expected `uiSchema.enum` labels and values.
7. Tree, file, and calendar templates expose their required structural fields instead of a look-alike approximation.
8. Relation fields created the expected `foreignKey`, `through`, `otherKey`, `targetKey`, or `reverseField`.
9. View-backed collections still match `dbViews:get` output after synchronization.

# Reference Index

| Topic | File |
| --- | --- |
| Collection type selection | `references/collection-types/index.md` |
| Reference routing decision matrix | `references/decision-matrix.md` |
| General collection baseline and examples | `references/collection-types/general.md` |
| File collection baseline and examples | `references/collection-types/file.md` |
| Tree collection baseline and examples | `references/collection-types/tree.md` |
| Calendar collection baseline and examples | `references/collection-types/calendar.md` |
| SQL collection guidance | `references/collection-types/sql.md` |
| View-backed collection guidance | `references/collection-types/view.md` |
| Inheritance collection guidance | `references/collection-types/inherit.md` |
| Plugin-provided tables and field capability gate | `references/plugin-provided-capabilities.md` |
| Field reference entry point | `references/field-capabilities.md` |
| Field family index | `references/fields/index.md` |
| Scalar field payloads | `references/fields/scalar.md` |
| Choice field payloads | `references/fields/choices.md` |
| Media and structured field payloads | `references/fields/media-and-structured.md` |
| Datetime field payloads | `references/fields/datetime.md` |
| System and advanced field payloads | `references/fields/system-and-advanced.md` |
| Advanced plugin-backed field payloads | `references/fields/advanced-plugin-fields.md` |
| Relation reference entry point | `references/relation-fields.md` |
| Relation family index | `references/relations/index.md` |
| Many-to-one relation payloads | `references/relations/m2o.md` |
| One-to-many relation payloads | `references/relations/o2m.md` |
| One-to-one relation payloads | `references/relations/o2o.md` |
| Many-to-many relation payloads | `references/relations/m2m.md` |
| Many-to-many array relation payloads | `references/relations/mbm.md` |
| End-to-end model pack index | `references/model-packs/index.md` |
| Orders transactional model pack | `references/model-packs/orders.md` |
| Person and students inheritance pack | `references/model-packs/person-students.md` |
| Contracts and files model pack | `references/model-packs/contracts-files.md` |
| Calendar appointments model pack | `references/model-packs/calendar-appointments.md` |
| Tree categories model pack | `references/model-packs/tree-categories.md` |
| SQL and view analytics pack | `references/model-packs/sql-view-analytics.md` |
| Verification workflow and read-back checks | `references/verification-playbook.md` |
| MCP inspect and mutation sequences | `references/mcp-mutation-sequences.md` |
