# Popup

Read this file when the request involves popup, `openView`, record popups, `currentRecord`, or `associatedRecords` semantics.

## 1. Core Split

- In **page DSL**, popup appears inline under the field/action/record action that opens it.
- In **localized low-level edits**, popup is handled through the corresponding action/field write plus popup follow-up APIs as needed.

## 2. Core Rules

- Keep popup intent close to the opener.
- If popup resource binding matters, confirm it with live facts instead of guessing.
- Reuse returned popup uids directly when a write establishes a popup subtree.
- Do not invent `currentRecord` or `associatedRecords` support where the live capability does not expose it.

## 3. CRUD Popup Defaults

For `addNew`, `view`, and `edit`:

- backend may auto-complete a standard CRUD popup when no explicit popup content/template is supplied
- read back the popup subtree before assuming whether content is already complete
- only add custom popup content when the default completion is insufficient for the confirmed intent
- for `edit`, rely on the default popup only when a standard single-form edit popup is enough; if the user wants custom layout, extra sibling blocks, or nested popups, author explicit `popup.blocks` / `popup.layout`
- if an `edit` popup uses explicit `popup.blocks`, that custom popup must contain exactly one `editForm` block
- in executeDsl, generic `form` is unsupported; use `editForm` or `createForm`

## 4. Page-DSL Popup Guidance

Use inline popup when the page as a whole is being created/replaced and the popup is part of that page structure.

The popup subtree in public `executeDsl` still follows the same public page-DSL rules:

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
- that `editForm` may omit `resource`; executeDsl will inherit the opener's current-record context
- sibling blocks such as relation tables are allowed next to the `editForm`

## 5. Low-level Popup Guidance

Use low-level APIs when the user is editing an existing popup or opener locally.

Typical flow:

1. locate opener/target with `get`
2. if capability is uncertain, read `catalog`
3. write the opener or popup content
4. reuse returned popup uids
5. read back the popup subtree

## 6. Verification

After popup-related writes, confirm:

- popup subtree exists at the expected place
- required content actually exists, not only the shell
- binding semantics are still correct when the user explicitly cares about them
