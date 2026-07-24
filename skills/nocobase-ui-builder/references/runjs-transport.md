# Inline RunJS Workspace transport

This file is the canonical transport contract for ordinary Inline RunJS Workspaces. Host actions create or read the
surface; the Host response supplies the canonical `data.runJSLocator`. Copy that `runJSLocator` object unchanged into
every RunJS request. Do not construct a locator from `modelUid` or other Host fields.

The backend action names and shell commands are distinct:

| Backend action | Shell command |
| --- | --- |
| `runJSSources:open` | `nb api run-js-sources open` |
| `runJSSources:openLatest` | `nb api run-js-sources open-latest` |
| `runJSSources:compilePreview` | `nb api run-js-sources compile-preview` |
| `runJSSources:save` | `nb api run-js-sources save` |

Run action-level `--help` before first use. Put each root request object in a JSON file and pass `--body-file`; do not
wrap it in `values`. Multi-file source must not be embedded in a shell JSON string because newlines, quotes, Unicode,
and template strings are easy to corrupt.

## Open

Write `/tmp/runjs-open.json` with the canonical Host locator:

```json
{
  "locator": {
    "kind": "flowModel.step",
    "modelUid": "copied-from-data.runJSLocator",
    "flowKey": "copied-from-data.runJSLocator",
    "stepKey": "copied-from-data.runJSLocator",
    "paramPath": ["copied", "from", "data.runJSLocator"]
  }
}
```

For a recognized but uninitialized owner, the optional `initialSource` is `{ "code": "...", "version": "v2" }`.
Then run:

```bash
nb api run-js-sources open --body-file /tmp/runjs-open.json
```

Record these values from the response before editing:

- `data.locator`
- `data.ownerFingerprint`
- `data.repository.repoId` (or `data.repository.id`) and `data.repository.headCommitId`
- the complete `data.files` snapshot
- `data.settingsDescriptor`
- `data.permissions`, especially `canRead`, `canWrite`, and `canSave`

Use only `data.locator` in subsequent requests. Preserve the opened snapshot as the `original` side if conflict recovery
is later required.

## Open latest

`open-latest` takes the same root `{ locator, initialSource? }` body. It reads the latest owner-aware snapshot without
the normal owner consistency rejection and is the recovery read after a stale save:

```bash
nb api run-js-sources open-latest --body-file /tmp/runjs-open.json
```

Its success response has the same shape as `open`. Record a fresh locator, owner fingerprint, repository id, Head,
files, settings descriptor, and permissions from this single response. A virtual result may have an empty repository id
and `headCommitId: null` when no persisted Workspace exists.

## Compile preview

Create `/tmp/runjs-preview.json` from the opened Workspace after applying local edits:

```json
{
  "locator": {},
  "repoId": "repository.repoId-or-id",
  "baseCommitId": "repository.headCommitId-or-null",
  "files": [
    {
      "path": "src/client/index.tsx",
      "operation": "upsert",
      "content": "complete UTF-8 file content",
      "language": "typescript"
    }
  ],
  "entryPath": "src/client/index.tsx",
  "version": "v2"
}
```

`repoId`, `baseCommitId`, `entryPath`, and `version` are optional where the server can resolve them. `locator` and the
complete `files` candidate are required. Run:

```bash
nb api run-js-sources compile-preview --body-file /tmp/runjs-preview.json
```

HTTP 200 returns `data.locator`, `data.locatorKind`, and `data.artifact`. Inspect
`data.artifact.diagnostics`; a diagnostic with `severity: "error"` means preview failed even though the HTTP request
succeeded. Repair source, descriptor, or imports and preview again. Do not save that candidate.

## Save

Create `/tmp/runjs-save.json` from the exact candidate that passed preview:

```json
{
  "locator": {},
  "repoId": "repository.repoId-or-id",
  "baseCommitId": "repository.headCommitId-or-null",
  "baseOwnerFingerprint": "ownerFingerprint-from-the-same-open-response",
  "message": "Implement the requested JS surface",
  "files": [
    {
      "path": "src/client/index.tsx",
      "operation": "upsert",
      "content": "complete UTF-8 file content",
      "language": "typescript"
    }
  ],
  "entryPath": "src/client/index.tsx",
  "version": "v2"
}
```

`locator`, `baseCommitId`, `baseOwnerFingerprint`, `message`, and the complete `files` snapshot are required; `repoId`,
`entryPath`, and `version` are optional only when the server can resolve them. Both CAS tokens must come from the same
`open` or `open-latest` response. Inline save has no `expectedHeadCommitId` field.

```bash
nb api run-js-sources save --body-file /tmp/runjs-save.json
```

HTTP 200 returns the new `data.repository`, `data.commit`, `data.artifact`, `data.ownerFingerprint`, and
`data.writeResult`. Read the new repository Head and owner fingerprint before any subsequent edit.

## Complete snapshot invariant

For Agent authoring, `files` is the complete target Workspace snapshot, not a patch. Every existing path omitted from
the save is deleted. Preserve the manifest, entry source, descriptor, and every unchanged source file. Preview and save
must use the same complete candidate snapshot; do not preview one file set and save another.

## Error recovery matrix

Classify failures by action, HTTP status, and `errors[].code`; status alone is insufficient.

| Action and result | Required handling |
| --- | --- |
| `compile-preview` + 200 + `artifact.diagnostics[].severity = "error"` | Repair source, descriptor, or imports; preview again; do not save. |
| `compile-preview` or `save` + 400 + `RUNJS_COMPILE_FAILED`, `RUNJS_IMPORT_NOT_ALLOWED`, `RUNJS_IMPORT_NOT_FOUND`, or `RUNJS_DYNAMIC_IMPORT_UNSUPPORTED` | Repair the candidate snapshot and preview again. |
| Any RunJS action + 400 + `RUNJS_SOURCE_KIND_UNSUPPORTED` | Return to the capability gate. This is not an ordinary compile failure. |
| Any RunJS action + 400 + `RUNJS_SOURCE_LOCATOR_INVALID`, or `save` + 400 + `RUNJS_COMMIT_MESSAGE_INVALID` | Correct the input and retry the same action. |
| Any RunJS action + 403, `RUNJS_SOURCE_READONLY`, or `PERMISSION_DENIED` | Stop and report the permission failure. |
| Any RunJS action + 404 | The owner, repository, or selected base commit is missing. Correct locator or Workspace state; do not classify this as an unsupported version. |
| `save` + 409 + `BASE_COMMIT_OUTDATED` or `RUNJS_SOURCE_OWNER_OUTDATED` | Run `open-latest`, merge `original`/`local`/`latest` by path, preview the merged complete snapshot, then save with both fresh tokens. A same-path conflict stops automatic overwrite. |
| `save` + 409 + `NO_CHANGES` or `RUNJS_SAVE_NO_CHANGES` | Read and verify latest state, then report no changes or already applied. Do not run a three-way merge. |
| `save` + 409 + `REPO_ARCHIVED` | Stop and report the archived repository. |
| `compile-preview` or `save` + 413 | Stop and report the Workspace resource limit. |

This Inline full-snapshot protocol is separate from Light Extension Head/check/reviewed-change workflows. Do not import
partial-preview statuses, reviewed delta save, or Light Extension concurrency fields into these requests.
