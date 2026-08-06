# UI Template Quick Route

Use this file when you need to decide whether UI Template logic is actually in scope. JS implementation reuse is a
separate [JS Template route](./js-template-source.md).

## You usually do **not** need template routing when

- the request is a simple whole-page draft with fully inline blocks
- the request is a fresh whole-page `create` with explicit local popup / block content, no existing template reference, and no ask to reuse / save / standardize a template-backed scene
- the request is a normal localized edit and the target has no existing template reference
- there is no popup / block / fields reuse question

In those cases, stay on the primary route and do not open [ui-templates.md](./ui-templates.md) yet.

## You **do** need template routing when

- the live target already has an existing template reference
- the request is really about `reference` vs `copy`
- a repeat-eligible popup / block / fields scene is being planned
- template reuse is explicitly requested

## Minimal rules

- existing template refs default to template-source edits for template-owned content
- host / openView config stays local
- page-scoped wording is not local-only intent
- unresolved scope means clarify, not `copy`
- repeat-eligible scenes require contextual `list-templates` when you are actually deciding whether to bind / reuse / standardize a template-backed scene
- keyword-only search is discovery-only
- "Fresh whole-page create may stay inline" is a pre-write routing shortcut only. It is not a reason to reject a successful backend `popup.template` hit, remove `popup.tryTemplate`, or rerun the page as local-only after `applyBlueprint` succeeds.

For artifact-only existing-reference decisions, make both branches visible instead of collapsing the route to one generic boundary note:

```json
{
  "autoDetachToCopy": false,
  "needsClarification": true,
  "templateOwnedContentRoute": "clarify-before-template-source-edit",
  "hostOpenViewConfigRoute": "local-host-config"
}
```

## Open next only if needed

- [ui-templates.md](./ui-templates.md) for the full decision matrix and existing-reference edit routing
- [popup.md](./popup.md) for popup-specific rules after template routing is already known
- [template-decision-summary.md](./template-decision-summary.md) when you need the final user-visible template outcome wording
