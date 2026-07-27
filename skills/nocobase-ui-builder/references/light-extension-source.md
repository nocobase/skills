# Light Extension source

This file is the intent router. Use [light-extension-transport.md](./light-extension-transport.md) for capability,
Repository, Entry, move, CAS, compile, and recovery payloads. Use
[light-extension-roundtrip.md](./light-extension-roundtrip.md) when one Entry is reused by multiple Hosts or one Host is
moved back Inline.

Light Extension is an explicit externalization destination, not the default authoring path for new JS. Use it only when the user asks for a light plugin, cross-Host reuse, independent Git ownership, or distribution. Multiple files, imports, hooks, services, or complexity alone do not authorize externalization.

If that explicit Light Extension capability is unavailable, report that the requested externalization, reuse, Git ownership, or distribution is incomplete. Do not silently replace it with Inline Workspace or single-file Inline. Conversely, do not use `nb light` to probe ordinary Inline Workspace capability; use [runjs-capability-gate.md](./runjs-capability-gate.md).

The externalization flow starts from the complete Inline Workspace and preserves its descriptor key, settings schema/defaults, Host overrides, and effective runtime behavior. The destination may be an existing Repository, a new Repository, or the application-level default Repository. When no destination is named, choose the default Repository; its identity is stable per application and is reused by later explicit moves.

Externalization must validate and compile the complete snapshot before publishing, then bind the Host with `sourceMode: "light-extension"` and `sourceBinding`. Send a stable `idempotencyKey` for the explicit move and reuse that key only when retrying the same complete request; a completed replay returns the persisted Repository, Entry, binding, and owner fingerprint without creating another Entry. Existing/new/default destinations retain CAS, permission, compile, and rollback checks. Entry directory names are paths; a valid `entry.json.key` remains the Entry identity across relocation and move-back.

Do not infer externalization from a new JS Page/Block and do not write source files through a Host Preview. Host Preview is outside this task's validation scope; report the preceding Inline `save-changes` commit/artifact/owner evidence plus the explicit externalization compile and binding evidence instead.
