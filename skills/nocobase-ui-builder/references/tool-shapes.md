# Tool Shapes

This file summarizes the request shapes most often needed by this skill.

Do not open this file until you are preparing the real nb body. For the common local helper surface first, use [helper-contracts.md](./helper-contracts.md).

Use it with:

- [cli-command-surface.md](./cli-command-surface.md) for canonical nb API families
- [transport-crosswalk.md](./transport-crosswalk.md) for the nb API family
- [page-blueprint.md](./page-blueprint.md), [reaction.md](./reaction.md), and [templates.md](./templates.md) for business-object rules and template planning

Canonical front door is `nb api flow-surfaces`. Use this file for the nb request body / locator shape you actually send.

## 0. Global Rule

- `nb api flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body.
- Most other body-based `flow-surfaces` commands take the raw business object through CLI `--body` / `--body-file`.
- Never stringify the business object.
- Never add an outer `{ values: ... }` wrapper.
- Never invent the literal `"root"` as `target.uid` / `locator.uid`; use a real uid from live readback.
- For `applyBlueprint`, the nb request body is one page blueprint business object. On a first whole-page write that already ran `prepare-write`, that means `result.cliBody`, not the original draft blueprint. The helper stays local/read-only; the later transport step must send only that prepared object. Do not wrap it again.
- For whole-page `applyBlueprint`, recompute the involved target collections from live metadata and rebuild top-level `defaults.collections` from scratch on each draft. Every involved direct collection keeps fixed `popups.view` / `addNew` / `edit` `{ name, description }` descriptors there, `defaults.collections.<collection>.fieldGroups` stays only on the target collection when a fixed generated popup scene should still have more than 10 effective fields, `table` blocks always pull their collection into the `addNew` threshold evaluation, and relation popup naming stays under `popups.associations` keyed only by the first relation segment; do not send `defaults.blocks` or popup-default content/layout.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For custom `edit` popups with `popup.blocks`, include exactly one `editForm` block.
- For normal single-page requests, keep exactly one real tab in the blueprint; do not send empty / placeholder tabs or placeholder `markdown` / note / banner blocks unless the user explicitly asked for them.
- Default blueprint `fields[]` entries to simple strings. Only use a field object when `popup`, `target`, `renderer`, or field-specific `type` is required.
- `layout` belongs only on `tabs[]` or inline `popup`, and when present it must be an object. Omit it only when that tab/popup has at most one non-filter block; otherwise explicit keyed layout is required.
- Public page/popup/fields layout `{ rows: [[{ key, span }]] }` is different from low-level `set-layout` runtime `rows` / `sizes`. Do not mix those grammars.
- When authoring direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` creations through `applyBlueprint`, `compose`, `add-block`, or `add-blocks`, always include a non-empty block-level `defaultFilter` on that block/create envelope. Prefer 3 to 4 common business fields when metadata supports them; if fewer than 3 suitable candidates exist, cover every available candidate instead. Keep the same host's block-level `filter` action routing for filter/search intent, but the action itself is optional.
- For repeat-eligible popup / block / fields scenes, contextual `list-templates` is mandatory before binding a template or finalizing a reusable/template-backed fallback; keyword-only search stays discovery-only. Fresh one-off pages with explicit local popup / block content, no existing template reference, and no reuse / save-template ask may stay inline and skip template routing.
- When no explicit `popup.template` is present, use `popup.tryTemplate=true` as the default write fallback on popup-capable `add-field` / `add-fields`, `add-action` / `add-actions`, `add-record-action` / `add-record-actions`, `compose` action/field popup specs, and whole-page `applyBlueprint` inline popup specs. Local popup content may remain as the miss fallback. Keep [templates.md](./templates.md) as the planning source of truth.
- When the user explicitly wants the new local popup to become a reusable popup template immediately, use `popup.saveAsTemplate={ name, description }` on those same create-time popup write paths. It cannot be combined with `popup.template`, and it may coexist with `popup.tryTemplate=true`: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved.
- For localized create/append writes, do not assume the request body is the final action list; read back the persisted surface before adding more actions or popup wiring.
- When the intended UX is "click the shown title/name to open details", prefer field popup / `clickToOpen` / `openView` semantics and avoid adding a redundant `view` record action unless the user explicitly asked for a button/action column.

