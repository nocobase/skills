# Light Extension public transport

This file is the canonical transport contract for reusable Light Extension source. Use only `nb`
commands as the public transport. Do not call internal services, write database rows, or substitute raw HTTP requests.
Ordinary Inline Workspace authoring stays on [runjs-transport.md](./runjs-transport.md); Light Extension routing follows
the business reuse, single-maintenance, Git ownership, and distribution intents in [light-extension-source.md](./light-extension-source.md).

## Contents

- [Capability and command crosswalk](#capability-and-command-crosswalk)
- [Discovery](#discovery)
- [Capture one Inline source snapshot](#capture-one-inline-source-snapshot)
- [Externalize with a stable request](#externalize-with-a-stable-request)
- [Canonical moveSource request](#canonical-movesource-request)
- [Existing destination](#existing-destination)
- [New destination](#new-destination)
- [Record externalization evidence](#record-externalization-evidence)
- [Repository edit loop](#repository-edit-loop)
- [Do not mix the two CAS protocols](#do-not-mix-the-two-cas-protocols)
- [Move the current Entry back Inline](#move-the-current-entry-back-inline)
- [Failure and recovery matrix](#failure-and-recovery-matrix)
- [Completion evidence](#completion-evidence)

## Capability and command crosswalk

Start with the machine contract and require `externalization.available=true`. Also require the current Entry kind and
destination type to appear in the returned contract. For move-back, require `supportsMoveToInline=true`; both move
directions also require `supportsIdempotency=true`.

```bash
nb api run-js-sources capabilities -j
```

If those signals are unavailable or false, stop and report the missing Light Extension capability. Do not silently
keep the source Inline when the user requested reuse, single maintenance, Git ownership, or distribution.

Backend actions and public shell commands are distinct:

| Backend action | Public shell command | Purpose |
| --- | --- | --- |
| `runJSSources:capabilities` | `nb api run-js-sources capabilities -j` | prove externalization and move-back availability |
| `lightExtensionRepos:list` | `nb api light-extension-repos list -j` | discover existing destination Repositories |
| `lightExtensionEntries:listSelectable` | `nb api light-extension-entries list-selectable -j` | discover reusable Entry binding identities |
| `lightExtensions:moveSource` | `nb api light-extensions move-source --body-file /tmp/light-move-source.json -j` | atomically externalize one Inline Host |
| `lightExtensionEntries:get` | `nb api light-extension-entries get --entry-id <entryId> -j` | read the current Entry identity and compile metadata |
| `lightExtensionReferences:readReferences` | `nb api light-extension-references read-references --body-file /tmp/light-reference-read.json -j` | verify the Host-to-Entry reference |
| `lightExtensionFiles:pull` | `nb light pull --repo <repoId> --entry <entryId> --dir <workspace> --json-output` | materialize the current Repository Head and Entry locally |
| `lightExtensions:compileWorkspacePreview` | `nb light check --dir <workspace> --json-output` | check the complete current local Repository workspace |
| `lightExtensionFiles:saveSource` | `nb light save --dir <workspace> --message <message> --yes --json-output` | review and save the generated source delta |
| `lightExtensions:moveToInline` | `nb api light-extensions move-to-inline --body-file /tmp/light-move-inline.json -j` | atomically move the bound Entry back Inline |

Run action-level `--help` before first use. Request bodies below are root business payloads and are never wrapped in
`values`. Keep multi-file bodies in JSON files and use `--body-file`; do not embed a large JSON object in the shell.

## Discovery

List destination Repositories and record each candidate's `id`, lifecycle status, health, and current Head:

```bash
nb api light-extension-repos list -j
```

List reusable compiled Entries. The unfiltered form is:

```bash
nb api light-extension-entries list-selectable -j
```

Optional `--repo-id <repoId>` and `--kind <kind>` filters narrow the result. A reusable binding identity needs the
same result row's `repoId`, `id` as `entryId`, `kind`, `entryName`, and `entryPath`. Keep its settings schema/default
hashes and runtime hashes as readback evidence. Do not combine the Repository from one row with the Entry from another.

Use `existing` only when the Entry already belongs to that Repository, the user explicitly selected it, or the same task
just created it; use its exact id. Otherwise use `new` with a business-meaningful name, title, and description. Never
choose an unrelated item from the Repository list and never emit a Default destination.

## Capture one Inline source snapshot

Externalization starts from one complete, persisted Inline Workspace response. Follow
[runjs-transport.md](./runjs-transport.md) to create or locate the Host, save the requested Inline source, and then run
one `open` or `open-latest`. Copy all of these values from that same response:

- canonical `data.locator`
- `data.ownerFingerprint`
- `data.repository.repoId` or `data.repository.id`
- `data.repository.headCommitId`, including `null` when that exact response returns it
- `data.source.runtimeVersion`
- every `data.files` item with its exact path, complete content, language, and mode
- the server-managed `.nocobase/runjs-source.json` from that file list; its `entry` is the canonical request
  `entryPath`, and its `runtimeVersion` must agree with `data.source.runtimeVersion`
- `data.settingsDescriptor`, including schema, defaults, hashes, and diagnostics

Never mix locator, owner fingerprint, Repository id/Head, entry path/version, or files across responses. If any value
changes after `open-latest`, rebuild the whole move request from the new response. Do not refresh only the stale token.

The move payload is a complete snapshot, not the changed-path delta used by Inline `save-changes`. Include all source
files returned by that open, not only the entry file or recently edited files. A file marked `managed: true` is
server-owned: copy its returned content unchanged when constructing the complete move snapshot, but never edit, delete,
or synthesize it. The move service filters or regenerates managed metadata such as `.nocobase/runjs-source.json`.

## Externalize with a stable request

Derive `idempotencyKey` deterministically from the complete semantic request, excluding only the key itself. Its input
must cover the canonical locator, expected owner fingerprint, source Repository and Head, entry path/version, every
file path and complete content, optional origin binding, destination, Entry name, and Entry title. Store the exact body
with the key. Reuse that key only to replay the byte-for-byte equivalent semantic request after an ambiguous transport
result or an in-progress response.

Changing the destination, Host/locator, Entry name/title, source Head, source files, version, owner fingerprint, or
origin binding creates a different request and requires a new key. Reusing one key with a different request returns an
idempotency conflict; never work around that conflict by changing only the key while pretending it is the same move.

Replace the entire sample `locator` object below with the exact normalized `data.locator` object from one current Inline
`open`/`open-latest` response; never fill, remove, or construct its fields individually. Replace every other evidence
placeholder from that same response. The sample file contents are illustrative; the real request must contain the complete
opened Workspace.

## Canonical moveSource request

Keep one canonical common body and replace only `destination` with one of the two fragments below:

```json
{
  "idempotencyKey": "move-source-v1-sha256-of-the-complete-request",
  "locator": {
    "kind": "flowModel.step",
    "modelUid": "modelUid-from-one-open-response",
    "flowKey": "flowKey-from-the-same-open-response",
    "stepKey": "stepKey-from-the-same-open-response",
    "paramPath": ["paramPath", "from", "the-same-open-response"]
  },
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
      "content": "{\n  \"key\": \"sales-summary\",\n  \"settingsSchema\": { \"type\": \"object\", \"properties\": {} }\n}\n",
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
  "entryName": "sales-summary",
  "entryTitle": "Sales summary"
}
```

## Existing destination

Use this only for the Entry's current Repository, a user-selected Repository, or one created earlier in the same task:

```json
{
  "type": "existing",
  "repoId": "repoId-selected-from-light-extension-repos-list"
}
```

## New destination

Use this for every first move without an explicit or already-known Repository. Derive a business-meaningful identity from
the implementation purpose; do not select an arbitrary existing Repository:

```json
{
  "type": "new",
  "name": "sales-tools",
  "title": "Sales tools",
  "description": "Reusable sales surfaces"
}
```

Write the completed common body to `/tmp/light-move-source.json`, insert exactly one destination fragment, derive the key
from that complete request, and run:

```bash
nb api light-extensions move-source --body-file /tmp/light-move-source.json -j
```

## Record externalization evidence

HTTP 200 means source validation, destination compilation, source publication, Host binding, and reference update
completed atomically. Record these values from the one success response:

- `data.repo.id`, name, lifecycle status, and `headCommitId`
- `data.entry.id`, `entryName`, `entryPath`, kind, compiled commit/runtime hashes, and diagnostics
- `data.binding`, especially type, `repoId`, `entryId`, `entryName`, `entryPath`, and kind
- `data.ownerFingerprint`

Read the persisted Entry and its reference through public transport:

```bash
nb api light-extension-entries get --entry-id <entryId> -j
```

Read references by the exact Repository and Entry identity from the move result. Do not reuse the RunJS source locator as
a `LightExtensionReferenceOwnerLocator`; reference owner kinds have a different public schema.

```json
{
  "repoId": "repoId-from-move-success",
  "entryId": "entryId-from-move-success"
}
```

```bash
nb api light-extension-references read-references --body-file /tmp/light-reference-read.json -j
```

A failed move does not change Host source mode/binding, source or destination Head, Entry, artifact, or reference state.
Never report partial externalization merely because a Repository or Entry was observed after a failed request.

## Repository edit loop

Use the local CLI workflow for subsequent source edits. It preserves the pulled baseline, validates the complete local
Workspace, shows the reviewed delta, and submits `expectedHeadCommitId` for Repository Head CAS.

```bash
nb light pull --repo <repoId> --entry <entryId> --dir /tmp/light-sales-summary --json-output
```

Record the pulled Repository id, Entry id/name/path/kind, `baseHeadCommitId`, tree hash, and file list. The CLI-owned
`.nocobase` baseline/state and `.light-extension/types` files are local metadata, not Repository source. Do not edit or
add them to the save delta. Edit only intended source files, including `entry.json` when changing the Entry Settings
descriptor.

Check the complete current workspace after the last local source change:

```bash
nb light check --dir /tmp/light-sales-summary --json-output
```

Continue only when the check returns an accepted snapshot. HTTP 207 means only part of the complete workspace was
accepted; HTTP 422 means it was rejected. Both are stop conditions: inspect diagnostics, repair the complete candidate,
and rerun `check`. Never run `save` after a 207/422 result or after another local file change invalidates the checked
snapshot.

Save only the reviewed delta generated against that same pull/check snapshot:

```bash
nb light save --dir /tmp/light-sales-summary --message "Update sales summary" --yes --json-output
```

Before confirmation, inspect the CLI review's `snapshotId`, `baseHeadCommitId`, changed-file counts, additions,
deletions, and diff. The resulting `saveSource` request uses the pulled `expectedHeadCommitId` and a `files` delta:
omitted Repository paths stay unchanged and deletion is explicit. On success record the new Head/commit id, tree hash,
compile status/entries, diagnostics, and delta summary. The successful save clears the old check marker, so a later edit
requires a new `check`.

If there are no local source changes, `nb light save` stops before the API call. Verify current local and remote state,
then report a no-op/already-current result; do not manufacture a source commit.

## Do not mix the two CAS protocols

Inline `runJSSources:saveChanges` and Repository `lightExtensionFiles:saveSource` are different transports:

| Contract | Inline `saveChanges` | Repository `saveSource` through `nb light save` |
| --- | --- | --- |
| Candidate construction | server materializes the complete candidate from the base plus changed paths | `nb light check` validates the complete local workspace; save submits the reviewed delta |
| Base CAS | `repoId`, `baseCommitId`, and `baseOwnerFingerprint` from one open | `expectedHeadCommitId` from one pull |
| Per-path CAS | `expectedBlobHash` for each changed existing path | no Inline blob-CAS fields; the Repository Head protects the delta |
| Change list | `changes` | `files` with explicit upsert/delete operations |
| Managed metadata | omit every `managed: true` path from `changes`; server derives the manifest | omit CLI `.nocobase`/generated local metadata; save only reviewed Repository source paths |

Inline `saveChanges` has no `expectedHeadCommitId`. Repository `saveSource` has no `baseCommitId`,
`baseOwnerFingerprint`, `expectedBlobHash`, or `changes`. Never copy fields, snapshot semantics, or conflict recovery from
one request into the other.

## Move the current Entry back Inline

Move-back uses the current bound Host and current reachable Entry source, not an old externalization request. First
re-read the Host to obtain its canonical locator and current binding. Confirm the binding's `repoId`, `entryId`, and
kind against `light-extension-entries get`, then pull the current Repository Head into a clean directory:

```bash
nb light pull --repo <repoId> --entry <entryId> --dir /tmp/light-move-back --json-output
```

Build the complete reachable file set from that pull: include the current Entry file, its `entry.json`, every relative
import reachable under the Entry directory, and every reachable shared source file. Do not use an older pull or omit a
transitive relative import. Copy each path, complete content, language, and mode into `/tmp/light-move-inline.json`.
Replace the entire sample `locator` object with the exact canonical locator from the current bound Host; never construct
it field-by-field:

```json
{
  "idempotencyKey": "move-to-inline-v1-sha256-of-the-complete-request",
  "locator": {
    "kind": "flowModel.step",
    "modelUid": "modelUid-from-the-current-bound-Host",
    "flowKey": "flowKey-from-the-current-bound-Host",
    "stepKey": "stepKey-from-the-current-bound-Host",
    "paramPath": ["paramPath", "from", "the-current-bound-Host"]
  },
  "repoId": "repoId-from-the-current-binding",
  "entryId": "entryId-from-the-current-binding",
  "entryPath": "src/client/js-blocks/sales-summary/index.tsx",
  "kind": "js-block",
  "version": "current-Entry-runtime-version",
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

```bash
nb api light-extensions move-to-inline --body-file /tmp/light-move-inline.json -j
```

Derive the required `idempotencyKey` from the complete move-to-inline request excluding only the key, and store the exact
body with it. Reuse the key only when the entire request is unchanged, after an ambiguous transport result or in-progress
response. Any body change requires a new key, including locator, Repository/Entry identity, Entry path, kind, version, or files.

On HTTP 200 record `data.runJSRepoId`, `data.commitId`, `data.ownerFingerprint`, `data.code`, `data.version`,
`data.entryPath`, optional `data.filesHash`, and `data.sourceRef`. A completed replay returns the same first
`runJSRepoId`, `commitId`, `ownerFingerprint`, and `sourceRef` even after the Host is already Inline, while rechecking
current Host, Repository, Entry, and RunJS Repository permissions. Re-read the Host/reference and verify Inline source
mode, the absence of the old binding/reference for that Host, and the new RunJS commit/owner evidence. A failed compile,
conflict, or permission check leaves the Host binding/reference and both source stores unchanged.

Idempotency does not make the server fetch or lock the latest Light Extension Head. `moveToInline` adds no expected
Repository Head, Entry compiled commit, Entry version, or files-hash CAS input; the caller must still re-read/pull the
current Entry and construct the complete reachable file set before the first request.

## Failure and recovery matrix

Classify failures by action, HTTP status, and `errors[].code`; status alone is insufficient.

| Result | Required handling and persistence guarantee |
| --- | --- |
| 400 invalid locator, destination, Entry name, reachable files, or malformed root body | Correct the request. No move or save state is committed. |
| 403 or `LIGHT_EXTENSION_PERMISSION_DENIED` | Stop and report the missing Host/Repository/Entry permission. Never retry with a different role unless the user authorized it. |
| 404 or `LIGHT_EXTENSION_REPO_NOT_FOUND` / `LIGHT_EXTENSION_ENTRY_NOT_FOUND` | Re-run discovery and current Host readback. Correct the selected identity; do not classify it as capability absence. |
| archived/disabled Repository (`LIGHT_EXTENSION_REPO_ARCHIVED` / `LIGHT_EXTENSION_REPO_DISABLED`) | Stop or select another user-approved destination. Do not force a write to that Repository. |
| `moveSource` 409 + `LIGHT_EXTENSION_BINDING_OUTDATED` | Run one fresh Inline `open-latest`, rebuild every request field/file and derive a new key. Never replace only the owner fingerprint. |
| `moveSource` 409 + `LIGHT_EXTENSION_SOURCE_OUTDATED` | Run one fresh Inline `open-latest`, rebuild the complete snapshot and derive a new key. Never replace only the Head. |
| `moveSource` 409 + `LIGHT_EXTENSION_ENTRY_CONFLICT` / `LIGHT_EXTENSION_REPO_CONFLICT` | Re-run discovery and ask for or derive a non-conflicting user-approved Repository/Entry identity; this is a different request and needs a new key. |
| either move 409 + `LIGHT_EXTENSION_IDEMPOTENCY_IN_PROGRESS` | Retry the exact stored request with the same key after a bounded wait. |
| either move 409 + `LIGHT_EXTENSION_IDEMPOTENCY_CONFLICT` | Stop: the key was used for a different semantic request. Recover the stored request or create a genuinely new request/key. |
| `nb light check` HTTP 207 or 422 | Stop before save, repair diagnostics, and check the new complete snapshot. No Repository Head is advanced. |
| `nb light save` 409 stale Head | Preserve the reviewed patch outside the dirty target, pull the new Head into a clean workspace, reapply the intended changes path-by-path, then check and review again. Do not edit CLI state or replace only `expectedHeadCommitId`. |
| validation, Settings, or compile failure (`LIGHT_EXTENSION_VALIDATION_FAILED` / `LIGHT_EXTENSION_SETTINGS_INVALID`) | Repair the complete candidate. No Head, commit, tree, artifact, Host binding, or reference state is advanced. |
| `nb light save` reports no changes | Verify latest state and report no-op/already current. Do not create an empty commit. |

`nb light pull` refuses to overwrite dirty local changes. After a stale-Head conflict, preserve the reviewed patch or
workspace, use a clean directory for the new pull, and intentionally reapply it. Never delete the only copy of local
work or mutate `.nocobase` state to bypass the conflict.

## Completion evidence

A complete handoff records evidence, not just command exit codes:

- capability contract version, supported Entry kind/destination, idempotency support, and move-back support
- Repository id/name plus old and new Head, source commit id/message, and tree hash/size
- Entry stable `entry.json.key`/`entryName`, persisted id, kind, Entry path, compiled version/hashes, and diagnostics
- exact Host binding and post-write owner fingerprint
- reference readback tying the owner locator to the Repository/Entry, or proving removal after move-back
- Settings descriptor schema and defaults plus their hashes, the separate Host-local override, and the resolved/effective
  settings used for runtime verification; do not overwrite source defaults with a Host override
- reviewed delta summary and the accepted complete-workspace check snapshot for Repository edits
- explicit statement of any remaining failure, partial intent, or fallback

API/CLI evidence is not rendered-browser evidence. Unless a real browser verification was performed in this task,
state explicitly that browser verification remains unperformed; never imply visual/runtime success from transport
responses alone.
