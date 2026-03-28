# General Collection

Use for ordinary business master data or transactional records.

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
