# Popup

Read this file when the request involves popup, `openView`, record popups, `currentRecord`, or `associatedRecords` semantics.

Template decision semantics live in [templates.md](./templates.md). Keep this file popup-specific and do not restate the full template matrix here.

## 1. Core Split

- In **page blueprint**, popup appears inline under the field/action/record action that opens it.
- In **localized low-level edits**, popup is handled through the corresponding action/field write plus popup follow-up APIs as needed.

## 2. Core Rules

- Keep popup intent close to the opener.
- If popup resource binding matters, confirm it with live facts instead of guessing.
- Reuse returned popup uids directly when a write establishes a popup subtree.
- Do not invent `currentRecord` or `associatedRecords` support where the live capability does not expose it.
- When a popup looks like a standard reusable scene, follow [templates.md](./templates.md) before choosing inline `popup` vs `popup.template`. For repeat-eligible popup scenes, contextual `list-templates` is mandatory before binding `popup.template` or finalizing inline fallback; keyword-only search stays discovery-only. This applies to whole-page planning too; a live opener is helpful but not mandatory when the planned opener/resource scene is already clear.
- When no explicit `popup.template` is present, default to `popup.tryTemplate=true` on create-time popup-capable write paths. Local popup content may remain as the miss fallback. Keep [templates.md](./templates.md) as the planning truth source; `popup.tryTemplate=true` is only the execution fallback and should not replace contextual `list-templates`.
- When the user explicitly wants the new local popup itself to become a reusable popup template seed immediately, use `popup.saveAsTemplate={ name, description }` on supported create-time popup writes instead of planning a separate save step. It requires explicit local `popup.blocks` and cannot be combined with `popup.template` or `popup.tryTemplate`.
- This file keeps popup-specific hard boundaries only; template-selection details stay in [templates.md](./templates.md).
- For localized edits on an existing popup template reference, route through [templates.md](./templates.md). Popup-owned content still defaults to the template source; page-scoped wording alone is not local-only intent, and `copy` is allowed only for explicit detach/local-only requests. Do not use `popup.tryTemplate=true`, whole-page `applyBlueprint replace`, or new inline popup content as a rewrite strategy for that existing referenced popup-owned content.
- Without a live opener/target uid, whole-page popup planning should still probe popup templates from the strongest planned opener/resource context. `discovery-only` remains valid when that context is still too weak, when a resolved explicit template is unavailable in the current context, or when the top candidates remain tied after ranking. Keep the exact user-visible reason contract in [template-decision-summary.md](./template-decision-summary.md).

## 3. CRUD Popup Defaults

For `addNew`, `view`, and `edit`:

- backend may auto-complete a standard CRUD popup when no explicit popup content/template is supplied
- if no explicit `popup.template` is present, write `popup.tryTemplate=true` first so the backend can try popup-template reuse before falling back to local popup content, normal CRUD popup completion, or a silent miss
- read back the popup subtree before assuming whether content is already complete
- only add custom popup content when the default completion is insufficient for the confirmed intent
- for `edit`, rely on the default popup only when a standard single-form edit popup is enough; if the user wants custom layout, extra sibling blocks, or nested popups, author explicit `popup.blocks` / `popup.layout`
- if an `edit` popup uses explicit `popup.blocks`, that custom popup must contain exactly one `editForm` block
- in applyBlueprint, generic `form` is unsupported; use `editForm` or `createForm`

## 4. Page-Blueprint Popup Guidance

Use inline popup when the page as a whole is being created/replaced and the popup is part of that page structure.

For whole-page `create` / `replace`, do not bind `popup.template` from loose or keyword-only search results. Probe popup templates with the planned opener/resource context first, and bind only when [templates.md](./templates.md) yields one stable best available candidate. When no explicit `popup.template` is present, keep `popup.tryTemplate=true` as the default inline popup fallback, and preserve local popup content as the miss fallback when needed. When the user explicitly wants that new inline popup to be kept as a reusable template immediately, use `popup.saveAsTemplate={ name, description }` with explicit local `popup.blocks` instead.

The popup subtree in public `applyBlueprint` still follows the same public page-blueprint rules:

- nested popup blocks use the same canonical block grammar as top-level tab blocks
- nested `resource` objects use `collectionName`, not `collection`
- for popup relation tables, prefer `resource.binding = "associatedRecords"` with `resource.associationField = "<relationField>"`
- the convenience shorthand `currentRecord | associatedRecords + associationPathName` only works for a single relation field name; author the canonical shape directly whenever possible
- when the requirement is "click the shown record / relation record to open details", prefer a field object with inline `popup` so the field itself is the opener; backend readback commonly normalizes this to clickable-field / `clickToOpen` semantics
- keep action / recordAction buttons for cases where the requirement explicitly says button / action column
- on record-capable popup blocks, prefer `recordActions` for `view` / `edit` / `updateRecord` / `delete`
- `field.target` is only a string block key in the same popup scope
- popup `layout.rows` uses block keys / `{ key, span }`, never `uid`, `ref`, or `$ref`
- `layout` belongs to the popup document itself, not to the popup's child blocks
- keep popup intent inline with `popup`, not low-level `openView` authoring

For low-level existing-field popup behavior:

- when the user wants a display/association field to click and open a popup, use low-level `configure` / field settings semantics such as `clickToOpen` / `openView`
- do not try to fake field-open behavior by editing unrelated popup descendants first
- when the popup content must be custom, configure the opener first, then build/read back the popup subtree

Typical shape:

```json
{
  "type": "view",
  "popup": {
    "title": "Employee details",
    "blocks": [
      {
        "type": "details",
        "resource": { "binding": "currentRecord", "collectionName": "employees" },
        "fields": ["nickname"]
      }
    ]
  }
}
```

Custom edit popup shape:

```json
{
  "type": "edit",
  "popup": {
    "blocks": [
      {
        "key": "editForm",
        "type": "editForm",
        "fields": ["nickname"]
      },
      {
        "key": "rolesTable",
        "type": "table",
        "resource": {
          "binding": "associatedRecords",
          "associationField": "roles",
          "collectionName": "roles"
        },
        "fields": ["title", "name"]
      }
    ],
    "layout": {
      "rows": [[{ "key": "editForm", "span": 12 }, { "key": "rolesTable", "span": 12 }]]
    }
  }
}
```

Notes:

- the custom popup contains exactly one `editForm`
- that `editForm` may omit `resource`; applyBlueprint will inherit the opener's current-record context
- sibling blocks such as relation tables are allowed next to the `editForm`

## 5. Low-level Popup Guidance

Use low-level APIs when the user is editing an existing popup or opener locally.

Typical flow:

1. locate opener/target with `get`
2. if the opener already references a popup template, route through [templates.md](./templates.md) first; popup-owned content defaults to the template source, and detach-to-copy requires explicit local-only intent
3. if the user is only changing current-instance title / size / mode / `clickToOpen` / outer `openView` config, keep that write on the current opener/host target
4. if capability is uncertain, read `catalog`
5. write the opener or popup content
6. reuse returned popup uids
7. read back the popup subtree

## 6. Verification

After popup-related writes, confirm:

- popup subtree exists at the expected place
- required content actually exists, not only the shell
- binding semantics are still correct when the user explicitly cares about them
