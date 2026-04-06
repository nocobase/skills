---
title: "Create Data"
description: "Explains the target collection and field assignment method of the create data node."
---

# Create Data

## Node Type

`create`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Adds a new record to a specified data table, with fields assigned using workflow context variables.

## Business Scenario Example
Add an order log or related record after an order is submitted.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. The format matches the data source selector. For a single data source, write the collection name (e.g., `posts`). For data sources not main, use `dataSource:collection`. |
| usingAssignFormSchema | boolean | true | Yes | Whether to use a custom assignment form (primarily affects the frontend configuration display). This option is used to avoid legacy values configuration format, and should always be set to true for new configurations. If you don't know how to configure the `assignFormSchema` field, leave it as false to use legacy UI. |
| assignFormSchema | object | {} | No | UI Schema for the custom assignment form (primarily for frontend use). The schema format follows Formily form schema, each field should be configured accordingly (type in collection) as the values are assigned. Each key of properties should be generated as an uid string. |
| params.values | object | {} | No | Field assignment object where keys are field names and values can be constants or variables. Unassigned fields will use their default value or `null`. Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| params.appends | string[] | [] | No | List of relationship fields to pre-load. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Branch Description

Branches are not supported.

## Example Configuration

### usingAssignFormSchema: false (legacy values configuration)

```json
{
  "collection": "orderLogs",
  "usingAssignFormSchema": false,
  "assignFormSchema": {},
  "params": {
    "values": {
      "orderId": "{{$context.data.id}}",
      "eventType": "{{$context.data.status}}",
      "timestamp": "{{$context.date}}"
    },
    "appends": []
  }
}
```

### usingAssignFormSchema: true

```json
{
  "collection": "posts",
  "usingAssignFormSchema": true,
  "assignFormSchema": {
    "_isJSONSchemaObject": true,
    "version": "2.0",
    "name": "exuqo5zqbv5",
    "type": "void",
    "x-component": "Grid",
    "x-initializer": "assignFieldValuesForm:configureFields",
    "properties": {
      "fqqktkzlw8x": {
        "_isJSONSchemaObject": true,
        "version": "2.0",
        "type": "void",
        "x-component": "Grid.Row",
        "properties": {
          "0q1kjh4llub": {
            "_isJSONSchemaObject": true,
            "version": "2.0",
            "type": "void",
            "x-component": "Grid.Col",
            "properties": {
              "title": {
                "_isJSONSchemaObject": true,
                "version": "2.0",
                "type": "string",
                "name": "title",
                "x-toolbar": "FormItemSchemaToolbar",
                "x-settings": "fieldSettings:FormItem",
                "x-component": "AssignedField",
                "x-decorator": "FormItem",
                "x-collection-field": "posts.title"
              }
            },
            "name": "0q1kjh4llub"
          }
        },
        "name": "fqqktkzlw8x"
      },
      "ptqlwp0zd8j": {
        "_isJSONSchemaObject": true,
        "version": "2.0",
        "type": "void",
        "x-component": "Grid.Row",
        "properties": {
          "q6n51n59e0j": {
            "_isJSONSchemaObject": true,
            "version": "2.0",
            "type": "void",
            "x-component": "Grid.Col",
            "properties": {
              "category": {
                "_isJSONSchemaObject": true,
                "version": "2.0",
                "type": "string",
                "name": "category",
                "x-toolbar": "FormItemSchemaToolbar",
                "x-settings": "fieldSettings:FormItem",
                "x-component": "AssignedField",
                "x-decorator": "FormItem",
                "x-collection-field": "posts.category",
                "x-component-props": {
                  "fieldNames": {
                    "value": "id",
                    "label": "id"
                  }
                }
              }
            },
            "name": "q6n51n59e0j"
          }
        },
        "name": "ptqlwp0zd8j"
      },
      "9774oq6aipe": {
        "_isJSONSchemaObject": true,
        "version": "2.0",
        "type": "void",
        "x-component": "Grid.Row",
        "properties": {
          "xpgu5ygg61y": {
            "_isJSONSchemaObject": true,
            "version": "2.0",
            "type": "void",
            "x-component": "Grid.Col",
            "properties": {
              "score": {
                "_isJSONSchemaObject": true,
                "version": "2.0",
                "type": "string",
                "name": "score",
                "x-toolbar": "FormItemSchemaToolbar",
                "x-settings": "fieldSettings:FormItem",
                "x-component": "AssignedField",
                "x-decorator": "FormItem",
                "x-collection-field": "posts.score"
              }
            },
            "name": "xpgu5ygg61y"
          }
        },
        "name": "9774oq6aipe"
      }
    }
  },
  "params": {
    "appends": ["category"],
    "values": {
      "title": "{{$jobsMapByNodeKey.7j6k21623os.nodeTitle}}",
      "category": "{{$context.data.categoryId}}",
      "score": 5
    }
  }
}
```
