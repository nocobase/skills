# RunJS Workspace source

This is the contract for an ordinary Inline RunJS Workspace used by every complete JS Model declared by the versioned authoring capability contract. `flow-surfaces` creates and locates the Host; `runJSSources` owns source files, commits, optional compile previews, and incremental Agent saves.

Before first use, run `nb api run-js-sources capabilities -j`. Require `inlineWorkspace.available: true`,
`inlineWorkspace.saveMode: "delta"`, `inlineWorkspace.supportsMaterialize: true`, and both the requested model use and
its broad owner kind in the independently published arrays. Contract version `1` publishes:

- owner kinds: `js-block`, `js-page`, `js-field`, `js-column`, `js-action`, `js-item`
- model uses: `JSPageModel`, `JSBlockModel`, `JSFieldModel`, `JSEditableFieldModel`, `JSColumnModel`, `JSItemModel`, `JSItemActionModel`, `JSActionModel`, `JSRecordActionModel`, `JSCollectionActionModel`, `JSFormActionModel`, `FilterFormJSActionModel`

The arrays are independent capability lists, not a one-to-one pair mapping. UI Builder maps complete Hosts as follows:

| Broad owner kind | Complete model uses |
| --- | --- |
| `js-page` | `JSPageModel` |
| `js-block` | `JSBlockModel` |
| `js-field` | `JSFieldModel`, `JSEditableFieldModel` |
| `js-column` | `JSColumnModel` |
| `js-action` | `JSActionModel`, `JSRecordActionModel`, `JSCollectionActionModel`, `JSFormActionModel`, `FilterFormJSActionModel` |
| `js-item` | `JSItemModel`, `JSItemActionModel` |

Treat the live response as authoritative for its `authoringContractVersion` and matrix. Embedded default/assignment,
linkage, custom variable, workflow JavaScript, chart option/events, and `flowRegistry` RunJS stay single-surface because
they are not in this complete-owner matrix.

## Default route

Copy the canonical locator returned by Host create/get exactly; never construct it from `uid`, `modelUid`, `use`, or
`fieldUid`. Use `sourceMode: "inline"`, then `runJSSources:open`. A new Workspace is bootstrapped with the source entry,
descriptor, and entry metadata. Existing files are preserved and missing initialization files are added idempotently.
This route does not create a `lightExtensionRepos` row or `sourceBinding`.

The normal sequence is:

`Host create -> sourceMode:inline -> runJSSources:open -> Settings Pass -> edit source files -> saveChanges -> diagnostics/conflict repair -> retry`

The lifecycle sends only changed paths with the `baseCommitId` plus `baseOwnerFingerprint` returned by one open and each
existing path's `expectedBlobHash`. Omitted paths remain unchanged and deletion is explicit. `RUNJS_FILE_CONFLICT`, a
stale base, or a stale owner follows the `open-latest` -> path merge -> `save-changes` lifecycle with fresh hashes and CAS
tokens; replacing tokens alone is invalid. Use [runjs-transport.md](./runjs-transport.md) as the sole authority for CLI
command names, request and response shapes, delta semantics, and code-specific error handling.

## Settings Pass

Settings schema and defaults live in `src/client/entry.json`. Host overrides are resolved with the descriptor defaults at runtime, preserving `false`, `0`, and `""`; invalid type, enum, range, or unknown paths are diagnostics. Settings values are Host state: they do not create source commits and must survive a Host reload. Clearing a setting removes the override and restores the descriptor default.

Normally author 2-5 meaningful settings and at least two in ordinary cases. Fewer than two are allowed for a pure bug fix, when the user explicitly asks to hardcode the behavior, when existing native Surface settings already cover the useful variation, or when the surface has fewer than two reasonable variation points. Every declared setting must be consumed by `ctx.settings`; do not add decorative settings that the code never reads.

Do not expose secrets, tokens, internal UIDs, arbitrary JS/HTML/SQL, module paths, debug cache keys, or values already covered by native Host settings merely to meet the quality line.

## Boundaries

Use the ordinary owner compatibility gate for existing workspaces. Multiple files, imports, hooks, services, size, or
complexity never trigger Light Extension; do not silently externalize an Inline Workspace for any of those reasons.
Shared implementation, single-maintenance, independent Git ownership, or distribution is a separate business intent; use
[light-extension-source.md](./light-extension-source.md) for that handoff even when the user does not name the transport.

If the user explicitly requested multiple files, missing capability support, a missing canonical locator, or a non-ready
Workspace is a stop condition. Do not downgrade to `settings.code`, an ordinary JS Block, another Surface, or a Light
Extension.
