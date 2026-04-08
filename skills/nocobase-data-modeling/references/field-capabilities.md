# Field Capabilities

Use this file when the main risk is field-type drift or missing field parameters.

This file is now the field-reference entry point. Use it to choose the correct field family first, then open the matching detailed file for compact payload guidance.

Typical intents:

- asking which field types are supported;
- asking for a table that covers all supported field types;
- mapping a field interface to an exact create payload;
- debugging wrong field types, incomplete field parameters, or inconsistent field behavior.

## Stable answer groups

Common field groups to mention first:

- basic scalar fields
- choices and enum fields
- rich text and media fields
- datetime fields
- relation fields
- advanced fields
- system fields

## Compact first checklist

For `nocobase-api data-modeling fields apply` and compact `collections apply` payloads, start from the smallest safe shape:

- `name`
- `interface`
- optional `title`
- interface-specific business options such as `enum`, `target`, `foreignKey`, `through`, `expression`, or plugin-required parameters when relevant

Only add `type`, `uiSchema`, or low-level storage options when:

- the current command help explicitly requires them;
- the field is a special preset or plugin capability that really needs them;
- or you are intentionally editing an existing field with advanced raw options.

## Minimum required payload matrix

Use this matrix when you need a fast payload check before sending a create call.

| Field family | Minimum required parts |
| --- | --- |
| Basic scalar | `name`, `interface`, optional `title` |
| Specialized scalar such as `email` or `phone` | basic scalar parts |
| Local choice field | `name`, `interface`, optional `title`, `enum` |
| Empty multi-valued choice field | local choice parts; compact flow can derive the empty default |
| Rich text or markdown | `name`, `interface`, optional `title` |
| Attachment-like field | `name`, `interface`, optional `title`, target or other relation options when required |
| Datetime field | `name`, `interface`, optional `title`, plus datetime-specific props only when the requirement really needs them |
| Preset audit field | normally omit from compact create payloads and let the template/server own them |
| Primary key field | only when intentionally overriding the default id strategy |

## Supported field inventory

### Basic scalar

- `input`
- `textarea`
- `phone`
- `email`
- `url`
- `integer`
- `number`
- `percent`
- `password`
- `color`
- `icon`
- `checkbox`

### Choices and enums

- `select`
- `multipleSelect`
- `radioGroup`
- `checkboxGroup`
- `chinaRegion`

### Rich text and media

- `markdown`
- `vditor`
- `richText`
- `attachment`
- `attachmentURL`

Default choice notes:

- prefer `textarea` for plain long text
- prefer `vditor` for markdown content when the plugin is enabled
- fall back to `markdown` when the Vditor plugin is unavailable or the simpler markdown field is explicitly preferred

### Datetime

- `datetime`
- `datetimeNoTz`
- `dateOnly`
- `unixTimestamp`
- `time`
- `createdAt`
- `updatedAt`

### Advanced and system

- `id`
- `snowflakeId`
- `uuid`
- `nanoid`
- `formula`
- `sort`
- `code`
- `sequence`
- `encryption`
- `json`
- `tableoid`
- `space`
- `createdBy`
- `updatedBy`

### Geometry and map

- `point`
- `lineString`
- `circle`
- `polygon`
- map-based geometry fields depend on map capability and should be treated as plugin-backed

## Datetime routing shortcut

When the user wording is specific, route by these exact meanings:

- `Datetime (with time zone)` -> `interface: "datetime"`
- `Datetime (without time zone)` -> `interface: "datetimeNoTz"`
- `DateOnly` -> `interface: "dateOnly"`
- `Time` -> `interface: "time"`
- `Unix Timestamp` -> `interface: "unixTimestamp"`

## Practical field bundles

### Realistic business-table baseline

Use this bundle for a normal `general` collection unless the user clearly wants a special case:

- `id`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- 2 to 6 business scalar fields
- optional local choice fields
- relation fields only after the scalar core is correct

### File-bearing business record

Choose one of these two patterns:

- one or two attachment fields on a `general` business table when files are only subordinate;
- a dedicated `file` collection plus relation fields when files are first-class records.

### Full-field coverage table

When the user wants a broad test or showcase table:

- include one representative field per important interface group;
- keep one primary-key strategy only;
- include explicit enum options for local choice fields;
- avoid mixing special-purpose field types that require incompatible business semantics unless the user explicitly wants a stress test;
- if the goal is realistic modeling, still keep preset fields and business coherence instead of forcing every niche interface into one table.

## Full-table composition rule

When building a broad demonstration table or a field-coverage table:

1. add preset fields first if the table is meant to be realistic;
2. add basic scalar fields;
3. add local choice fields with explicit enums;
4. add rich text and media fields;
5. add datetime fields;
6. add advanced fields only when they do not conflict with the chosen primary-key strategy;
7. add relation fields last.

Do not mix multiple primary-key strategies in the same table unless the user explicitly wants a special test case.

## Common mistakes by field family

### Scalar fields

- using `input` when a stronger specialized interface such as `email`, `url`, `phone`, or `password` is required;
- forgetting validators or component props required by the chosen interface.

### Choice fields

- omitting `uiSchema.enum`;
- using the wrong storage type for multi-valued choices;
- forgetting `defaultValue: []` on empty multi-valued fields.

### Media and structured fields

- replacing `attachment` with a plain URL text field;
- replacing `chinaRegion` with unstructured text;
- replacing `json` with long text when structured data is actually required.

### Preset and system fields

- sending preset fields into compact create payloads when the template already owns them;
- mixing multiple primary-key strategies;
- forgetting `field` on `createdAt` or `updatedAt`;
- forgetting `target` and `foreignKey` on `createdBy` or `updatedBy`.

## Anti-drift rules

- Do not answer field-capability questions from memory only; use this file and the linked family references as the source of truth.
- In compact modeling flows, do not default to explicit `type` or full `uiSchema` when `interface` already determines them.
- Do not turn every multi-valued field into `type: json`; follow the interface contract first.
- Do not omit `defaultValue: []` for `multipleSelect` and `checkboxGroup` when the field should start empty.
- Do not replace attachment, china-region, or relation-capable fields with plain text or json substitutes unless the user explicitly wants that weaker design as the final model.
- For plugin-backed interfaces, try to enable the required plugin first. If that is not possible, stop and tell the user which plugin is required instead of inventing a replacement field.
- Do not stop after confirming that an interface exists. The payload still needs the correct relation keys, enum values, plugin prerequisites, or special options that interface depends on.
- Do not mix `id`, `snowflakeId`, `uuid`, and `nanoid` as competing primary-key fields in one realistic business table.
- Do not let a broad `all field types` request weaken correctness for common business fields.

## Detailed field references

- `references/fields/index.md`
- `references/fields/scalar.md`
- `references/fields/choices.md`
- `references/fields/media-and-structured.md`
- `references/fields/datetime.md`
- `references/fields/system-and-advanced.md`
- `references/fields/advanced-plugin-fields.md`
- `references/relation-fields.md`
