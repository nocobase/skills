---
title: CommentsBlockModel
description: Public Flow Surfaces contract for comments blocks in pages and record popups.
---

# CommentsBlockModel

## When To Use

Use public block type `comments` when the requested UI is a comment thread, discussion area, or comment block.

Aliases include:

- 评论 / 评论区块 / 评论区
- comment block / comments

Always inspect `catalog` for localized writes before adding it to a live target. If `catalog.blocks` does not expose `CommentsBlockModel`, do not guess raw schema or internal `stepParams`.

## Public Creation Contract

Supported public writes:

- `applyBlueprint` block type: `comments`
- localized `compose`, `add-block`, and `add-blocks` block type: `comments`

Never use raw model names, raw `props`, raw `decoratorProps`, raw `stepParams`, or raw schema to create the block.

Page-level comments require a direct comment-template collection:

```json
{
  "type": "comments",
  "collection": "comments",
  "settings": {
    "title": "Comments",
    "pageSize": 20
  }
}
```

Localized page-level form:

```json
{
  "target": { "uid": "tab-schema-uid" },
  "type": "comments",
  "resourceInit": {
    "dataSourceKey": "main",
    "collectionName": "comments"
  },
  "settings": {
    "title": "Comments",
    "pageSize": 20
  }
}
```

The target collection must have `collection.template === "comment"` or `collection.options.template === "comment"`.

## Popup Association Contract

Record popup comments are association comments only:

```json
{
  "target": { "uid": "record-popup-uid" },
  "type": "comments",
  "resource": {
    "binding": "associatedRecords",
    "associationField": "comments"
  },
  "settings": {
    "title": "Comments",
    "pageSize": 10
  }
}
```

The host collection field must be `hasMany` or `belongsToMany`, and the association target collection must be a comment-template collection. `resource.binding: "currentRecord"` is invalid for comments.

## Configure Contract

Supported `configure.changes` keys:

- `title`
- `description`
- `resource`
- `pageSize`
- `dataScope`

`pageSize` must be one of `5`, `10`, `20`, `50`, `100`, or `200`.

```json
{
  "target": { "uid": "comments-block-uid" },
  "changes": {
    "title": "Verification comments",
    "pageSize": 5,
    "dataScope": { "logic": "$and", "items": [] }
  }
}
```

## Readback Checks

Successful readback should contain:

- `CommentsBlockModel`
- `subModels.items[0].use = "CommentItemModel"`
- `resourceSettings.init.collectionName` pointing to the comment collection
- popup association comments also include an association resource such as `associationName` and `sourceId`

If backend returns aggregate `errors[]`, fix every listed error before retrying. If rendered UI warns about the comment collection, check the collection template first.
