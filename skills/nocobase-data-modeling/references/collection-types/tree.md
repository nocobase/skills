# Tree Collection

Use when hierarchy is intrinsic to the data, such as departments, categories, regions, or nested directories.

Key rules:

- Treat hierarchy as first-class structure.
- Use the tree template rather than simulating a tree with ordinary self-relations in a general collection.
- `parentId`, `parent`, and `children` are core structural fields.
- Add business fields only after the structural tree fields are correct.

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

## Realistic example: product categories tree

Use a `tree` collection like this when categories are inherently hierarchical and each node may have a parent and children.

```json
{
  "logging": true,
  "name": "product_categories",
  "template": "tree",
  "view": false,
  "tree": "adjacencyList",
  "autoGenId": false,
  "title": "Product categories",
  "fields": [
    {
      "interface": "snowflakeId",
      "name": "parentId",
      "type": "snowflakeId",
      "isForeignKey": true,
      "uiSchema": {
        "type": "number",
        "title": "Parent ID",
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
        "title": "Parent",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false,
          "fieldNames": {
            "label": "title",
            "value": "id"
          }
        }
      },
      "target": "product_categories"
    },
    {
      "interface": "o2m",
      "type": "hasMany",
      "name": "children",
      "foreignKey": "parentId",
      "treeChildren": true,
      "onDelete": "CASCADE",
      "uiSchema": {
        "title": "Children",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": true,
          "fieldNames": {
            "label": "title",
            "value": "id"
          }
        }
      },
      "target": "product_categories"
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
      "name": "title",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Title",
        "x-component": "Input"
      }
    },
    {
      "name": "code",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Code",
        "x-component": "Input"
      }
    },
    {
      "name": "enabled",
      "interface": "checkbox",
      "type": "boolean",
      "uiSchema": {
        "type": "boolean",
        "title": "Enabled",
        "x-component": "Checkbox"
      }
    },
    {
      "name": "sort",
      "interface": "integer",
      "type": "bigInt",
      "uiSchema": {
        "type": "number",
        "title": "Sort",
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

Verification focus for `tree` collections:

- `parentId`, `parent`, and `children` all exist together;
- `treeParent: true` and `treeChildren: true` are present on the structural relation fields;
- the parent and child fields target the same collection;
- business fields are added after the tree baseline rather than replacing the structural fields.
