# System And Advanced Fields

Use this file for stable core advanced fields and system fields:

- primary-key strategy
- `json`
- `tableoid`
- audit relations such as `createdBy` and `updatedBy`

Use `advanced-plugin-fields.md` for capability-gated plugin-backed advanced fields such as `formula`, `sort`, `code`, `sequence`, `encryption`, and `space`.

Compact-flow rule:

- do not send these fields in ordinary compact create payloads unless the user explicitly wants to override the default model behavior;
- `tableoid` is opt-in only;
- audit fields such as `createdBy` and `updatedBy` are usually template-owned or server-owned in compact collection creation.

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `snowflakeId` | `snowflakeId` | preferred explicit preset id in realistic business collections |
| `id` | `bigInt` | auto-increment primary key baseline |
| `uuid` | `uuid` | supports explicit primary-key strategy |
| `nanoid` | `nanoid` | supports custom alphabet and length |
| `json` | `json` | `uiSchema.x-component = "Input.JSON"` |
| `tableoid` | `virtual` | system-info field rendered by `CollectionSelect` with `isTableOid: true` |
| `createdBy` | `belongsTo` | target `users`, foreign key `createdById` |
| `updatedBy` | `belongsTo` | target `users`, foreign key `updatedById` |

## Primary-key strategy rule

Pick one primary-key strategy per realistic business table.

Preferred order:

1. `snowflakeId` for explicit, stable business-table creation
2. `id` for ordinary auto-increment tables when that is the intended default
3. `uuid` when external integration, global uniqueness, or string identifiers are intentionally required
4. `nanoid` when compact string identifiers are intentionally required

Do not combine multiple primary-key strategies in one realistic table.

## Canonical payload snippets

### UUID

```json
{
  "name": "id",
  "interface": "uuid",
  "type": "uuid",
  "primaryKey": true,
  "allowNull": false,
  "uiSchema": {
    "type": "string",
    "title": "ID",
    "x-component": "Input",
    "x-validator": "uuid"
  }
}
```

### Nano ID

```json
{
  "name": "id",
  "interface": "nanoid",
  "type": "nanoid",
  "primaryKey": true,
  "allowNull": false,
  "customAlphabet": "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  "size": 21,
  "uiSchema": {
    "type": "string",
    "title": "ID",
    "x-component": "NanoIDInput"
  }
}
```

### Snowflake ID

```json
{
  "name": "id",
  "type": "snowflakeId",
  "autoIncrement": false,
  "primaryKey": true,
  "allowNull": false,
  "interface": "snowflakeId",
  "uiSchema": {
    "type": "number",
    "title": "ID",
    "x-component": "InputNumber",
    "x-component-props": {
      "stringMode": true,
      "separator": "0.00",
      "step": "1"
    },
    "x-validator": "integer"
  }
}
```

### Auto-increment ID

```json
{
  "name": "id",
  "interface": "id",
  "type": "bigInt",
  "autoIncrement": true,
  "primaryKey": true,
  "allowNull": false,
  "uiSchema": {
    "type": "number",
    "title": "ID",
    "x-component": "InputNumber",
    "x-read-pretty": true
  }
}
```

### Created by

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
      "fieldNames": {
        "value": "id",
        "label": "nickname"
      }
    },
    "x-read-pretty": true
  }
}
```

### Updated by

```json
{
  "name": "updatedBy",
  "interface": "updatedBy",
  "type": "belongsTo",
  "target": "users",
  "foreignKey": "updatedById",
  "uiSchema": {
    "type": "object",
    "title": "Last updated by",
    "x-component": "AssociationField",
    "x-component-props": {
      "fieldNames": {
        "value": "id",
        "label": "nickname"
      }
    },
    "x-read-pretty": true
  }
}
```

### Table OID

```json
{
  "name": "__collection",
  "interface": "tableoid",
  "type": "virtual",
  "uiSchema": {
    "type": "string",
    "title": "Table OID",
    "x-component": "CollectionSelect",
    "x-component-props": {
      "isTableOid": true
    },
    "x-read-pretty": true
  }
}
```

## Anti-drift rules

- do not mix `id`, `snowflakeId`, `uuid`, and `nanoid` in one realistic business table
- do not proactively add `tableoid` unless the user explicitly asks for it
- do not proactively add `createdAt`, `createdBy`, `updatedAt`, or `updatedBy` to a compact collection create payload when the template already owns them
- do not rely on convenience flags when explicit preset payloads are required for accuracy
- do not forget `target` and `foreignKey` on `createdBy` and `updatedBy`
- do not document plugin-backed advanced fields here as if they were unconditional built-ins
- treat `tableoid` as a system-info field, not a normal business field
- do not describe `tableoid` as a numeric editable field
