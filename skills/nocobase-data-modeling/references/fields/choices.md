# Choice Fields

Use this file for local enum-backed fields and structured selectors that behave like curated options.

These fields must carry explicit `uiSchema.enum` entries when the option set is local. Do not leave enum options implicit.

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
  { "value": "draft", "label": "Draft" },
  { "value": "active", "label": "Active" }
]
```

Color is optional, for example `{ "value": "active", "label": "Active", "color": "green" }`.

## Canonical payload snippets

### Single select

```json
{
  "name": "status",
  "interface": "select",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Status",
    "x-component": "Select",
    "enum": [
      { "value": "draft", "label": "Draft" },
      { "value": "active", "label": "Active" }
    ]
  }
}
```

### Multiple select

```json
{
  "name": "tags",
  "interface": "multipleSelect",
  "type": "array",
  "defaultValue": [],
  "uiSchema": {
    "type": "array",
    "title": "Tags",
    "x-component": "Select",
    "x-component-props": {
      "mode": "multiple"
    },
    "enum": [
      { "value": "vip", "label": "VIP" },
      { "value": "new", "label": "New" }
    ]
  }
}
```

### Radio group

```json
{
  "name": "priority",
  "interface": "radioGroup",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "title": "Priority",
    "x-component": "Radio.Group",
    "enum": [
      { "value": "low", "label": "Low" },
      { "value": "high", "label": "High" }
    ]
  }
}
```

### Checkbox group

```json
{
  "name": "features",
  "interface": "checkboxGroup",
  "type": "array",
  "defaultValue": [],
  "uiSchema": {
    "type": "string",
    "title": "Features",
    "x-component": "Checkbox.Group",
    "enum": [
      { "value": "a", "label": "A" },
      { "value": "b", "label": "B" }
    ]
  }
}
```

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
- do not forget `defaultValue: []` for `multipleSelect` and `checkboxGroup` when the field should start empty
- do not reduce `chinaRegion` to plain text or generic `json`
- do not create `chinaRegion` when the plugin interface exists only partially and the backing `chinaRegions` resource is absent
