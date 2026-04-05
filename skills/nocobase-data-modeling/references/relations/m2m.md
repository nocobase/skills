# Many To Many

Use when both sides can have many records and the relation needs a through table.

Direction rule:

- the current field uses `interface: "m2m"` and `type: "belongsToMany"`
- the relation needs `through`, `foreignKey`, `otherKey`, `sourceKey`, and `targetKey`

Compact payload:

```json
{
  "name": "tags",
  "interface": "m2m",
  "title": "Tags",
  "target": "tags",
  "through": "orders_tags",
  "sourceKey": "id",
  "foreignKey": "orderId",
  "otherKey": "tagId",
  "targetKey": "id",
  "targetTitleField": "name",
  "reverseField": {
    "name": "orders",
    "title": "Orders",
    "interface": "m2m"
  }
}
```

Use this compact shape by default. The stored field metadata will include derived `type` and `uiSchema`, but they do not need to be sent in the normal request.

Verification focus:

- the through table name is correct
- `foreignKey` and `otherKey` are not swapped
- both sides use the intended readable labels
- the reverse field appears on the target collection when requested

Anti-drift rules:

- do not omit `through`
- do not omit `foreignKey` or `otherKey` when the behavior must be predictable
- do not rely on generated through-table or key names when readable names are part of the requirement
- do not use `m2m` when the relationship is actually `m2o` or `o2m`
