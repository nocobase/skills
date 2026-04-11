# Media And Structured Fields

Use this file for rich content, attachment-style media fields, and structured data payloads.

Compact-flow rule:

- for ordinary compact requests, start with `name`, `interface`, and optional `title`;
- add plugin-specific relation options such as `target` only when that interface needs them;
- do not proactively send `type` or full `uiSchema` unless the task is explicitly about advanced overrides or stored-shape inspection.

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `markdown` | `text` | `uiSchema.x-component = "Markdown"` |
| `vditor` | plugin-provided markdown field | requires Vditor markdown plugin |
| `richText` | `text` | `uiSchema.x-component = "RichText"` |
| `attachment` | attachment-capable relation field | requires attachment capability; use the real attachment interface, not plain URL text |
| `attachmentURL` | plugin-provided string field | requires attachment-url capability and explicit target collection |
| `json` | `json` | `uiSchema.x-component = "Input.JSON"` |

## Preferred compact snippets

### Markdown

```json
{
  "name": "contentMd",
  "interface": "markdown",
  "title": "Markdown content"
}
```

### Rich text

```json
{
  "name": "contentHtml",
  "interface": "richText",
  "title": "Rich text content"
}
```

### Vditor

```json
{
  "name": "contentMd",
  "interface": "vditor",
  "title": "Markdown content"
}
```

Use this only when the Vditor markdown plugin capability is enabled. Otherwise use ordinary `markdown`.

### Attachment

Use an attachment field when the file is only a subordinate field on the current record.

```json
{
  "name": "attachments",
  "interface": "attachment",
  "target": "attachments",
  "title": "Attachments"
}
```

If the file itself must be queryable and first-class, prefer a real `file` collection instead of an attachment field.

Plugin gate:

- confirm file-manager or equivalent attachment capability is enabled first
- if the user needs attachment URL behavior, confirm that plugin capability too

### Attachment URL

```json
{
  "name": "coverUrl",
  "interface": "attachmentURL",
  "target": "attachments",
  "targetKey": "id",
  "title": "Cover URL"
}
```

Use this only when the user explicitly wants attachment upload behavior represented as a URL-like field instead of a normal attachment relation or a first-class file collection.

### JSON

```json
{
  "name": "meta",
  "interface": "json",
  "title": "Meta"
}
```

## Expanded structure snippets

## Anti-drift rules

- do not replace `attachment` with a plain URL text field when file behavior matters
- do not use `attachmentURL` unless the attachment-url plugin capability is confirmed
- do not use `vditor` unless the Vditor plugin capability is confirmed
- when the user asked for markdown content, prefer `vditor` first if the plugin capability is available
- when the user only asked for plain long-form text without markdown semantics, prefer `textarea`
- do not replace `json` with long text when structured data is actually required
- do not choose a `file` collection when the user only needs a subordinate file field on another record
