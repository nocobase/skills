# RunJS Workspace capability gate

Use this gate before treating any complete JS Model as an Inline multi-file Workspace. The decision is conservative:
ordinary failures stay on their real repair path, and single-file compatibility is allowed only for an ordinary request
that did not explicitly require multiple files, only for a JS Block with a verified public Host write.

## Required evidence

Collect all of these signals instead of inferring capability from one status code:

- `nb api run-js-sources capabilities -j`, including `authoringContractVersion`, `inlineWorkspace.available`,
  `inlineWorkspace.ownerKinds`, `inlineWorkspace.modelUses`, `inlineWorkspace.saveMode`,
  `inlineWorkspace.supportsMaterialize`, and `externalization.available`
- the requested complete JS Model's broad owner kind appears in `ownerKinds` and its model use appears in `modelUses`;
  these are independent lists, so use the mapping in [runjs-workspace-source.md](./runjs-workspace-source.md) rather than
  inferring a one-to-one pair from array position
- the Host response's canonical `data.runJSLocator`; copy it exactly and never construct it from `uid`, `modelUid`,
  `use`, `fieldUid`, or other Host fields
- `workspaceStatus: ready | pending | error`, `workspaceRetryable`, and `workspaceError.code/message`
- whether the `nb api run-js-sources` action exists, checked with action-level `--help`
- the actual `open` and `save-changes` HTTP status plus every `errors[].code`; include `compile-preview` only when it was explicitly used
- for a JS Block fallback, current public Host support for `settings.code/settings.version` on create and
  `changes.code/changes.version` on configure

Do not use `nb js-template` to probe ordinary Inline Workspace capability. It is the reusable JS Template workspace route. A
generic 404 is also not proof that a command, resource, or provider is absent: the same action returns 404 when an
owner, Repository, or base commit cannot be found.

An explicit multi-file request has no single-file fallback. If capability or contract support is missing, including an
absent broad owner kind or model use, the Host does not return a canonical locator, or the Workspace cannot become ready,
stop and report the failed stage. Never rewrite the request into `settings.code`, an ordinary JS Block, another Surface,
or a JS Template.

## Decision matrix

| Signal | Agent action | Single-file fallback |
| --- | --- | --- |
| Matching versioned capability, `workspaceStatus=ready`, and a canonical locator exists | Use the Inline Workspace `open -> Settings Pass -> save-changes` route. | No |
| JS Block: `FLOW_SURFACE_RUNJS_BOOTSTRAP_PROVIDER_UNAVAILABLE`, and the corresponding command/resource/provider is confirmed unavailable | Use the verified Host single-file write and disclose the fallback. | Yes |
| JS Block: `RUNJS_SOURCE_KIND_UNSUPPORTED`, and the Host single-file public write is available | Use the verified Host single-file write and disclose the fallback. | Yes |
| Any complete Model except an ordinary compatible JS Block: provider/resource unavailable, source kind unsupported, or owner/model use absent | Stop and report that the requested complete authoring path is unavailable. For JS Page, never substitute an ordinary page + JS Block (`普通页面 + JS Block`). | No |
| `workspaceStatus=pending` and retryable, without an explicit capability-unavailable code | Retry at most twice, then report that the environment is not ready. | No |
| 401 or 403 | Stop and report authentication or permission failure. | No |
| owner, Repository, or base commit 404 | Repair the locator, Host, or Workspace state. | No |
| `save-changes` + compile error diagnostics in `artifact.diagnostics` | No state was committed. Repair code, descriptor, path, imports, or Settings and retry on the unchanged base. | No |
| 409 + `RUNJS_FILE_CONFLICT`, `BASE_COMMIT_OUTDATED`, or `RUNJS_SOURCE_OWNER_OUTDATED` | `open-latest -> read latest file/hash -> merge by path -> save-changes` with fresh hashes and CAS tokens; never replace tokens alone. | No |
| 409 + `NO_CHANGES` or `RUNJS_SAVE_NO_CHANGES` | Verify latest state and report no changes; do not merge. | No |
| 409 + `REPO_ARCHIVED` | Stop and report the Repository state. | No |
| 400 + `RUNJS_COMPILE_FAILED`, import errors, or descriptor errors | Repair the changed files and retry `save-changes` on the unchanged base. | No |
| 413 | Report the Workspace resource limit and ask to reduce or adjust the Workspace. | No |
| network error or 5xx | Retry at most twice, then report an environment failure. | No |

`workspaceStatus=error` does not by itself enable fallback. Classify `workspaceError.code`, the action result, and
`errors[].code`; any unlisted code remains a stop/repair condition rather than evidence that multi-file authoring is
unsupported.

## Verified JS Block compatibility write

The compatibility path is available only when the user did not explicitly request multiple files, the gate reaches one
of the two `Yes` rows, and the current Host contract confirms the action:

- new/local JS Block: `nb api flow-surfaces add-block` with `type: "jsBlock"` and
  `settings: { code, version }`
- existing JS Block: `nb api flow-surfaces configure` with direct `changes: { code, version }`

Do not encode multiple Workspace files into either field. Preview/read back the persisted JS Block through the Host
surface contract. The completion response must state that the current instance has no available multi-file Workspace
capability, single-file Inline was used, and no Source Project or Template Entry was created.

JS Page public configure currently writes page metadata only; it has no public single-file source write. If Workspace
capability is unavailable, stop. A future JS Page fallback requires a public API and tests in the NocoBase product
repository before this Skill can expose it.

If the user asked for multiple Hosts to share one implementation maintained once without copied code, an unavailable JS
Template capability means the request is incomplete. Report it; do not silently downgrade to Inline. Independent Git
storage or distribution alone does not move a single-Host implementation out of Inline.
