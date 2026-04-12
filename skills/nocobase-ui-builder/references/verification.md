# Verification

Use this file to verify inspect/prewrite output and post-write persistence.

## 1. Inspect / Prewrite Verification

### Core Rules

- `inspect` and page-DSL drafting are read-only.
- whole-page `executeDsl` authoring is **ASCII-first** before the first write; the preview should still be traceable back to one concrete DSL draft, whether execution pauses for review or continues immediately.
- For menu questions, default to the visible menu tree first.
- For initialized pages/popup trees, default to `get` first.
- Use `describeSurface` only when its richer public tree is actually needed.
- Do not describe a draft as if a write already succeeded.

### Draft Acceptance

A page-DSL draft is good when:

- create vs replace is clear
- required collections/fields/bindings are backed by live facts
- tabs/blocks/popups are structurally explicit
- any ASCII wireframe shown to the user matches the same tabs / blocks / popup structure as the DSL draft
- if execution proceeded immediately, the ASCII wireframe still appeared before the first `executeDsl`
- if duplicate same-title menu groups existed, the preview/readback states which routeId was chosen and no extra same-title group was created unless the user explicitly asked for one
- canonical public names are used (`collection` vs `resource.collectionName`, `popup`, string `field.target`, layout `key`)
- low-level selectors/internal forms such as `uid`, `ref`, `$ref`, or alias fields do not appear in the JSON
- destructive blast radius is explicit for replace/delete scenarios
- remaining assumptions are stated outside the JSON payload

## 2. Write Readback Principles

- Verify only the surfaces affected by the write, unless hierarchy changed.
- A successful write response is not enough; confirm via readback.
- Popup-specific claims require popup-specific readback.

## 3. Minimum Readback Targets

| operation | minimum readback |
| --- | --- |
| `executeDsl` create | menu tree if menu placement matters + `get({ pageSchemaUid })` |
| `executeDsl` replace | `get({ pageSchemaUid })` and affected tab/content checks |
| `createPage` | `get({ pageSchemaUid })` |
| `addTab/updateTab/moveTab/removeTab` | page or tab readback |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | popup page/tab readback |
| `compose/addBlock/addField/addAction/addRecordAction` | direct parent/target readback |
| `configure/updateSettings` | modified target readback |
| `moveNode/removeNode` | parent/target readback |
| `updateMenu` / `createMenu` | menu tree when placement matters |

## 4. Popup-specific Checks

After popup-related writes, confirm:

- popup subtree exists
- required content exists, not just shell
- if the user explicitly cares about binding semantics, binding still matches live facts

## 5. Replace / Destructive Checks

For replace/delete style operations, explicitly confirm:

- the intended page/tab/node still exists or was removed as expected
- extra tabs/nodes that should disappear actually disappeared
- unaffected sibling structure was not unexpectedly damaged
