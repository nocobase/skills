---
title: "Data Modeling API Internals"
description: "NocoBase field management API internals: lifecycle hooks, uiSchema structure, edge cases (source code analysis)"
tags: [nocobase, api, fields, uiSchema, reference, builder-toolkit]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  label: "Data Modeling"
  order: 1
---

# Data Modeling API Internals

> **This document is a low-level internals reference**, documenting NocoBase field management API source code behavior, lifecycle hooks, and edge cases.
>
> For everyday modeling operations, see -> [nb-setup.py Usage Guide](/300000-projects/300008-nocobase-builder/01-data-modeling/usage/)
>
> **Source version**: Based on the current HEAD of `<nocobase-source>/`.

---

## 1. API Endpoint Overview

| Endpoint | Description |
|----------|-------------|
| `PUT /api/fields:update?filterByTk=:key` | Upgrade field interface/uiSchema |
| `POST /api/collections/{name}/fields:create` | Create field (relations/system/sequence, etc.) |
| `POST /api/collections:create` | Register a collection |
| `POST /api/mainDataSource:syncFields` | DB columns -> NocoBase fields sync |
| `DELETE /api/collections:destroy?filterByTk=name` | Destroy a collection (caution: async DB column deletion) |

**Key**: `filterByTk` uses the `key` field (UUID) from the `fields` table, **not** `name`.

---

## 2. fields:update In Detail

### 2.1 How It Works (Source Code Analysis)

A field update triggers the following lifecycle hooks (in execution order):

```
fields.beforeUpdate
  -> If reverseField exists but reverseField.key is missing, throw error
  -> If hasMany + sortable, auto-set sortBy
  -> Validate primaryKey does not conflict

fields.afterUpdate
  -> If unique value changed -> syncUniqueIndex (add/remove unique constraint, modifies DB schema)
  -> If defaultValue changed -> syncDefaultValue (ALTER COLUMN to change default)
  -> If onDelete changed -> syncReferenceCheckOption

fields.afterUpdate (second hook)
  -> If context exists -> model.load() (reload field into in-memory collection)

fields.afterSaveWithAssociations
  -> collection.sync({ force: false, alter: { drop: false } })
  -> This triggers Sequelize's ALTER TABLE operation
```

### 2.2 Operations That Modify the DB Schema

| Operation | Modifies DB | Details |
|-----------|-------------|---------|
| Change `interface` | No | Pure metadata, does not affect DB columns |
| Change `uiSchema` | No | Pure metadata, only affects UI rendering |
| Change `unique` | **Yes** | Adds/removes unique constraint |
| Change `defaultValue` | **Yes** | ALTER COLUMN to change default value |
| Change `onDelete` | No | Only updates reverseField record |
| Change `type` | **Dangerous** | May cause data type incompatibility, generally not recommended |

### 2.3 Standard Approach for "Field Upgrades"

For basic fields synced from SQL (e.g., a `varchar` column that becomes `type: string, interface: input` after sync), the upgrade steps are:

1. First look up the field's `key`: `GET /api/fields:list?filter[collectionName]=xxx&filter[name]=yyy`
2. Update using `key`: `PUT /api/fields:update?filterByTk=:key`

**Only send the changed fields**; NocoBase will merge rather than overwrite.

```bash
# Example: upgrade the status field from input to select
curl -X PUT "$NB_URL/api/fields:update?filterByTk=$FIELD_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "interface": "select",
    "uiSchema": {
      "type": "string",
      "title": "Status",
      "x-component": "Select",
      "enum": [
        { "value": "active", "label": "Active", "color": "green" },
        { "value": "inactive", "label": "Inactive", "color": "default" }
      ]
    }
  }'
```

### 2.4 Important Notes

- **uiSchema is associated data**: In server.ts there is middleware `pushUISchemaWhenUpdateCollectionField` that automatically adds `uiSchema` to `updateAssociationValues` during `collections.fields:update`, ensuring nested uiSchema is saved correctly.
- **reverseField requires key**: If you pass `reverseField` during update but without `reverseField.key`, and the field already has a `reverseKey`, it will throw `cant update field without a reverseField key`.
- **filterByTk is the field's key**: Not `name`, not `id`, but `key` (UUID format).

