# Scalar Fields

Use this file for ordinary text, numbers, booleans, and specialized scalar inputs.

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `input` | `string` | `uiSchema.x-component = "Input"` |
| `textarea` | `text` | `uiSchema.x-component = "Input.TextArea"` |
| `phone` | `string` | `uiSchema.x-component = "Input"`, `x-component-props.type = "tel"` |
| `email` | `string` | `uiSchema.x-component = "Input"`, `x-validator = "email"` |
| `url` | `text` | `uiSchema.x-component = "Input.URL"` |
| `integer` | `bigInt` | `uiSchema.x-component = "InputNumber"`, `x-validator = "integer"` |
| `number` | `double` | `uiSchema.x-component = "InputNumber"` |
| `percent` | `float` | `uiSchema.x-component = "Percent"`, usually with `addonAfter = "%"` |
| `password` | `password` or `string` | use password interface, do not replace with plain input |
| `color` | `string` | use color interface |
| `icon` | `string` | use icon interface |
| `checkbox` | `boolean` | use checkbox interface |

## Canonical payload snippets

### Input

```json
{
  "name": "title",
  "interface": "input",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Title",
    "x-component": "Input"
  }
}
```

### Textarea

```json
{
  "name": "description",
  "interface": "textarea",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Description",
    "x-component": "Input.TextArea"
  }
}
```

### Email

```json
{
  "name": "email",
  "interface": "email",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Email",
    "x-component": "Input",
    "x-validator": "email"
  }
}
```

### URL

```json
{
  "name": "website",
  "interface": "url",
  "type": "text",
  "uiSchema": {
    "type": "string",
    "title": "Website",
    "x-component": "Input.URL"
  }
}
```

### Integer

```json
{
  "name": "quantity",
  "interface": "integer",
  "type": "bigInt",
  "uiSchema": {
    "type": "number",
    "title": "Quantity",
    "x-component": "InputNumber",
    "x-component-props": {
      "stringMode": true,
      "step": "1"
    },
    "x-validator": "integer"
  }
}
```

### Number

```json
{
  "name": "amount",
  "interface": "number",
  "type": "double",
  "uiSchema": {
    "type": "number",
    "title": "Amount",
    "x-component": "InputNumber",
    "x-component-props": {
      "stringMode": true,
      "step": "1"
    }
  }
}
```

### Percent

```json
{
  "name": "discountRate",
  "interface": "percent",
  "type": "float",
  "uiSchema": {
    "type": "string",
    "title": "Discount rate",
    "x-component": "Percent",
    "x-component-props": {
      "stringMode": true,
      "step": "1",
      "addonAfter": "%"
    }
  }
}
```

### Checkbox

```json
{
  "name": "enabled",
  "interface": "checkbox",
  "type": "boolean",
  "uiSchema": {
    "type": "boolean",
    "title": "Enabled",
    "x-component": "Checkbox"
  }
}
```

### Phone

```json
{
  "name": "phone",
  "interface": "phone",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Phone",
    "x-component": "Input",
    "x-component-props": {
      "type": "tel"
    }
  }
}
```

### Password

```json
{
  "name": "password",
  "interface": "password",
  "type": "password",
  "uiSchema": {
    "type": "string",
    "title": "Password",
    "x-component": "Password"
  }
}
```

### Color

```json
{
  "name": "themeColor",
  "interface": "color",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Theme color",
    "x-component": "ColorSelect"
  }
}
```

### Icon

```json
{
  "name": "icon",
  "interface": "icon",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Icon",
    "x-component": "IconPicker"
  }
}
```

## Anti-drift rules

- do not use plain `input` when a stronger specialized scalar interface exists
- do not forget validator or component props for `email`, `phone`, or `integer`
- do not use `double` or `text` casually when the interface contract already implies a narrower type
