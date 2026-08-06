# JS Template routing prompt corpus

This is a manual business-prompt corpus for reviewing route, transport, completion evidence, and stop behavior. It does
not invoke a model or provider. Reviewers should judge each case against [js-template-source.md](../js-template-source.md)
and [js-template-transport.md](../js-template-transport.md).

## Contents

- [Normal cases](#normal-cases)
- [Failure cases](#failure-cases)

## Normal cases

### Case 1: Complex single-Host JS

- Prompt: “Build one JS Page for this dashboard. It needs several files, hooks, and helper modules, but no other Host
  shares the implementation.”
- Expected route: `inline-runjs`
- Key reason: one Host exclusively owns the JS; file count and complexity are not JS Template triggers.
- Completion evidence: Host ready, `save-changes` succeeds without error diagnostics, new commit and owner fingerprint,
  and no JS Template created; Host Preview only if actually run.
- Forbidden behavior: do not select JS Template because the code is large or multi-file.

### Case 2: Explicit Save as JS Template

- Prompt: “Save this completed Inline JS Block as a JS Template named Sales summary.”
- Expected route: `js-template-save-as`
- Key reason: the user explicitly selected Save as JS Template.
- Completion evidence: compile/validation success, Source Project Head, JS Template identity and `runtimeVersion`, exact
  four-field binding, Host readback, and idempotency result.
- Forbidden behavior: do not create only a Source Project or send the legacy public `version` field.

### Case 3: Shared JS across compatible Hosts

- Prompt: “Use the same sales calculation block in three compatible Hosts. Maintainers must update the code once and
  have all three locations use it without copies.”
- Expected route: `js-template-shared`
- Key reason: multiple compatible Hosts share one maintained JS implementation without copied code.
- Completion evidence: one Save as result, the same exact four-field binding on every Host, independent settings
  overrides, JS Template-level Usage count, and no duplicate Save as operation.
- Forbidden behavior: do not copy the source or create a second JS Template for later Hosts.

### Case 4: Explicit distributable JS Template

- Prompt: “Create a reusable, distributable JS Template for this renderer, even though today we will bind only one Host.”
- Expected route: `js-template-save-as`
- Key reason: the user explicitly requested the JS Template product route and distribution property.
- Completion evidence: the same Save as evidence as Case 2 plus the selected Source Project identity.
- Forbidden behavior: do not treat generic Git storage as equivalent evidence; the explicit JS Template request is what
  selects this route.

### Case 5: Reusable UI structure only

- Prompt: “Reuse this table, form fields, and popup layout on several pages, but let each page keep its own behavior and
  JavaScript.”
- Expected route: `ui-template`
- Key reason: the task reuses UI/Flow structure without one shared JS implementation.
- Completion evidence: contextual UI Template selection/readback and the intended reference/copy outcome on each Host.
- Forbidden behavior: do not create a JS Template or Source Project.

### Case 6: New server capability

- Prompt: “The feature needs a new server API, a database table and migration, and feature-specific ACL enforcement.”
- Expected route: `nocobase-plugin`
- Key reason: required backend capability wins before every client-side source route.
- Completion evidence: handoff to the NocoBase plugin implementation route with the required server scope preserved.
- Forbidden behavior: do not claim Inline, UI Template, or JS Template can provide the missing server behavior.

### Case 7: Single-Host Git ownership

- Prompt: “Keep this one Host's JS implementation in its own Git repository and later push it with our normal CLI. No
  other Host shares the implementation.”
- Expected route: `inline-runjs`
- Key reason: Git storage, independent Git ownership, and CLI push alone do not trigger JS Template or DSL reconciliation.
- Completion evidence: the same Inline evidence as Case 1.
- Forbidden behavior: do not hand off to `nocobase-dsl-reconciler` unless the user explicitly asks to author or reconcile
  DSL/YAML, and do not select JS Template from Git ownership.

### Case 8: Detach one shared Host

- Prompt: “Detach Host A from the shared JS Template at the current committed Head; Host B must stay shared.”
- Expected route: `js-template-detach`
- Key reason: this is an explicit Detach of one currently bound Host.
- Completion evidence: exact five-field request (`idempotencyKey`, `locator`, `projectId`, `templateId`,
  `expectedProjectHeadCommitId`), resulting Inline repo/commit/owner/files hash/source reference, cleared Host A
  binding/Usage, and unchanged Host B binding/override.
- Forbidden behavior: do not send `entryPath`, `kind`, `runtimeVersion`, or `files`; the server derives them from the
  exact committed Head.

## Failure cases

### Case 9: Shared route without capability

- Prompt: “Make these two compatible Hosts share one maintained JS implementation, but the current server does not expose
  JS Template externalization capability.”
- Expected route: `stop-capability-missing`
- Key reason: the requested shared-source route cannot be completed on this instance.
- Completion evidence: report the missing capability and the requested route as incomplete.
- Forbidden behavior: do not downgrade to Inline, copy source, or claim successful reuse.

### Case 10: Detach with unsaved shared edits

- Prompt: “Detach Host A now and include the unsaved changes currently open in the shared JS Template editor.”
- Expected route: `stop-unsaved-shared-edits`
- Key reason: Detach copies only a committed Source Project Head.
- Completion evidence: require the user to save the shared changes or explicitly discard them before retrying Detach.
- Forbidden behavior: do not upload the working copy through Detach or add source fields to the five-field request.
