---
name: nocobase-data-modeling
description: Create and manage NocoBase data models via nocobase-api. Use when users want to inspect or change collections, fields, relations, or view-backed schemas in a NocoBase app.
argument-hint: "[collection-name] [operation: list|get|apply|destroy|fields|db-views]"
allowed-tools: shell, local file reads, nocobase-api
---

# Goal

Use `nocobase-api` to inspect and change collections, fields, relations, and view-backed schemas.

Read `references/decision-matrix.md` first when the request is broad or the correct modeling path is unclear.

# Mandatory Gates

1. Confirm `nocobase-api` is reachable and authenticated before any write operation.
2. For plugin-backed tables or fields, read `references/plugin-provided-capabilities.md` before mutating schema.
3. For `view` collections, verify the upstream database view exists with `db-views list|get` before creating or updating anything.
4. Before using a modeling command you have not used yet in the current task, run its `--help` once and follow the generated help text for flags and examples.

Stop and ask the user to fix auth when CLI returns `401`, `403`, `Auth required`, or equivalent token errors.

# Final Command Surface

Use only the `nocobase-api data-modeling` commands:

- Inspect collections: `nocobase-api data-modeling collections list`
- Inspect one collection: `nocobase-api data-modeling collections get`
- Inspect fields in one collection: `nocobase-api data-modeling collections fields list`
- Create or update a collection with compact payload: `nocobase-api data-modeling collections apply`
- Create or update fields with compact payload: `nocobase-api data-modeling fields apply`
- Delete a collection: `nocobase-api data-modeling collections destroy`
- Inspect database views: `nocobase-api data-modeling db-views list|get`

Prefer learning exact flags from help instead of keeping large command-shape reminders in prompt context:

- `nocobase-api data-modeling collections apply --help`
- `nocobase-api data-modeling collections fields list --help`
- `nocobase-api data-modeling fields apply --help`
- `nocobase-api data-modeling collections destroy --help`

Do not prefer older low-level collection or nested field commands when the final command surface can handle the task.

# Core Rules

1. Decide collection type first. Never infer `general`, `tree`, `file`, `calendar`, `sql`, `view`, or `inherit` from the name alone.
2. Prefer the compact payloads supported by `collections apply` and `fields apply`. Let the server fill derived defaults.
3. Do not guess special capabilities. Check references first for plugin-backed fields, relation variants, special collection types, and view-backed models.
4. Relations come after the base collection and scalar fields are correct.
5. Prefer `collections get` for routine post-mutation read-back. Use the verification result returned by `collections apply` when normalized diagnostics are needed.
6. If the requested behavior cannot be expressed through the final command surface, stop and explain what is missing instead of silently falling back to an older path.

## Compact Payload Rules

- When creating a collection with `collections apply`, do not send built-in system fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, or template-owned structural fields unless the current command help explicitly says they are required.
- For `general`, `tree`, `file`, and other built-in templates, assume the server will create the template defaults. Only send business fields that the user is actually adding.
- For `file`, do not manually send built-in fields such as `title`, `filename`, `extname`, `size`, `mimetype`, `path`, `url`, `preview`, `storage`, or `meta` unless the task is explicitly customizing one of those existing fields on an already-created collection.
- For `tree`, do not manually include `parentId`, `parent`, or `children` in the compact create payload unless you are intentionally overriding an existing schema with a fully expanded raw shape.
- Every custom field supplied to `collections apply` or `fields apply` still needs an explicit `interface`. The compact API reduces derived options, but it does not infer business field interfaces from the field name alone.
- Usually do not pass `type`. Let the server derive it from `interface`. Only pass `type` when the current command help or a reference explicitly requires it.
- Unknown `interface` values now fail fast. If the correct interface is unclear, stop and inspect references or command help instead of guessing.
- If you choose a plugin-backed interface such as `vditor`, `formula`, map geometry fields, or special relation fields, confirm the plugin-backed capability first.
- If a reference file shows a fully expanded collection JSON, treat it as structure reference or read-back reference, not as the preferred compact CLI payload.

## Default Interface Bias

- Prefer the common built-in interface first when the user does not request a plugin-specific editor or behavior.
- For long-form plain text without markdown semantics, prefer `textarea`.
- For markdown content, prefer `vditor` first when the plugin capability is available.
- Only fall back from `vditor` to ordinary `markdown` when the plugin is unavailable or the user explicitly wants the simpler markdown field.
- Do not add `tableoid` unless the user explicitly asks for that system-info field.
- For map fields, use the exact interface requested by the spatial requirement, such as `point`, `lineString`, `circle`, or `polygon`. Do not collapse them into generic `json` or text.

## Formula Rule

- For `formula`, do not invent expressions from memory.
- Read `references/fields/plugins/formula.md` first.
- Choose the engine first, then write the expression in that engine's syntax.
- In compact payloads, prefer only the parameters that are actually needed, usually `name`, `title`, `interface`, `expression`, and optional `engine` or `dataType`.
- If the intended engine or syntax is unclear, stop and ask instead of guessing.

## Relation Key Rule

- For relation fields, read `references/relation-fields.md` before mutation.
- If the relation should be stable and readable, pass explicit keys such as `foreignKey`, `through`, `otherKey`, `sourceKey`, and `targetKey` instead of relying on generated defaults.
- Treat generated key names as fallback behavior, not as the preferred modeling result.

# Working Process

## 1. Inspect

- Start with `collections list` or `collections get`.
- When you need the current field set of one collection, use `collections fields list`.
- When the request involves a view-backed model, inspect `db-views list|get` first.
- Run the relevant command `--help` before first use in the current task.
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
- Use `collections destroy` only for explicit delete requests.

Compact payloads are preferred. Supply only the fields the command contract requires, such as collection template/name/title and field name/title/interface, plus any necessary special options that cannot be derived safely.

For collection creation, this usually means:

- collection-level options such as `name`, `title`, `template`, and a small number of template-specific flags;
- business fields only, not default system/template fields;
- relation-specific options only when the field interface is relational.

## 4. Verify

After each mutation, usually read back with `collections get`. When normalized diagnostics are needed, rely on the verification result returned by `collections apply`.

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
- `sql`, `view`, `inherit`: only after capability and prerequisites are confirmed.

Do not emulate `tree` or `file` with weaker general-table substitutes unless the user explicitly asks for that tradeoff.

# Field and Relation Safeguards

- Use `references/field-capabilities.md` as the source of truth for interface support.
- Do not guess plugin-backed interfaces such as region, special media, or custom relation capabilities.
- Use `references/relation-fields.md` before creating or changing relations.
- Verify both sides after relation changes, because reverse fields or keys may be created as side effects.

# Error Handling

- `400` or `422`: inspect the payload, then correct collection type, field interface, missing required options, enum shape, or relation keys before retrying.
- Auth errors: stop and ask the user to restore CLI auth.
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
