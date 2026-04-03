# One To Many

Use when one current record owns many target records.

Direction rule:

- the foreign key lives on the target collection
- the current field uses `interface: "o2m"` and `type: "hasMany"`

Canonical payload:

```json
{
  "name": "items",
  "interface": "o2m",
  "type": "hasMany",
  "target": "order_items",
  "sourceKey": "id",
  "foreignKey": "orderId",
  "targetKey": "id",
  "uiSchema": {
    "title": "Items",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": true,
      "fieldNames": {
        "value": "id",
        "label": "id"
      }
    }
  },
  "reverseField": {
    "name": "order",
    "interface": "m2o",
    "type": "belongsTo",
    "uiSchema": {
      "title": "Order",
      "x-component": "AssociationField",
      "x-component-props": {
        "multiple": false,
        "fieldNames": {
          "value": "id",
          "label": "id"
        }
      }
    }
  }
}
```

Verification focus:

- the target collection contains `orderId`
- the current field is really `hasMany`
- the reverse field, if requested, appears on the target collection as `belongsTo`
- `sourceKey` and `targetKey` still point to the intended keys

Anti-drift rules:

- do not accidentally place the foreign key on the current collection
- do not confuse the owner side with the display side
- do not assume the reverse field is optional when the user expects bidirectional navigation