Safe mental model:

1. author the inner business object
2. send that same prepared object as raw JSON through CLI `--body` / `--body-file`, or use locator flags when the command is bodyless
3. do not wrap that object again
4. never transform the business object into a stringified nested wrapper

Common wrong shapes:

Wrong nb body:

```json
{
  "blueprint": {
    "target": { "uid": "table-block-uid" },
    "changes": { "pageSize": 20 }
  }
}
```

Correct nb body for `configure`:

```json
{
  "target": { "uid": "table-block-uid" },
  "changes": { "pageSize": 20 }
}
```

Wrong stringified wrapper:

```json
{
  "blueprint": "{\"version\":\"1\",\"mode\":\"create\"}"
}
```

## 1. CLI Shapes

### `get`

Use `get` for normal structural inspection and post-write readback.

- no JSON body
- pass locator fields as CLI flags such as `--page-schema-uid`, `--route-id`, `--tab-schema-uid`, or `--uid`

Locator shape:

```json
{ "pageSchemaUid": "employees-page-schema" }
```

### `describe-surface`

Use `describe-surface` only when its richer public tree helps analyze an existing surface.

nb request body:

```json
{
  "locator": {
    "pageSchemaUid": "employees-page-schema"
  }
}
```

### `catalog`

Use `catalog` when current-target capability is the question.

nb request body:

```json
{
  "target": { "uid": "table-block-uid" },
  "sections": ["fields"]
}
```

Wrong:

```json
{
  "target": { "uid": "root" },
  "sections": ["fields"]
}
```

If you do not yet have a real target uid, read structure first; do not guess `"root"`.

### `get-reaction-meta`

Use `get-reaction-meta` as the first discovery read for default values, linkage, computed fields, block visibility, or action state.

nb request body:

```json
{
  "target": { "uid": "employee-form-uid" }
}
```

Notes:

- For form `fieldValue` / `fieldLinkage`, keep targeting the outer form block uid.
- Reuse the returned capability `fingerprint` in the matching `set-*` write.
- Use `flow-surfaces context` only when you still need lower-level ctx paths beyond the returned metadata.

### `set-event-flows`

Use `set-event-flows` only for full replacement of a target node's instance-level `flowRegistry`.

nb request body:

```json
{
  "target": { "uid": "submit-action-uid" },
  "flowRegistry": {
    "submitFlow": {
      "key": "submitFlow",
      "on": "click",
      "steps": {
        "runJsStep": {
          "params": {
            "code": "ctx.message.success(ctx.t('Saved'));"
          }
        }
      }
    }
  }
}
```

Alternative `on` shape when the flow is inserted relative to a built-in flow/step:

```json
{
  "target": { "uid": "employee-create-form-uid" },
  "flowRegistry": {
    "submitHook": {
      "key": "submitHook",
      "on": {
        "eventName": "submit",
        "phase": "beforeStep",
        "flowKey": "formSettings",
        "stepKey": "refresh"
      },
      "steps": {}
    }
  }
}
```

Notes:

- Prefer `flowRegistry` over `flows`.
- `submitFlow`, `submitHook`, and `runJsStep` are placeholders for live keys copied from readback.
- For `Execute JavaScript`, keep the existing step shape and update only `params.code` after local RunJS validation.
- Do not guess unsupported `eventName`, `phase`, `flowKey`, or `stepKey`; keep the live contract from readback.

Wrong wrapped body:

```json
{
  "blueprint": {
    "target": { "uid": "submit-action-uid" },
    "flowRegistry": {
      "submitFlow": {
        "key": "submitFlow",
        "on": "click",
        "steps": {
          "runJsStep": {
            "params": {
              "code": "ctx.message.success(ctx.t('Saved'));"
            }
          }
        }
      }
    }
  }
}
```

