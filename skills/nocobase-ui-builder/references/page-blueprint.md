# Page Blueprint

This file defines the simplified public page-structure JSON blueprint used by `applyBlueprint`.

Canonical front door is `nb api flow-surfaces apply-blueprint`. This file owns the inner page document only; for nb raw body details, always read [tool-shapes.md](./tool-shapes.md). For reusable popup / block / fields planning, read [templates.md](./templates.md) instead of restating that matrix here.

## 1. Core Rules

- The wire format is **JSON**.
- One document describes **one page**.
- `version` stays `"1"`.
- `mode` is either `"create"` or `"replace"`.
- `create` creates a new menu item + page.
- In `create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must include one valid semantic Ant Design icon.
- `replace` rewrites one existing page and therefore requires `target.pageSchemaUid`.
- In `replace`, omitted page-level fields are left unchanged.
- Tabs are interpreted in array order. In `replace`, blueprint tabs map to existing route-backed tab slots by index.
- For a normal single-page request, default to exactly **one tab** unless the user explicitly asks for multiple route-backed tabs.
- Do not add empty / placeholder tabs to a normal single-page draft.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
- Layout may be omitted only when one tab/popup contains at most one non-filter block. When multiple non-filter blocks share the same tab/popup, provide explicit layout instead of relying on server-generated top-to-bottom stacking.
- `layout` is only allowed on `tabs[]` and inline `popup` documents; individual blocks do not accept `layout`.
- `fieldsLayout` is available only on `createForm`, `editForm`, `details`, and `filterForm` blocks. It uses the same `{ rows: [[...]] }` shape as page/popup layout, but references field keys inside that block.
- For `createForm`, `editForm`, and `details`, once the block contains more than 10 real fields, switch to explicit `fieldGroups` instead of one flat `fields[]` list.
- `fieldGroups` and `fieldsLayout` are mutually exclusive. Do not mix `fieldGroups` with `fields[]`, and do not treat manual `divider` items as a grouping substitute.
- Minimal large-form example:

```json
{
  "type": "createForm",
  "collection": "users",
  "fieldGroups": [
    {
      "title": "Basic info",
      "fields": ["username", "nickname", "email", "phone", "status", "bio"]
    },
    {
      "title": "Assignments",
      "fields": ["department.title", "role.name", "manager.nickname", "owner.nickname", "createdBy.nickname"]
    }
  ],
  "actions": ["submit"]
}
```

- If `layout` is present, it must be an object, every referenced block must have a `key`, and every keyed block in that scope must be placed by the layout rows.
- Field entries default to simple strings. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is required.
- In display blocks (`table`, `details`, `list`, `gridCard`), a first-level relation field such as `roles` must not stay as shorthand ``"roles"`` or `{ "field": "roles" }`. Write it as `{ "field": "roles", "popup": { ... } }` so the relation has an explicit detail popup. This rule does not apply to dotted paths such as `department.title`, and it does not apply to `createForm` / `editForm`.
- Every field placed into any blueprint `fields[]` must come from live collection metadata truth and have a non-empty `interface`. Prefer `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`; if that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`. Do not place schema-only fields with `interface: null` / empty into block or form fields.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- Public applyBlueprint supports `calendar` only as the flow-model `CalendarBlockModel` path. Do not use legacy V1 / `CalendarV2` schema blocks in this contract.
- `calendar` main blocks do not support direct `fields[]`, `fieldGroups[]`, or `recordActions[]`. Bind only calendar settings such as `titleField` / `colorField` / `startField` / `endField` on the main block; event content fields belong in quick-create / event-view popup hosts.
- For deciding whether to use `template` / `popup.template` at all, follow [templates.md](./templates.md). For repeat-eligible popup / block / fields scenes, contextual `list-templates` is mandatory before binding one template or finalizing a reusable/template-backed path. Whole-page drafts may and should bind templates only after that flow yields one stable best candidate; keyword-only search is discovery-only and not binding proof. Fresh one-off pages with explicit local popup / block content, no existing template reference, and no reuse / save-template ask may stay inline and skip template routing.
- For whole-page inline popup specs, when no explicit `popup.template` is present, default to `popup.tryTemplate=true` as the write fallback. Local popup content may remain as the miss fallback. Keep `list-templates` as the planning truth source, and let the backend own the final relation-vs-non-relation popup-template match.
- When the user explicitly wants the newly created local popup to become a reusable popup template immediately, use `popup.saveAsTemplate={ name, description }` on that inline popup instead of planning a separate save step. It cannot be combined with `popup.template`, and it may coexist with `popup.tryTemplate=true`: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved.
- In this skill's prepare-write flow, explicit local inline popups with `popup.blocks` may auto-receive generated `popup.saveAsTemplate={ name, description }`; keep `popup.tryTemplate=true` unless the blueprint explicitly sets `popup.tryTemplate=false`.
- The blueprint stays public and declarative; it does not expose planning or execution internals.

