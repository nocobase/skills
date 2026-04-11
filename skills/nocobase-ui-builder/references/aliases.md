# Aliases

Use this file when natural-language wording is ambiguous and you still need to narrow it to a target family or capability.

## 1. Page / Page Entry

| user expression | default narrowing path | when to stop and confirm |
| --- | --- | --- |
| page | if there is already a page locator/uid, treat it as an existing page first; otherwise, if the user is clearly describing a whole page in business terms, route to **public page-DSL / executeDsl authoring** | when both “create a page” and “modify this page” remain plausible |
| page entry / menu / navigation item | first distinguish `menu-group`, `menu-item`, and initialized `page` | when it may refer to another navigation system |

## 2. Title / Icon

- Default guess order: visible-slot clue first, then object name, then route-backed default semantics.
- `left menu`, `navigation`, `menu title`, `menu icon` -> narrow to `menu-group` / `menu-item` first.
- `tab title`, `tab icon` -> narrow to `outer-tab` / `popup-tab` first.
- `page top title`, `header title` -> narrow to `page` first.
- If the user only says `page title` with no clue, default to the page entry/menu path, not directly to tab semantics.

## 3. Conservative Moves

- Aliases only choose semantics; they do not choose the final API by themselves.
- If the input still describes a whole page, route it to page-DSL authoring instead of low-level APIs.
- If the action would cross families or scopes, narrow the target first.
- Do not jump from ambiguous wording directly into low-level `uid`-driven writes when the request still sounds like public whole-page authoring.
