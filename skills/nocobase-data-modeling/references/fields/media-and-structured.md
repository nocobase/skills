# Media And Structured Fields

Use this file for rich content, attachment-style media fields, and structured data payloads.

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `markdown` | `text` | `uiSchema.x-component = "Markdown"` |
| `markdownVditor` | plugin-provided markdown field | requires Vditor markdown plugin |
| `richText` | `text` | `uiSchema.x-component = "RichText"` |
| `attachment` | attachment-capable relation field | requires attachment capability; use the real attachment interface, not plain URL text |
| `attachmentURL` | plugin-provided string field | requires attachment-url capability and explicit target collection |
| `json` | `json` | `uiSchema.x-component = "Input.JSON"` |

## Canonical payload snippets

### Markdown

```json
{
  "name": "contentMd",
  "interface": "markdown",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Markdown content",
    "x-component": "Markdown"
  }
}
```

### Rich text

```json
{
  "name": "contentHtml",
  "interface": "richText",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Rich text content",
    "x-component": "RichText"
  }
}
```

### Markdown Vditor

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

Use this only when the Vditor markdown plugin capability is enabled. Otherwise use ordinary `markdown`.

### Attachment

Use an attachment field when the file is only a subordinate field on the current record.

```json
{
  "name": "attachments",
  "interface": "attachment",
  "type": "belongsToMany",
  "target": "attachments",
  "uiSchema": {
    "type": "array",
    "title": "Attachments",
    "x-component": "Attachment"
  }
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

Use this only when the user explicitly wants attachment upload behavior represented as a URL-like field instead of a normal attachment relation or a first-class file collection.

### JSON

```json
{
  "name": "meta",
  "interface": "json",
  "type": "json",
  "uiSchema": {
    "type": "object",
    "title": "Meta",
    "x-component": "Input.JSON",
    "x-component-props": {
      "autoSize": {
        "minRows": 5
      }
    }
  }
}
```

## Anti-drift rules

- do not replace `attachment` with a plain URL text field when file behavior matters
- do not use `attachmentURL` unless the attachment-url plugin capability is confirmed
- do not use `markdownVditor` unless the Vditor plugin capability is confirmed
- do not replace `json` with long text when structured data is actually required
- do not choose a `file` collection when the user only needs a subordinate file field on another record
