---
title: "Common Conventions"
description: "Description of common conventions for workflow configuration, including configuration item formats, naming standards, etc."
---

# Common Conventions

## The `collection` Field in Trigger and Node Configuration

Some trigger and node configuration items use the `collection` field to represent a data table associated with the trigger or node. This field must use the following (colon-separated) format: `dataSourceName:collectionName`. The `dataSourceName` should be omitted if and only if the data source is `main` (the default primary data source).

## The `filter` Field in Trigger and Node Configuration

Some triggers and nodes use a `filter` (or `condition`) field to specify filtering conditions. This field is a JSON object that follows the **data table filter DSL** format described below.

### Basic Structure

**The root node of a filter object must be a condition group: `{ "$and": [...] }` or `{ "$or": [...] }`.** All conditions must be placed inside the top-level condition group array. Do not place conditions directly at the root level.

Each element in the condition group array is either:
- A **single condition**: `{ "fieldName": { "$operator": value } }`
- A **nested condition group**: `{ "$and": [...] }` or `{ "$or": [...] }`

The `value` in a condition can be a constant or a variable expression (e.g., `"{{ $context.data.id }}"`).

For association fields, use dot notation to reference nested fields, e.g., `"category.name"`.

### Available Operators

#### General (all field types)
| Operator | Description |
| --- | --- |
| `$eq` | Equal |
| `$ne` | Not equal |
| `$in` | In (value is an array) |
| `$notIn` | Not in (value is an array) |
| `$empty` | Is empty |
| `$notEmpty` | Is not empty |

#### String fields
| Operator | Description |
| --- | --- |
| `$includes` | Contains substring |
| `$notIncludes` | Does not contain substring |
| `$startsWith` | Starts with |
| `$notStartsWith` | Does not start with |
| `$endWith` | Ends with |
| `$notEndWith` | Does not end with |

#### Date fields
| Operator | Description |
| --- | --- |
| `$dateOn` | On the specified date |
| `$dateNotOn` | Not on the specified date |
| `$dateBefore` | Before the specified date |
| `$dateNotBefore` | Not before the specified date |
| `$dateAfter` | After the specified date |
| `$dateNotAfter` | Not after the specified date |
| `$dateBetween` | Between two dates (value is `[start, end]`) |

#### Array fields
| Operator | Description |
| --- | --- |
| `$match` | Matches all elements |
| `$notMatch` | Does not match all elements |
| `$anyOf` | Matches any element |
| `$noneOf` | Matches none of the elements |
| `$arrayEmpty` | Array is empty |
| `$arrayNotEmpty` | Array is not empty |

#### Boolean fields
| Operator | Description |
| --- | --- |
| `$isTruly` | Is truthy |
| `$isFalsy` | Is falsy |

#### Association fields
| Operator | Description |
| --- | --- |
| `$exists` | Association exists |
| `$notExists` | Association does not exist |

### Examples

#### Simple filter with one condition

```json
{
  "$and": [
    { "status": { "$eq": "published" } }
  ]
}
```

#### Multiple conditions with AND logic

```json
{
  "$and": [
    { "status": { "$eq": "active" } },
    { "createdAt": { "$dateBefore": "2025-01-01" } }
  ]
}
```

#### Nested AND/OR logic

```json
{
  "$and": [
    { "status": { "$ne": "archived" } },
    {
      "$or": [
        { "title": { "$includes": "Nocobase" } },
        { "category.name": { "$eq": "Tech" } }
      ]
    }
  ]
}
```

#### Using variable expressions

```json
{
  "$and": [
    { "id": { "$eq": "{{ $context.data.id }}" } }
  ]
}
```