---

## 3. fields:create In Detail

> **Note**: `fields:create` is primarily used for **relation fields and system fields**. Regular fields should be created via SQL columns + syncFields, then upgraded with `fields:update` to change the interface.

### 3.1 Creating a belongsTo (Many-to-One) Field

**Scenario**: The customers table has a `salesperson_id` column (already created during SQL table creation), and now you need to tell NocoBase this is a belongsTo relationship.

```bash
curl -X POST "$NB_URL/api/collections.fields/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": "salesperson",
      "type": "belongsTo",
      "interface": "m2o",
      "target": "users",
      "foreignKey": "salesperson_id",
      "targetKey": "id",
      "onDelete": "SET NULL",
      "uiSchema": {
        "title": "Salesperson",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false
        }
      }
    }
  }'
```

**Behavior when the foreignKey column already exists in the DB**:
- The `beforeInitOptions` hook checks `if (model.get(key)) continue;` -- if you provide a `foreignKey`, it won't generate a random name
- The `afterCreateForForeignKeyField` hook creates a corresponding record for the foreignKey in the `fields` table (if it doesn't exist), marking it `isForeignKey: true`
- If the foreignKey column already exists in the DB, Sequelize `sync({ force: false, alter: { drop: false } })` won't recreate the column, only creates missing columns
- **Conclusion**: Specifying an existing column name as `foreignKey` is safe

**Key source code evidence** (`afterCreateForForeignKeyField.ts`):
```typescript
// When interface is m2o:
if (['obo', 'm2o'].includes(interfaceType)) {
  const values = generateFkOptions(collectionName, foreignKey);
  await createFieldIfNotExists({
    values: { collectionName, ...values },
    transaction,
    interfaceType,
  });
}
```

`createFieldIfNotExists` first checks if a field record with the same name exists; if so, it only updates the `isForeignKey` flag; otherwise, it creates a new one.

### 3.2 Creating a belongsToMany (Many-to-Many) Field

```bash
curl -X POST "$NB_URL/api/collections.fields/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": "tags",
      "type": "belongsToMany",
      "interface": "m2m",
      "target": "tags",
      "through": "posts_tags",
      "foreignKey": "post_id",
      "otherKey": "tag_id",
      "sourceKey": "id",
      "targetKey": "id",
      "uiSchema": {
        "title": "Tags",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": true
        }
      }
    }
  }'
```

**Auto-creation behavior for the through table** (`afterCreateForForeignKeyField.ts`):

```typescript
// When interface is m2m:
if (['linkTo', 'm2m'].includes(interfaceType)) {
  const instance = await r.findOne({ filter: { name: through } });
  if (!instance) {
    // Auto-creates the through table!
    await r.create({
      values: {
        name: through,
        title: through,
        timestamps: true,
        autoGenId: false,
        hidden: true,
        autoCreate: true,
        isThrough: true,
        sortable: false,
      },
      context,
      transaction,
    });
  }
  // Then creates foreignKey and otherKey field records in the through table
}
```

**Conclusion**:
- If the through table doesn't exist -> **auto-created** (marked as hidden + isThrough)
- If the through table already exists (e.g., you created it via SQL first or it's already defined in NocoBase) -> skips creation, directly adds FK field records in it
- Test evidence from `belongs-to-many.test.ts` (lines 197-215) confirms the through table is auto-created and recorded in the collections table

### 3.3 Creating a hasMany (One-to-Many) Field

```bash
curl -X POST "$NB_URL/api/collections.fields/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": "orders",
      "type": "hasMany",
      "interface": "o2m",
      "target": "orders",
      "foreignKey": "user_id",
      "sourceKey": "id",
      "targetKey": "id",
      "onDelete": "SET NULL",
      "uiSchema": {
        "title": "Orders",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": true
        }
      }
    }
  }'
```

### 3.4 Creating a hasOne (One-to-One) Field

```bash
curl -X POST "$NB_URL/api/collections.fields/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": "profile",
      "type": "hasOne",
      "interface": "o2o",
      "target": "profiles",
      "foreignKey": "user_id",
      "sourceKey": "id",
      "onDelete": "CASCADE",
      "uiSchema": {
        "title": "Profile",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false
        }
      }
    }
  }'
```

### 3.5 Reverse Fields (reverseField)

You can create a reverse field simultaneously when creating a relation field:

```bash
# Create belongsTo and auto-create the reverse hasMany
{
  "name": "user",
  "type": "belongsTo",
  "interface": "m2o",
  "target": "users",
  "foreignKey": "userId",
  "onDelete": "SET NULL",
  "uiSchema": {
    "title": "User",
    "x-component": "AssociationField",
    "x-component-props": { "multiple": false }
  },
  "reverseField": {
    "interface": "o2m",
    "type": "hasMany",
    "name": "posts",
    "uiSchema": {
      "title": "Posts",
      "x-component": "AssociationField",
      "x-component-props": { "multiple": true }
    }
  }
}
```

**Note**: You don't need to specify `foreignKey`/`sourceKey`/`targetKey` in `reverseField`; the `beforeCreateForReverseField` hook automatically infers them from the forward field.

### 3.6 beforeInitOptions Auto-Fill Rules

If you don't specify certain keys, the system auto-generates them (source file `beforeInitOptions.ts`):

| Relation Type | Auto-Filled | Value |
|---------------|-------------|-------|
| **belongsTo** | `target` | `pluralize(name)` -- e.g., name="user" -> target="users" |
| | `foreignKey` | `f_{uid()}` -- randomly generated |
| | `targetKey` | Target table's primaryKeyAttribute or `id` |
| **belongsToMany** | `target` | Equals `name` |
| | `through` | `t_{uid()}` -- randomly generated |
| | `foreignKey` | `f_{uid()}` -- randomly generated |
| | `otherKey` | `f_{uid()}` -- randomly generated |
| | `sourceKey` / `targetKey` | Each table's primaryKeyAttribute or `id` |
| **hasMany** | `target` | Equals `name` |
| | `foreignKey` | `f_{uid()}` -- randomly generated |
| | `sourceKey` / `targetKey` | Each table's primaryKeyAttribute or `id` |
| **hasOne** | `target` | `pluralize(name)` |
| | `foreignKey` | `f_{uid()}` -- randomly generated |
| | `sourceKey` | Source table's primaryKeyAttribute or `id` |

**Recommendation**: Always explicitly specify `foreignKey`, `target`, `targetKey`, etc. to avoid depending on auto-generated random names.

### 3.7 Field Name Conflict Detection

The `fields.beforeCreate` hook checks whether a field with the same name already exists under the same collection (`server.ts` lines 222-243):

```typescript
const exists = await this.app.db.getRepository('fields').findOne({
  filter: { collectionName, name },
  transaction,
});
if (exists) {
  throw new FieldNameExistsError(name, collectionName);
}
```

**If a field with the same name already exists** (e.g., a field record auto-created after SQL sync), use `fields:update` instead of `fields:create`.

---

## 4. Sequence Fields (Auto-Numbering)

### 4.1 Overview

Sequence fields are an advanced field type that supports combining multiple patterns to auto-generate numbers, such as `CUS-20260226-0001`.

**Plugin**: `@nocobase/plugin-field-sequence`
**DB type**: `sequence` (actually stored as `STRING`)
**Interface**: `sequence`

### 4.2 Pattern Types

| Pattern | Description | Configuration Parameters |
|---------|-------------|--------------------------|
| `string` | Fixed text | `{ value: "CUS-" }` |
| `date` | Date formatting | `{ format: "YYYYMMDD", field: "createdAt" }` |
| `integer` | Auto-increment | `{ digits: 4, start: 1, cycle: "0 0 * * *", key: 1, base: 10 }` |
| `randomChar` | Random characters | `{ length: 6, charsets: ["number", "lowercase", "uppercase", "symbol"] }` |

### 4.3 integer Pattern Detailed Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `digits` | number | 1 | Number of digits, zero-padded (e.g., digits=4 -> "0001") |
| `start` | number | 0 | Starting value |
| `base` | number | 10 | Base (10=decimal, 16=hexadecimal, etc.) |
| `cycle` | string | null | Reset cycle (cron expression), e.g., `"0 0 * * *"` = daily reset |
| `key` | number | - | Sequence identifier (used to distinguish multiple integer patterns in the same field) |

**cycle shorthand values**:
- No reset: omit or `null`
- Daily: `"0 0 * * *"`
- Weekly (Monday): `"0 0 * * 1"`
- Monthly: `"0 0 1 * *"`
- Yearly: `"0 0 1 1 *"`

### 4.4 API Call to Create a Sequence Field

```bash
# Example: create customer number CUS-20260226-0001
curl -X POST "$NB_URL/api/collections.fields/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": "customer_no",
      "type": "sequence",
      "interface": "sequence",
      "patterns": [
        { "type": "string", "options": { "value": "CUS-" } },
        { "type": "date", "options": { "format": "YYYYMMDD" } },
        { "type": "string", "options": { "value": "-" } },
        {
          "type": "integer",
          "options": {
            "digits": 4,
            "start": 1,
            "key": 1,
            "cycle": "0 0 1 1 *"
          }
        }
      ],
      "inputable": false,
      "uiSchema": {
        "type": "string",
        "title": "Customer No.",
        "x-component": "Input",
        "x-component-props": {}
      }
    }
  }'
```

### 4.5 inputable and match Options

| Option | Default | Description |
|--------|---------|-------------|
| `inputable` | false | Whether manual input is allowed (skips auto-generation) |
| `match` | false | Whether manual input must match the pattern regex |

When `inputable: true, match: true`, if a manually entered value exceeds the current sequence number, the sequence counter is updated to avoid conflicts.

### 4.6 Sequence State Storage

The current sequence value is stored in the `sequences` table:

```sql
-- Table structure
CREATE TABLE sequences (
  id BIGINT PRIMARY KEY,
  collection VARCHAR(255),  -- Table name
  field VARCHAR(255),        -- Field name
  key INTEGER,               -- pattern.options.key
  current BIGINT,            -- Current value
  "lastGeneratedAt" TIMESTAMP
);
```

---

## 5. uiSchema Structures for All Field Interfaces

> All uiSchema structures below are extracted directly from the source code at `packages/core/client/src/collection-manager/interfaces/`.
> Replace `title` with your actual field display name when making API calls.

### 5.1 Basic Fields

#### email

```json
{
  "type": "string",
  "interface": "email",
  "uiSchema": {
    "type": "string",
    "title": "Email",
    "x-component": "Input",
    "x-validator": "email"
  }
}
```
- DB type: `string`

#### phone

```json
{
  "type": "string",
  "interface": "phone",
  "uiSchema": {
    "type": "string",
    "title": "Phone",
    "x-component": "Input",
    "x-component-props": {
      "type": "tel"
    }
  }
}
```
- DB type: `string`
- Note: no `x-validator` (the source code has `'x-validator': 'phone'` commented out)

#### url

```json
{
  "type": "text",
  "interface": "url",
  "uiSchema": {
    "type": "string",
    "title": "URL",
    "x-component": "Input.URL"
  }
}
```
- DB type: `text` (not `string`!)
- Available types: `string`, `text`

#### password

```json
{
  "type": "password",
  "interface": "password",
  "hidden": true,
  "uiSchema": {
    "type": "string",
    "title": "Password",
    "x-component": "Password"
  }
}
```
- DB type: `password`
- Note the additional `hidden: true` property

#### color

```json
{
  "type": "string",
  "interface": "color",
  "uiSchema": {
    "type": "string",
    "title": "Color",
    "x-component": "ColorPicker"
  }
}
```
- DB type: `string`

#### percent

```json
{
  "type": "float",
  "interface": "percent",
  "uiSchema": {
    "type": "string",
    "title": "Percent",
    "x-component": "Percent",
    "x-component-props": {
      "stringMode": true,
      "step": "1",
      "addonAfter": "%"
    }
  }
}
```
- DB type: `float`
- Available types: `float`, `double`, `decimal`
- `step` controls precision: "1" = integer percentage, "0.1" = one decimal place, "0.01" = two decimal places...

### 5.2 Selection Fields

#### select (Single-Select Dropdown)

```json
{
  "type": "string",
  "interface": "select",
  "uiSchema": {
    "type": "string",
    "title": "Status",
    "x-component": "Select",
    "enum": [
      { "value": "draft", "label": "Draft", "color": "default" },
      { "value": "published", "label": "Published", "color": "green" },
      { "value": "archived", "label": "Archived", "color": "gray" }
    ]
  }
}
```
- DB type: `string`
- Available types: `string`, `bigInt`, `boolean`
- Each item in the `enum` array supports `value`, `label`, `color`

#### multipleSelect (Multi-Select Dropdown)

```json
{
  "type": "array",
  "interface": "multipleSelect",
  "defaultValue": [],
  "uiSchema": {
    "type": "array",
    "title": "Tags",
    "x-component": "Select",
    "x-component-props": {
      "mode": "multiple"
    },
    "enum": [
      { "value": "tag1", "label": "Tag 1", "color": "blue" },
      { "value": "tag2", "label": "Tag 2", "color": "red" }
    ]
  }
}
```
- DB type: `array` (stored as JSON array in PostgreSQL)
- Available types: `array`, `json`

#### radioGroup (Radio Button Group)

```json
{
  "type": "string",
  "interface": "radioGroup",
  "uiSchema": {
    "type": "string",
    "title": "Priority",
    "x-component": "Radio.Group",
    "enum": [
      { "value": "low", "label": "Low", "color": "default" },
      { "value": "medium", "label": "Medium", "color": "orange" },
      { "value": "high", "label": "High", "color": "red" }
    ]
  }
}
```
- DB type: `string`
- Available types: `string`, `integer`, `boolean`
- Note: the `default` definition does not include `enum`; you need to add it yourself when creating

#### checkboxGroup (Checkbox Group)

```json
{
  "type": "array",
  "interface": "checkboxGroup",
  "defaultValue": [],
  "uiSchema": {
    "type": "string",
    "title": "Features",
    "x-component": "Checkbox.Group",
    "enum": [
      { "value": "wifi", "label": "WiFi" },
      { "value": "parking", "label": "Parking" }
    ]
  }
}
```
- DB type: `array`
- Available types: `array`, `json`
- Note: uiSchema.type is `"string"` rather than `"array"` (this is how the source code defines it)

### 5.3 Rich Text Fields

#### richText

```json
{
  "type": "text",
  "interface": "richText",
  "uiSchema": {
    "type": "string",
    "title": "Content",
    "x-component": "RichText"
  }
}
```
- DB type: `text`
- Available types: `text`, `json`, `string`

#### markdown

```json
{
  "type": "text",
  "interface": "markdown",
  "uiSchema": {
    "type": "string",
    "title": "Description",
    "x-component": "Markdown"
  }
}
```
- DB type: `text`
- Available types: `text`, `json`, `string`

### 5.4 Relation Fields

#### m2o (Many-to-One / belongsTo)

```json
{
  "type": "belongsTo",
  "interface": "m2o",
  "target": "target_table",
  "foreignKey": "target_table_id",
  "targetKey": "id",
  "onDelete": "SET NULL",
  "uiSchema": {
    "title": "Related Record",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": false
    }
  }
}
```

Default reverse field template:
```json
{
  "reverseField": {
    "interface": "o2m",
    "type": "hasMany",
    "uiSchema": {
      "x-component": "AssociationField",
      "x-component-props": { "multiple": true }
    }
  }
}
```

#### o2m (One-to-Many / hasMany)

```json
{
  "type": "hasMany",
  "interface": "o2m",
  "target": "target_table",
  "foreignKey": "source_table_id",
  "sourceKey": "id",
  "targetKey": "id",
  "onDelete": "SET NULL",
  "uiSchema": {
    "title": "Related Records",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": true
    }
  }
}
```

Default reverse field template:
```json
{
  "reverseField": {
    "interface": "m2o",
    "type": "belongsTo",
    "uiSchema": {
      "x-component": "AssociationField",
      "x-component-props": { "multiple": false }
    }
  }
}
```

#### m2m (Many-to-Many / belongsToMany)

```json
{
  "type": "belongsToMany",
  "interface": "m2m",
  "target": "target_table",
  "through": "source_target",
  "foreignKey": "source_id",
  "otherKey": "target_id",
  "sourceKey": "id",
  "targetKey": "id",
  "uiSchema": {
    "title": "Related Records",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": true
    }
  }
}
```

Default reverse field template:
```json
{
  "reverseField": {
    "interface": "m2m",
    "type": "belongsToMany",
    "uiSchema": {
      "x-component": "AssociationField",
      "x-component-props": { "multiple": true }
    }
  }
}
```

#### o2o (One-to-One / hasOne)

```json
{
  "type": "hasOne",
  "interface": "o2o",
  "target": "target_table",
  "foreignKey": "source_table_id",
  "sourceKey": "id",
  "onDelete": "SET NULL",
  "uiSchema": {
    "title": "Related Record",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": false
    }
  }
}
```

There are also three variants (defined in `o2o.tsx`):

| Interface | Type | Description |
|-----------|------|-------------|
| `o2o` | `hasOne` | One-to-one (FK in target table) |
| `oho` | `hasOne` | One-to-one has one (same as o2o) |
| `obo` | `belongsTo` | One-to-one belongs to (FK in own table) |

### 5.5 sequence (Auto-Numbering)

```json
{
  "type": "sequence",
  "interface": "sequence",
  "patterns": [
    { "type": "string", "options": { "value": "CUS-" } },
    { "type": "date", "options": { "format": "YYYYMMDD" } },
    { "type": "string", "options": { "value": "-" } },
    { "type": "integer", "options": { "digits": 4, "start": 1, "key": 1 } }
  ],
  "inputable": false,
  "uiSchema": {
    "type": "string",
    "title": "Customer No.",
    "x-component": "Input",
    "x-component-props": {}
  }
}
```

---

## 6. Known Pitfalls and Edge Cases

### 6.1 Field Name Conflicts

- Creating a field where `collectionName + name` already exists will throw `FieldNameExistsError`
- **Solution**: Check before creating. If upgrading an existing field, use `fields:update`

### 6.2 Foreign Key Types Must Match

- `beforeCreateForValidateField` validates that the foreignKey type and targetKey type must match
- Example: if targetKey is `STRING` type, foreignKey must also be `STRING`, not `BIGINT`
- Test evidence: `belongs-to.test.ts` lines 32-83

### 6.3 belongsToMany foreignKey and otherKey Cannot Be the Same

```typescript
// beforeCreateForValidateField.ts
if (model.type === 'belongsToMany') {
  if (model.get('foreignKey') === model.get('otherKey')) {
    throw new Error('foreignKey and otherKey can not be the same');
  }
}
```

### 6.4 fields.beforeCreate Validates Uniqueness

Two fields with the same name cannot exist under the same collection. If SQL sync has already created a field record, a subsequent `fields:create` will throw an error.

### 6.5 Through Table Name Cannot Conflict with Existing Field Names

In the `belongs-to-many.test.ts` tests, you can see that if the through table's name is the same as an existing field name under the collection, it will throw an error (e.g., collection A already has field `t1`, and you try to create an m2m field with through set to `t1` -- the names conflict). However, if the m2m field's `name` differs from `through`, there's no problem.

### 6.6 sync Never Drops Columns

`collection.sync({ force: false, alter: { drop: false } })` -- never drops columns, only adds them. This is a safety design in NocoBase.

### 6.7 Importance of the context Parameter

Many hooks in the source code include `if (context)` checks. When calling via HTTP API, `context` is automatically present. But when calling repository methods directly (e.g., in scripts), you need to explicitly pass `context: {}`, otherwise many follow-up operations (such as `model.load()`, `collection.sync()`, `afterCreateForForeignKeyField`) will not trigger.

---

## 7. Standard Workflows

### 7.1 Everyday Operations (Using nb-setup.py)

```bash
# 1. Create tables via SQL (do NOT create system field columns)
PGPASSWORD=nocobase psql -h localhost -p 5435 -U nocobase -d nocobase -f tables.sql

# 2. Run configuration (JSON only contains fields to upgrade + relations + seed data)
python3 scripts/nocobase/nb-setup.py config.json
```

See [nb-setup.py Usage Guide](/300000-projects/300008-nocobase-builder/01-data-modeling/usage/) for details.

### 7.2 "Upgrade Field" vs "Create Field" Decision Tree

```
Does the field you want to configure already have a record in the NocoBase fields table?
|
|-- Yes (a field record was auto-created after SQL sync)
|   |-- Is it a regular field upgrade (changing interface/uiSchema)? -> fields:update
|   +-- Want to change it to a relation field? -> Not possible, type cannot change from string to belongsTo
|       -> Must: delete the old field record first -> then fields:create to create the relation field
|
+-- No (it's a new field, or the relation field hasn't been configured yet)
    +-- fields:create
```

---

## 8. Field Types That Must Be Created via API

> **Core principle**: Some fields/tables cannot be created via SQL first then synced; they must be created through the NocoBase API because they trigger internal hooks that create subsidiary resources.

### 8.1 System Fields (createdAt / updatedAt / createdBy / updatedBy)

**Why API creation is required**:
- `createdBy`/`updatedBy` are `belongsTo -> users` relation fields; API creation auto-generates FK columns (`createdById`/`updatedById`)
- The field's `key` (UUID) and complete configuration are managed internally by NocoBase
- A SQL-created `created_by_id` column won't be recognized as the `createdBy` interface, only as a regular `integer`
- Post-hoc fixes can only be done by directly modifying the `fields` and `uiSchemas` database tables; the API cannot fix this

**Correct creation payload** (from the `default` object in source `createdBy.ts`):

```json
{
  "name": "createdBy",
  "interface": "createdBy",
  "type": "belongsTo",
  "target": "users",
  "foreignKey": "createdById",
  "uiSchema": {
    "type": "object",
    "title": "Created by",
    "x-component": "AssociationField",
    "x-component-props": {
      "fieldNames": {"label": "nickname", "value": "id"}
    },
    "x-read-pretty": true
  }
}
```

> nb-setup.py's Step 3 automatically creates these 4 fields; no manual handling needed.

### 8.2 Tree Tables (Tree Collection)

**Why API creation is required**:
- Automatically creates the path closure table `{dataSourceName}_{collectionName}_path`
- The path table contains `nodePk`, `path` (indexed), `rootPk` fields
- Registers `afterCreate`/`afterUpdate`/`afterDestroy` hooks to automatically maintain the path index
- `treeParent: true` and `treeChildren: true` are NocoBase internal markers

**Creation API (collections:create, not fields:create)**:

```json
POST /api/collections:create
{
  "name": "nb_departments",
  "title": "Departments",
  "tree": "adjacency-list",
  "template": "tree",
  "fields": [
    {
      "type": "belongsTo",
      "name": "parent",
      "target": "nb_departments",
      "treeParent": true,
      "foreignKey": "parentId"
    },
    {
      "type": "hasMany",
      "name": "children",
      "target": "nb_departments",
      "treeChildren": true
    }
  ]
}
```

**Querying tree structures**:
- `GET /api/nb_departments:list?tree=true` -- automatically returns hierarchical structure
- Without a filter, it automatically adds `{ parentId: null }` to return only root nodes
- Child nodes are recursively nested via the `children` field

**Source code location**:
- Plugin: `packages/plugins/@nocobase/plugin-collection-tree/src/server/`
- Real-world example (departments table): `packages/plugins/@nocobase/plugin-departments/src/server/collections/departments.ts`

### 8.3 Comment Tables

Comments are not a built-in field type; they use a **separate collection + relation fields** pattern. Two implementation approaches:

| Approach | Use Case | Implementation |
|----------|----------|----------------|
| Flat comments | Simple scenarios | Regular collection + m2o to main table + m2o to users |
| Threaded comments | Nested replies needed | Tree table (`tree: "adjacency-list"`) + m2o to main table |

---

## Related Documents

- [Data Modeling Standard Workflow](/300000-projects/300008-nocobase-builder/01-data-modeling/usage/) -- Everyday operations entry point, read this first
- [NocoBase Builder Toolkit](/300000-projects/300008-nocobase-builder/) -- Project overview
- [PM Demo Modeling Log](/300000-projects/300008-nocobase-builder/05-pm-demo/) -- 21-table PM system in practice
- [NocoBase MCP Requirements Spec](/200000-guides/nocobase-3-vision/mcp-requirements/) -- Long-term MCP Server goals
- [NocoBase Resource Map](/200000-guides/nocobase-resources/) -- All NocoBase resource entry points
