# One To Many

Use when one current record owns many target records.

Direction rule:

- the foreign key lives on the target collection
- the current field uses `interface: "o2m"` and `type: "hasMany"`

Compact payload:

```json
{
  "name": "items",
  "interface": "o2m",
  "title": "Items",
  "target": "order_items",
  "sourceKey": "id",
  "foreignKey": "orderId",
  "targetKey": "id",
  "targetTitleField": "id",
  "reverseField": {
    "name": "order",
    "title": "Order",
    "interface": "m2o"
  }
}
```

Use this compact shape by default. The stored field metadata will include derived `type` and `uiSchema`, but they do not need to be sent in the normal request.

Verification focus:

- the target collection contains `orderId`
- the current field is really `hasMany`
- the reverse field, if requested, appears on the target collection as `belongsTo`
- `sourceKey` and `targetKey` still point to the intended keys

Anti-drift rules:

- do not accidentally place the foreign key on the current collection
- do not confuse the owner side with the display side
- do not rely on generated foreign keys when readable names are part of the requirement
- do not assume the reverse field is optional when the user expects bidirectional navigation