### `set-layout`

Use `set-layout` only for full replacement of one existing live grid layout.

nb request body:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": [
      ["details-uid"],
      ["roles-table-uid"]
    ],
    "row2": [
      ["edit-form-uid"]
    ]
  },
  "sizes": {
    "row1": [12, 12],
    "row2": [24]
  },
  "rowOrder": ["row1", "row2"]
}
```

Notes:

- `target.uid` must be the live grid uid from readback, not a public block `key`.
- `rows` is `Record<string, string[][]>`. Each top-level row entry is an array of column cells. Each cell is an array of stacked live child `uid`s.
- `sizes` is `Record<string, number[]>`. For every row key, the sizes array length must equal `rows[rowKey].length`, and `rows` / `sizes` must use the same row keys.
- `rowOrder` is optional; when present, it must list every key from `rows` exactly once.
- `[[details-uid], [roles-table-uid]]` means one row with two side-by-side columns.
- `[[details-uid, roles-table-uid]]` means one column with two vertically stacked blocks.
- Public page/popup layout `{ rows: [[{ key, span }]] }` and form `fieldsLayout` do not apply to `set-layout`.

Common wrong shapes:

Wrong one-dimensional `rows`:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": ["details-uid", "roles-table-uid"]
  },
  "sizes": {
    "row1": [12, 12]
  }
}
```

Wrong stacked cell + two sizes:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": [
      ["details-uid", "roles-table-uid"]
    ]
  },
  "sizes": {
    "row1": [12, 12]
  }
}
```

Wrong nested `sizes`:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": [
      ["details-uid"],
      ["roles-table-uid"]
    ]
  },
  "sizes": {
    "row1": [[12, 12]]
  }
}
```

Wrong wrapped body:

```json
{
  "blueprint": {
    "target": { "uid": "popup-grid-uid" },
    "rows": {
      "row1": [
        ["details-uid"],
        ["roles-table-uid"]
      ]
    },
    "sizes": {
      "row1": [12, 12]
    },
    "rowOrder": ["row1"]
  }
}
```

## 2. `applyBlueprint`

### Create

nb request body:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "routeId": 12 },
    "item": { "title": "Employees", "icon": "TeamOutlined" }
  },
  "page": {
    "title": "Employees",
    "documentTitle": "Employees workspace"
  },
  "defaults": {
    "collections": {
      "employees": {
        "popups": {
          "addNew": { "name": "Create employee", "description": "Create one employee record." },
          "view": { "name": "Employee details", "description": "View one employee record." },
          "edit": { "name": "Edit employee", "description": "Edit one employee record." }
        }
      }
    }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "defaultFilter": {
            "logic": "$and",
            "items": [
              { "path": "nickname", "operator": "$includes", "value": "" },
              { "path": "email", "operator": "$includes", "value": "" },
              { "path": "status", "operator": "$eq", "value": "" }
            ]
          },
          "fields": ["nickname", "email", "status"],
          "actions": ["filter"]
        }
      ]
    }
  ]
}
```

When the target group is not already known, `navigation.group.title` is also valid; applyBlueprint will reuse a unique same-title group or create a new one when no match exists, but multi-match same-title cases must stop and require explicit `routeId` before write. Same-title reuse is title-only. `navigation.group.routeId` is exact targeting only and must not be mixed with `icon`, `tooltip`, or `hideInMenu`; if an existing group's metadata must change, use low-level `update-menu` instead.

When the requirement is "click the shown record / relation record to open details", prefer a field popup rather than inventing a new action button:

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": [
            {
              "field": "department.title",
              "popup": {
                "title": "Department details",
                "blocks": [
                  {
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "departments"
                    },
                    "fields": ["title"]
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Readback commonly normalizes this to clickable-field / `clickToOpen` semantics. If the requirement explicitly says "details button" or "action column", use an action / recordAction instead.

For popup relation tables, prefer the canonical `resource.binding = "associatedRecords"` + `resource.associationField = "<relationField>"` shape:

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "details",
          "collection": "users",
          "fields": [
            {
              "field": "roles",
              "popup": {
                "blocks": [
                  {
                    "type": "table",
                    "resource": {
                      "binding": "associatedRecords",
                      "collectionName": "roles",
                      "associationField": "roles"
                    },
                    "fields": ["name"]
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

For custom edit popups, use `editForm`, not `form`:

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "recordActions": [
            {
              "type": "edit",
              "popup": {
                "blocks": [
                  { "key": "editForm", "type": "editForm", "fields": ["nickname"], "actions": ["submit"] }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

In a custom `edit` popup, the single `editForm` may omit `resource`; applyBlueprint will inherit the opener's current-record context.

Whole-page reaction example:

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "key": "main",
      "title": "Overview",
      "blocks": [
        {
          "key": "employeeForm",
          "type": "createForm",
          "collection": "employees",
          "fields": ["status"],
          "actions": ["submit"]
        }
      ]
    }
  ],
  "reaction": {
    "items": [
      {
        "type": "setFieldValueRules",
        "target": "main.employeeForm",
        "rules": [
          {
            "targetPath": "status",
            "mode": "default",
            "value": {
              "source": "literal",
              "value": "draft"
            }
          }
        ]
      }
    ]
  }
}
```

