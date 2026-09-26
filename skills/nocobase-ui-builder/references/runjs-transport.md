# Inline RunJS Workspace transport

This file is the canonical transport contract for ordinary Inline RunJS Workspaces. Host actions create or read the
surface; the Host response supplies the canonical `data.runJSLocator`. Copy that object unchanged into `open`. After
`open` or `open-latest`, copy that response's normalized `data.locator` unchanged into subsequent requests based on the
same snapshot. Do not construct either locator from `modelUid` or other Host fields.

The backend action names and shell commands are distinct:

| Backend action | Shell command | Agent role |
| --- | --- | --- |
| `runJSSources:capabilities` | `nb api run-js-sources capabilities -j` | read the versioned owner/model-use and transport capability contract before first complete authoring |
| `runJSSources:open` | `nb api run-js-sources open` | open the current Workspace and collect CAS/file evidence |
| `runJSSources:openLatest` | `nb api run-js-sources open-latest` | recover after file, base, or owner conflicts |
| `runJSSources:saveChanges` | `nb api run-js-sources save-changes` | default Agent save; send changed paths only |
| `runJSSources:compilePreview` | `nb api run-js-sources compile-preview` | optional dry-run, debugging, or Studio interaction |

The legacy `runJSSources:save` / `nb api run-js-sources save` action remains a complete-replacement compatibility API
for existing Studio/import callers. It is not the ordinary Agent route.

Run action-level `--help` before first use. Put each root request object in a JSON file and pass `--body-file`; do not
wrap it in `values`. Multi-file source must not be embedded in a shell JSON string because newlines, quotes, Unicode,
and template strings are easy to corrupt.

## Open

Write `/tmp/runjs-open.json` by serializing one root object whose `locator` value is the exact
`data.runJSLocator` object returned by Host create/get. Do not select fields, rename keys, merge another response, or
type a locator-shaped object by hand.

For a recognized but uninitialized owner, the optional `initialSource` is `{ "code": "...", "version": "v2" }`.
Then run:

```bash
nb api run-js-sources open --body-file /tmp/runjs-open.json
```

Record these values from the response before editing:

- `data.locator`
- `data.ownerFingerprint`
- `data.repository.repoId` (or `data.repository.id`) and `data.repository.headCommitId`
- `data.files`, including every file's `path`, complete `content`, stable `blobHash`, `size`, and `managed` flag
- `data.settingsDescriptor`
- `data.permissions`, especially `canRead`, `canWrite`, and `canSave`

Use only `data.locator` in subsequent requests. Preserve the opened file contents and hashes as the `original` side if
conflict recovery is later required. A file with `managed: true` is server-owned and must not be placed in Agent changes.
In particular, `.nocobase/runjs-source.json` is the server-managed manifest: do not upload, edit, or delete it.

## Open latest

`open-latest` takes the same root `{ locator, initialSource? }` body. It reads the latest owner-aware Workspace without
the normal owner consistency rejection and is the recovery read after a file, base, or owner conflict:

```bash
nb api run-js-sources open-latest --body-file /tmp/runjs-open.json
```

Its success response has the same shape as `open`. Record a fresh locator, owner fingerprint, repository id, Head,
files and their blob hashes, settings descriptor, and permissions from this single response. A virtual result may have
an empty repository id and `headCommitId: null` when no persisted Workspace exists.

## Save changed paths

Create `/tmp/runjs-save-changes.json` from the files actually changed since `open`. Set its `locator` to the exact
`data.locator` object returned by that same `open` response. The rest of the root body has this shape:

```json
{
  "repoId": "repository.repoId-or-id",
  "baseCommitId": "repository.headCommitId-or-null",
  "baseOwnerFingerprint": "ownerFingerprint-from-the-same-open-response",
  "message": "Implement the requested JS surface",
  "changes": [
    {
      "operation": "upsert",
      "path": "src/client/components/OrderTable.tsx",
      "expectedBlobHash": "blobHash-from-open",
      "content": "complete UTF-8 content for this changed file"
    },
    {
      "operation": "upsert",
      "path": "src/client/components/NewSummary.tsx",
      "expectedBlobHash": null,
      "content": "complete UTF-8 content for this new file"
    },
    {
      "operation": "delete",
      "path": "src/client/components/Unused.tsx",
      "expectedBlobHash": "blobHash-from-open"
    }
  ],
  "entryPath": "src/client/index.tsx",
  "version": "v2"
}
```

