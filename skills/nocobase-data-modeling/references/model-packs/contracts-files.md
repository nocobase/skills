# Model Pack: Contracts And Contract Files

Use this pack when:

- `contracts` is the business table
- uploaded files are first-class records
- each contract may have many file records

Collection choices:

- `contracts` -> `general`
- `contract_files` -> `file`

Relation pattern:

- many file records belong to one contract
- one contract has many contract files

Compact reduction:

- create `contracts` as a compact `general` collection with business fields only;
- create `contract_files` as a compact `file` collection and do not resend template-owned fields such as `filename`, `path`, or `meta`;
- add the contract relation afterward with explicit readable keys;
- treat the expanded JSON below as structure reference or read-back shape, not as the default request body.

## Table 1: contracts

```json
{
  "name": "contracts",
  "title": "Contracts",
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
      "name": "contractNo",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Contract no",
        "x-component": "Input"
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
      "name": "status",
      "interface": "select",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Status",
        "x-component": "Select",
        "enum": [
          { "value": "draft", "label": "Draft" },
          { "value": "active", "label": "Active" },
          { "value": "closed", "label": "Closed" }
        ]
      }
    },
    {
      "name": "effectiveAt",
      "interface": "datetime",
      "type": "date",
      "defaultToCurrentTime": false,
      "onUpdateToCurrentTime": false,
      "timezone": true,
      "uiSchema": {
        "type": "string",
        "title": "Effective at",
        "x-component": "DatePicker",
        "x-component-props": {
          "showTime": true,
          "utc": true
        }
      }
    }
  ]
}
```

## Table 2: contract_files

```json
{
  "name": "contract_files",
  "title": "Contract files",
  "template": "file",
  "view": false,
  "createdBy": true,
  "updatedBy": true,
  "fields": [
    {
      "interface": "input",
      "type": "string",
      "name": "title",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "Title",
        "x-component": "Input"
      }
    },
    {
      "interface": "input",
      "type": "string",
      "name": "filename",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "File name",
        "x-component": "Input",
        "x-read-pretty": true
      }
    },
    {
      "interface": "input",
      "type": "string",
      "name": "extname",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "Extension name",
        "x-component": "Input",
        "x-read-pretty": true
      }
    },
    {
      "interface": "integer",
      "type": "integer",
      "name": "size",
      "deletable": false,
      "uiSchema": {
        "type": "number",
        "title": "Size",
        "x-component": "InputNumber",
        "x-read-pretty": true,
        "x-component-props": {
          "stringMode": true,
          "step": "0"
        }
      }
    },
    {
      "interface": "input",
      "type": "string",
      "name": "mimetype",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "MIME type",
        "x-component": "Input",
        "x-read-pretty": true
      }
    },
    {
      "interface": "url",
      "type": "text",
      "name": "url",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "URL",
        "x-component": "Input.URL",
        "x-read-pretty": true
      }
    },
    {
      "type": "belongsTo",
      "name": "storage",
      "target": "storages",
      "foreignKey": "storageId",
      "deletable": false,
      "interface": "m2o",
      "uiSchema": {
        "type": "object",
        "title": "Storage",
        "x-component": "AssociationField",
        "x-component-props": {
          "fieldNames": {
            "value": "id",
            "label": "title"
          }
        },
        "x-read-pretty": true
      }
    },
    {
      "name": "contract",
      "interface": "m2o",
      "type": "belongsTo",
      "target": "contracts",
      "foreignKey": "contractId",
      "targetKey": "id",
      "uiSchema": {
        "title": "Contract",
        "x-component": "AssociationField",
        "x-component-props": {
          "multiple": false,
          "fieldNames": {
            "value": "id",
            "label": "title"
          }
        }
      },
      "reverseField": {
        "name": "files",
        "interface": "o2m",
        "type": "hasMany",
        "uiSchema": {
          "title": "Files",
          "x-component": "AssociationField",
          "x-component-props": {
            "multiple": true,
            "fieldNames": {
              "value": "id",
              "label": "filename"
            }
          }
        }
      }
    }
  ]
}
```

Verification focus:

- `contracts` stays `general`
- `contract_files` stays `file`
- the file template fields remain intact
- the contract relation is added on top of the file baseline, not instead of it
