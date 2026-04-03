---
name: nocobase-data-modeling
description: Create and manage NocoBase data models via nocobase-cli. Use when users want to inspect or change collections, fields, relations, or view-backed schemas in a NocoBase app.
argument-hint: "[collection-name] [operation: list|get|apply|destroy|fields|db-views]"
allowed-tools: shell, local file reads, nocobase-cli
---

# Goal

Use `nocobase-cli` to inspect and change collections, fields, relations, and view-backed schemas.

Read `references/decision-matrix.md` first when the request is broad or the correct modeling path is unclear.

# Mandatory Gates

1. Confirm `nocobase-cli` is reachable and authenticated before any write operation.
2. For plugin-backed tables or fields, read `references/plugin-provided-capabilities.md` before mutating schema.
3. For `view` collections, verify the upstream database view exists with `db-views list|get` before creating or updating anything.
4. Before using a modeling command you have not used yet in the current task, run its `--help` once and follow the generated help text for flags and examples.

Stop and ask the user to fix auth when CLI returns `401`, `403`, `Auth required`, or equivalent token errors.

# Final Command Surface

Use only the `nocobase-cli data-modeling` commands:

- Inspect collections: `nocobase-cli data-modeling collections list`
- Inspect one collection: `nocobase-cli data-modeling collections get`
- Inspect fields in one collection: `nocobase-cli data-modeling collections fields list`
- Create or update a collection with compact payload: `nocobase-cli data-modeling collections apply`
- Create or update fields with compact payload: `nocobase-cli data-modeling fields apply`
- Delete a collection: `nocobase-cli data-modeling collections destroy`
- Inspect database views: `nocobase-cli data-modeling db-views list|get`

Prefer learning exact flags from help instead of keeping large command-shape reminders in prompt context:

- `nocobase-cli data-modeling collections apply --help`
- `nocobase-cli data-modeling collections fields list --help`
- `nocobase-cli data-modeling fields apply --help`
- `nocobase-cli data-modeling collections destroy --help`

Do not prefer older low-level collection or nested field commands when the final command surface can handle the task.

# Core Rules

1. Decide collection type first. Never infer `general`, `tree`, `file`, `calendar`, `sql`, `view`, or `inherit` from the name alone.
2. Prefer the compact payloads supported by `collections apply` and `fields apply`. Let the server fill derived defaults.
3. Do not guess special capabilities. Check references first for plugin-backed fields, relation variants, special collection types, and view-backed models.
4. Relations come after the base collection and scalar fields are correct.
5. Prefer `collections get` for routine post-mutation read-back. Use the verification result returned by `collections apply` when normalized diagnostics are needed.
6. If the requested behavior cannot be expressed through the final command surface, stop and explain what is missing instead of silently falling back to an older path.

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
