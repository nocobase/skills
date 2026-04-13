# Field Models

> Read when creating custom field display components for table columns or form fields.

## Template: Custom Display Field

```tsx
// models/PriorityFieldModel.tsx
import React from 'react';
import { ClickableFieldModel } from '@nocobase/client-v2';
import { DisplayItemModel } from '@nocobase/flow-engine';
import { Tag } from 'antd';
import { tExpr } from '../locale';

const priorityColors: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'green',
};

export class PriorityFieldModel extends ClickableFieldModel {
  public renderComponent(value: string) {
    if (!value) return <span>-</span>;
    return <Tag color={priorityColors[value] || 'default'}>{value}</Tag>;
  }
}

PriorityFieldModel.define({
  label: tExpr('Priority tag'),
});

// Bind to field interface types where this component is available
DisplayItemModel.bindModelToInterface('PriorityFieldModel', ['input']);
```

## Template: Simple Display Field

```tsx
// models/DisplaySimpleFieldModel.tsx
import React from 'react';
import { ClickableFieldModel } from '@nocobase/client-v2';
import { DisplayItemModel } from '@nocobase/flow-engine';
import { tExpr } from '../locale';

export class DisplaySimpleFieldModel extends ClickableFieldModel {
  public renderComponent(value) {
    // Access current row data
    console.log('Current record:', this.context.record);
    console.log('Current record index:', this.context.recordIndex);
    return <span>[{value}]</span>;
  }
}

DisplaySimpleFieldModel.define({
  label: tExpr('Simple field'),
});

// Bind to 'input' interface (single-line text fields)
DisplayItemModel.bindModelToInterface('DisplaySimpleFieldModel', ['input']);
```

## Registration in Plugin

```ts
// plugin.tsx
this.flowEngine.registerModelLoaders({
  PriorityFieldModel: {
    loader: () => import('./models/PriorityFieldModel'),
  },
  DisplaySimpleFieldModel: {
    loader: () => import('./models/DisplaySimpleFieldModel'),
  },
});
```

## Key Concepts

### renderComponent(value)

- Receives the current field value as parameter.
- Returns JSX for rendering the field.
- Access row data via `this.context.record` and `this.context.recordIndex`.

### ClickableFieldModel

- Extends `FieldModel` with click interaction capability.
- Use this as the base class for display fields in tables.

### bindModelToInterface()

```ts
DisplayItemModel.bindModelToInterface('ModelClassName', ['interfaceType1', 'interfaceType2']);
```

Binds the field model to specific field interface types. Common interface types:

| Interface | Description |
|---|---|
| `'input'` | Single-line text |
| `'textarea'` | Multi-line text |
| `'integer'` | Integer number |
| `'number'` | Decimal number |
| `'checkbox'` | Boolean checkbox |
| `'select'` | Single select |
| `'multipleSelect'` | Multiple select |
| `'datetime'` | Date and time |
| `'email'` | Email address |
| `'url'` | URL |
| `'json'` | JSON data |

After binding, users can switch to this custom field component via the column configuration menu in table blocks.

### define() Parameters

| Parameter | Type | Description |
|---|---|---|
| `label` | `string` | Display name in field component dropdown. Use `tExpr()` |

## Built-in Field Models (from @nocobase/client-v2)

client-v2 exports many built-in field models for common field types:

**Editable fields**: `InputFieldModel`, `TextareaFieldModel`, `NumberFieldModel`, `SelectFieldModel`, `CheckboxFieldModel`, `CheckboxGroupFieldModel`, `RadioGroupFieldModel`, `DateTimeFieldModel`, `TimeFieldModel`, `ColorFieldModel`, `IconFieldModel`, `JsonFieldModel`, `PasswordFieldModel`, `PercentFieldModel`, `RichTextFieldModel`, `AssociationFieldModel`, `CollectionSelectorFieldModel`

**Display-only fields**: `DisplayTextFieldModel`, `DisplayNumberFieldModel`, `DisplayDateTimeFieldModel`, `DisplayEnumFieldModel`, `DisplayCheckboxFieldModel`, `DisplayColorFieldModel`, `DisplayIconFieldModel`, `DisplayJSONFieldModel`, `DisplayPasswordFieldModel`, `DisplayPercentFieldModel`, `DisplayURLFieldModel`, `DisplayHtmlFieldModel`, `DisplayAssociationField`, `DisplayTimeFieldModel`

**Special items**: `ClickableFieldModel`, `DividerItemModel`, `MarkdownItemModel`, `DisplayTitleFieldModel`

These can be extended for custom rendering. For simple custom display, extend `ClickableFieldModel` (as shown in the templates above).

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/flow-engine/field.md

## Related

- [./block.md](./block.md) -- blocks where fields are displayed
- [./flow.md](./flow.md) -- registerFlow for field configuration
- [./plugin.md](./plugin.md) -- registering fields in load()
- [./i18n.md](./i18n.md) -- tExpr for define() labels
