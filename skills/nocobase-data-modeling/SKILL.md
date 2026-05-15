---
name: nocobase-data-modeling
description: Create and manage NocoBase data models through the available data-modeling surface. Use when users want to inspect or change collections, fields, relations, or view-backed schemas in a NocoBase app.
argument-hint: "[collection-name] [operation: list|get|apply|destroy|fields|db-views]"
allowed-tools: shell, local file reads
---

# Goal

Use the available NocoBase data-modeling surface to inspect and change collections, fields, relations, and view-backed schemas.

Prefer the transport in this order:

- the `nb api data-modeling` CLI whenever it is available
- another equivalent data-modeling transport only when the CLI is unavailable and it exposes the same operation surface

Do not make the skill depend on one executable name. Treat CLI command names and equivalent wrappers as transport details around the same modeling operations.

Transport-selection rule:

1. Check whether the `nb api data-modeling` CLI is available in the current environment.
2. If it is available, use the CLI.
3. If the CLI is available but not authenticated for the target app, stop and guide the user to authenticate the CLI.
4. Only fall back to another equivalent transport when the CLI itself is unavailable.

Read `references/decision-matrix.md` first when the request is broad or the correct modeling path is unclear.

# Mandatory Gates

1. Confirm the chosen data-modeling transport is reachable and authenticated before any write operation. If `nb api data-modeling` CLI is available, that should be the chosen transport.
2. For plugin-backed tables or fields, read `references/plugin-provided-capabilities.md` before mutating schema.
3. For `view` collections, verify the upstream database view exists with `db-views list|get` before creating or updating anything.
4. Before using a CLI modeling command you have not used yet in the current task, run its `--help` once and follow the generated help text for flags and examples. When CLI is unavailable and another non-CLI transport must be used, inspect its exposed parameter schema before first use.

Stop and ask the user to fix auth when the chosen transport returns `401`, `403`, `Auth required`, or equivalent access errors. If the chosen transport is `nb api data-modeling` CLI, guide the user to restore CLI authentication rather than switching transports.

# Final Command Surface

Use only this final data-modeling operation surface:

- Inspect collections: `collections list`
- Inspect one collection: `collections get`
- Inspect fields in one collection: `collections fields list`
- Inspect enabled external data sources: `dataSources list-enabled`
- Inspect collections in one external data source: `dataSources collections list`
- Inspect fields in one external data source collection: `dataSourcesCollections.fields list`
- Create or update a collection with compact payload: `collections apply`
- Create or update fields with compact payload: `fields apply`
- Create or update external data source fields with compact payload: `dataSourcesCollections.fields apply`
- Delete a collection: `collections destroy`
- Inspect database views: `db-views list|get`

When the transport is CLI-based, prefer learning exact flags from help instead of keeping large command-shape reminders in prompt context:

- `nb api data-modeling collections apply --help`
- `nb api data-modeling collections fields list --help`
- `nb api data-modeling fields apply --help`
- `nb api data-modeling data-sources list-enabled --help`
- `nb api data-modeling data-sources collections list --help`
- `nb api data-modeling data-sources-collections fields list --help`
- `nb api data-modeling data-sources-collections fields apply --help`
- `nb api data-modeling collections destroy --help`

Do not prefer older low-level collection or nested field commands when the final command surface can handle the task.

# Core Rules

1. Decide collection type first. Never infer `general`, `tree`, `file`, `calendar`, `comment`, `sql`, `view`, or `inherit` from the name alone.
2. If the user explicitly asks for a file table, file collection, `template: "file"`, or uses wording such as "文件表", "合同文件", "扫描件", "证书文件", or "the file itself is the record", treat that as a binding collection-type requirement and choose `template: "file"` first.
3. If the user explicitly asks for a comment table, comment collection, comments, `template: "comment"`, "评论表", or "评论插件的表", treat that as a binding plugin-backed collection-type requirement and choose `template: "comment"` after the comments plugin gate.
4. Do not reinterpret a file-first or comment-first request as a `general` collection just because extra metadata fields are also needed.
5. Prefer the compact payloads supported by `collections apply` and `fields apply`. Let the server fill derived defaults.
6. Do not guess special capabilities. Check references first for plugin-backed fields, relation variants, special collection types, and view-backed models.
7. Relations come after the base collection and scalar fields are correct.
8. Prefer the structured response returned by `collections apply` or `fields apply` for routine post-mutation confirmation. Use follow-up `collections get` or `collections fields list` only when the apply response is missing details needed for the task, or when relation/template side effects must be inspected in full.
9. If the requested behavior cannot be expressed through the final command surface in the chosen transport, stop and explain what is missing instead of silently falling back to an older path.
10. For business identifiers, prefer `sequence` when the user asks for 编码, 编号, 单号, 序号, 流水号, or similar auto-generated codes. Reserve `code` for code-editor content such as source code, SQL, JSON, or other syntax-oriented text.

## Compact Payload Rules

