# DSL Execution

Read this file when the task is a structural UI write and the preferred path should be DSL-first. This file defines when to use `kind = "blueprint"` vs `kind = "patch"`, when to show a DSL draft first, and when low-level flow-surfaces APIs are the correct fallback.

## 1. Default Chain

- New page / whole-page design request: `blueprint DSL -> validateDsl -> executeDsl -> readback`
- Existing-surface structural edit: `describeSurface -> patch DSL -> validateDsl -> executeDsl -> readback`
- Existing-surface whole-page rewrite that is still easier to describe as a page-level structure: `describeSurface -> blueprint DSL(target.mode = "update-page") -> validateDsl -> executeDsl -> readback`
- Use `verificationMode = "strict"` by default on `executeDsl`.

`validateDsl` is mandatory before `executeDsl`. For structural page writes, it is also the default coverage decision point. Do not bypass it just because the request looks simple, complex, popup-heavy, or locally under-documented.

## 2. Choose DSL Kind

| Use case | Preferred kind | Why |
| --- | --- | --- |
| create a new page from business intent | `blueprint` | the request describes a page structure, navigation metadata, data sources, layout, blocks, interactions, and popup semantics together |
| update an existing page by replacing or reorganizing the overall structure | `blueprint` | the change is still easiest to describe as a full page design rather than isolated primitive edits |
| add/remove/move/update one or more blocks, fields, actions, tabs, layout, or settings on an existing identified surface | `patch` | the change is a concrete structural delta on an existing page |

Supported patch ops are:

- `page.destroy`
- `tab.add`, `tab.update`, `tab.move`, `tab.remove`
- `block.add`, `field.add`, `action.add`, `recordAction.add`
- `settings.update`, `layout.replace`
- `node.move`, `node.remove`
- `template.detach`

If the required edit is outside this list, do not force `patch`.

## 3. When to Show a DSL Draft First

Show a DSL draft and stop for confirmation when any of the following is true:

- `unresolvedQuestions` is non-empty
- the request is ambiguous, multi-surface, destructive, or high-impact
- the page layout, popup completion, or data-source choices still depend on assumptions the user may want to review
- the user explicitly asks for a draft / blueprint before execution

In this mode, return:

1. a short explanation of the intended structure and assumptions
2. the structured DSL draft

Do not mix execution logs into the draft response.

## 4. When Direct Execution Is Allowed

You may proceed directly to execution only when all of the following are true:

- the request is clear and bounded
- the target is unique
- the DSL has explicit `kind`, `version`, `assumptions`, and empty `unresolvedQuestions`
- the DSL does not invent fields, bindings, popup content, or destructive scope

For existing-surface execution, prefer reading `describeSurface` first so the run is anchored with `expectedFingerprint`.

## 5. DSL Correctness Loop

1. Gather live facts first: menu context, surface locators, collection fields, relation metadata, popup bindings, and target-specific addability when relevant.
2. Emit explicit DSL with `version = "1"`, explicit `kind`, explicit `assumptions`, and honest `unresolvedQuestions`.
3. Run `validateDsl`.
4. If `validateDsl` reports a schema / contract error, fix the DSL first. Do not bypass the failure with low-level writes unless the error concretely shows that the change is outside DSL coverage.
5. If `validateDsl` returns `validation.fieldIssues`, revise the DSL first. Only switch to a supported low-level flow when the validation result concretely proves that DSL cannot preserve the exact semantics.
6. Run `executeDsl` with `verificationMode = "strict"`.
7. Perform user-facing readback according to [verification.md](./verification.md).

## 6. Existing-Surface Anchoring

- Use `describeSurface` when the next step is DSL execution on an existing surface.
- Carry `expectedFingerprint` from `describeSurface` into `validateDsl` / `executeDsl`.
- Use `bindRefs` only when you want stable names for already existing nodes; for example, when a patch change targets an existing table and a later change targets a field or action created in the same run.
- Do not expose bind-ref persistence internals in natural-language commentary.

## 7. Low-Level Fallback Rules

Low-level flow-surfaces APIs remain the fallback when any of the following is true:

- the required work is a lifecycle-only exception outside DSL coverage, such as isolated menu-group creation, menu moves, or template-record management
- a prior `validateDsl` attempt has returned concrete unsupported / schema / contract evidence showing that the current DSL path is outside coverage or would lose required semantics

Preferred low-level fallback families:

- lifecycle / navigation: `createMenu`, `updateMenu`, `createPage`, `updateTab`, `moveTab`, `removeTab`, `destroyPage`
- content / structure: `compose`, `addBlock`, `addField`, `addAction`, `addRecordAction`, `removeNode`, `moveNode`
- settings / layout: `configure`, `updateSettings`, `setLayout`

When falling back, keep the same standards:

- no guessed fields or bindings
- `catalog` only when the contract requires it
- post-write readback is still mandatory
- explain the failing `validateDsl` evidence that justified the fallback

## 8. Things Not to Do

- Do not rely on backend kind inference; always write `dsl.kind` explicitly.
- Do not call `executeDsl` while `unresolvedQuestions` is still non-empty.
- Do not let subjective confidence, page complexity, popup complexity, relation bindings, or missing local examples substitute for a `validateDsl` attempt.
