# Many To Many

Use when both sides can have many records and the relation needs a through table.

Direction rule:

- the current field uses `interface: "m2m"` and `type: "belongsToMany"`
- the relation needs `through`, `foreignKey`, `otherKey`, `sourceKey`, and `targetKey`

Canonical payload:

```json
{
  "name": "tags",
  "interface": "m2m",
  "type": "belongsToMany",
  "target": "tags",
  "through": "orders_tags",
  "sourceKey": "id",
  "foreignKey": "orderId",
  "otherKey": "tagId",
  "targetKey": "id",
  "uiSchema": {
    "title": "Tags",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": true,
      "fieldNames": {
        "value": "id",
        "label": "name"
      }
    }
  },
  "reverseField": {
    "name": "orders",
    "interface": "m2m",
    "type": "belongsToMany",
    "uiSchema": {
      "title": "Orders",
      "x-component": "AssociationField",
      "x-component-props": {
        "multiple": true,
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

- the through table name is correct
- `foreignKey` and `otherKey` are not swapped
- both sides use the intended readable labels
- the reverse field appears on the target collection when requested

Anti-drift rules:

- do not omit `through`
- do not omit `foreignKey` or `otherKey` when the behavior must be predictable
- do not use `m2m` when the relationship is actually `m2o` or `o2m`
