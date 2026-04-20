# Template Quick Route

Use this file when you need to decide whether template logic is actually in scope.

## You usually do **not** need template routing when

- the request is a simple whole-page draft with fully inline blocks
- the request is a fresh whole-page `create` with explicit local popup / block content, no existing template reference, and no ask to reuse / save / standardize a template-backed scene
- the request is a normal localized edit and the target has no existing template reference
- there is no popup / block / fields reuse question

In those cases, stay on the primary route and do not open [templates.md](./templates.md) yet.

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

## Open next only if needed

- [templates.md](./templates.md) for the full decision matrix and existing-reference edit routing
- [popup.md](./popup.md) for popup-specific rules after template routing is already known
- [template-decision-summary.md](./template-decision-summary.md) when you need the final user-visible template outcome wording
