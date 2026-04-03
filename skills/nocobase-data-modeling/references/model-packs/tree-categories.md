# Model Pack: Tree Categories

Use this pack when the data is intrinsically hierarchical and should be modeled as a tree rather than an ordinary self-related table.

Collection choice:

- `product_categories` -> `tree`

## Table: product_categories

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

Verification focus:

- the collection is really `tree`
- `parentId`, `parent`, and `children` all exist together
- `treeParent: true` and `treeChildren: true` are present
- business fields are added after the structural tree fields, not instead of them
