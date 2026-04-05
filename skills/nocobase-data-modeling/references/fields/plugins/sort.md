# Plugin Field: Sort

Use this file when the requested field is the plugin-backed `sort` field.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-field-sort`

Before using this field:

1. confirm the plugin is installed and enabled
2. confirm the `sort` field interface is exposed in the current instance
3. confirm the target collection actually intends drag-and-drop or ordered-record behavior

## What this field is

This is not a plain numeric field.

It is a plugin-backed ordering field with:

- `type: "sort"`
- optional grouped sorting through `scopeKey`
- numeric-style UI with special sort semantics

Compact request:

```json
{
  "name": "sort",
  "interface": "sort",
  "title": "Sort"
}
```

Use this compact shape by default.

## Expanded structure

```json
{
  "name": "sort",
  "interface": "sort",
  "type": "sort",
  "uiSchema": {
    "type": "number",
    "title": "Sort",
    "x-component": "InputNumber",
    "x-component-props": {
      "stringMode": true,
      "step": "1"
    },
    "x-validator": "integer"
  }
}
```

## Grouped-sort variant

```json
{
  "name": "sort",
  "interface": "sort",
  "title": "Sort",
  "scopeKey": "status",
  "type": "sort"
}
```

## Important details

- the storage type is plugin-specific `sort`, not ordinary `bigInt`
- `scopeKey` is optional and enables grouped sorting behavior
- filter behavior follows number-style operators
- the field interface also exposes validation schema options such as `minimum`, `maximum`, `format`, and `pattern`

## When to use `scopeKey`

Use `scopeKey` when records should be sorted independently inside groups, for example:

- one order inside each status
- one order inside each parent category
- one order inside each board column

Do not add `scopeKey` unless grouped sorting is actually required by the model.

## Verification checklist

Verify at least:

1. `interface` is `sort`
2. `type` is `sort`
3. `scopeKey` matches the intended grouped-sort field when used
4. the field was not silently downgraded to a plain integer field

## Anti-drift rules

- do not model `sort` as plain `bigInt`
- do not add `scopeKey` unless grouped sorting behavior is intended
- do not treat this field as just another editable numeric business column
