# Choice Fields

Use this file for local enum-backed fields and structured selectors that behave like curated options.

These fields must carry explicit `uiSchema.enum` entries when the option set is local. Do not leave enum options implicit.

Compact-flow rule:

- in compact requests, pass local options through `enum`;
- do not proactively send `type` or full `uiSchema` unless the task is about advanced raw overrides;
- for `multipleSelect` and `checkboxGroup`, the compact flow can derive the empty-array default.

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `select` | `string` | `uiSchema.type = "string"`, `x-component = "Select"` |
| `multipleSelect` | `array` | `defaultValue = []`, `uiSchema.type = "array"`, `x-component-props.mode = "multiple"` |
| `radioGroup` | `string` | `uiSchema.x-component = "Radio.Group"` |
| `checkboxGroup` | `array` | `defaultValue = []`, `uiSchema.x-component = "Checkbox.Group"` |
| `chinaRegion` | plugin-provided relation-backed field | requires china-region plugin; do not replace with a guessed json or text field |

Preferred enum item shape:

```json
[
  { "value": "draft", "label": "Draft", "color": "gold" },
  { "value": "active", "label": "Active", "color": "green" }
]
```

Color is required for each local choice option.

Allowed colors:

- `red`
- `magenta`
- `volcano`
- `orange`
- `gold`
- `lime`
- `green`
- `cyan`
- `blue`
- `geekblue`
- `purple`
- `default`

## Preferred compact snippets

### Single select

```json
{
  "name": "status",
  "interface": "select",
  "title": "Status",
  "enum": [
    { "value": "draft", "label": "Draft", "color": "gold" },
    { "value": "active", "label": "Active", "color": "green" }
  ]
}
```

### Multiple select

```json
{
  "name": "tags",
  "interface": "multipleSelect",
  "title": "Tags",
  "enum": [
    { "value": "vip", "label": "VIP", "color": "geekblue" },
    { "value": "new", "label": "New", "color": "cyan" }
  ]
}
```

### Radio group

```json
{
  "name": "priority",
  "interface": "radioGroup",
  "title": "Priority",
  "enum": [
    { "value": "low", "label": "Low", "color": "default" },
    { "value": "high", "label": "High", "color": "red" }
  ]
}
```

### Checkbox group

```json
{
  "name": "features",
  "interface": "checkboxGroup",
  "title": "Features",
  "enum": [
    { "value": "a", "label": "A", "color": "purple" },
    { "value": "b", "label": "B", "color": "blue" }
  ]
}
```

## Expanded structure snippets

### China region

```json
{
  "name": "region",
  "interface": "chinaRegion",
  "type": "belongsToMany",
  "target": "chinaRegions",
  "targetKey": "code",
  "sourceKey": "id",
  "sortBy": "level",
  "through": "t_region_links",
  "foreignKey": "f_record_id",
  "otherKey": "f_region_code",
  "uiSchema": {
    "type": "array",
    "title": "Region",
    "x-component": "Cascader",
    "x-component-props": {
      "useDataSource": "{{ useChinaRegionDataSource }}",
      "useLoadData": "{{ useChinaRegionLoadData }}",
      "changeOnSelectLast": false,
      "labelInValue": true,
      "maxLevel": 3,
      "fieldNames": {
        "label": "name",
        "value": "code",
        "children": "children"
      }
    }
  }
}
```

Plugin gate:

- confirm the china-region plugin is installed and enabled first
- confirm the backing `chinaRegions` capability exists before creating this field
- treat it as a plugin-backed relation configuration, not as a local enum field
- if `chinaRegions` is missing, stop and report the required plugin instead of creating the field
- do not treat "field added but backing collection missing" as a valid outcome

## Anti-drift rules

- do not omit `uiSchema.enum` for local choice fields
- do not forget the option set for local choice fields
- do not omit `color` on any local choice option
- do not use colors outside the supported palette
- when working with advanced raw payloads or read-back comparison, remember `multipleSelect` and `checkboxGroup` normally store an empty-array default
- do not reduce `chinaRegion` to plain text or generic `json`
- do not create `chinaRegion` when the plugin interface exists only partially and the backing `chinaRegions` resource is absent
