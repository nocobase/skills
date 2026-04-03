# One To One

Use when exactly one current record corresponds to one target record.

Direction rule:

- decide the owner side first
- if the current collection stores the foreign key, use `belongsTo`
- if the target collection stores the foreign key, use `hasOne`

Owner-side pattern:

```json
{
  "name": "profile",
  "interface": "m2o",
  "type": "belongsTo",
  "target": "profiles",
  "foreignKey": "profileId",
  "targetKey": "id",
  "uiSchema": {
    "title": "Profile",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": false,
      "fieldNames": {
        "value": "id",
        "label": "displayName"
      }
    }
  },
  "reverseField": {
    "name": "user",
    "interface": "o2o",
    "type": "hasOne",
    "uiSchema": {
      "title": "User",
      "x-component": "AssociationField",
      "x-component-props": {
        "multiple": false,
        "fieldNames": {
          "value": "id",
          "label": "name"
        }
      }
    }
  }
}
```

Verification focus:

- the owner side is explicit and not guessed
- exactly one foreign key placement is used
- the reverse field uses the opposite one-to-one direction
- both sides present readable labels

Anti-drift rules:

- do not treat `o2o` as self-explanatory without deciding ownership
- do not put foreign keys on both sides
- do not confuse one-to-one with one-to-many just because the business nouns sound singular
