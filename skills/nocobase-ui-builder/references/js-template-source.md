# JS Template source

This file is the intent router. Use [js-template-transport.md](./js-template-transport.md) for canonical commands,
payloads, compile gates, CAS, Usage, and deletion protection. Use
[js-template-roundtrip.md](./js-template-roundtrip.md) when one Template Entry is reused by multiple compatible Hosts or
one Host is detached back to Inline.

A solution must pass this ordered four-way gate; stop at the first match:

- a JS feature that itself needs a new backend API, database table, data migration, ACL/permission enforcement, or server capability -> full **NocoBase Plugin**;
- multiple Hosts share one maintained JS implementation -> **JS Template**;
- reusable UI/Flow structure without a shared JS implementation -> **UI Template**;
- one Host exclusively owns one JS implementation -> **Inline RunJS**.

UI Template reuses UI/Flow structure; JS Template shares one JS implementation. Do not use JS Template as a substitute
for required server capabilities. Existing-app ACL administration and data-model configuration remain specialist
handoffs rather than JS solution routes.

A JS Template is a reusable **Template Entry**. A **Source Project** is only the advanced source-management container
that may hold one or more Template Entries. The primary JS Template catalog is entry-centric: one Source Project with
two Template Entries produces two catalog rows, while the advanced Source Project list still has one row. Creating a
Source Project without creating a Template Entry does not complete a “Create JS Template” request.

Choose JS Template when one implementation must be reused by multiple Hosts and maintained once without copied code.
The user does not need to name JS Template, Source Project, or Template Entry when that business intent is clear. A
complete implementation used only by its current Host stays Inline; storage in an independent Git repository or
preparation for distribution does not change that route. Multiple files, imports, hooks, services, size, complexity, or a
single-page dashboard alone do not select the JS Template route.
If the canonical capability is unavailable, report the requested reuse as incomplete; do not silently substitute an
Inline Workspace or single-file Inline path.

**Save as JS Template** starts from one complete current Inline RunJS Workspace. Source Project selection or creation is
a supporting choice, separate from the Template name and title. It must validate and compile before publishing, create
one real Template Entry, and atomically bind the Host with only this canonical persistence contract:

```json
{
  "sourceMode": "js-template",
  "sourceBinding": {
    "type": "js-template-entry",
    "projectId": "project-id",
    "templateId": "template-id",
    "kind": "js-block"
  }
}
```

Never persist Source Project title, Template title/name, `entryPath`, `entryKey`, or other display/source metadata in
`sourceBinding`; resolve it from the catalog and Template service. Keep generic Inline/VSC `repoId` evidence and source
format details such as `entry.json`, `entryPath`, and `entryKey` where their real contracts require them.

Save as JS Template requires a non-empty `idempotencyKey`. Reuse it only for an equivalent complete request; a changed
Host, source snapshot, Source Project choice, Template identity, or file set requires a new key. Compilation, validation,
permission, or conflict failure must leave the Host binding, Source Project Head, Template, Artifact, and Usage state
unchanged.

**Detach to Inline** copies the current reachable Template Entry source into only the selected Host and clears only that
Host's binding and Usage. It requires a non-empty `idempotencyKey` and the current `expectedProjectHeadCommitId`; a stale
Head returns 409 with no partial mutation. Other Hosts keep their binding and independent settings override. The
Template Entry and Source Project remain until explicitly deleted.

Usage is template-level. The catalog count and paginated Usage locations exclude `owner_missing`, omit hidden owner
details, and retain visibility-safe aggregate counts. Saving shared source is non-blocking but should disclose that all N
effective locations immediately use the new code. A Template Entry with any effective Usage is server-protected from
deletion; after all effective Usages are detached, its deletion may remove only that Template's source and unreferenced
artifacts. Source Project deletion protection remains a separate operation.

Use only the `nb js-template pull`, `nb js-template check`, and `nb js-template save` workspace CLI namespace. It is not
an Inline capability probe; use [runjs-capability-gate.md](./runjs-capability-gate.md) for ordinary Inline Workspace
availability.