### Replace

`replace` rebuilds existing route-backed tab slots by array index. It does not use tab `key` to match old tabs.

nb request body:

```json
{
  "version": "1",
  "mode": "replace",
  "target": {
    "pageSchemaUid": "employees-page-schema"
  },
  "page": {
    "title": "Employees workspace"
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"]
        }
      ]
    }
  ]
}
```

## 3. Localized Edit CLI Bodies

### `compose`

```json
{
  "target": { "uid": "tab-schema-uid" },
  "mode": "append",
  "blocks": [
    {
      "key": "employeeFilter",
      "type": "filterForm",
      "resource": {
        "dataSourceKey": "main",
        "collectionName": "employees"
      },
      "fields": [
        { "fieldPath": "nickname", "target": "employeesTable" },
        { "fieldPath": "status", "target": "employeesTable" }
      ],
      "fieldsLayout": {
        "rows": [[{ "key": "nickname", "span": 12 }, { "key": "status", "span": 12 }]]
      }
    },
    {
      "key": "employeesTable",
      "type": "table",
      "resource": {
        "dataSourceKey": "main",
        "collectionName": "employees"
      },
      "defaultFilter": {
        "logic": "$and",
        "items": [
          { "path": "nickname", "operator": "$includes", "value": "" },
          { "path": "email", "operator": "$includes", "value": "" },
          { "path": "status", "operator": "$eq", "value": "" }
        ]
      },
      "fields": ["nickname", "email", "status"],
      "actions": ["filter"]
    }
  ]
}
```

Notes:

- `fieldsLayout` is available on `compose` only for `createForm`, `editForm`, `details`, and `filterForm`. It uses the same `{ rows: [[...]] }` shape as top-level layout, but references field keys inside that one block.
- Each `fieldsLayout` row must be non-empty, every keyed field must be placed exactly once, and object-cell `span` must be numeric.
- `addBlock` does not accept `fieldsLayout`; when the first write must shape a field grid directly, prefer `compose` over `addBlock`.
- For `table` / `list` / `gridCard` / `calendar` / `kanban`, keep filtering/search as a normal block-level `filter` action unless the user explicitly asked for `filterForm`.
- `compose` popup-capable field/action children follow the same popup contract as `add-field` / `add-action` / `add-record-action`: default to `popup.tryTemplate=true` unless an explicit `popup.template` or explicit `popup.tryTemplate=false` override already exists.
- After `compose`, verify the persisted children rather than assuming the write body proves the final action order, popup-template binding, or click/open behavior.

### `configure`

```json
{
  "target": { "uid": "table-block-uid" },
  "changes": {
    "pageSize": 20
  }
}
```

### `set-field-value-rules`

```json
{
  "target": { "uid": "employee-form-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "targetPath": "status",
      "mode": "default",
      "value": {
        "source": "literal",
        "value": "draft"
      }
    }
  ]
}
```

