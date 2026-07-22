# Light Extension source

Light Extension is an explicit externalization destination, not the default authoring path for new JS. Use it only when the user asks for a light plugin, cross-Host reuse, independent Git ownership, or distribution. Multiple files, imports, hooks, services, or complexity alone do not authorize externalization.

The externalization flow starts from the complete Inline Workspace and preserves its descriptor key, settings schema/defaults, Host overrides, and effective runtime behavior. The destination may be an existing Repository, a new Repository, or the application-level default Repository. When no destination is named, choose the default Repository; its identity is stable per application and is reused by later explicit moves.

Externalization must validate and compile the complete snapshot before publishing, then bind the Host with `sourceMode: "light-extension"` and `sourceBinding`. Existing/new/default destinations retain CAS, permission, compile, and rollback checks. Entry directory names are paths; a valid `entry.json.key` remains the Entry identity across relocation and move-back.

Do not infer externalization from a new JS Page/Block and do not write source files through a Host Preview. Host Preview is outside this task's validation scope; report source open, compile, binding, and save evidence instead.
