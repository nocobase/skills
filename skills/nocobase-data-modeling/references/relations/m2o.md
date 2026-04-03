# Many To One

Use when many current records belong to one target record.

Direction rule:

- the foreign key lives on the current collection
- the current field uses `interface: "m2o"` and `type: "belongsTo"`

Canonical payload:

```json
{
  "name": "customer",
  "interface": "m2o",
  "type": "belongsTo",
  "target": "customers",
  "foreignKey": "customerId",
  "targetKey": "id",
  "uiSchema": {
    "title": "Customer",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": false,
      "fieldNames": {
        "value": "id",
        "label": "name"
      }
    }
  },
  "reverseField": {
    "name": "orders",
    "interface": "o2m",
    "type": "hasMany",
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

- the current collection contains `customerId`
- the field is really `belongsTo`
- the target collection is correct
- the reverse field, if requested, appears on the target collection

Anti-drift rules:

- do not accidentally model this as `o2m`
- do not place the foreign key on the target collection
- do not use unreadable raw ids as the association label when a better title field exists