### `set-field-linkage-rules`

```json
{
  "target": { "uid": "employee-form-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "recomputeTotals",
      "then": [
        {
          "type": "assignField",
          "items": [
            {
              "targetPath": "subtotal",
              "value": {
                "source": "runjs",
                "version": "v2",
                "code": "const amount = Number(ctx.formValues?.amount || 0);\n\nreturn amount;"
              }
            },
            {
              "targetPath": "total",
              "value": {
                "source": "runjs",
                "version": "v2",
                "code": "const amount = Number(ctx.formValues?.amount || 0);\nconst taxRate = Number(ctx.formValues?.taxRate || 0);\n\nreturn amount + amount * taxRate;"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### `set-block-linkage-rules`

```json
{
  "target": { "uid": "employees-table-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "hideTable",
      "when": {
        "logic": "$and",
        "items": [
          {
            "path": "params.query.hideTable",
            "operator": "$isTruly"
          }
        ]
      },
      "then": [
        {
          "type": "setBlockState",
          "state": "hidden"
        }
      ]
    }
  ]
}
```

### `set-action-linkage-rules`

```json
{
  "target": { "uid": "refresh-action-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "disableRefresh",
      "when": {
        "logic": "$and",
        "items": [
          {
            "path": "params.query.readonly",
            "operator": "$isTruly"
          }
        ]
      },
      "then": [
        {
          "type": "setActionState",
          "state": "disabled"
        }
      ]
    }
  ]
}
```

### `add-tab`

Use when the task is to add one new route-backed tab under an existing page.

```json
{
  "target": { "uid": "page-root-uid" },
  "title": "Analytics"
}
```

### `move-tab`

Use when the task is to reorder sibling outer tabs on the same page.

```json
{
  "sourceUid": "analytics-tab-uid",
  "targetUid": "overview-tab-uid",
  "position": "before"
}
```

Both `sourceUid` and `targetUid` must come from live readback; do not infer them from tab titles alone.

### `remove-node`

Use when the task is to remove one existing block / field / action subtree from a live surface.

```json
{
  "target": { "uid": "banner-block-uid" }
}
```

### `update-menu`

Use when an existing group/item metadata must change, especially when `applyBlueprint` exact group targeting through `navigation.group.routeId` is insufficient.

```json
{
  "menuRouteId": "workspace-route-id",
  "title": "Workspace",
  "icon": "TableOutlined"
}
```

## 4. Common Invalid Public Shapes

These are common invalid shapes that should be caught locally before the real write.

Wrong: block-level `layout`

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "blocks": [
        {
          "key": "employeesTable",
          "type": "table",
          "collection": "employees",
          "layout": { "rows": [["employeesTable"]] }
        }
      ]
    }
  ]
}
```

Wrong: layout-cell `uid` / `ref` / `$ref`

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "layout": { "rows": [[{ "uid": "employeesTable" }]] },
      "blocks": [
        { "key": "employeesTable", "type": "table", "collection": "employees" }
      ]
    }
  ]
}
```

Wrong: deprecated aliases such as block `collectionName`, field `fieldPath`, or nested `resourceBinding`

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "blocks": [
        {
          "type": "table",
          "collectionName": "employees",
          "fields": [{ "fieldPath": "nickname" }]
        }
      ]
    }
  ]
}
```

Wrong: placeholder tab or placeholder `markdown` / note / banner content in a normal single-page request

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [{ "type": "table", "collection": "employees" }]
    },
    {
      "title": "Later",
      "blocks": []
    }
  ]
}
```

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        { "type": "table", "collection": "employees" },
        { "type": "markdown", "title": "Later notes" }
      ]
    }
  ]
}
```

Wrong: object-style `field.target`

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "blocks": [
        {
          "key": "employeesTable",
          "type": "table",
          "collection": "employees",
          "fields": [
            {
              "field": "nickname",
              "target": { "key": "employeesTable" }
            }
          ]
        }
      ]
    }
  ]
}
```
