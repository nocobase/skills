# Page Blueprint

This file defines the simplified public page-structure JSON blueprint used by `applyBlueprint`.

Agent-facing write path is `nb api flow-surfaces apply-blueprint`. This file owns the raw page business document; for command body details, always read [tool-shapes.md](./tool-shapes.md). For reusable popup / block / fields planning, read [templates.md](./templates.md) instead of restating that matrix here.

## 1. Core Rules

- The wire format is **JSON**.
- One document describes **one page**.
- `version` stays `"1"`.
- `mode` is either `"create"` or `"replace"`.
- `create` creates a new menu item + page.
- For duplicate-page prevention, page identity is `(navigation.group.routeId, page.title)`, after resolving a unique `navigation.group.title` to routeId. In `create`, same group + same page title may be prepared as `replace` with `target.pageSchemaUid`; different group + same page title does not merge, reuse, or auto-replace another page.
- In `create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must include one valid semantic Ant Design icon.
- `replace` rewrites one existing page and therefore requires `target.pageSchemaUid`.
- In `replace`, omitted page-level fields are left unchanged.
- Tabs are interpreted in array order. In `replace`, blueprint tabs map to existing route-backed tab slots by index.
- For a normal single-page request, default to exactly **one tab** unless the user explicitly asks for multiple route-backed tabs.
- Do not add empty / placeholder tabs to a normal single-page draft.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
- Layout may be omitted only when one tab/popup contains at most one non-filter block. When multiple non-filter blocks share the same tab/popup, provide explicit layout instead of relying on server-generated top-to-bottom stacking, and give each non-template-backed data block a `title`; template-backed blocks are exempt. A single non-filter block may omit its block `title` unless the user explicitly asks for one.
- `layout` is only allowed on `tabs[]` and inline `popup` documents; individual blocks do not accept `layout`.
- `fieldsLayout` is available only on `createForm`, `editForm`, `details`, and `filterForm` blocks. It uses the same `{ rows: [[...]] }` shape as page/popup layout, but references field keys inside that block. For `createForm`, `editForm`, and `details`, omit `fieldsLayout` unless the user explicitly asks for exact field placement; backend authoring owns the default grid, keeps ordinary fields two per row, and puts live `richText` / `vditor` fields and `divider` items on full-width rows. `filterForm` may still use the compact three-per-row default layout.
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
- Field entries default to simple strings. Upgrade to a field object only when `popup`, `target`, `renderer`, field-specific `type`, or behavior inferred from collection field `description` is required.
- In display blocks (`table`, `details`, `list`, `gridCard`), a first-level relation field such as `roles` must not stay as shorthand ``"roles"`` or `{ "field": "roles" }`. Write it as `{ "field": "roles", "popup": { ... } }` so the relation has an explicit detail popup. The popup content must also use the correct resource binding: `details` / `editForm` for the clicked relation record use `resource.binding = "currentRecord"`, while relation lists use `resource.binding = "associatedRecords"` plus `resource.associationField`. This rule does not apply to dotted paths such as `department.title`, and it does not apply to `createForm` / `editForm`.
- Every field placed into any blueprint `fields[]` must come from live collection metadata truth and have a non-empty `interface`. Prefer `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`; if that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`. Do not place schema-only fields with `interface: null` / empty into block or form fields.
- For direct tree tables (`type: "table"` plus `settings.treeTable=true`), explicit `fields[]` must stay self-contained: make `fields[0]` a direct readable non-association field from live metadata, or rely only on moving an existing later readable field first. Do not expect a missing `title` / `name` fallback to be injected into explicit fields; explicit lists with no readable direct field are rejected. Only omitted `fields[]` uses default priority `titleField`, then `name`, then `code`, then `title`, then another direct field with a non-empty `interface`. Never put `id`, `uid`, `uuid`, `parentId`, primary/foreign keys, `xxxId` / `xxxUid`, `_id`, or `_uid` first.
- Do not author default `recordActions: ["view", "edit", "delete"]` for tree tables. Omit tree-table `recordActions` unless the user explicitly asks for a row action; the backend injects only `addChild` by default for supported tree collection tables.
- When a form field's live metadata has a `description`, treat it as behavior input, not passive text. Use agent/LLM semantic extraction for arbitrary languages, but emit only structured public settings and field-linkage rules; when carrying extracted intent through metadata, use `descriptionBehavior.{settings,linkage}` instead of adding more language-specific keyword rules. Clear static required wording becomes `settings.required=true`; clear low-risk constraints can become `settings.rules` / `settings.maxCount` plus helper copy; and unambiguous same-form conditional required/disabled/hidden wording can be represented as top-level `reaction.items[]` on a keyed local form block. Map condition values through live option `value` / localized `label` metadata when available. For backend-generated add/edit popups, put safely derived behavior under target-scoped `defaults.collections.<collection>.formBehavior.addNew/edit`. Every described generated add/edit candidate field must then be accounted for in the final payload: fields covered by structured behavior stay in `formBehavior`, and any reviewed non-implemented field uses sibling `defaults.collections.<collection>.formBehaviorDescriptionReview.fields.<field> = { decision: "noUiBehavior" | "unsupported", reasonCode }`. `decision: "implemented"` is allowed only when real structured coverage exists. Do not use old `fields[]`, `hasTried`, `formBehavior: {}`, or `null` as confirmation markers. Do not add a NocoBase backend fallback parser for raw descriptions. Keep ambiguous description text as helper copy instead of guessing behavior.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- Public applyBlueprint supports `calendar` only as the flow-model `CalendarBlockModel` path. Do not use legacy V1 / `CalendarV2` schema blocks in this contract.
- `calendar` main blocks do not support direct `fields[]`, `fieldGroups[]`, or `recordActions[]`. Bind only calendar settings such as `titleField` / `colorField` / `startField` / `endField` on the main block; event content fields belong in quick-create / event-view popup hosts.
- `kanban` main blocks may use `fields[]`, but do not support `fieldGroups`, `fieldsLayout`, or `recordActions`. For direct non-template `applyBlueprint` kanban main blocks, explicit `fields[]` is capped at 2 card fields; omitted `fields[]` is materialized from live metadata with at most 2 suitable display fields. `compose` / `addBlock` do not have this 2-field cap. Card content stays on the main card field list; quick-create and card-view content belongs in hidden popup hosts.
- For deciding whether to use `template` / `popup.template` at all, follow [templates.md](./templates.md). For repeat-eligible popup / block / fields scenes, contextual `list-templates` is mandatory before binding one template or finalizing a reusable/template-backed path. Whole-page drafts may and should bind templates only after that flow yields one stable best candidate; keyword-only search is discovery-only and not binding proof. Fresh one-off pages with explicit local popup / block content, no existing template reference, and no reuse / save-template ask may stay inline and skip template routing.
- For whole-page inline popup specs, when no explicit `popup.template` is present, default to `popup.tryTemplate=true` as the write fallback. Local popup content may remain as the miss fallback. Keep `list-templates` as the planning truth source, and let the backend own the final relation-vs-non-relation popup-template match.
- Do not emit `popup.tryTemplate=false` unless the user explicitly asks for no template, no reuse, local-only/current-only behavior, copy, or detach. Inline `popup.blocks` are fallback content and should still prefer reuse by default.
- Calendar / kanban hidden popup hosts follow the same create-time template fallback: when direct non-template `calendar` / `kanban` blocks omit those hidden popup objects, the backend can add `tryTemplate=true` popup settings so default popup/template completion can run instead of leaving the opener empty.
- Dashboard chart sections must stay as chart blocks in whole-page payloads. Use `assets.charts.<key>` plus `{ "type": "chart", "chart": "<key>" }`; do not replace requested chart / 图表 / trend / distribution / ranking / percentage / 占比 sections with `jsBlock`, `table`, or `list`.
- When the user explicitly wants the newly created local popup to become a reusable popup template immediately, use `popup.saveAsTemplate={ name, description }` on that inline popup instead of planning a separate save step. It cannot be combined with `popup.template`, and it may coexist with `popup.tryTemplate=true`: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved.
- Explicit local inline popups with `popup.blocks` may be normalized by the backend with generated `popup.saveAsTemplate={ name, description }`; keep `popup.tryTemplate=true` unless the user explicitly requested the hard reuse opt-out and the blueprint intentionally sets `popup.tryTemplate=false`.
- The blueprint stays public and declarative; it does not expose planning or execution internals.

