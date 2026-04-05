# Many To One

Use when many current records belong to one target record.

Direction rule:

- the foreign key lives on the current collection
- the current field uses `interface: "m2o"` and `type: "belongsTo"`

Compact payload:

```json
{
  "name": "customer",
  "interface": "m2o",
  "title": "Customer",
  "target": "customers",
  "foreignKey": "customerId",
  "targetKey": "id",
  "targetTitleField": "name",
  "reverseField": {
    "name": "orders",
    "title": "Orders",
    "interface": "o2m"
  }
}
```

Use this compact shape by default. The stored field metadata will include derived `type` and `uiSchema`, but they do not need to be sent in the normal request.

Verification focus:

- the current collection contains `customerId`
- the field is really `belongsTo`
- the target collection is correct
- the reverse field, if requested, appears on the target collection

Anti-drift rules:

- do not accidentally model this as `o2m`
- do not place the foreign key on the target collection
- do not rely on generated foreign keys when readable names are part of the requirement
- do not use unreadable raw ids as the association label when a better title field exists
