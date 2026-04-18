# Tool Shapes

This file summarizes the request shapes most often needed by this skill.

Use it together with:

- [cli-command-surface.md](./cli-command-surface.md) for the canonical CLI command families
- [transport-crosswalk.md](./transport-crosswalk.md) when you need the matching MCP fallback tool family
- [page-blueprint.md](./page-blueprint.md) and [reaction.md](./reaction.md) for the inner business object rules

Canonical front door is `nocobase-ctl`. Use this file in two layers:

1. the **CLI request body / locator shape** you actually send through `nocobase-ctl flow-surfaces`
2. the **MCP fallback mapping** you only use when the CLI path is unavailable or cannot expose the required runtime command family after repair

## 0. Global Rule

- `nocobase-ctl flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body.
- Most other body-based `flow-surfaces` commands take the raw business object through CLI `--body` / `--body-file`.
- Only in MCP fallback should that same business object be wrapped under `requestBody`.
- Never stringify the business object.
- Never add an outer `{ values: ... }` wrapper.
- Never invent the literal `"root"` as `target.uid` / `locator.uid`; use a real uid from live readback.
- For `applyBlueprint`, the page blueprint object itself is the CLI request body. Do not wrap it again.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For custom `edit` popups with `popup.blocks`, include exactly one `editForm` block.
- For normal single-page requests, keep exactly one real tab in the blueprint; do not send empty / placeholder tabs.
- Do not add placeholder `Summary` / `Later` / `Fallback` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
- Default blueprint `fields[]` entries to simple strings. Only use a field object when `popup`, `target`, `renderer`, or field-specific `type` is required.
- `layout` belongs only on `tabs[]` or inline `popup`, and when present it must be an object. If you are unsure, omit it.
- For repeat-eligible popup / block / fields scenes, contextual `list-templates` is mandatory before binding a template or finalizing inline fallback; keyword-only search stays discovery-only.
- When no explicit `popup.template` is present, use `popup.tryTemplate=true` as the default write fallback on popup-capable `add-field` / `add-fields`, `add-action` / `add-actions`, `add-record-action` / `add-record-actions`, `compose` action/field popup specs, and whole-page `applyBlueprint` inline popup specs. Local popup content may remain as the miss fallback. Keep [templates.md](./templates.md) as the planning source of truth.
- When the user explicitly wants the new local popup to become a reusable popup template immediately, use `popup.saveAsTemplate={ name, description }` on those same create-time popup write paths. It requires explicit local `popup.blocks` and cannot be combined with `popup.template` or `popup.tryTemplate`.

Safe mental model:

1. author the inner business object
2. send that same object as raw JSON through CLI `--body` / `--body-file`, or use locator flags when the command is bodyless
3. only in MCP fallback wrap that same object under `requestBody`
4. never transform the business object into a stringified nested `requestBody`

Common wrong shapes:

Wrong CLI body:

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "changes": { "pageSize": 20 }
  }
}
```

Correct CLI body for `configure`:

```json
{
  "target": { "uid": "table-block-uid" },
  "changes": { "pageSize": 20 }
}
```

Wrong fallback envelope:

```json
{
  "requestBody": "{\"version\":\"1\",\"mode\":\"create\"}"
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

CLI request body:

```json
{
  "locator": {
    "pageSchemaUid": "employees-page-schema"
  }
}
```

### `catalog`

Use `catalog` when current-target capability is the question.

CLI request body:

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

CLI request body:

```json
{
  "target": { "uid": "employee-form-uid" }
}
```

Notes:

- For form `fieldValue` / `fieldLinkage`, keep targeting the outer form block uid.
- Reuse the returned capability `fingerprint` in the matching `set-*` write.
- Use `flow_surfaces_context` only when you still need lower-level ctx paths beyond the returned metadata.

### `set-event-flows`

Use `set-event-flows` only for full replacement of a target node's instance-level `flowRegistry`.

CLI request body:

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

MCP fallback envelope:

```json
{
  "requestBody": {
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

## 2. `applyBlueprint`

### Create

CLI request body:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "routeId": 12 },
    "item": { "title": "Employees" }
  },
  "page": {
    "title": "Employees",
    "documentTitle": "Employees workspace"
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

When the target group is not already known, `navigation.group.title` is also valid; applyBlueprint will reuse a unique same-title group or create a new one when no match exists. Same-title reuse is title-only. `navigation.group.routeId` is exact targeting only and must not be mixed with `icon`, `tooltip`, or `hideInMenu`; if an existing group's metadata must change, use low-level `update-menu` instead.

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

CLI request body:

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
      "key": "employeesTable",
      "type": "table",
      "resource": {
        "dataSourceKey": "main",
        "collectionName": "employees"
      },
      "fields": ["nickname"]
    }
  ]
}
```

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
                "code": "const amount = Number(ctx.formValues?.amount || 0); return amount;"
              }
            },
            {
              "targetPath": "total",
              "value": {
                "source": "runjs",
                "version": "v2",
                "code": "const amount = Number(ctx.formValues?.amount || 0); const taxRate = Number(ctx.formValues?.taxRate || 0); return amount + amount * taxRate;"
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

## 5. MCP Fallback Mapping

Only when the CLI path is unavailable, or after repair still cannot expose the required runtime command family, switch to the MCP/tool-call envelopes below.

### `get`

`flow_surfaces_get` uses top-level locator fields directly:

```json
{ "pageSchemaUid": "employees-page-schema" }
```

### Most other `flow_surfaces_*` backend actions

Wrap the same business object under `requestBody`.

`describeSurface` fallback:

```json
{
  "requestBody": {
    "locator": {
      "pageSchemaUid": "employees-page-schema"
    }
  }
}
```

`applyBlueprint` fallback:

```json
{
  "requestBody": {
    "version": "1",
    "mode": "create",
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
}
```

`configure` fallback:

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "changes": { "pageSize": 20 }
  }
}
```
