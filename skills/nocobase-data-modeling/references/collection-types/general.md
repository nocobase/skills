# General Collection

Use for ordinary business master data or transactional records.

Key rules:

- For the compact `collections apply` flow, do not manually include built-in system fields such as `id`, `createdAt`, `createdBy`, `updatedAt`, or `updatedBy`.
- Treat those fields as template defaults that the server creates for ordinary `general` collections unless the active command help explicitly requires a fully expanded raw payload.
- Append business fields only. Each business field still needs an explicit `interface`.
- Default business-table pattern:
  - business scalar fields first;
  - local choice fields next;
  - relation fields after the core business fields.

Recommended extension pattern after the baseline:

- title or display field;
- status or business state field;
- one or more scalar business measures such as amount, quantity, code, or note;
- optional local choice fields;
- relation fields only after the scalar business fields are correct.

The fully expanded JSON examples below are structure references, not the preferred compact CLI request shape.

## Preferred compact request

```json
{
  "name": "orders",
  "title": "Orders",
  "template": "general",
  "fields": [
    {
      "name": "orderNo",
      "title": "Order No",
      "interface": "input"
    },
    {
      "name": "status",
      "title": "Status",
      "interface": "select",
      "enum": ["draft", "paid", "cancelled"]
    },
    {
      "name": "amount",
      "title": "Amount",
      "interface": "number"
    }
  ]
}
```

Start from this compact shape. Only use the expanded structure below when discussing template internals or inspecting stored output.

```json
{
  "logging": true,
  "name": "example_collection",
  "template": "general",
  "autoGenId": false,
  "title": "Example",
  "fields": [
    {
      "name": "id",
      "type": "snowflakeId",
      "autoIncrement": false,
      "primaryKey": true,
      "allowNull": false,
      "interface": "snowflakeId",
      "uiSchema": {
        "type": "number",
        "title": "{{t(\"ID\")}}",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "separator": "0.00",
          "step": "1"
        },
        "x-validator": "integer"
      }
    },
    {
      "name": "createdAt",
      "interface": "createdAt",
      "type": "date",
      "field": "createdAt",
      "uiSchema": {
        "type": "datetime",
        "title": "{{t(\"Created at\")}}",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
    {
      "name": "createdBy",
      "interface": "createdBy",
      "type": "belongsTo",
      "target": "users",
      "foreignKey": "createdById",
      "uiSchema": {
        "type": "object",
        "title": "{{t(\"Created by\")}}",
        "x-component": "AssociationField",
        "x-component-props": {
          "fieldNames": {
            "value": "id",
            "label": "nickname"
          }
        },
        "x-read-pretty": true
      }
    },
    {
      "name": "updatedAt",
      "interface": "updatedAt",
      "type": "date",
      "field": "updatedAt",
      "uiSchema": {
        "type": "datetime",
        "title": "{{t(\"Last updated at\")}}",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
    {
      "name": "updatedBy",
      "interface": "updatedBy",
      "type": "belongsTo",
      "target": "users",
      "foreignKey": "updatedById",
      "uiSchema": {
        "type": "object",
        "title": "{{t(\"Last updated by\")}}",
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
  ]
}
```

Add business fields after this baseline.

## Realistic example: customer table

Use a `general` collection like this when the business object is an ordinary master-data table.

```json
{
  "logging": true,
  "name": "customers",
  "template": "general",
  "autoGenId": false,
  "title": "Customers",
  "fields": [
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
    },
    {
      "name": "createdAt",
      "interface": "createdAt",
      "type": "date",
      "field": "createdAt",
      "uiSchema": {
        "type": "datetime",
        "title": "Created at",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
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
    },
    {
      "name": "updatedAt",
      "interface": "updatedAt",
      "type": "date",
      "field": "updatedAt",
      "uiSchema": {
        "type": "datetime",
        "title": "Last updated at",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
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
    },
    {
      "name": "name",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Name",
        "x-component": "Input"
      }
    },
    {
      "name": "email",
      "interface": "email",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Email",
        "x-component": "Input",
        "x-validator": "email"
      }
    },
    {
      "name": "phone",
      "interface": "phone",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Phone",
        "x-component": "Input",
        "x-component-props": {
          "type": "tel"
        }
      }
    },
    {
      "name": "status",
      "interface": "select",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Status",
        "x-component": "Select",
        "enum": [
          { "value": "lead", "label": "Lead" },
          { "value": "active", "label": "Active" },
          { "value": "inactive", "label": "Inactive" }
        ]
      }
    },
    {
      "name": "notes",
      "interface": "textarea",
      "type": "text",
      "uiSchema": {
        "type": "string",
        "title": "Notes",
        "x-component": "Input.TextArea"
      }
    }
  ]
}
```

## Realistic example: order table

Use a `general` collection like this when the business object is an ordinary transaction table.

```json
{
  "logging": true,
  "name": "orders",
  "template": "general",
  "autoGenId": false,
  "title": "Orders",
  "fields": [
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
    },
    {
      "name": "createdAt",
      "interface": "createdAt",
      "type": "date",
      "field": "createdAt",
      "uiSchema": {
        "type": "datetime",
        "title": "Created at",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
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
    },
    {
      "name": "updatedAt",
      "interface": "updatedAt",
      "type": "date",
      "field": "updatedAt",
      "uiSchema": {
        "type": "datetime",
        "title": "Last updated at",
        "x-component": "DatePicker",
        "x-component-props": {},
        "x-read-pretty": true
      }
    },
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
    },
    {
      "name": "orderNo",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Order no",
        "x-component": "Input"
      }
    },
    {
      "name": "status",
      "interface": "select",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Status",
        "x-component": "Select",
        "enum": [
          { "value": "draft", "label": "Draft" },
          { "value": "paid", "label": "Paid" },
          { "value": "cancelled", "label": "Cancelled" }
        ]
      }
    },
    {
      "name": "totalAmount",
      "interface": "number",
      "type": "double",
      "uiSchema": {
        "type": "number",
        "title": "Total amount",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        }
      }
    },
    {
      "name": "remark",
      "interface": "textarea",
      "type": "text",
      "uiSchema": {
        "type": "string",
        "title": "Remark",
        "x-component": "Input.TextArea"
      }
    }
  ]
}
```

Common good fits for `general`:

- customers
- orders
- products
- leads
- opportunities
- invoices
- tasks
- contract metadata

Common bad fits for `general`:

- department trees that need structural parent-child behavior
- file records where the file itself is first-class
- schedule-centric objects that mainly exist for calendar behavior