- When creating a collection with `collections apply`, do not send built-in system fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, or template-owned structural fields unless the current command help explicitly says they are required.
- For `general`, `tree`, `file`, `calendar`, `comment`, and other supported templates, assume the server will create the template defaults. Only send business fields that the user is actually adding.
- For `file`, do not manually send built-in fields such as `title`, `filename`, `extname`, `size`, `mimetype`, `path`, `url`, `preview`, `storage`, or `meta` unless the task is explicitly customizing one of those existing fields on an already-created collection.
- For `comment`, do not manually send the template-owned `content` field in a compact create payload unless the task is explicitly customizing that existing field on an already-created comment collection. The server baseline owns `content`.
- For `tree`, do not manually include `parentId`, `parent`, or `children` in the compact create payload unless you are intentionally overriding an existing schema with a fully expanded raw shape.
- Every custom field supplied to `collections apply` or `fields apply` still needs an explicit `interface`. The compact API reduces derived options, but it does not infer business field interfaces from the field name alone.
- For local choice fields passed through `collections apply` or `fields apply` (`select`, `multipleSelect`, `radioGroup`, `checkboxGroup`), every enum item must be an object with explicit `value`, `label`, and `color`. Do not use string shorthand such as `["draft", "paid"]`.
- Allowed choice colors are `red`, `magenta`, `volcano`, `orange`, `gold`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple`, and `default`.
- Usually do not pass `type`. Let the server derive it from `interface`. Only pass `type` when the current command help or a reference explicitly requires it.
- Unknown `interface` values now fail fast. If the correct interface is unclear, stop and inspect references or command help instead of guessing.
- If you choose a plugin-backed interface such as `vditor`, `formula`, map geometry fields, or special relation fields, confirm the plugin-backed capability first.
- If a reference file shows a fully expanded collection JSON, treat it as structure reference or read-back reference, not as the preferred compact apply payload.

## Default Interface Bias

- Prefer the common built-in interface first when the user does not request a plugin-specific editor or behavior.
- For long-form plain text without markdown semantics, prefer `textarea`.
- For markdown content, prefer `vditor` first when the plugin capability is available.
- Only fall back from `vditor` to ordinary `markdown` when the plugin is unavailable or the user explicitly wants the simpler markdown field.
- For `comment` collections, let the template create the markdown-capable `content` field instead of adding a separate plain text substitute.
- Do not add `tableoid` unless the user explicitly asks for that system-info field.
- For map fields, use the exact interface requested by the spatial requirement, such as `point`, `lineString`, `circle`, or `polygon`. Do not collapse them into generic `json` or text.

## Formula Rule

- For `formula`, do not invent expressions from memory.
- Read `references/fields/plugins/formula.md` first.
- Choose the engine first, then write the expression in that engine's syntax.
- In compact payloads, prefer only the parameters that are actually needed, usually `name`, `title`, `interface`, `expression`, and optional `engine` or `dataType`.
- If the intended engine or syntax is unclear, stop and ask instead of guessing.

## Server-Side Field Validation Rule

NocoBase supports server-side field validation through field options. These rules run in repository `create` and `update`, and are based on Joi. They are different from frontend `uiSchema.x-validator`; do not use `x-validator` when the user asks for service-side or database-model validation.

Prefer the compact `validators` shorthand in `fields apply` or nested collection fields. The server converts it to `validation.rules`, fills missing rule keys, and infers `validation.type` from the field interface:

```json
{
  "collectionName": "contacts",
  "name": "email",
  "title": "Email",
  "interface": "email",
  "validators": ["required", "email"]
}
```

Use full `validation` when the Joi type or rule shape must be explicit:

```json
{
  "collectionName": "orders",
  "name": "amount",
  "interface": "number",
  "validation": {
    "type": "number",
    "rules": [
      { "key": "required", "name": "required" },
      { "key": "min", "name": "min", "args": { "limit": 0 } },
      { "key": "precision", "name": "precision", "args": { "limit": 2 } }
    ]
  }
}
```

Common Joi-based rules:

- `string`: `required`, `min`, `max`, `length`, `pattern`, `email`, `uri`, `uuid`, `hex`.
- `number`: `required`, `min`, `max`, `greater`, `less`, `integer`, `multiple`, `precision`.
- `date`: `required`, `min`, `max`, `greater`, `less`, `timestamp`.
- `boolean` and `object`: mainly `required`.

Argument conventions:

- Rules such as `min`, `max`, `length`, and `precision` use `args: { "limit": value }`.
- `pattern` uses `args: { "regex": "^[A-Z]+$" }`.
- Rules that expect a Joi options object, such as `email`, `uuid`, or `uri`, may use `paramsType: "object"` with an options object in `args`.

Add validation rules when the business requirement says a value is required, must match a format, must stay within a length or numeric range, must use a fixed decimal precision, or must match a stable identifier format. Avoid adding strict rules just from field names alone if the requirement is ambiguous.

## Relation Key Rule

- For relation fields, read `references/relation-fields.md` before mutation.
- If the relation should be stable and readable, pass explicit keys such as `foreignKey`, `through`, `otherKey`, `sourceKey`, and `targetKey` instead of relying on generated defaults.
- Treat generated key names as fallback behavior, not as the preferred modeling result.

# Working Process

## 1. Inspect

- Start with `collections list` or `collections get`.
- When you need the current field set of one collection, use `collections fields list`.
- When the request involves a view-backed model, inspect `db-views list|get` first.
- In CLI flows, run the relevant command `--help` before first use in the current task.
- For broad modeling tasks, load the matching references before writing.

## 2. Decide the model

Before writing, determine:

- what the collection represents;
- which collection type is correct;
- which fields are required;
- whether relations are needed;
- whether any plugin capability is required;
- what verification output will prove the result is correct.

Summarize the intended model in natural language before destructive or broad changes.

## 3. Apply

- Use `collections apply` for collection-level creation or updates.
- Use `fields apply` for targeted field creation or updates.
- Use `dataSources list-enabled`, `dataSources collections list`, and `dataSourcesCollections.fields list` to inspect external data source metadata before writing relation fields.
- Use `dataSourcesCollections.fields apply` for external data source field metadata updates, especially relation fields on external data source collections.
- Use `collections destroy` only for explicit delete requests.

Compact payloads are preferred. Supply only the fields the command contract requires, such as collection template/name/title and field name/title/interface, plus any necessary special options that cannot be derived safely.

For external data source relation fields, do not use main data source `fields apply`. Use `dataSourcesCollections.fields apply` with the external collection locator and compact relation interface, for example `interface: "m2o"`, `name`, `target`, and explicit keys when stable names matter.

For collection creation, this usually means:

- collection-level options such as `name`, `title`, `template`, and a small number of template-specific flags;
- business fields only, not default system/template fields;
- relation-specific options only when the field interface is relational.

## 4. Verify

After each mutation, first inspect the apply response. `collections apply` should return key collection summary fields, applied field summaries, and verification diagnostics. `fields apply` should return the applied field summary.

Do not automatically run a second `get` or `list` after every successful apply. Read back only when the apply response does not include the details needed to prove the requested outcome, or when the task involves relation ownership, reverse fields, plugin/template side effects, or a user explicitly asks for a full read-back.

Confirm:

1. the collection type is correct;
2. the expected fields exist with the right interface/type/title;
3. relation ownership and reverse behavior are correct when relations were changed;
4. special collections still satisfy their source constraints.

# Reference Loading

Load only the references needed for the active task:

- Collection type choice: `references/collection-types/index.md`
- Field family and supported options: `references/field-capabilities.md`
- Relations: `references/relation-fields.md`
- Plugin-backed capabilities: `references/plugin-provided-capabilities.md`
- Whole-schema examples after lower-level decisions: `references/model-packs/*.md`
- Verification order and template-specific checks: `references/verification-playbook.md`

After opening an index file, continue only into the matching subtype file that is actually in scope.

# Collection Type Safeguards

- `general`: ordinary business records.
- `tree`: hierarchical data.
- `file`: file-centric records where the file is first-class.
- `calendar`: schedule-oriented objects.
- `comment`: plugin-backed comment records with a template-owned `content` field.
- `sql`, `view`, `inherit`: only after capability and prerequisites are confirmed.

Do not emulate `tree`, `file`, or `comment` with weaker general-table substitutes unless the user explicitly asks for that tradeoff.

Explicit override rule:

- If the request contains "file collection", "file table", "文件表", or equivalent wording that makes the file the primary record, this overrides any default bias toward `general`.
- When the request mentions contracts as managed files, scanned documents, certificates, invoices, archives, or uploaded document records, default to `file` unless the user explicitly says the file is only a subordinate attachment on another business table.
- If the request contains "comment collection", "comment table", `template: "comment"`, "评论表", or "评论插件的表", this overrides any default bias toward `general`; confirm the comments plugin and use `template: "comment"`.

# Field and Relation Safeguards

- Use `references/field-capabilities.md` as the source of truth for interface support.
- Do not guess plugin-backed interfaces such as region, special media, or custom relation capabilities.
- Use `references/relation-fields.md` before creating or changing relations.
- Verify both sides after relation changes, because reverse fields or keys may be created as side effects.

# Error Handling

- `400` or `422`: inspect the payload, then correct collection type, field interface, missing required options, enum shape, missing/invalid enum colors, or relation keys before retrying.
- Auth errors: stop and ask the user to restore access for the chosen transport.
- Missing plugin or view prerequisite: stop and tell the user exactly what is missing.

# Reference Index

| Topic | File |
| --- | --- |
| Collection type selection | `references/collection-types/index.md` |
| Field capability matrix | `references/field-capabilities.md` |
| Relation overview | `references/relation-fields.md` |
| Plugin-backed modeling capabilities | `references/plugin-provided-capabilities.md` |
| Whole-schema examples | `references/model-packs/*.md` |
| Verification order and checks | `references/verification-playbook.md` |
| Decision helper | `references/decision-matrix.md` |
