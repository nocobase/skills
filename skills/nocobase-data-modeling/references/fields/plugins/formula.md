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

It is a plugin-backed computed field with:

- `type: "formula"`
- explicit result `dataType`
- explicit `engine`
- explicit `expression`
- result rendering through `Formula.Result`

## Canonical baseline

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

## Engine choices

Supported engines exposed by the evaluator registry include:

- `formula.js`
- `math.js`
- `string`

Engine guidance:

- `formula.js`: spreadsheet-style formula functions; current formula-field default
- `math.js`: expression-oriented calculation engine for mathematical evaluation
- `string`: string-template engine for simple interpolation and replacement

Use `string` only when the user wants string-template behavior rather than arithmetic calculation.

Reference links:

- `formula.js` docs: `https://docs.nocobase.com/calculation-engine/formula`
- `math.js` docs: `https://docs.nocobase.com/calculation-engine/math`

Implementation notes:

- `formula.js` is registered with a tooltip that says it supports most Microsoft Excel formula functions
- `math.js` is registered with a tooltip that describes it as a broad mathematical expression engine with built-in functions and constants

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
2. `type` is `formula`
3. `dataType` matches the intended result type
4. `engine` matches the intended evaluator
5. `expression` is stored
6. `uiSchema.x-component` is `Formula.Result`

## Anti-drift rules

- do not reduce formula fields to plain scalar fields
- do not omit `dataType`, `engine`, or `expression`
- do not use `Input` or `Input.TextArea` as the result component
- do not assume only `formula.js` exists; the registry also exposes `math.js` and `string`
- do not use `string` when the requirement is real formula calculation
