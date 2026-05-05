# Whole-page Recipes

Use this file when [whole-page-quick.md](./whole-page-quick.md) is already the right route, but you want a reusable pattern for a richer first-pass blueprint.

These recipes stay on the same whole-page route. They are not staged mutation plans.

## Recipe 1: Multi-workbench management page

Use when one page needs:

- one or more root `filterForm` blocks
- paired table/details workbenches
- one or more quick create/edit forms
- nested popup flows
- top-level reactions that belong to the page being created now

Recommended structure:

- top row: filter/search blocks
- middle row: primary and secondary workbench blocks
- bottom row: quick create/edit forms
- popup flows anchored to the owning table/details block
- interaction logic in top-level `reaction.items[]`

## Generic paired-collection blueprint

Replace the placeholder collection and field names with live metadata from the current environment.

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Operations" },
    "item": { "title": "Governance Console" }
  },
  "page": {
    "title": "Governance Console"
  },
  "tabs": [
    {
      "key": "main",
      "title": "Overview",
      "blocks": [
        {
          "key": "primaryFilter",
          "type": "filterForm",
          "collection": "primaryCollection",
          "fields": [
            {
              "key": "primaryStatusFilter",
              "field": "primaryStatusField",
              "target": "primaryTable"
            }
          ],
          "actions": ["submit", "reset"]
        },
        {
          "key": "secondaryFilter",
          "type": "filterForm",
          "collection": "secondaryCollection",
          "fields": [
            {
              "key": "secondaryStatusFilter",
              "field": "secondaryStatusField",
              "target": "secondaryTable"
            }
          ],
          "actions": ["submit", "reset"]
        },
        {
          "key": "primaryTable",
          "type": "table",
          "collection": "primaryCollection",
          "fields": [
            "primaryDisplayField",
            "primaryStatusField",
            "relationField"
          ],
          "recordActions": [
            {
              "key": "primaryViewAction",
              "type": "view",
              "title": "Details",
              "popup": {
                "blocks": [
                  {
                    "key": "primaryPopupDetails",
                    "type": "details",
                    "binding": "currentRecord",
                    "fields": [
                      "primaryDisplayField",
                      "primaryStatusField",
                      "relationField"
                    ],
                    "recordActions": [
                      {
                        "key": "primaryPopupEditAction",
                        "type": "edit",
                        "title": "Edit"
                      }
                    ]
                  },
                  {
                    "key": "primaryPopupRelatedTable",
                    "type": "table",
                    "binding": "associatedRecords",
                    "associationField": "relationField",
                    "fields": [
                      "secondaryDisplayField",
                      "secondaryStatusField"
                    ],
                    "recordActions": ["view"]
                  }
                ],
                "layout": {
                  "rows": [
                    ["main.primaryTable.primaryViewAction.popup.primaryPopupDetails", "main.primaryTable.primaryViewAction.popup.primaryPopupRelatedTable"]
                  ]
                }
              }
            }
          ]
        },
        {
          "key": "secondaryTable",
          "type": "table",
          "collection": "secondaryCollection",
          "fields": [
            "secondaryDisplayField",
            "secondaryStatusField"
          ],
          "recordActions": [
            {
              "key": "secondaryViewAction",
              "type": "view",
              "title": "Details"
            },
            {
              "key": "protectedDeleteAction",
              "type": "delete",
              "title": "Delete"
            }
          ]
        },
        {
          "key": "primaryCreateForm",
          "type": "createForm",
          "collection": "primaryCollection",
          "fields": [
            "primaryDisplayField",
            "relationField"
          ],
          "actions": ["submit"]
        },
        {
          "key": "secondaryCreateForm",
          "type": "createForm",
          "collection": "secondaryCollection",
          "fields": [
            "secondaryDisplayField",
            "secondaryStatusField"
          ],
          "actions": ["submit"]
        }
      ],
      "layout": {
        "rows": [
          ["main.primaryFilter", "main.secondaryFilter"],
          ["main.primaryTable", "main.secondaryTable"],
          ["main.primaryCreateForm", "main.secondaryCreateForm"]
        ]
      }
    }
  ],
  "reaction": {
    "items": [
      {
        "type": "setFieldValueRules",
        "target": "main.secondaryCreateForm",
        "rules": [
          {
            "key": "defaultSecondaryStatus",
            "targetPath": "secondaryStatusField",
            "mode": "default",
            "value": {
              "source": "literal",
              "value": "draft"
            }
          }
        ]
      },
      {
        "type": "setFieldLinkageRules",
        "target": "main.secondaryCreateForm",
        "rules": [
          {
            "key": "deriveSecondaryName",
            "when": {
              "logic": "$and",
              "items": [
                {
                  "path": "formValues.secondaryDisplayField",
                  "operator": "$notEmpty"
                },
                {
                  "path": "formValues.secondaryCodeField",
                  "operator": "$empty"
                }
              ]
            },
            "then": [
              {
                "type": "assignField",
                "items": [
                  {
                    "targetPath": "secondaryCodeField",
                    "value": {
                      "source": "runjs",
                      "version": "v2",
                      "code": "const value = String(ctx.formValues?.secondaryDisplayField || '').trim(); if (!value) return null; return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');"
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "type": "setActionLinkageRules",
        "target": "main.secondaryTable.protectedDeleteAction",
        "rules": [
          {
            "key": "disableProtectedDelete",
            "when": {
              "logic": "$or",
              "items": [
                {
                  "path": "record.name",
                  "operator": "$eq",
                  "value": "root"
                },
                {
                  "path": "record.name",
                  "operator": "$eq",
                  "value": "admin"
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
    ]
  }
}
```

## Guardrails

- Every block, field, and action that another node references should have an explicit `key`
- Keep `filterForm` field `target` values on string block keys, not low-level `defaultTargetUid`
- Put popup content inline with the owning field/action/record action
- Keep whole-page reaction targets on stable public paths
- If a whole-page `applyBlueprint` fails before first success, repair the blueprint from the error, rerun `prepare-write`, and retry blueprint-only up to 5 rounds instead of falling back to low-level APIs during those pre-success retries. After 5 failed rounds, report the latest blueprint / error evidence
- After one successful whole-page `applyBlueprint`, localized low-level repair is allowed only for an explicit residual local/live gap and should stay narrowly scoped
