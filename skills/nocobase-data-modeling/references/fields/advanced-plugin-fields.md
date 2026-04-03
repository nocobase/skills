# Advanced Plugin Fields

Use this file for advanced or plugin-backed field interfaces that are not ordinary baseline business fields.

These fields are higher risk than the core scalar, choice, datetime, and relation families because they often depend on plugin enablement or instance-specific capability.

## Use order

Before creating any field in this file:

1. confirm the relevant plugin or capability is enabled
2. inspect the actual runtime plugin `name` used by the instance for plugin management
3. if disabled, try to enable it through the current management path using that runtime plugin `name`
4. if enablement cannot be completed, stop and tell the user the exact plugin package that is required
5. confirm the field interface is actually exposed in the current instance
6. only then build the field payload
7. verify the created metadata immediately after mutation

Do not attempt field creation as a plugin-detection shortcut.

## Field groups in this file

- `markdownVditor`
- `attachmentURL`
- `formula`
- `sort`
- `code`
- `sequence`
- `encryption`
- `space`
- map-based geometry

## Detailed plugin field references

Use these dedicated files first when the requested field has more than a trivial payload:

- `plugins/formula.md`
- `plugins/sort.md`
- `plugins/code.md`
- `plugins/sequence.md`
- `plugins/encryption.md`
- `plugins/map-fields.md`

## Markdown Vditor

Typical plugin:

- `@nocobase/plugin-field-markdown-vditor`
- runtime plugin `name`: `field-markdown-vditor`

When to use:

- the user explicitly wants the Vditor markdown experience instead of ordinary markdown

Canonical payload:

```json
{
  "name": "contentMd",
  "interface": "markdownVditor",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Markdown content",
    "x-component": "MarkdownVditor"
  }
}
```

Do not use this interface unless the plugin capability is enabled. If the user only needs normal markdown and the plugin is unavailable, use ordinary `markdown`.

## Attachment URL

Typical plugin:

- `@nocobase/plugin-field-attachment-url`
- runtime plugin `name`: `field-attachment-url`

Related capability:

- attachment or file-manager support
- related runtime plugin `name`: `file-manager`

When to use:

- the user explicitly wants upload behavior surfaced as a URL-style field

Canonical payload:

```json
{
  "name": "coverUrl",
  "interface": "attachmentURL",
  "type": "string",
  "target": "attachments",
  "targetKey": "id",
  "uiSchema": {
    "type": "string",
    "title": "Cover URL",
    "x-component": "AttachmentUrl",
    "x-use-component-props": "useAttachmentUrlFieldProps"
  }
}
```

Important details:

- `target` is required
- this is not the same as the normal `attachment` field
- if the file itself is first-class, use a `file` collection instead

## Formula

Typical plugin:

- `@nocobase/plugin-field-formula`
- runtime plugin `name`: `field-formula`

When to use:

- the user explicitly wants a computed field rather than stored manual input

Read first:

- `plugins/formula.md`

Short rule:

- do not treat `formula` as a normal scalar field
- use the dedicated formula reference for `dataType`, `engine`, and `expression`

## Sort

Typical plugin:

- `@nocobase/plugin-field-sort`
- runtime plugin `name`: `field-sort`

When to use:

- the user explicitly needs sortable ordering semantics backed by the sort-field capability

Read first:

- `plugins/sort.md`

Short rule:

- do not model `sort` as a plain numeric field
- use the dedicated sort reference for `type: "sort"` and `scopeKey`

## Code

Typical plugin:

- `@nocobase/plugin-field-code`
- runtime plugin `name`: `field-code`

When to use:

- the user wants code-oriented content rather than ordinary text

Read first:

- `plugins/code.md`

Short rule:

- do not model `code` as ordinary textarea text
- use the dedicated code reference for `CodeEditor`, `language`, and editor props

## Sequence

Typical plugin:

- `@nocobase/plugin-field-sequence`
- runtime plugin `name`: `field-sequence`

When to use:

- the user wants managed sequence-style identifiers rather than plain input

Read first:

- `plugins/sequence.md`

Short rule:

- do not reduce `sequence` to a plain string field
- use the dedicated sequence reference for `patterns`, `inputable`, `match`, and rule-item schemas

## Encryption

Typical plugin:

- `@nocobase/plugin-field-encryption`
- runtime plugin `name`: `field-encryption`

License note:

- this plugin is exposed from the pro plugin set, so capability must be confirmed in the current instance before modeling against it

When to use:

- the user explicitly wants encrypted field storage

Read first:

- `plugins/encryption.md`

Short rule:

- do not treat `encryption` as plain text or a password widget shortcut
- use the dedicated encryption reference for `hidden`, operator semantics, and pro-plugin gating

## Space

Typical capability:

- multi-space support in the current instance
- common runtime plugin `name`: `multi-space`

When to use:

- the model must be space-aware and the instance exposes `spaces`

Canonical payload:

```json
{
  "name": "space",
  "interface": "space",
  "type": "belongsTo",
  "target": "spaces",
  "foreignKey": "spaceId",
  "uiSchema": {
    "type": "object",
    "title": "Space",
    "x-component": "AssociationField",
    "x-component-props": {
      "fieldNames": {
        "value": "id",
        "label": "title"
      }
    }
  }
}
```

Important rule:

- do not use `space` unless multi-space capability and backing `spaces` support are confirmed

## Map-based geometry

Typical plugin:

- `@nocobase/plugin-map`
- runtime plugin `name`: `map`

When to use:

- the user explicitly wants map-based geometry behavior such as point, line, circle, or polygon storage

Read first:

- `plugins/map-fields.md`

Short rule:

- do not treat map geometry as generic `json`
- use the dedicated map reference for `point`, `lineString`, `circle`, `polygon`, and `mapType`

## Verification checklist

For fields in this file, verify at least:

1. the interface exists in the current instance
2. the plugin-backed capability was enabled before creation
3. the stored `interface` and `type` match the intended advanced field
4. the field is not silently downgraded to a weaker built-in type
5. any backing collection or resource exists when required

## Anti-drift rules

- do not create plugin-backed fields before checking enablement
- do not substitute weaker built-in fields unless the user accepts the downgrade
- do not invent plugin-specific config that the current instance may not support
