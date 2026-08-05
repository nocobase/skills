# JS Template public transport

This is the canonical transport contract for reusable JS Template source. Use only `nb` commands as public transport;
do not call internal services, write database rows, or substitute raw HTTP. Ordinary Inline Workspace authoring stays on
[runjs-transport.md](./runjs-transport.md), while routing intent comes from
[js-template-source.md](./js-template-source.md).

## Contents

- [Domain and command crosswalk](#domain-and-command-crosswalk)
- [Capability and discovery](#capability-and-discovery)
- [Capture one Inline snapshot](#capture-one-inline-snapshot)
- [Save as JS Template](#save-as-js-template)
- [Canonical Save as request](#canonical-save-as-request)
- [Record the durable result](#record-the-durable-result)
- [Source Project edit loop](#source-project-edit-loop)
- [Keep Inline and Source Project CAS separate](#keep-inline-and-source-project-cas-separate)
- [Usage and deletion](#usage-and-deletion)
- [Detach to Inline](#detach-to-inline)
- [Failure and recovery matrix](#failure-and-recovery-matrix)
- [Completion evidence](#completion-evidence)

## Domain and command crosswalk

A JS Template is one Template Entry. A Source Project is its source container and may contain multiple Template Entries.
Never use a Source Project row as a Template row, and never treat Source Project creation alone as “Create JS Template.”

Backend actions and public shell commands are distinct:

| Backend action | Public shell command | Purpose |
| --- | --- | --- |
| `runJSSources:capabilities` | `nb api run-js-sources capabilities -j` | prove the Inline owner matrix and reusable-source capability |
| `jsTemplateProjects:list` | `nb api js-template-projects list -j` | discover manageable Source Projects |
| `jsTemplates:listSelectable` | `nb api js-templates list-selectable -j` | discover compiled Template Entries that can bind to a compatible Host |
| `jsTemplates:get` | `nb api js-templates get --template-id <templateId> -j` | read one Template Entry and its current source/compile metadata |
| `jsTemplates:saveAsJsTemplate` | `nb api js-templates save-as-js-template --body-file /tmp/js-template-save-as.json -j` | atomically save an Inline Workspace as one Template Entry and bind its Host |
| `jsTemplateUsages:listUsages` | `nb api js-template-usages list-usages --body-file /tmp/js-template-usages.json -j` | read one visibility-safe paginated Template Usage list |
| `jsTemplates:detachToInline` | `nb api js-templates detach-to-inline --body-file /tmp/js-template-detach.json -j` | atomically copy current Template source to one Host and detach it |
| `jsTemplates:delete` | `nb api js-templates delete --template-id <templateId> -j` | delete one unreferenced Template Entry |
| `jsTemplateFiles:pull` | `nb js-template pull --project <projectId> --template <templateId> --dir <workspace> --json-output` | materialize a Source Project Head and selected Template locally |
| `jsTemplates:compileWorkspacePreview` | `nb js-template check --dir <workspace> --json-output` | authoritatively validate and compile the complete local working copy |
| `jsTemplateFiles:saveSource` | `nb js-template save --dir <workspace> --message <message> --yes --json-output` | review and save the checked Source Project delta |

`nb js-template` is the only workspace CLI namespace. Run action-level `--help` before first use. Root business
payloads go directly through `--body-file`; never wrap them in `values`. Keep multi-file bodies in JSON files so
newlines, Unicode, quotes, template strings, and nullable Head values remain exact.

## Capability and discovery

Start with the live machine contract:

```bash
nb api run-js-sources capabilities -j
```

Contract version `1` publishes these reusable Template kinds and Source Project destination types:

- entry kinds: `js-block`, `js-page`, `js-field`, `js-action`, `js-item`
- destination types: `existing`, `new`
- required Save as signals: `externalization.available: true`, `externalization.supportsIdempotency: true`
- required Detach signal: `externalization.supportsDetachToInline: true`

Require the current kind, the selected destination type, and the canonical JS Template API actions. Before Detach, also
require the current product capability signal above; false or absent support is a stop condition. Do not silently keep
source Inline when the user requested shared single-maintenance source.

List Source Projects and keep each candidate's exact `id`, lifecycle status, health, and Head:

```bash
nb api js-template-projects list -j
```

List reusable Template Entries, optionally filtered by Source Project and kind:

```bash
nb api js-templates list-selectable -j
nb api js-templates list-selectable --project-id <projectId> --kind <kind> -j
```

Use identity fields from one result row: `projectId`, `templateId`/`id`, and `kind`. Names, titles, source paths,
runtime hashes, and Settings hashes are readback/display evidence, not binding fields. Do not combine a Source Project
from one result with a Template Entry from another.

Use an `existing` destination only when the user selected it, the current Template already belongs to it, or the same
task just created it. Otherwise use `new` with a business-meaningful Source Project name. Source Project selection is
separate from `templateName` and `templateTitle`. Disabled or archived Source Projects cannot receive Save as JS
Template writes.

## Capture one Inline snapshot

Save as JS Template starts from one complete current Inline Workspace. Follow
[runjs-transport.md](./runjs-transport.md), persist the requested source, and then use one `open` or `open-latest`
response. Copy all of these values from that same response:

- exact normalized `data.locator`
- `data.ownerFingerprint`
- generic Inline/VSC `data.repository.repoId` or `data.repository.id`
- `data.repository.headCommitId`, including `null`
- `data.source.runtimeVersion`
- every `data.files` item with exact path, complete content, language, and mode
- current canonical `entryPath`, including the source-format `entry.json` contract
- `data.settingsDescriptor`

Do not rename generic Inline/VSC `repoId`, and do not mix locator, owner fingerprint, repository identity, Head, entry
path, version, or files across responses. If one changes, rebuild the complete request from a fresh response.

The Save as payload is a complete current Workspace, not the changed-path delta used by Inline `save-changes`. Include
all source files, including unsaved editor content selected for the operation. Copy server-managed
`.nocobase/runjs-source.json` unchanged when it appears in the opened file list; the Save as service removes or derives
managed metadata during conversion. Never edit, delete, or synthesize a managed file.

## Save as JS Template

`idempotencyKey` is required, non-empty, and at most 255 characters. Derive it deterministically from the complete
semantic request, excluding only the key. Store the exact body with the key. Reuse the key only after an ambiguous
transport result or in-progress response when the complete request is equivalent.

Changing the Host/locator, source snapshot, owner fingerprint, Source Project choice, Template name/title, origin
binding, or any file requires a new key. Reusing a key with a different request returns
`JS_TEMPLATE_IDEMPOTENCY_CONFLICT`; do not disguise a changed request as a retry.

Replace the complete sample `locator` value below with the exact `data.locator` object from one current Inline open.
Do not select or construct its fields individually. Replace every other source placeholder from that same response.

## Canonical Save as request

```json
{
  "idempotencyKey": "save-as-js-template-v1-sha256-of-the-complete-request",
  "locator": {},
  "expectedOwnerFingerprint": "ownerFingerprint-from-the-same-open-response",
  "sourceRepoId": "repository.repoId-or-id-from-the-same-open-response",
  "sourceHeadCommitId": "repository.headCommitId-from-the-same-open-response",
  "entryPath": "src/client/index.tsx",
  "version": "v2",
  "files": [
    {
      "path": "src/client/index.tsx",
      "content": "import { Summary } from './Summary';\nctx.render(<Summary />);\n",
      "language": "typescriptreact",
      "mode": "100644"
    },
    {
      "path": "src/client/Summary.tsx",
      "content": "export function Summary() {\n  return <div>Summary</div>;\n}\n",
      "language": "typescriptreact",
      "mode": "100644"
    },
    {
      "path": "src/client/entry.json",
      "content": "{\n  \"key\": \"inline-source\",\n  \"settingsSchema\": { \"type\": \"object\", \"properties\": {} }\n}\n",
      "language": "json",
      "mode": "100644"
    },
    {
      "path": ".nocobase/runjs-source.json",
      "content": "managed-content-copied-unchanged-from-open",
      "language": "json",
      "mode": "100644"
    }
  ],
  "destination": {},
  "templateName": "sales-summary",
  "templateTitle": "Sales summary"
}
```

For an existing Source Project, use only:

```json
{
  "type": "existing",
  "projectId": "project-id-selected-from-js-template-projects-list"
}
```

For a new Source Project, use only:

```json
{
  "type": "new",
  "name": "sales-tools",
  "title": "Sales tools",
  "description": "Reusable sales surfaces"
}
```

Insert exactly one destination object, derive the required key from the completed request, write it to
`/tmp/js-template-save-as.json`, and run:

```bash
nb api js-templates save-as-js-template --body-file /tmp/js-template-save-as.json -j
```

An optional `originBinding`, when supplied by the current source flow, must itself contain exactly `type`, `projectId`,
`templateId`, and `kind`. It never carries display fields.

## Record the durable result

HTTP 200 means the complete destination compiled, Source Project source and artifacts were published, one Template
Entry exists, and the Host binding and Usage were updated atomically. Record the one result's:

- `data.project.id`, name/title, lifecycle status, and `headCommitId`
- `data.template.id`, `templateName`, kind, `entryPath`, compiled commit, runtime/artifact hashes, Settings hashes, and diagnostics
- `data.ownerFingerprint`
- exact binding, which must contain only:

```json
{
  "type": "js-template-entry",
  "projectId": "data.binding.projectId",
  "templateId": "data.binding.templateId",
  "kind": "data.binding.kind"
}
```

Read the Template Entry back with `js-templates get`, then read the Host. The Host must have
`sourceMode: "js-template"` and the exact four-field binding above. Do not add Source Project/Template names, titles,
paths, or keys to persisted binding data.

A completed equivalent replay returns the same durable Project, Template, binding, and owner fingerprint without
creating another Template Entry. A failed compile, validation, permission, CAS, or conflict check leaves Source Project
Head, Template, Artifact, Usage, and Host state unchanged.

## Source Project edit loop

Subsequent shared-source edits use the canonical local workspace CLI:

```bash
nb js-template pull --project <projectId> --template <templateId> --dir /tmp/js-template-sales-summary --json-output
nb js-template check --dir /tmp/js-template-sales-summary --json-output
nb js-template save --dir /tmp/js-template-sales-summary --message "Update sales summary" --yes --json-output
```

Pull refuses to overwrite local source changes. Record the pulled Project/Template identity, `baseHeadCommitId`, tree
hash, and file list. `.nocobase/js-template-state.json`, `.nocobase/js-template-baseline`, `.js-template/types`, and
`node_modules` are local/generated metadata, not Source Project source.

Check validates the complete current working copy. HTTP 207 or 422 is a stop condition: repair diagnostics and check the
new snapshot. Do not Save after a rejected/partial check or after another local edit invalidates the accepted snapshot.

Save displays the accepted `snapshotId`, `baseHeadCommitId`, changed-file counts, additions, deletions, and diff. It
sends only the reviewed delta with the unchanged `expectedHeadCommitId`; omitted Source Project paths remain unchanged
and deletion is explicit. Success advances the Source Project Head and affected Template artifacts together, then
invalidates the previous check marker. No local changes is a verified no-op, not permission to create an empty commit.

On stale Head, keep the local patch, pull the new Head into a clean workspace, reapply intended changes path by path,
check again, and review again. Never edit CLI state or replace only `expectedHeadCommitId`.

Near Save, surface a localized non-blocking impact message based on current effective Usage count: all N locations use
the new code immediately after success. Do not add a publish confirmation, Draft/Publish, Version, Pin, or Release flow.

## Keep Inline and Source Project CAS separate

Inline `runJSSources:saveChanges` and Source Project `jsTemplateFiles:saveSource` are separate protocols:

| Contract | Inline `saveChanges` | Source Project `saveSource` through `nb js-template save` |
| --- | --- | --- |
| Identity | generic VSC `repoId` plus Host locator | `projectId` plus selected `templateId` in local state |
| Candidate | server materializes base plus changed paths | Check validates the complete local working copy; Save submits reviewed delta |
| Base CAS | `baseCommitId` and `baseOwnerFingerprint` from one open | `expectedHeadCommitId` from one pull |
| Per-path CAS | `expectedBlobHash` for each existing changed path | Source Project Head protects the delta |
| Change list | `changes` | `files` with explicit upsert/delete operations |
| Managed metadata | omit every `managed: true` path; server derives the manifest | omit CLI state/baseline/generated paths |

Inline save has no `expectedHeadCommitId`. Source Project save has no `baseCommitId`, `baseOwnerFingerprint`,
`expectedBlobHash`, or `changes`. Preserve the generic VSC/Git `Repository`, `Commit`, `Tree`, `Blob`, `GitRemote`, and
`repoId` vocabulary only where that infrastructure actually owns it.

## Usage and deletion

Read one Template Entry's paginated Usage locations with:

```json
{
  "templateId": "template-id",
  "page": 1,
  "pageSize": 20
}
```

```bash
nb api js-template-usages list-usages --body-file /tmp/js-template-usages.json -j
```

`data.data` contains only visible effective owner locations. `data.meta.effectiveCount` includes visible and hidden
effective owners, `hiddenCount` exposes only an aggregate, and `owner_missing` is excluded from counts and rows. Never
infer or disclose hidden owner descriptors. Disabled/archived resolution remains visible through safe status rather than
being treated as missing ownership.

Delete one Template Entry only through the authoritative action:

```bash
nb api js-templates delete --template-id <templateId> -j
```

`JS_TEMPLATE_USAGE_EXISTS` means at least one effective Usage still protects the Template. Do not work around it or
delete the Source Project. Detach or otherwise remove every effective Usage, re-read the count, and retry. Successful
deletion removes only that Template's source and unreferenced artifacts. Archived Source Projects remain read-only, and
Source Project deletion protection is a separate operation.

## Detach to Inline

Detach starts from the currently bound Host and the current Source Project Head. Re-read the Host and require this exact
binding identity: `type`, `projectId`, `templateId`, and `kind`. Then pull the current Project/Template into a clean
workspace and record its `baseHeadCommitId`.

Build the complete reachable file set for that Template Entry: current entry file, its `entry.json`, all relative imports
under the Template directory, and reachable shared source. Preserve the generic source-format `entryPath`/`entryKey`
semantics; do not put them into the Host binding.

Replace the complete sample `locator` value with the exact canonical locator from the current Host:

```json
{
  "idempotencyKey": "detach-to-inline-v1-sha256-of-the-complete-request",
  "locator": {},
  "projectId": "project-id-from-current-binding",
  "templateId": "template-id-from-current-binding",
  "expectedProjectHeadCommitId": "baseHeadCommitId-from-current-pull",
  "entryPath": "src/client/js-blocks/sales-summary/index.tsx",
  "kind": "js-block",
  "version": "current-template-runtime-version",
  "files": [
    {
      "path": "src/client/js-blocks/sales-summary/index.tsx",
      "content": "import { Summary } from './Summary';\nctx.render(<Summary />);\n",
      "language": "typescriptreact",
      "mode": "100644"
    },
    {
      "path": "src/client/js-blocks/sales-summary/Summary.tsx",
      "content": "export function Summary() {\n  return <div>Summary</div>;\n}\n",
      "language": "typescriptreact",
      "mode": "100644"
    },
    {
      "path": "src/client/js-blocks/sales-summary/entry.json",
      "content": "{\n  \"key\": \"sales-summary\",\n  \"settingsSchema\": { \"type\": \"object\", \"properties\": {} }\n}\n",
      "language": "json",
      "mode": "100644"
    }
  ]
}
```

Derive the key from the complete request excluding only the key, store the exact body, and run:

```bash
nb api js-templates detach-to-inline --body-file /tmp/js-template-detach.json -j
```

The server validates `expectedProjectHeadCommitId` inside the same operation that copies source, clears the binding, and
updates Usage. A stale Project Head returns 409 `JS_TEMPLATE_SOURCE_OUTDATED`; do not refresh only the Head field. Pull
again, rebuild the reachable source and every request field, then derive a new key.

Equivalent retries return the first `runJSRepoId`, `commitId`, `ownerFingerprint`, `filesHash`, and `sourceRef`.
Conflicting key reuse returns `JS_TEMPLATE_IDEMPOTENCY_CONFLICT`. Success changes only the selected Host to Inline and
removes only its Usage; other Host bindings/settings and the Source Project, Template, Head, history, and remaining
Usages stay intact.

## Failure and recovery matrix

Classify by action, HTTP status, and `errors[].code`; status alone is insufficient.

| Result | Required handling and atomicity guarantee |
| --- | --- |
| 400 `JS_TEMPLATE_INVALID_INPUT` | Correct the canonical root payload. No source or binding state advances. |
| 403 `JS_TEMPLATE_PERMISSION_DENIED` | Stop and report the missing Host, Template, Source Project, or Usage permission without changing role. |
| 404 `JS_TEMPLATE_PROJECT_NOT_FOUND` / `JS_TEMPLATE_NOT_FOUND` | Re-run discovery/current Host readback and correct the selected identity. |
| 409 `JS_TEMPLATE_PROJECT_DISABLED` / `JS_TEMPLATE_PROJECT_ARCHIVED` | Stop; do not force a Save as or source write. |
| 409 `JS_TEMPLATE_BINDING_OUTDATED` | Re-read the Host and rebuild the entire operation; do not replace only binding values. |
| 409 `JS_TEMPLATE_SOURCE_OUTDATED` during Save as | Run one fresh Inline `open-latest`, rebuild all source evidence and derive a new key. |
| 409 `JS_TEMPLATE_SOURCE_OUTDATED` during Detach | Pull the current Source Project Head, rebuild the reachable files/request, and derive a new key. No Host, Usage, source, Head, or Artifact state changes. |
| 409 `JS_TEMPLATE_CONFLICT` / `JS_TEMPLATE_PROJECT_CONFLICT` | Re-run discovery and choose a non-conflicting user-approved Source Project/Template identity; this is a new request/key. |
| 409 `JS_TEMPLATE_IDEMPOTENCY_IN_PROGRESS` | Retry the exact stored request with the same key after a bounded wait. |
| 409 `JS_TEMPLATE_IDEMPOTENCY_CONFLICT` | Stop: recover the original request or create a genuinely new request/key. |
| 409 `JS_TEMPLATE_USAGE_EXISTS` | Keep the Template. Remove effective Usages through supported owner operations, re-read count, then retry delete. |
| `nb js-template check` HTTP 207 or 422 | Repair diagnostics and Check again. No Source Project Head or Artifact advances. |
| `nb js-template save` stale Head | Preserve the patch, pull cleanly, reapply by path, Check, and review again. |
| 422 `JS_TEMPLATE_VALIDATION_FAILED` / `JS_TEMPLATE_SETTINGS_INVALID` | Repair the complete candidate. No Head, Template, Artifact, Host binding, or Usage state advances. |
| no local source changes | Verify latest state and report no-op/already current; do not create an empty commit. |

## Completion evidence

A complete handoff records:

- capability contract version, supported Template kind/destination, and canonical actions
- Source Project id/name, lifecycle, old/new Head, source commit id/message, and tree hash/size
- Template id/name/title/kind, stable `entry.json.key`, source `entryPath`, compiled commit, hashes, and diagnostics
- exact four-field Host binding plus post-write owner fingerprint
- Template-level effective Usage count, visible paginated locations, and hidden aggregate without hidden details
- independent Host Settings overrides and the save impact count
- accepted Check snapshot and reviewed Source Project delta for source edits
- Detach idempotency and Project Head CAS evidence, plus the resulting Inline commit/source reference
- deletion conflict/success evidence when deletion is in scope
- any remaining failure or partial intent

API/CLI evidence is not rendered-browser evidence. Unless a real browser verification ran in the task, state that
browser rendering remains unverified.