Envelope boundary:

- This file describes the inner page blueprint document only.
- Before whole-page `prepare-write`, this document is the authoring draft blueprint.
- For the first real whole-page write, `prepare-write` is mandatory, and the actual nb raw body becomes `result.cliBody`, not the original draft blueprint.
- Do not wrap that object again. If `prepare-write` already ran, that same object means the prepared `result.cliBody`.
- Do not stringify this document into nested JSON such as `blueprint: "{\"version\":\"1\"...}"`.
- Every JSON snippet below should be treated as the inner blueprint draft; for the first real whole-page write, send the returned `cliBody` instead of the raw draft snippet.

## 2. Top-level Shape

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Workspace", "icon": "AppstoreOutlined" },
    "item": { "title": "Employees", "icon": "TeamOutlined" }
  },
  "page": {
    "title": "Employees",
    "documentTitle": "Employees workspace",
    "enableHeader": true,
    "displayTitle": true
  },
  "defaults": {
    "collections": {
      "employees": {
        "fieldGroups": [
          { "key": "basic", "title": "Basic info", "fields": ["nickname", "status", "department"] }
        ],
        "popups": {
          "addNew": { "name": "Create employee", "description": "Create one employee record." },
          "view": { "name": "Employee details", "description": "View one employee record." },
          "edit": { "name": "Edit employee", "description": "Edit one employee record." }
        }
      }
    }
  },
  "assets": {
    "scripts": {},
    "charts": {}
  },
  "reaction": {
    "items": []
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
              { "path": "nickname", "operator": "$includes", "value": "" }
            ]
          }
        }
      ]
    }
  ]
}
```

### Top-level fields

- `version`: currently only `"1"`
- `mode`: `"create" | "replace"`
- `target`: required only for `replace`, shape `{ "pageSchemaUid": "..." }`
- `navigation`: only for `create`; controls menu group/item metadata. Newly created groups must include `icon`, and newly created top-level or second-level items must also include `icon`.
- `page`: page-level metadata
- `defaults`: optional collection-level defaults for generated popup names and large grouped popup field candidates
- `assets`: reusable script/chart blobs referenced by blocks/fields/actions
- `reaction`: optional whole-page interaction authoring section
- `tabs`: non-empty ordered array of route-backed tabs

### `defaults.collections`

- For each whole-page draft, recompute the involved target collections from live metadata and rebuild `defaults.collections` from scratch instead of copying a stale fragment.
- Every involved direct collection always uses top-level `defaults.collections.<collection>.popups.view/addNew/edit.{name,description}`, and any `table` block always pulls that collection into the `addNew` threshold evaluation even when the blueprint omitted an explicit `addNew` opener.
- Use top-level `defaults.collections.<collection>.fieldGroups` as collection-level candidate groups for backend-generated `details`, `createForm`, and `editForm` popup content only when one of those fixed popup scenes should still have more than 10 effective fields after scene filtering.
- Generate these groups from live collection metadata only for large generated popups. For 10 or fewer effective fields, omit `defaults.collections.<collection>.fieldGroups` and let the backend keep a flat popup.
- Keep `fieldGroups` keyed only by target collection. If multiple relation paths land on the same target collection, reuse one collection entry; do not create per-association or per-popup `fieldGroups` branches.
- The backend filters each group by scene: create/edit forms drop audit and non-writable fields; details can retain read-only/audit fields when displayable. Empty groups are omitted, but a provided small `fieldGroups` payload can still force divider-style generated forms, so do not emit it for small scenes.
- Use `defaults.collections.<collection>.popups.view/addNew/edit.{name,description}` for the fixed collection record popup descriptor trio.
- Use `defaults.collections.<sourceCollection>.popups.associations.<associationField>.view/addNew/edit.{name,description}` for the fixed relation-field popup descriptor trio. Use `associations`, not `relations`. Key it only by the first relation segment from the field path, not by deeper nested relation chains. These relation popup descriptors stay separate from `fieldGroups`: the grouped fields still come only from the target collection entry when needed.
- Explicit local `popup.blocks` still count when prepare-write recomputes defaults scope, even if that popup also carries `popup.template` or `popup.tryTemplate`; template reuse only changes popup content sourcing.
- For compatibility, prepare-write can normalize deeper `popups.associations` keys such as `department.manager` back to that first relation segment in `result.cliBody`; when both a one-level key and a deeper alias exist, the explicit one-level key wins.
- Popup defaults must be `{ name, description }` only. Do not place `blocks`, `fields`, `fieldGroups`, `layout`, or other content under `defaults.collections.*.popups`.
- Do not generate `defaults.blocks`; v1 defaults are collection-level only.
- If `popup.tryTemplate` resolves an existing template, the backend reuses that template and does not regenerate default popup content from `defaults`.

Example:

```json
{
  "defaults": {
    "collections": {
      "users": {
        "fieldGroups": [
          {
            "key": "basic",
            "title": "Basic information",
            "fields": ["username", "nickname", "email", "phone", "employeeCode", "realName"]
          },
          {
            "key": "profile",
            "title": "Profile",
            "fields": ["bio", "personalWebsite", "notificationEnabled", "identityVerified", "city", "country"]
          }
        ],
        "popups": {
          "view": { "name": "User details", "description": "View one user record." },
          "addNew": { "name": "Create user", "description": "Create one user record." },
          "edit": { "name": "Edit user", "description": "Edit one user record." },
          "associations": {
            "roles": {
              "view": { "name": "User role details", "description": "View one related user role." },
              "addNew": { "name": "Create user role", "description": "Create one related user role." },
              "edit": { "name": "Edit user role", "description": "Edit one related user role." }
            }
          }
        }
      },
      "roles": {
        "popups": {
          "view": { "name": "Role details", "description": "View one role record." },
          "addNew": { "name": "Create role", "description": "Create one role record." },
          "edit": { "name": "Edit role", "description": "Edit one role record." }
        }
      }
    }
  }
}
```

### `reaction.items[]`

- Use top-level `reaction.items[]` only when interaction logic belongs to the same whole-page blueprint run.
- Valid item types are `setFieldValueRules`, `setFieldLinkageRules`, `setBlockLinkageRules`, and `setActionLinkageRules`.
- `target` is a same-run local key / bind key, not a live uid.
- For form default values and form field linkage, target the form block key/path, not the inner grid.
- Localized edits on an existing live surface should not use blueprint `reaction` as a patch format; use `getReactionMeta` + `set*Rules` instead.
- See [reaction.md](./reaction.md) for recipes and localized write flow.

### `navigation.group` semantics

- Prefer `navigation.group.routeId` when the destination menu group is already known.
- `navigation.group.routeId` is exact targeting only; do not mix it with `icon`, `tooltip`, or `hideInMenu`.
- `navigation.group.title` is for new-group creation or title-only unique same-title reuse.
- When `navigation.group.title` creates a new group, `navigation.group.icon` is required.
- When `routeId` is omitted and `title` matches:
  - zero existing groups -> create a new group
  - one existing group -> reuse that group
  - multiple existing groups -> reject and require `routeId`
- If same-title reuse hits an existing group, keep it title-only.
- If an existing group's metadata must change, do not rely on applyBlueprint create; use low-level `updateMenu` instead.

### `navigation.item` semantics

- In `create`, a new top-level or second-level `navigation.item` must include both `title` and `icon`.
- When `navigation.item` is attached under one explicit existing `navigation.group.routeId`, keep `icon` by default; the local preview tolerates omission because it cannot prove whether that live target is already third-level or deeper.
- Replacing the page does not use `navigation.item` to mutate existing menu metadata.

## 3. Create Example

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Workspace", "icon": "AppstoreOutlined" },
    "item": { "title": "Employees", "icon": "TeamOutlined" }
  },
  "page": {
    "title": "Employees",
    "documentTitle": "Employees workspace",
    "enableHeader": true,
    "displayTitle": true
  },
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
  },
  "tabs": [
    {
      "key": "main",
      "title": "Overview",
      "blocks": [
        {
          "key": "employeeForm",
          "type": "createForm",
          "collection": "employees",
          "fields": [
            { "key": "nicknameField", "field": "nickname" },
            { "key": "statusField", "field": "status" }
          ],
          "fieldsLayout": {
            "rows": [[{ "key": "nicknameField", "span": 12 }, { "key": "statusField", "span": 12 }]]
          },
          "actions": ["submit"]
        },
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"],
          "recordActions": [
            {
              "type": "view",
              "title": "View",
              "popup": {
                "title": "Employee details",
                "blocks": [
                  {
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "employees"
                    },
                    "fields": ["nickname"]
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

## 4. Replace Example

```json
{
  "version": "1",
  "mode": "replace",
  "target": {
    "pageSchemaUid": "employees-page-schema"
  },
  "page": {
    "title": "Employees workspace",
    "documentTitle": "Employees replace flow",
    "displayTitle": false,
    "enableTabs": false
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

### Replace semantics

- `replace` targets one existing page through `target.pageSchemaUid`.
- blueprint tabs map to existing route-backed tab slots by index, rewrite each slot in order, remove trailing old tabs, and append extra new tabs when needed.
- If `replace` expands a page from one hidden-tab state to multiple tabs, set `page.enableTabs: true` explicitly. When the current page has `enableTabs = false`, omitting it is rejected.
- If you need a tiny localized edit on one existing tab/node, do not use `replace`; use low-level APIs instead.

## 5. Single-tab Deep-popup Skeleton

Use this as a **generic structure pattern**, not as a copy-paste answer. It shows that a deep popup chain with sibling popup blocks still belongs to **one page / one tab**:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Workspace" },
    "item": { "title": "Records" }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "key": "mainTable",
          "type": "table",
          "collection": "<mainCollection>",
          "fields": ["<summaryField>"],
          "recordActions": [
            {
              "type": "view",
              "title": "Details",
              "popup": {
                "blocks": [
                  {
                    "key": "mainDetails",
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "<mainCollection>"
                    },
                    "fields": ["<summaryField>"],
                    "recordActions": [
                      {
                        "type": "edit",
                        "popup": {
                          "blocks": [
                            {
                              "key": "editForm",
                              "type": "editForm",
                              "fields": ["<editableField>"]
                            }
                          ]
                        }
                      }
                    ]
                  },
                  {
                    "key": "relatedTable",
                    "type": "table",
                    "resource": {
                      "binding": "associatedRecords",
                      "associationField": "<relationField>",
                      "collectionName": "<relatedCollection>"
                    },
                    "fields": [
                      {
                        "field": "<relatedLabelField>",
                        "popup": {
                          "title": "Related details",
                          "blocks": [
                            {
                              "type": "details",
                              "resource": {
                                "binding": "currentRecord",
                                "collectionName": "<relatedCollection>"
                              },
                              "fields": ["<relatedLabelField>"],
                              "recordActions": [
                                {
                                  "type": "edit",
                                  "popup": {
                                    "blocks": [
                                      {
                                        "key": "relatedEditForm",
                                        "type": "editForm",
                                        "fields": ["<relatedEditableField>"]
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      }
                    ]
                  }
                ],
                "layout": {
                  "rows": [[{ "key": "mainDetails", "span": 12 }, { "key": "relatedTable", "span": 12 }]]
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Notes:

- Even with sibling popup blocks and nested edit popups, the outer page still has only **one tab**.
- When the intent is "click the shown related record to open details", the field object itself can carry the inline `popup`.
- If the requirement explicitly says "details button" or "action column", use an action / recordAction instead.

## 6. High-frequency Wrong vs Right

### A. `tab.layout` must be an object

Wrong:

```json
{
  "title": "Overview",
  "layout": "two-column",
  "blocks": [{ "type": "table", "collection": "employees" }]
}
```

Right:

```json
{
  "title": "Overview",
  "layout": {
    "rows": [["employeesTable"]]
  },
  "blocks": [
    {
      "key": "employeesTable",
      "type": "table",
      "collection": "employees",
      "defaultFilter": {
        "logic": "$and",
        "items": [{ "path": "nickname", "operator": "$includes", "value": "" }]
      },
      "actions": [
        {
          "type": "filter",
          "settings": {
            "filterableFieldNames": ["nickname"],
            "defaultFilter": {
              "logic": "$and",
              "items": [{ "path": "nickname", "operator": "$includes", "value": "" }]
            }
          }
        }
      ]
    }
  ]
}
```

### B. `layout` does not belong on a block

Wrong:

```json
{
  "type": "table",
  "collection": "employees",
  "layout": {
    "rows": [["employeesTable"]]
  }
}
```

Right:

```json
{
  "title": "Overview",
  "layout": {
    "rows": [["employeesTable"]]
  },
  "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees" }]
}
```

### C. Do not keep an empty second tab in a single-page draft

Wrong:

```json
{
  "tabs": [
    { "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }] },
    { "title": "Later", "blocks": [] }
  ]
}
```

Right:

```json
{
  "tabs": [
    { "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }] }
  ]
}
```

### D. Do not add placeholder `markdown` / note / banner blocks in a single-page draft

Wrong:

```json
{
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

Right:

```json
{
  "tabs": [
    {
      "title": "Overview",
      "blocks": [{ "type": "table", "collection": "employees" }]
    }
  ]
}
```

### E. Default `fields[]` entries to simple strings unless extra behavior is required

Wrong:

```json
{
  "type": "table",
  "collection": "employees",
  "fields": [{ "field": "nickname", "name": "Nickname" }]
}
```

Right:

```json
{
  "type": "table",
  "collection": "employees",
  "fields": ["nickname"]
}
```

## 7. Supported Semantics

### Block-level

Each tab contains `blocks[]`. A block can carry:

- optional local `key` when custom `layout` or cross-block references need a stable local identifier
- `type`
- `title`
- collection/binding info through `collection`, `associationPathName`, `resource`, `binding`
- `template`
- `settings`
- `fields[]`
- `actions[]`
- `recordActions[]`
- `script` / `chart` asset references

Supported block `type` values are:

- `table`
- `createForm`
- `editForm`
- `details`
- `filterForm`
- `list`
- `gridCard`
- `calendar`
- `markdown`
- `iframe`
- `chart`
- `actionPanel`
- `jsBlock`

`form` is not a public applyBlueprint block type.

### Canonical resource shapes

Use **one** of these two styles per block:

#### A. Block-level shorthand

```json
{
  "type": "table",
  "collection": "employees",
  "associationPathName": "department",
  "fields": ["nickname"]
}
```

Rules:

- at block root, use `collection`, not `collectionName`
- at block root, use `binding`, not `resourceBinding`
- at block root, use `associationPathName`, not `association`
- `associationField` only makes sense when `binding` is present

#### B. Nested `resource` object

```json
{
  "type": "details",
  "resource": {
    "binding": "currentRecord",
    "collectionName": "employees"
  },
  "fields": ["nickname"]
}
```

Rules:

- inside `resource`, use `collectionName`, not `collection`
- inside `resource`, use `binding`, not `resourceBinding`
- inside `resource`, use `associationPathName`, not `association`
- do not mix block-level shorthand and nested `resource` on the same block
- when `resource.binding` is present, treat the object as binding-centered; do not mix it with raw locator-only forms such as `sourceId`

#### C. Canonical popup relation table

For a relation table inside a current-record popup, prefer:

```json
{
  "type": "table",
  "resource": {
    "binding": "associatedRecords",
    "associationField": "roles",
    "collectionName": "roles"
  },
  "fields": ["title", "name"]
}
```

Notes:

- this is the canonical form for "show the current record's related roles"
- applyBlueprint may normalize `currentRecord | associatedRecords + associationPathName` into this shape for convenience when `associationPathName` is a single relation field name
- the skill should still author this canonical `associatedRecords + associationField` shape directly

### Field shorthand

A field entry may be:

- a string, for example `"nickname"`
- an object with optional `key`, `field`, `renderer`, `type`, optional `target`, `settings`, and optional inline `popup`

Default to a simple string whenever the field only needs normal display/edit behavior. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is actually required. Do not invent ad-hoc extra keys in field objects.

When the user says clicking a shown record / relation record should open details, prefer a field object with inline `popup` so the field itself is the opener. Readback commonly normalizes this to clickable-field / `clickToOpen` semantics. Use an action / recordAction only when the requirement explicitly says button / action column.

`field.target` is only a **string block key** in the same tab or popup scope:

```json
{ "field": "status", "type": "filter", "target": "employeesTable" }
```

Do not send object selectors there.

Clickable field example:

```json
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
```

### Action shorthand

An action / record action entry may be:

- a string action type
- an object with optional `key`, `type`, `title`, `settings`, and optional inline `popup`

For record-capable blocks (`table`, `details`, `list`, `gridCard`):

- author `view`, `edit`, `updateRecord`, and `delete` under `recordActions`
- applyBlueprint may auto-promote these common record actions from `actions`, but that is a convenience fallback, not the preferred authoring style
- for `edit`, backend default popup completion is fine for a standard single-form popup; if you author a custom edit popup with `popup.blocks`, that popup must contain exactly one `editForm`
- in a custom `edit` popup, that `editForm` may omit `resource`; applyBlueprint will inherit the opener's current-record context

For collection-action hosts (`table`, `list`, `gridCard`):

- when the user only asks to “增加筛选 / filter” on that data block, or explicitly adds “搜索 / search” to that host with wording such as “支持搜索 / 带搜索 / 可搜索 / searchable”, prefer the same block-level `filter` action
- do not upgrade that request into a root `filterForm` unless the user explicitly asks for a filter/search block, form, or query area
- page-noun wording such as “搜索页 / 搜索结果页 / 搜索门户 / 搜索列表页” stays page intent, not filter intent, even if the same sentence also says “支持搜索”
- if the user explicitly names the host, keep the `filter` action on that same host type
- every direct, non-template public `table` / `list` / `gridCard` block must include block-level `defaultFilter`

For `calendar` blocks:

- allowed public actions are `today`, `turnPages`, `title`, `selectView`, plus applicable collection actions such as `filter`, `addNew`, `popup`, `refresh`, `js`, and `triggerWorkflow`
- do not use `bulkDelete`, import/export, print, or record-level actions on the main calendar block
- `settings.startField` and `settings.endField` must bind date-capable fields; `settings.titleField` and `settings.colorField` must bind non-association display fields

Required block-level `defaultFilter` plus optional filter action settings shape:

```json
{
  "type": "table",
  "collection": "users",
  "defaultFilter": {
    "logic": "$and",
    "items": [
      { "path": "username", "operator": "$includes", "value": "" },
      { "path": "email", "operator": "$includes", "value": "" },
      { "path": "status", "operator": "$eq", "value": "" }
    ]
  },
  "actions": [
    {
      "type": "filter",
      "settings": {
        "filterableFieldNames": ["username", "email", "status"],
        "defaultFilter": {
          "logic": "$and",
          "items": [
            { "path": "username", "operator": "$includes", "value": "" },
            { "path": "email", "operator": "$includes", "value": "" },
            { "path": "status", "operator": "$eq", "value": "" }
          ]
        }
      }
    }
  ]
}
```

Planning rules:

- block-level `defaultFilter` is required for every direct, non-template public `table` / `list` / `gridCard` block, and it must contain at least one concrete filter item; `{}`, `null`, and `{ "logic": "$and", "items": [] }` are rejected
- a host-level `filter` action may be shorthand (`"filter"`) or an object; explicit action settings are optional for first-write `prepare-write`
- if explicit `filterableFieldNames` are provided, validate coverage against action-level `settings.defaultFilter` when present, otherwise against block-level `defaultFilter`
- if the user explicitly asks for a filter/search block or form, use `filterForm` instead of a block action

### Popup

Inline popup is supported beneath a field/action/record action through:

```json
{
  "popup": {
    "title": "...",
    "mode": "drawer",
    "template": { "uid": "...", "mode": "reference" },
    "blocks": [],
    "layout": { "rows": [["..."]] }
  }
}
```

`popup.layout` is valid because popup is a popup document. By contrast, block objects themselves do **not** accept `layout`; use `tab.layout` or `popup.layout`.

`popup.mode` is optional. Common values are `drawer`, `dialog`, and `page`. In whole-page `prepare-write`, when a first-layer inline popup omits `popup.mode` and its local popup content exceeds 3 direct non-filter blocks or 20 direct effective fields, the helper defaults that popup to `page`.

In whole-page `create` / `replace`, do not bind `popup.template` from loose discovery or text search alone. Instead, build the strongest planned opener/resource context you have, run the contextual selection flow from [templates.md](./templates.md), and bind `popup.template` only when one stable best available candidate wins.

### Layout cell shape

`layout.rows` accepts only:

```json
["employeesTable"]
```

or

```json
[{ "key": "employeesTable", "span": 12 }]
```

Public `applyBlueprint` layout cells do **not** use `uid`, `ref`, or `$ref`.

### Assets

`assets.scripts` and `assets.charts` are reusable object maps. A block/field/action may refer to them by `script` or `chart`.

## 8. Canonical Naming Rule

When this skill authors `applyBlueprint`, always emit the canonical public names above.

- use block-level `collection`, not block-level `collectionName`
- use nested `resource.collectionName`, not `resource.collection`
- use `associationPathName`, not `association`
- use `field`, not `fieldPath`
- use `binding`, not `resourceBinding`
- use `popup`, not `openView`
- use string `target`, not object-style target selectors
- use layout cell `key`, not `uid`
- place `layout` only on `tabs[]` or `popup`, never on a block object
- do not use `ref` or `$ref`

## 9. Unsupported / Forbidden Public Fields

Use this file as the **shape reference**, not as a second full contract document.

- Send only the structure fields described here.
- Use the canonical names from Section 8.
- Keep `blueprint`, `ref`, `$ref`, block-level `layout`, layout-cell `uid`, object-style `field.target`, and deprecated aliases out of the payload.
- Keep non-blueprint control fields and alias fields out of the payload; the authoritative contract lives in [normative-contract.md](./normative-contract.md).

## 10. Response Shape

`applyBlueprint` returns:

```json
{
  "version": "1",
  "mode": "create",
  "target": {
    "pageSchemaUid": "employees-page-schema",
    "pageUid": "employees-page-uid"
  },
  "surface": {}
}
```

The public response carries the resolved page `target` and may also include `surface`. A successful `apply-blueprint` response is the default stop point. Run follow-up `get` only when follow-up localized work or explicit inspection needs live structure.
