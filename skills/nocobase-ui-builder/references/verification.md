# Verification

Use this file to verify inspect/prewrite output and post-write persistence.

## 1. Inspect / Prewrite Verification

### Core Rules

- `inspect` and page-blueprint drafting are read-only.
- whole-page `applyBlueprint` authoring is **ASCII-first** before the first write; the preview should still be traceable back to one concrete blueprint draft, whether execution pauses for review or continues immediately.
- For menu questions, default to the visible menu tree first.
- For initialized pages/popup trees, default to `get` first.
- Use `describeSurface` only when its richer public tree is actually needed.
- Do not describe a draft as if a write already succeeded.

### Draft Acceptance

A page-blueprint draft is good when:

- create vs replace is clear
- required collections/fields/bindings are backed by live facts
- tabs/blocks/popups are structurally explicit
- any ASCII wireframe shown to the user matches the same tabs / blocks / popup structure as the blueprint draft
- if execution proceeded immediately, the ASCII wireframe still appeared before the first `applyBlueprint`
- if duplicate same-title menu groups existed, the preview/readback states which routeId was chosen and no extra same-title group was created unless the user explicitly asked for one
- canonical public names are used (`collection` vs `resource.collectionName`, `popup`, string `field.target`, layout `key`)
- low-level selectors/internal forms such as `uid`, `ref`, `$ref`, or alias fields do not appear in the JSON
- destructive blast radius is explicit for replace/delete scenarios
- remaining assumptions are stated outside the JSON payload

## 2. Write Readback Principles

- Verify only the surfaces affected by the write, unless hierarchy changed.
- A successful write response is not enough; confirm via readback.
- Popup-specific claims require popup-specific readback.
- Reaction writes should also verify `resolvedScene` / `resolvedSlot` / `fingerprint` from the write result instead of assuming the backend used the guessed scene.

## 3. Minimum Readback Targets

| operation | minimum readback |
| --- | --- |
| `applyBlueprint` create | menu tree if menu placement matters + `get({ pageSchemaUid })` |
| `applyBlueprint` replace | `get({ pageSchemaUid })` and affected tab/content checks |
| `applyBlueprint` with `reaction.items[]` | `get({ pageSchemaUid })` plus the affected reaction slot in readback |
| `createPage` | `get({ pageSchemaUid })` |
| `addTab/updateTab/moveTab/removeTab` | page or tab readback |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | popup page/tab readback |
| `compose/addBlock/addField/addAction/addRecordAction` | direct parent/target readback |
| `configure/updateSettings` | modified target readback |
| `getReactionMeta` + `set*Rules` | target readback plus write-result `resolvedScene` / `fingerprint` checks |
| `moveNode/removeNode` | parent/target readback |
| `updateMenu` / `createMenu` | menu tree when placement matters |

### Reaction-specific readback

After a reaction write, confirm at least:

- the returned `resolvedScene` matches the intended scene family
- the returned `fingerprint` changed when the slot content changed
- the persisted rule slot exists where expected
- for form `fieldValue` / `fieldLinkage`, rules land on the form-grid slot rather than the outer form step root
- for clear operations, `rules: []` really leaves the persisted slot empty

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
