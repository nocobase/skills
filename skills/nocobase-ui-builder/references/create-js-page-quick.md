# Create JS page

Use this route when the user asks for a new complete JS Page. The visible route name is **Create JS page**; `createJSPage` and `create-js-page` are implementation aliases only.

1. Create or locate the JS Page Host through the `flow-surfaces` Host action. The Host owns navigation, layout, locator, and idempotency; it does not own the source files.
2. Confirm `sourceMode: "inline"` and call `runJSSources:open` for the returned locator. The ordinary Inline Workspace is the default for a new JS Page and for a new complete JS Block created through the same Host flow.
3. Run the Settings Pass before writing implementation code. Read the descriptor from `src/client/entry.json`, normally define 2-5 meaningful settings (at least two in ordinary cases), and make the code read `ctx.settings`. Allowed exceptions are a genuinely static surface (zero), a single meaningful setting, a compatibility migration, or a deliberately empty settings schema.
4. Edit the complete Workspace file set, including `src/client/index.tsx`, `.nocobase/runjs-source.json`, `src/client/entry.json`, and any components/hooks/services/utils. Keep the files as files; do not encode a multi-file Workspace in `settings.code` or `assets.scripts`.
5. Run `runJSSources:compilePreview`, repair every returned diagnostic, and save a complete snapshot. Save and ZIP import must include both `baseCommitId` and `baseOwnerFingerprint`; a stale 409 requires `openLatest`, a path-level three-way merge, another `compilePreview`, and save with the fresh tokens. Never recover by only replacing tokens.
6. Report Host creation, Workspace open, Settings schema/defaults, compile diagnostics, and snapshot save evidence. Host Preview is a non-goal for this route and must not be claimed as validation.

Use Light Extension only after the user explicitly asks to externalize, convert to a light plugin, reuse across Hosts, keep an independent Git repository, or distribute the source. If a destination is not named, use the application-level default Repository. See [light-extension-source.md](./light-extension-source.md).

Read [runjs-workspace-source.md](./runjs-workspace-source.md) for the ordinary Workspace contract, then [js-surfaces/index.md](./js-surfaces/index.md) for the code surface and one safe snippet.
