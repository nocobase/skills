# File Collection

Use when the file itself is the primary record, such as attachments, scans, contracts, images, or archive files.

```json
{
  "logging": true,
  "name": "example_files",
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
        "title": "{{t(\"Title\")}}",
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
        "title": "{{t(\"File name\", { ns: \"file-manager\" })}}",
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
        "title": "{{t(\"Extension name\", { ns: \"file-manager\" })}}",
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
        "title": "{{t(\"Size\", { ns: \"file-manager\" })}}",
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
        "title": "{{t(\"MIME type\", { ns: \"file-manager\" })}}",
        "x-component": "Input",
        "x-read-pretty": true
      }
    },
    {
      "interface": "input",
      "type": "text",
      "name": "path",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "{{t(\"Path\", { ns: \"file-manager\" })}}",
        "x-component": "TextAreaWithGlobalScope",
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
        "title": "{{t(\"URL\")}}",
        "x-component": "Input.URL",
        "x-read-pretty": true
      }
    },
    {
      "interface": "url",
      "type": "text",
      "name": "preview",
      "field": "url",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "{{t(\"Preview\", { ns: \"file-manager\" })}}",
        "x-component": "Preview",
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
        "title": "{{t(\"Storage\", { ns: \"file-manager\" })}}",
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
      "type": "jsonb",
      "name": "meta",
      "deletable": false,
      "defaultValue": {}
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
