# Plugin Field: Code

Use this file when the requested field is the plugin-backed `code` field.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-field-code`

Before using this field:

1. confirm the plugin is installed and enabled
2. confirm the `code` field interface is exposed in the current instance
3. confirm the user really wants code-editor behavior rather than ordinary long text

## What this field is

This is not just a textarea for storing text.

It is a text-backed field rendered with a code editor component and language-aware options.

Compact request:

```json
{
  "name": "sourceCode",
  "interface": "code",
  "title": "Source code"
}
```

Use this compact shape by default. Add editor options only when the language or editor behavior is part of the requirement.

## Expanded structure

```json
{
  "name": "sourceCode",
  "interface": "code",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Source code",
    "x-component": "CodeEditor",
    "x-component-props": {
      "language": "javascript"
    }
  }
}
```

## Expanded variant

```json
{
  "name": "sourceCode",
  "interface": "code",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Source code",
    "x-component": "CodeEditor",
    "x-component-props": {
      "language": "javascript",
      "height": "auto",
      "indentUnit": 2
    }
  }
}
```

## Important details

- storage type is `text`
- UI component is `CodeEditor`, not `Input.TextArea`
- `uiSchema.x-component-props.language` is the main configurable option and defaults to `javascript`
- `height` and `indentUnit` are supported editor props when the instance exposes them
- this field is sortable in the interface definition, but its main value is code-oriented editing experience

## Language guidance

Use the language option when the user explicitly wants syntax-aware editing for a known language.

Examples:

- `javascript`
- `typescript`
- `json`
- `sql`
- `python`

Do not invent language values if the current instance does not expose them in the language list.

## Verification checklist

Verify at least:

1. `interface` is `code`
2. `type` is `text`
3. `uiSchema.x-component` is `CodeEditor`
4. `language` matches the intended editor mode when specified

## Anti-drift rules

- do not downgrade `code` to ordinary textarea behavior when the user explicitly asked for code editing
- do not change storage type from `text`
- do not omit `CodeEditor` and keep claiming it is the code field
