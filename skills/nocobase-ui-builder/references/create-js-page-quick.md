# Create JS page

Use this route when the user asks for a new complete JS Page. The visible route name is **Create JS page**; `createJSPage` and `create-js-page` are implementation aliases only.

1. Create or locate the JS Page Host through the `flow-surfaces` Host action. The Host owns navigation, layout, locator, and idempotency; it does not own the source files.
2. Confirm `sourceMode: "inline"` and open the returned canonical locator through the Inline Workspace transport. The
   ordinary Inline Workspace is the default for a new JS Page and for a new complete JS Block created through the same
   Host flow. Follow [runjs-transport.md](./runjs-transport.md); never construct the locator from `modelUid`.
3. Run the Settings Pass before writing implementation code. Read the descriptor from `src/client/entry.json`, normally define 2-5 meaningful settings (at least two in ordinary cases), and make the code read `ctx.settings`. Fewer than two are allowed for a pure bug fix, when the user explicitly asks to hardcode the behavior, when existing native Surface settings already cover the useful variation, or when the surface has fewer than two reasonable variation points.
4. Edit only the needed source files, such as `src/client/index.tsx`, `src/client/entry.json`, and components/hooks/services/utils. `.nocobase/runjs-source.json` is server-managed: do not upload, edit, or delete it. Keep source as files; do not encode a multi-file Workspace in `settings.code` or `assets.scripts`.
5. Run `runJSSources:saveChanges` with only changed paths. It compiles the complete materialized candidate; repair every returned diagnostic and retry. Use `compilePreview` only for an explicit dry-run or debugging. The
   authoritative transport document defines the CLI commands, request fields, CAS tokens, and stale-save recovery; do
   not duplicate or improvise them here.
6. Report Host readiness, Workspace open, Settings schema/defaults, `save-changes` artifact diagnostics, the new commit and owner fingerprint, and that no Light Extension Repository was automatically created. Host Preview is a non-goal for this route and must not be claimed as validation.

Use Light Extension only after the user explicitly asks to externalize, convert to a light plugin, reuse across Hosts, keep an independent Git repository, or distribute the source. If a destination is not named, use the application-level default Repository. See [light-extension-source.md](./light-extension-source.md).

Read [runjs-workspace-source.md](./runjs-workspace-source.md) for the ordinary Workspace contract, then [js-surfaces/index.md](./js-surfaces/index.md) for the code surface and one safe snippet.