Payload boundary:

- This file describes the inner page blueprint document only.
- For the first real whole-page write, send this raw business object directly to `nb api flow-surfaces apply-blueprint`.
- Do not wrap that object in `{ values }`, `{ blueprint }`, or `cliBody`.
- Do not stringify this document into nested JSON such as `blueprint: "{\"version\":\"1\"...}"`.
- Do not put helper-only planning fields such as `collectionMetadata`, `templateDecision`, or `cliBody` in this blueprint.
- Every JSON snippet below should be treated as the raw backend business payload.

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
              { "path": "nickname", "operator": "$includes", "value": "" },
              { "path": "email", "operator": "$includes", "value": "" },
              { "path": "status", "operator": "$eq", "value": "" }
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
- Use top-level `defaults.collections.<collection>.formBehavior.addNew/edit` for settings and field linkage rules derived from live field descriptions when the add/edit form is backend-generated. Use sibling `defaults.collections.<collection>.formBehaviorDescriptionReview.fields.<field> = { decision, reasonCode? }` for each reviewed described generated add/edit candidate field: `implemented` requires real structured coverage, while `noUiBehavior` / `unsupported` require a valid `reasonCode`. Put relation popup behavior on the relation target collection entry, not under `popups.associations`. Do not use old `fields[]`, `hasTried`, `formBehavior: {}`, or no-op `null`.
- Generate these groups from live collection metadata only for large generated popups. For 10 or fewer effective fields, omit `defaults.collections.<collection>.fieldGroups` and let the backend keep a flat popup.
- After generating defaults fieldGroups, run one compact self-review with a short structured verdict (`approve` or `regenerate`) that checks semantic grouping, required-field coverage, group balance, and group title specificity. Use the lowest practical reasoning effort / no-think mode, do not ask for chain-of-thought, and if the verdict is `regenerate`, regenerate once from live metadata and stop after that single retry.
- With live metadata, missing `fieldGroups` for large generated popups can be a backend hard validation error. Regenerate explicit semantic `fieldGroups` from the live fields, and make sure they cover every required generated-popup field.
- Keep `fieldGroups` keyed only by target collection. If multiple relation paths land on the same target collection, reuse one collection entry; do not create per-association or per-popup `fieldGroups` branches.
- The backend filters each group by scene: create/edit forms drop audit and non-writable fields; details can retain read-only/audit fields when displayable. Empty groups are omitted, but a provided small `fieldGroups` payload can still force divider-style generated forms, so do not emit it for small scenes.
- Use `defaults.collections.<collection>.popups.view/addNew/edit.{name,description}` for the fixed collection record popup descriptor trio.
- Use `defaults.collections.<sourceCollection>.popups.associations.<associationField>.view/addNew/edit.{name,description}` for the fixed relation-field popup descriptor trio. Use `associations`, not `relations`. Key it only by the first relation segment from the field path, not by deeper nested relation chains. These relation popup descriptors stay separate from `fieldGroups`: the grouped fields still come only from the target collection entry when needed.
- `formBehavior.fieldLinkageRules` uses the same rule shape as `reaction.items[].rules` for `setFieldLinkageRules`, but without a `target`; the backend binds those rules to the generated form block. An explicit empty array clears description-derived defaults; a non-empty explicit array is merged with non-conflicting derived rules by key/semantic rule shape, with explicit rules winning conflicts.
- Explicit local `popup.blocks` still count when backend authoring recomputes defaults scope, even if that popup also carries `popup.template` or `popup.tryTemplate`; template reuse only changes popup content sourcing.
- For compatibility, backend authoring can normalize deeper `popups.associations` keys such as `department.manager` back to that first relation segment; when both a one-level key and a deeper alias exist, the explicit one-level key wins.
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
        },
        "formBehavior": {
          "addNew": {
            "fields": {
              "username": {
                "settings": {
                  "required": true,
                  "extra": "必填。最多 50 个字符。",
                  "rules": [{ "max": 50, "message": "最多 50 个字符。" }]
                }
              }
            }
          },
          "edit": {
            "fieldLinkageRules": [
              {
                "key": "description-approvalComment-status-required",
                "when": {
                  "logic": "$and",
                  "items": [{ "path": "formValues.status", "operator": "$eq", "value": "published" }]
                },
                "then": [{ "type": "setFieldState", "fieldPaths": ["approvalComment"], "state": "required" }]
              }
            ]
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
- `navigation.group.routeId` has highest priority; when it is present, `title`, `icon`, `tooltip`, and `hideInMenu` are ignored for the existing group.
- `navigation.group.title` is for new-group creation or unique same-title reuse.
- When `navigation.group.title` creates a new group, `navigation.group.icon` is required.
- When `routeId` is omitted and `title` matches:
  - zero existing groups -> create a new group
  - one existing group -> reuse that group
  - multiple existing groups -> reject and require `routeId`
- If same-title reuse hits an existing group, `icon`, `tooltip`, and `hideInMenu` are ignored.
- If an existing group's metadata must change, do not rely on applyBlueprint create; use low-level `updateMenu` instead.
- During backend authoring, the server may rewrite one unique same-title existing group or one explicit `routeId` group to `navigation.group.routeId`. Treat the persisted response as authoritative.

### `navigation.item` semantics

- In `create`, a new top-level or second-level `navigation.item` must include both `title` and `icon`.
- When `navigation.item` is attached under one explicit existing `navigation.group.routeId`, keep `icon` by default.
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
        "items": [
          { "path": "nickname", "operator": "$includes", "value": "" },
          { "path": "email", "operator": "$includes", "value": "" },
          { "path": "status", "operator": "$eq", "value": "" }
        ]
      },
      "actions": [
        {
          "type": "filter",
          "settings": {
            "filterableFieldNames": ["nickname", "email", "status"],
            "defaultFilter": {
              "logic": "$and",
              "items": [
                { "path": "nickname", "operator": "$includes", "value": "" },
                { "path": "email", "operator": "$includes", "value": "" },
                { "path": "status", "operator": "$eq", "value": "" }
              ]
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
- `kanban`
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

Default to a simple string whenever the field only needs normal display/edit behavior. Upgrade to a field object only when `popup`, `target`, `renderer`, field-specific `type`, or form behavior inferred from live field `description` is actually required. Do not invent ad-hoc extra keys in field objects.

For `createForm`, `editForm`, and `filterForm`, read the field `description` from live collection metadata before finalizing fields. Use it conservatively:

- Static required intent extracted by the agent/LLM becomes `settings.required=true`; deterministic wording checks are only a conservative fallback, not the arbitrary-language strategy.
- Explanatory or constraint text becomes `settings.extra` or `settings.tooltip` unless the field already has explicit helper settings.
- Clear conditional same-form rules extracted from any language become structured `descriptionBehavior.linkage` or top-level `reaction.items[]` targeting the stable local form block.
- Description-derived conditional reactions are auto-generated for any stable form block inside the same local popup chain, including field/action/recordAction/hidden popup nests when the popup contains local `blocks`. Backend authoring materializes generated local keys only when a derived reaction needs them. Resolve option conditions through live `value` / localized `label` metadata where possible. Keep helper/settings-only behavior for ambiguous descriptions, missing condition cues, or popup scenes without a stable form target.
- If the description names unclear fields, unsupported actions, or ambiguous conditions, keep it as helper text and do not guess a reaction rule.

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

Field assignment for update actions uses only `settings.assignValues`:

- `bulkUpdate` is a collection action and belongs under block `actions`
- `updateRecord` is a record action and belongs under `recordActions`
- `assignValues` must be a plain object keyed by fields in the host collection metadata
- `{}` is valid and clears the persisted field assignment
- do not configure assignment fields through `add-fields`, raw `flowModels`, `AssignFormGridModel`, or `AssignFormItemModel`

Workflow binding for submit/update actions uses only `settings.triggerWorkflows`:

- form submit actions under `createForm` / `editForm` may use `settings.triggerWorkflows`
- record `updateRecord` actions under `recordActions` may use `settings.triggerWorkflows`
- each row is `{ workflowKey, context? }`; `workflowKey` is a non-empty string and `context` is optional string
- `[]` clears bindings; `null` is invalid
- do not configure this by writing raw `flowModels`, internal `stepParams`, or a standalone `triggerWorkflow` action unless the user explicitly wants a separate button
- authoring validates shape only and does not require workflow metadata

```json
{
  "type": "bulkUpdate",
  "settings": {
    "assignValues": {
      "priority": "high",
      "isTracking": true
    }
  }
}
```

For collection-action hosts (`table`, `list`, `gridCard`, `calendar`, `kanban`):

- when the user only asks to “增加筛选 / filter” on that data block, or explicitly adds “搜索 / search” to that host with wording such as “支持搜索 / 带搜索 / 可搜索 / searchable”, prefer the same block-level `filter` action
- do not upgrade that request into a root `filterForm` unless the user explicitly asks for a filter/search block, form, or query area
- page-noun wording such as “搜索页 / 搜索结果页 / 搜索门户 / 搜索列表页” stays page intent, not filter intent, even if the same sentence also says “支持搜索”
- if the user explicitly names the host, keep the `filter` action on that same host type
- direct, non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` blocks may omit `defaultFilter`; backend authoring materializes one from live metadata with up to 4 scalar/filterable fields
- explicit block-level or filter action `defaultFilter` overrides must contain concrete metadata-valid filter items backed by at least the smaller of 3 and the collection's eligible direct interface-field count; explicit empty groups, invalid operators, relation fields used directly, and unknown paths are rejected through aggregate `errors[]`. For relation filters, write a relation child path such as `department.title`, not the relation field itself.
- for every direct public data surface, `actions` partials merge with that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`); ordinary table `recordActions` partials merge with `view` / `edit` / `delete`, while tree table `recordActions` are not completed with those defaults

For `calendar` blocks:

- allowed public actions are `today`, `turnPages`, `title`, `selectView`, plus applicable collection actions such as `filter`, `addNew`, `popup`, `refresh`, `js`, `jsItem`, and `triggerWorkflow`
- do not use `bulkDelete`, import/export, print, or record-level actions on the main calendar block
- `settings.startField` and `settings.endField` must bind date-capable fields; `settings.titleField` and `settings.colorField` must bind non-association display fields
- For generic prompts that only say “add a calendar block” and do not name a business date field, prefer date fields that are likely populated in existing data, such as `createdAt` / `updatedAt`, over optional business dates such as `birthday` / `hireDate`. This keeps event-click verification possible on existing records. Use optional business date fields only when the user asks for that calendar meaning or live data confirms those fields are populated.
- quick-create and event click/view popups are configured through `settings.quickCreatePopup` and `settings.eventPopup` on the calendar block. Use the same popup/open-view shape as action popup settings, including `template`, `tryTemplate`, or `saveAsTemplate` when a popup template decision is required. In whole-page `create`, backend authoring can auto-add missing `quickCreatePopup` / `eventPopup` as `{ tryTemplate: true }`. Do not put `popup.template` on the calendar main block itself.
- direct public calendar blocks use the same omitted-or-explicit `defaultFilter` contract as the other shared data-surface blocks; filter/search wording on a calendar host routes to that host's `filter` action unless a real `filterForm` is explicitly requested

For `kanban` blocks:

- allowed public main-block actions are `filter`, `addNew`, `popup`, `refresh`, `js`, and `jsItem`
- do not use `today`, `turnPages`, `bulkDelete`, `triggerWorkflow`, import/export, print, or record-level actions on the main kanban block
- public main kanban blocks may keep `fields[]`, but do not accept `fieldGroups`, `fieldsLayout`, or `recordActions`
- direct non-template `applyBlueprint` kanban main blocks accept at most 2 explicit card fields. If `fields[]` is omitted, backend authoring selects at most 2 live metadata fields with non-empty `interface`, excluding audit/hidden/primaryKey/sort/grouping/sort-binding fields and preferring title or business-readable names. If the payload explicitly has more than 2 fields, fix it; do not rely on automatic trimming. The aggregate rule id is `kanban-main-fields-too-many`.
- for `applyBlueprint`, missing drag settings default to `settings.dragEnabled=true`. Backend authoring binds `settings.dragSortBy` when a compatible sort field already exists for the current/effective `groupField`; otherwise it creates a hidden sort field for writable main datasource collections. Explicit `settings.dragEnabled=false` disables that creation, and explicit incompatible `settings.dragSortBy` is rejected.
- quick-create and card click/view popups are configured through `settings.quickCreatePopup` and `settings.cardPopup`. In whole-page `create`, backend authoring can auto-add missing `quickCreatePopup` / `cardPopup` as `{ tryTemplate: true }` and default missing `settings.quickCreateEnabled` / `settings.enableCardClick` to `true`; explicit overrides are preserved.
- direct public kanban blocks use the same omitted-or-explicit `defaultFilter` contract as the other shared data-surface blocks; filter/search wording on a kanban host routes to that host's `filter` action unless a real `filterForm` is explicitly requested

Optional explicit `defaultFilter` override plus filter action settings shape:

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

- direct, non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` blocks may omit `defaultFilter`; backend materializes generated defaults from live metadata with up to 4 scalar/filterable fields
- explicit `defaultFilter` overrides must contain concrete filter items backed by at least the smaller of 3 and the collection's eligible direct interface-field count; `{}`, `null`, `{ "logic": "$and", "items": [] }`, invalid operators, relation fields used directly, and unknown paths are rejected through backend aggregate `errors[]`
- a host-level `filter` action may be shorthand (`"filter"`) or an object; explicit action settings are optional for the first backend write
- if explicit `filterableFieldNames` are provided, validate coverage against the effective default filter: filter action `settings.defaultFilter` when present, then `defaultActionSettings.filter.defaultFilter`, then block-level `defaultFilter`, otherwise the backend-generated default filter
- for every direct public data surface, partial `actions` complete to that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`); ordinary table partial `recordActions` complete to `view` / `edit` / `delete`, but tree table `recordActions` should usually be omitted so the backend injects only `addChild`
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

`popup.mode` is optional. Common values are `drawer`, `dialog`, and `page`. In whole-page backend authoring, when a first-layer inline popup omits `popup.mode` and its local popup content exceeds 3 direct non-filter blocks or 20 direct effective fields, the server may default that popup to `page`.

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

For two blocks side by side in one row, use two cells in the same row:

```json
{ "rows": [["usersCalendar", "usersKanban"]] }
```

Do not wrap a cell in another array such as `[["usersCalendar", "usersKanban"]]` as a single cell; each row array contains cells directly.

Public `applyBlueprint` layout cells do **not** use `uid`, `ref`, or `$ref`.

### Assets

`assets.scripts` and `assets.charts` are reusable object maps. A block/field/action may refer to them by `script` or `chart`.

For `jsBlock`, use exactly one public code form:

- Inline: put RunJS source under block `settings.code` and optional `settings.version`.
- Asset reference: put source under `assets.scripts.<key>.code` and reference it with block `script: "<key>"`.
- A new `jsBlock` must include one of those explicit code sources; do not rely on the default JS template.
- Do not put top-level `code` or top-level `version` on the block.
- Do not author internal readback fields such as `stepParams`, `props`, `decoratorProps`, or `flowRegistry`.
- Do not mix `script` with `settings.code` / `settings.version`.

Inline `jsBlock`:

```json
{
  "type": "jsBlock",
  "settings": {
    "title": "KPI Cards",
    "version": "v2",
    "code": "ctx.render(<div>Hello</div>);"
  }
}
```

Asset-backed `jsBlock`:

```json
{
  "assets": {
    "scripts": {
      "kpiCards": {
        "version": "v2",
        "code": "ctx.render(<div>Hello</div>);"
      }
    }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "jsBlock",
          "script": "kpiCards",
          "settings": {
            "title": "KPI Cards"
          }
        }
      ]
    }
  ]
}
```

For `chart`, the canonical whole-page shape is the chart asset-reference form:

- Put complete chart config under `assets.charts.<key>`.
- Reference it from the chart block with `chart: "<key>"`.
- Do not put internal `stepParams` on the block.
- Do not mix `block.chart` with inline `settings.query`, `settings.visual`, or `settings.events`; for whole-page chart config, asset reference is the only supported authoring source.

Whole-page `applyBlueprint` does not auto-lift inline `settings.query` / `settings.visual` into `assets.charts`. If a legacy draft still has inline chart config on the block, manually move `query`, `visual`, and optional `events` to `assets.charts.<key>` before writing, keep display-only settings such as `title` / `height` on the block, and set `chart: "<key>"`. Missing or bad chart asset references return backend aggregate rule ids such as `chart-block-asset-reference-required` and `chart-block-asset-reference-missing`.

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
