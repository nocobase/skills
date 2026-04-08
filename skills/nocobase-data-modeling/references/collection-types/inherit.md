# Inherit Collection

Use when the new collection must inherit fields from one or more parent collections.

Key rules:

- Do not use `inherit` as a naming convenience. Use it only when shared fields truly belong on parent collections.
- Confirm the parent collection or collections already exist before creation.
- Do not redefine inherited fields on the child unless the platform explicitly supports that exact change.
- Child collections should add only their own specific fields after inheritance is established.
- Inheritance behavior is more constrained than ordinary collection extension, so verify every inherited field after creation.

Good fits for `inherit`:

- person -> student, employee, customer subtype models
- shared base identity tables with subtype-specific child tables
- multi-parent shared-field scenarios when the instance supports them

Bad fits for `inherit`:

- unrelated tables that just happen to share a few similar fields
- cases where composition or ordinary relations are clearer than inheritance
- environments where inheritance support is not enabled or not appropriate for the data source

Capability gate before creation:

1. confirm inheritance is supported by the current instance and data source;
2. confirm the parent collection exists and has real fields to inherit;
3. confirm the shared fields belong on the parent;
4. define only child-specific fields on the new collection.

Minimal create pattern:

```json
{
  "name": "students",
  "title": "Students",
  "template": "inherit",
  "inherits": "person",
  "fields": [
    {
      "name": "score",
      "type": "bigInt",
      "interface": "integer",
      "uiSchema": {
        "type": "number",
        "title": "Score",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        },
        "x-validator": "integer"
      }
    }
  ]
}
```

Multiple-parent pattern:

```json
{
  "name": "hybrid_profile",
  "title": "Hybrid profile",
  "template": "inherit",
  "inherits": ["base_identity", "contact_profile"],
  "fields": [
    {
      "name": "profileType",
      "type": "string",
      "interface": "select",
      "uiSchema": {
        "type": "string",
        "title": "Profile type",
        "x-component": "Select",
        "enum": [
          { "value": "internal", "label": "Internal" },
          { "value": "external", "label": "External" }
        ]
      }
    }
  ]
}
```

Modeling process for `inherit`:

1. inspect the parent collection fields first;
2. confirm which fields should stay inherited and which belong only on the child;
3. create the child collection with `inherits`;
4. add only child-specific fields;
5. verify that inherited fields are visible and that child fields were added without breaking inherited ones.

Verification focus for `inherit` collections:

- the child collection records the correct `inherits` parent or parents;
- inherited fields are visible on the child collection metadata;
- child-only fields exist separately and do not replace inherited ones;
- later parent-field updates do not silently break the child model;
- subtype records can be created through the child collection as expected.
