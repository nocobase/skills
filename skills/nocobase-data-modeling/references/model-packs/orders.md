# Model Pack: Orders

Use this pack for a normal transactional model with:

- a master-data `customers` table
- a transactional `orders` table
- a child-line `order_items` table

Collection choices:

- `customers` -> `general`
- `orders` -> `general`
- `order_items` -> `general`

Relation pattern:

- many orders belong to one customer
- one order has many order items
- many order items belong to one order

## Table 1: customers

```json
{
  "name": "customers",
  "title": "Customers",
  "template": "general",
  "autoGenId": false,
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
    }
  ]
}
```

## Table 2: orders

```json
{
  "name": "orders",
  "title": "Orders",
  "template": "general",
  "autoGenId": false,
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
          { "value": "confirmed", "label": "Confirmed" },
          { "value": "shipped", "label": "Shipped" },
          { "value": "closed", "label": "Closed" }
        ]
      }
    },
    {
      "name": "orderDate",
      "interface": "datetime",
      "type": "date",
      "defaultToCurrentTime": false,
      "onUpdateToCurrentTime": false,
      "timezone": true,
      "uiSchema": {
        "type": "string",
        "title": "Order date",
        "x-component": "DatePicker",
        "x-component-props": {
          "showTime": true,
          "utc": true
        }
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
              "label": "orderNo"
            }
          }
        }
      }
    }
  ]
}
```

## Table 3: order_items

```json
{
  "name": "order_items",
  "title": "Order items",
  "template": "general",
  "autoGenId": false,
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
      "name": "productName",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Product name",
        "x-component": "Input"
      }
    },
    {
      "name": "quantity",
      "interface": "integer",
      "type": "bigInt",
      "uiSchema": {
        "type": "number",
        "title": "Quantity",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        },
        "x-validator": "integer"
      }
    },
    {
      "name": "unitPrice",
      "interface": "number",
      "type": "double",
      "uiSchema": {
        "type": "number",
        "title": "Unit price",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        }
      }
    },
    {
      "name": "order",
      "interface": "m2o",
      "type": "belongsTo",
      "target": "orders",
      "foreignKey": "orderId",
      "targetKey": "id",
      "uiSchema": {
        "title": "Order",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false,
          "fieldNames": {
            "value": "id",
            "label": "orderNo"
          }
        }
      },
      "reverseField": {
        "name": "items",
        "interface": "o2m",
        "type": "hasMany",
        "uiSchema": {
          "title": "Items",
          "x-component": "AssociationField",
          "x-component-props": {
            "multiple": true,
            "fieldNames": {
              "value": "id",
              "label": "productName"
            }
          }
        }
      }
    }
  ]
}
```

Verification focus:

- `customers` is a normal master-data table, not a tree or file table
- `orders.customer` is `m2o`
- `order_items.order` is `m2o`
- the reverse fields on `customers` and `orders` are `o2m`
- scalar, choice, datetime, and relation fields each use the correct payload family
