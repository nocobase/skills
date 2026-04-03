# Plugin Field: Sequence

Use this file when the requested field is the plugin-backed `sequence` field.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-field-sequence`

Before using this field:

1. confirm the plugin is installed and enabled
2. confirm the `sequence` field interface is exposed in the current instance
3. confirm the sequence rule editor capability is available in the current instance

## What this field is

This is not a plain string field with a naming convention.

It is a plugin-backed generated identifier field with:

- `type: "sequence"`
- required `patterns`
- optional `inputable`
- optional `match`

## Canonical baseline

```json
{
  "name": "serialNo",
  "interface": "sequence",
  "type": "sequence",
  "patterns": [
    {
      "type": "integer",
      "options": {
        "digits": 4
      }
    }
  ],
  "inputable": false,
  "match": false,
  "uiSchema": {
    "type": "string",
    "title": "Serial no",
    "x-component": "Input",
    "x-component-props": {}
  }
}
```

## Rule item types

Supported rule item types are typically:

- `string`
- `randomChar`
- `integer`
- `date`

## Rule item examples

### Fixed text + date + autoincrement

```json
[
  {
    "type": "string",
    "options": {
      "value": "SO"
    }
  },
  {
    "type": "date",
    "options": {
      "format": "YYYYMMDD"
    }
  },
  {
    "type": "integer",
    "options": {
      "digits": 4,
      "start": 1,
      "cycle": null
    }
  }
]
```

### Random-character variant

```json
[
  {
    "type": "randomChar",
    "options": {
      "length": 6,
      "charsets": [
        "number"
      ]
    }
  }
]
```

## Rule item option details

### `string`

```json
{
  "type": "string",
  "options": {
    "value": "SO"
  }
}
```

- `string.options.value` holds fixed text

### `randomChar`

```json
{
  "type": "randomChar",
  "options": {
    "length": 6,
    "charsets": [
      "number",
      "uppercase"
    ]
  }
}
```

- `randomChar.options.length` is typically between 1 and 32
- `randomChar.options.charsets` usually draws from `number`, `lowercase`, `uppercase`, and `symbol`

### `integer`

```json
{
  "type": "integer",
  "options": {
    "digits": 4,
    "start": 1,
    "cycle": null
  }
}
```

- `integer.options.digits` controls zero-padded width
- `integer.options.start` controls the initial numeric value
- `integer.options.cycle` controls reset cadence; it may be `null` or a cron expression

### `date`

```json
{
  "type": "date",
  "options": {
    "format": "YYYYMMDD"
  }
}
```

- `date.options.format` follows Day.js-style formatting

## Field-level flags

- `inputable`: whether users can manually input the value
- `match`: whether manual input must match the configured sequence rules

If `inputable` is false, `match` should usually remain false or irrelevant.

## Verification checklist

Verify at least:

1. `interface` is `sequence`
2. `type` is `sequence`
3. `patterns` exists and is non-empty
4. each pattern item has a supported `type`
5. each pattern item has the expected `options`
6. `inputable` and `match` match the intended behavior

## Anti-drift rules

- do not reduce sequence fields to plain string fields
- do not omit `patterns`
- do not invent unsupported rule item types
- do not treat sequence generation as only a prefix plus counter unless the patterns actually define that
- do not claim exact numbering behavior unless the current instance exposes the expected plugin capability