The shown JSON fragment omits `locator` only to prevent hand-shaped examples; the transmitted root object must include
the exact serialized `data.locator`. `locator`, `repoId`, `baseCommitId`, `baseOwnerFingerprint`, `message`, and a
non-empty `changes` array are required.
`entryPath` and `version` are optional only when the server can resolve them. Both CAS tokens must come from the same
`open` or `open-latest` response. Inline save has no `expectedHeadCommitId` field.

```bash
nb api run-js-sources save-changes --body-file /tmp/runjs-save-changes.json
```

Incremental semantics are strict:

- a path omitted from `changes` remains unchanged
- deletion requires an explicit `operation: "delete"`
- an upsert sends the complete content of that changed file only
- updating or deleting an existing file uses the `expectedBlobHash` returned by `open` / `open-latest`
- creating a new file uses `expectedBlobHash: null`, and the path must not already exist
- do not include `.nocobase/runjs-source.json` or any other `managed: true` file
- the server derives the manifest update from the base manifest, `entryPath`, `version`, surface style, and candidate paths

The server materializes the complete candidate from the base tree, changed paths, and its managed manifest, then runs
all path, size, Settings descriptor, import, TypeScript, and RunJS compile checks. The Agent sends source once. Successful
HTTP 200 returns the new `data.repository`, `data.commit`, `data.artifact`, `data.ownerFingerprint`, and
`data.writeResult`. Read the new repository Head and owner fingerprint before any subsequent edit.

## Optional compile preview

`nb api run-js-sources compile-preview --body-file <file>` remains available for an explicit dry-run, debugging, or an
existing Studio interaction. It is not a required predecessor to `save-changes`; the save itself is the full-candidate
compile and atomic commit gate. If preview is deliberately used, inspect `data.artifact.diagnostics` and treat any
diagnostic with `severity: "error"` as failure.

## Error recovery matrix

Classify failures by action, HTTP status, and `errors[].code`; status alone is insufficient.

| Action and result | Required handling |
| --- | --- |
| `save-changes` + compile diagnostics or 400 + `RUNJS_COMPILE_FAILED`, `RUNJS_IMPORT_NOT_ALLOWED`, `RUNJS_IMPORT_NOT_FOUND`, or `RUNJS_DYNAMIC_IMPORT_UNSUPPORTED` | No Head, tree, artifact, Host, or owner state was committed. Repair the changed files and retry against the same unchanged base. |
| Any RunJS action + 400 + `RUNJS_SOURCE_KIND_UNSUPPORTED` | Return to the capability gate. This is not an ordinary compile failure. |
| Any RunJS action + 400 + `RUNJS_SOURCE_LOCATOR_INVALID`, or `save-changes` + 400 + `RUNJS_COMMIT_MESSAGE_INVALID` | Correct the input and retry the same action. |
| Any RunJS action + 403, `RUNJS_SOURCE_READONLY`, or `PERMISSION_DENIED` | Stop and report the permission failure. |
| Any RunJS action + 404 | The owner, repository, or selected base commit is missing. Correct locator or Workspace state; do not classify this as an unsupported version. |
| `save-changes` + 409 + `RUNJS_FILE_CONFLICT` | Read `details.path`, `details.expectedBlobHash`, and `details.currentBlobHash`; run `open-latest`, compare original/local/latest for that path, merge intentionally, then resubmit with the latest hash and fresh CAS tokens. Never silently overwrite or replace only tokens. |
| `save-changes` + 409 + `BASE_COMMIT_OUTDATED` or `RUNJS_SOURCE_OWNER_OUTDATED` | Run `open-latest`, merge original/local/latest by path, then resubmit changed paths with fresh hashes and both fresh CAS tokens. Never replace only tokens. |
| `save-changes` + 409 + `NO_CHANGES` or `RUNJS_SAVE_NO_CHANGES` | Read and verify latest state, then report no changes or already applied. Do not run a three-way merge. |
| `save-changes` + 409 + `REPO_ARCHIVED` | Stop and report the archived repository. |
| `compile-preview` or `save-changes` + 413 | Stop and report the Workspace resource limit. |

The ordinary Agent protocol is incremental `save-changes`. Do not import JS Template Source Project Head/Check/reviewed-change
workflows or its concurrency fields into these requests, and do not fall back to the legacy complete-replacement `save`.
