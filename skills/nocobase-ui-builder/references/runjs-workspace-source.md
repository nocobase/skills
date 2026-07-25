# RunJS Workspace source

This is the contract for an ordinary Inline RunJS Workspace used by a new complete JS Page or JS Block. `flow-surfaces` creates and locates the Host; `runJSSources` owns source files, commits, optional compile previews, and incremental Agent saves.

## Default route

Use `sourceMode: "inline"`, then `runJSSources:open`. A new Workspace is bootstrapped with the source entry, descriptor, and entry metadata. Existing files are preserved and missing initialization files are added idempotently. This route does not create a `lightExtensionRepos` row or `sourceBinding`.

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

Use the ordinary owner compatibility gate for existing workspaces. Do not silently externalize an Inline Workspace because it is large, modular, uses imports, or has hooks/services. Explicit externalization is a separate action; use [light-extension-source.md](./light-extension-source.md) for that handoff.
