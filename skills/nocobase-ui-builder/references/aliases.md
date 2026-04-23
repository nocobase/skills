# Aliases

Use this file when natural-language wording is ambiguous and you still need to narrow it to a target family or capability.

## 1. Page / Page Entry

| user expression | default narrowing path | when to stop and confirm |
| --- | --- | --- |
| page | if there is already a page locator/uid, treat it as an existing page first; otherwise, if the user is clearly describing a whole page in business terms, route to **public page-blueprint / applyBlueprint authoring** | when both “create a page” and “modify this page” remain plausible |
| page entry / menu / navigation item | first distinguish `menu-group`, `menu-item`, and initialized `page` | when it may refer to another navigation system |

## 2. Title / Icon

- Default guess order: visible-slot clue first, then object name, then route-backed default semantics.
- `left menu`, `navigation`, `menu title`, `menu icon` -> narrow to `menu-group` / `menu-item` first.
- `tab title`, `tab icon` -> narrow to `outer-tab` / `popup-tab` first.
- `page top title`, `header title` -> narrow to `page` first.
- If the user only says `page title` with no clue, default to the page entry/menu path, not directly to tab semantics.

## 3. Filter / Search

| user expression | default narrowing path | when to stop and confirm |
| --- | --- | --- |
| 给表格 / 列表 / Grid 增加筛选、筛选功能、filter | default to the data block's collection action slot and add a `filter` action first; do **not** create `filterForm` by default | when the target surface is still ambiguous or there is no supported data block host |
| 给表格 / 列表 / Grid / 卡片增加搜索、搜索功能、search | only when the wording explicitly adds search to that data block, including “支持搜索 / 带搜索 / 可搜索 / searchable”, narrow it to the same block-level `filter` action path; do not infer filtering from page-noun wording alone | when the request may instead mean a global search page, search portal, search results page, or non-filter search experience |
| 增加筛选按钮 / 筛选操作 / Filter Action | narrow to a block-level `filter` action | when the user might instead mean a dedicated controls area rather than one action |
| 增加筛选区块 / 筛选表单 / 查询表单 / 搜索区块 / 搜索表单 / 条件查询区 / filter form / search block | narrow to `FilterFormBlockModel` | when both a dedicated block and a simple action would satisfy the request and the user has not named the host |

`筛选 / filter` is ambiguous by itself. Unless the user explicitly asks for a block/form, default it to a button/action on the existing data block. `搜索 / search` should follow that rule only when the request explicitly adds search to a table / list / Grid / card-like host, including “支持搜索 / 带搜索 / 可搜索 / searchable”; page-noun wording such as `搜索页`, `搜索结果页`, or `搜索门户` should not. 像“帮助中心页面，用列表展示帮助文档入口，并支持搜索”这种页面级搜索诉求，也不应仅因为同句出现了 `列表` 就自动收窄成 data-block `filter` action。

## 4. Conservative Moves

- Aliases only choose semantics; they do not choose the final API by themselves.
- If the input still describes a whole page, route it to page-blueprint authoring instead of low-level APIs.
- If the action would cross families or scopes, narrow the target first.
- Do not jump from ambiguous wording directly into low-level `uid`-driven writes when the request still sounds like public whole-page authoring.
