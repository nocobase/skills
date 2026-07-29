# Light Extension source

This file is the intent router. Use [light-extension-transport.md](./light-extension-transport.md) for capability,
Repository, Entry, move, CAS, compile, and recovery payloads. Use
[light-extension-roundtrip.md](./light-extension-roundtrip.md) when one Entry is reused by multiple Hosts or one Host is
moved back Inline.

Light Extension is the route for one implementation that must be reused by multiple Hosts, maintained once without copied code, independently Git-owned, or distributed. The user does not need to say "Light Extension", "externalize", "Repository", or "Entry" when that business intent is clear. A complete implementation used only by its current Host stays Inline. Multiple files, imports, hooks, services, size, complexity, or a single-page dashboard alone do not authorize externalization.

If that Light Extension capability is unavailable, report that the requested reuse, single-maintenance, Git ownership, or distribution is incomplete. Do not silently replace it with Inline Workspace or single-file Inline. Conversely, do not use `nb light` to probe ordinary Inline Workspace capability; use [runjs-capability-gate.md](./runjs-capability-gate.md).

The move starts from the complete Inline Workspace and preserves its descriptor key, settings schema/defaults, Host overrides, and effective runtime behavior. Use an Existing destination only when the Entry already belongs to that Repository, the user explicitly selects it, or the same task just created it. Otherwise create a New Repository with a business-meaningful name. Never choose an unrelated existing Repository and never emit a Default destination.

Moving source must validate and compile the complete snapshot before publishing, then bind the Host with `sourceMode: "light-extension"` and `sourceBinding`. Send a stable `idempotencyKey` and reuse it only when retrying the same complete request; a completed replay returns the persisted Repository, Entry, binding, and owner fingerprint without creating another Entry. Moving back Inline also requires a stable key, reuses it only for an identical complete request, and replays the first Inline commit/owner result. Existing/New destinations and both move directions retain permission, compile, snapshot, CAS, and rollback checks. Entry directory names are paths; a valid `entry.json.key` remains the Entry identity across relocation and move-back.

Do not infer externalization from a new JS Page/Block and do not write source files through a Host Preview. Host Preview is outside this task's validation scope; report the preceding Inline `save-changes` commit/artifact/owner evidence plus the explicit externalization compile and binding evidence instead.
