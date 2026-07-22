# RunJS Workspace source

This is the contract for an ordinary Inline RunJS Workspace used by a new complete JS Page or JS Block. `flow-surfaces` creates and locates the Host; `runJSSources` owns source files, commits, compile previews, and complete snapshots.

## Default route

Use `sourceMode: "inline"`, then `runJSSources:open`. A new Workspace is bootstrapped with the source entry, descriptor, and entry metadata. Existing files are preserved and missing initialization files are added idempotently. This route does not create a `lightExtensionRepos` row or `sourceBinding`.

The normal sequence is:

`Host create -> sourceMode:inline -> runJSSources:open -> Settings Pass -> full Workspace edit -> compilePreview -> diagnostics repair -> full snapshot save`

The save is a complete snapshot, not a patch. Include every retained file and send mandatory `baseCommitId` and `baseOwnerFingerprint` tokens. On a 409 stale Head, call `openLatest`, merge the original/local/latest paths, compile the merged result, and save with the fresh tokens. Same-path conflicts stop automatic recovery and preserve local edits.

## Settings Pass

Settings schema and defaults live in `src/client/entry.json`. Host overrides are resolved with the descriptor defaults at runtime, preserving `false`, `0`, and `""`; invalid type, enum, range, or unknown paths are diagnostics. Settings values are Host state: they do not create source commits and must survive a Host reload. Clearing a setting removes the override and restores the descriptor default.

Normally author 2-5 meaningful settings and at least two in ordinary cases. Fewer than two are allowed for a pure bug fix, when the user explicitly asks to hardcode the behavior, when existing native Surface settings already cover the useful variation, or when the surface has fewer than two reasonable variation points. Every declared setting must be consumed by `ctx.settings`; do not add decorative settings that the code never reads.

## Boundaries

Use the ordinary owner compatibility gate for existing workspaces. Do not silently externalize an Inline Workspace because it is large, modular, uses imports, or has hooks/services. Explicit externalization is a separate action; use [light-extension-source.md](./light-extension-source.md) for that handoff.
