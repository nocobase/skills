# File Collection

Use when the file itself is the primary record, such as attachments, scans, contracts, images, or archive files.

Key rules:

- Do not assume `template: "file"` alone is enough for realistic modeling validation.
- Start from the real built-in file fields, then append business-specific fields.
- Prefer a real file collection over URL or path text fields when the file is a first-class object.
- If the user only needs one file attached to another business table, an attachment field may be enough.
- If the user needs file metadata, reuse, lifecycle tracking, or file-centered querying, use a real `file` collection.

Good fits for `file`:

- scanned invoices
- contracts
- vouchers
- certificates
- equipment photos
- uploaded documents

Bad fits for `file`:

- ordinary business tables that only need one supporting attachment field
- metadata-only records that point to an external file system by URL and intentionally do not use NocoBase file semantics

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

After the baseline, add business-specific fields such as:

- category or document type
- owner relation
- related business record relation
- tags or status
- retention or review fields

## Realistic example: contracts file collection

Use a `file` collection like this when the uploaded contract file is the business record and must be searchable together with business metadata.

```json
{
  "logging": true,
  "name": "contract_files",
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
      "interface": "input",
      "type": "text",
      "name": "path",
      "deletable": false,
      "uiSchema": {
        "type": "string",
        "title": "Path",
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
        "title": "URL",
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
        "title": "Preview",
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
          { "value": "archived", "label": "Archived" }
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

Verification focus for `file` collections:

- the built-in file metadata fields exist, not just a business `title` field;
- the storage relation is present and points to `storages`;
- the primary key strategy is explicit and readable in metadata;
- business fields are appended after the file baseline, not substituted for it.
