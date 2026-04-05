# Plugin Field: Formula

Use this file when the requested field is the plugin-backed `formula` field.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-field-formula`

Before using this field:

1. confirm the plugin is installed and enabled
2. confirm the `formula` field interface is exposed in the current instance
3. confirm the expression engine options are available in the current instance

## What this field is

This is not a plain scalar field with a calculated default.

It is a plugin-backed computed field.

In compact modeling payloads, the usual starting shape is:

- `name`
- `interface: "formula"`
- optional `title`
- `expression`
- optional `engine`
- optional `dataType` when the result type must be explicit

Read-back or fully expanded JSON may also contain:

- `type: "formula"`
- result rendering through `Formula.Result`

## First decision: engine

Choose the engine before writing the expression.

Supported engines exposed by the evaluator registry include:

- `formula.js`
- `math.js`
- `string`

Engine guidance:

- `formula.js`: spreadsheet-style formula functions
- `math.js`: expression-oriented mathematical syntax
- `string`: string-template interpolation and replacement

Do not write an expression until the engine is fixed.
Do not mix syntax across engines.
If the intended engine is unclear, stop and ask instead of guessing.

Reference links:

- `formula.js` docs: `https://docs.nocobase.com/calculation-engine/formula`
- `math.js` docs: `https://docs.nocobase.com/calculation-engine/math`

## Compact baseline

```json
{
  "name": "scoreLevel",
  "interface": "formula",
  "engine": "formula.js",
  "expression": "ROUND({{price}} * {{quantity}}, 2)"
}
```

Use a fuller payload only when the task explicitly needs engine override, result type override, or advanced rendering options.

## Expanded read-back shape

```json
{
  "name": "scoreLevel",
  "interface": "formula",
  "type": "formula",
  "dataType": "double",
  "engine": "formula.js",
  "expression": "ROUND({{price}} * {{quantity}}, 2)",
  "uiSchema": {
    "type": "string",
    "title": "Score level",
    "x-component": "Formula.Result",
    "x-component-props": {
      "stringMode": true,
      "step": "1"
    },
    "x-read-pretty": true
  }
}
```

## Syntax reminders by engine

### `formula.js`

Use spreadsheet-style functions and syntax.

Good examples:

- `ROUND({{price}} * {{quantity}}, 2)`
- `SUM({{score1}}, {{score2}}, {{score3}})`
- `IF({{status}} = "paid", 1, 0)`

### `math.js`

Use math-expression syntax.

Good examples:

- `{{price}} * {{quantity}}`
- `round({{price}} * {{quantity}}, 2)`
- `({{score1}} + {{score2}} + {{score3}}) / 3`

### `string`

Use interpolation for text assembly, not formula functions.

Good examples:

- `Order-{{id}}-{{status}}`
- `{{firstName}} {{lastName}}`

## Result data types

Supported `dataType` values are typically:

- `boolean`
- `integer`
- `bigInt`
- `double`
- `string`
- `date`

Selection guidance:

- use `double` for general numeric results
- use `integer` or `bigInt` only when integer semantics are explicitly required
- use `string` for textual computed output
- use `boolean` for true/false computed output
- use `date` for datetime-style computed output

## UI behavior notes

- `uiSchema.x-component` should be `Formula.Result`
- numeric precision is configured through `uiSchema.x-component-props.step`
- when `dataType` is `date`, datetime display props such as `dateFormat`, `showTime`, and `timeFormat` become relevant
- formula results are normally read-pretty rather than manually typed

## Datetime-oriented formula variant

```json
{
  "name": "nextReviewAt",
  "interface": "formula",
  "type": "formula",
  "dataType": "date",
  "engine": "formula.js",
  "expression": "{{$nDate}}",
  "uiSchema": {
    "type": "string",
    "title": "Next review at",
    "x-component": "Formula.Result",
    "x-component-props": {
      "dateFormat": "YYYY-MM-DD",
      "showTime": true,
      "timeFormat": "HH:mm:ss"
    },
    "x-read-pretty": true
  }
}
```

Use the exact expression only when the instance and business requirement justify it. The important part is the `dataType: "date"` plus the datetime display props.

## String-template variant

```json
{
  "name": "displayLabel",
  "interface": "formula",
  "type": "formula",
  "dataType": "string",
  "engine": "string",
  "expression": "Order-{{id}}-{{status}}",
  "uiSchema": {
    "type": "string",
    "title": "Display label",
    "x-component": "Formula.Result",
    "x-read-pretty": true
  }
}
```

This engine is intended for interpolation, not spreadsheet-style functions.

## Verification checklist

Verify at least:

1. `interface` is `formula`
2. `type` is `formula` in the stored result
3. `dataType` matches the intended result type when the task depends on it
4. `engine` matches the intended evaluator
5. `expression` is stored
6. `uiSchema.x-component` is `Formula.Result`
7. the expression syntax matches the chosen engine

## Anti-drift rules

- do not reduce formula fields to plain scalar fields
- do not omit `expression`
- do not omit `engine` when the default `formula.js` is not intended
- do not assume `dataType` must always be sent in the compact request when the task does not need an explicit override
- do not use `Input` or `Input.TextArea` as the result component
- do not assume only `formula.js` exists; the registry also exposes `math.js` and `string`
- do not use `string` when the requirement is real formula calculation
- do not write a `formula.js` expression with `math.js` syntax, or the reverse
- do not guess engine syntax from memory; check the engine docs first
