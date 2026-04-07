# One To One

Use when exactly one current record corresponds to one target record.

Direction rule:

- decide the owner side first
- if the current collection stores the foreign key, use `belongsTo`
- if the target collection stores the foreign key, use `hasOne`

Compact owner-side pattern:

```json
{
  "name": "profile",
  "interface": "m2o",
  "title": "Profile",
  "target": "profiles",
  "foreignKey": "profileId",
  "targetKey": "id",
  "targetTitleField": "displayName",
  "reverseField": {
    "name": "user",
    "title": "User",
    "interface": "o2o"
  }
}
```

Use this compact shape by default. The stored field metadata will include derived `type` and `uiSchema`, but they do not need to be sent in the normal request.

Verification focus:

- the owner side is explicit and not guessed
- exactly one foreign key placement is used
- the reverse field uses the opposite one-to-one direction
- both sides present readable labels

Anti-drift rules:

- do not treat `o2o` as self-explanatory without deciding ownership
- do not put foreign keys on both sides
- do not rely on generated foreign keys when readable names are part of the requirement
- do not confuse one-to-one with one-to-many just because the business nouns sound singular
