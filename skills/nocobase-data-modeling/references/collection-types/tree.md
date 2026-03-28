# Tree Collection

Use when the hierarchy is intrinsic to the data, such as organizations, departments, categories, regions, or nested directories.

```json
{
  "logging": true,
  "name": "example_tree",
  "template": "tree",
  "view": false,
  "tree": "adjacencyList",
  "autoGenId": false,
  "title": "Example Tree",
  "fields": [
    {
      "interface": "snowflakeId",
      "name": "parentId",
      "type": "snowflakeId",
      "isForeignKey": true,
      "uiSchema": {
        "type": "number",
        "title": "{{t(\"Parent ID\")}}",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "separator": "0.00",
          "step": "1"
        },
        "x-validator": "integer"
      },
      "autoFill": false
    },
    {
      "interface": "m2o",
      "type": "belongsTo",
      "name": "parent",
      "foreignKey": "parentId",
      "treeParent": true,
      "onDelete": "CASCADE",
      "uiSchema": {
        "title": "{{t(\"Parent\")}}",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false,
          "fieldNames": {
            "label": "id",
            "value": "id"
          }
        }
      },
      "target": "example_tree"
    },
    {
      "interface": "o2m",
      "type": "hasMany",
      "name": "children",
      "foreignKey": "parentId",
      "treeChildren": true,
      "onDelete": "CASCADE",
      "uiSchema": {
        "title": "{{t(\"Children\")}}",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": true,
          "fieldNames": {
            "label": "id",
            "value": "id"
          }
        }
      },
      "target": "example_tree"
    },
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
