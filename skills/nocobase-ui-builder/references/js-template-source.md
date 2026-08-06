# JS Template source

This file owns the product boundary and route selection. Use
[js-template-transport.md](./js-template-transport.md) only after the route is selected for commands, payloads, compile
gates, CAS, Usage, and deletion protection. Use [js-template-roundtrip.md](./js-template-roundtrip.md) for one JS
Template shared by compatible Hosts or one bound Host detached back to Inline.

Apply this ordered gate and stop at the first match:

1. If the requested JS feature itself needs a new backend API, database table, data migration, ACL/permission
   enforcement, or server capability, use a full **NocoBase Plugin**.
2. Use **JS Template** only when the user explicitly asks to create, use, or Save as JS Template; explicitly wants the
   implementation maintained as a reusable or distributable JS Template; or multiple compatible Hosts must share one
   maintained JS implementation without copied code.
3. Reusable UI/Flow structure without one shared JS implementation uses **UI Template**.
4. One Host exclusively owning one JS implementation uses **Inline RunJS**.

UI Template reuses UI/Flow structure; JS Template shares one JS implementation. Existing-app ACL administration and
data-model configuration remain specialist handoffs. Do not use JS Template as a substitute for missing server
capability.

Multiple files, imports, hooks, services, code size, complexity, dashboards, Git storage, independent Git ownership, or
vague future distribution planning do not select JS Template. A single-Host implementation stays Inline unless the user
explicitly chooses the JS Template product route.

If the canonical capability is unavailable, do not silently substitute another source mode. Follow
[runjs-capability-gate.md](./runjs-capability-gate.md) and report the selected route as incomplete.

## Product identity

A JS Template is a reusable **Template Entry**. A **Source Project** is only its advanced source-management container and
may contain multiple JS Templates. The primary catalog is JS Template-centric: one Source Project with two JS Templates
has two catalog rows, while the advanced Source Project list has one row. Creating only a Source Project does not
complete a “Create JS Template” request.

Source Project selection or creation is separate from JS Template name and title. Use an existing Source Project only
when its identity is explicit, current, or created in the same task; otherwise create a business-named new Source
Project.

## Save as JS Template boundary

Save as JS Template starts from one complete current Inline RunJS Workspace. The request carries the current public
`runtimeVersion`, validates and compiles the complete candidate, commits the Source Project update, creates one real JS
Template, and atomically binds the Host with only this persistence contract:

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

Never persist Source Project or JS Template display/source metadata in `sourceBinding`. Keep generic Inline/VSC `repoId`
evidence and source-format details such as `entry.json`, `entryPath`, and its compiler entrypoint where their real
contracts require them.

Save as JS Template requires a stable non-empty `idempotencyKey`. Reuse it only for an equivalent complete request; a
changed Host, source snapshot, Source Project choice, JS Template identity, or file set requires a new key. Compile,
validation, permission, or conflict failure must leave the Host binding, Source Project Head, JS Template, Artifact, and
Usage unchanged.

## Shared edit and Detach boundaries

Shared-source edits use the Source Project pull/check/save loop. A successful save advances the Source Project Head and
recompiles affected JS Templates; public readback and completion evidence use `runtimeVersion`. Before saving, disclose
that all effective Usage locations will use the committed code immediately.

Detach to Inline copies the selected JS Template from the exact committed Source Project Head into only the selected
Host. If the shared workspace has unsaved edits, save them first or explicitly discard them before Detach. The public
request contains exactly `idempotencyKey`, `locator`, `projectId`, `templateId`, and `expectedProjectHeadCommitId`; the
server reads the exact commit and derives source files, kind, entry path, and runtime version. The Agent must not collect
or upload reachable source files for Detach.

A stale Head returns 409 with no partial mutation. Success clears only the selected Host binding and effective Usage;
other Hosts keep their binding and settings override. The JS Template and Source Project remain until explicitly deleted.

Usage is JS Template-level. Catalog counts and paginated Usage locations exclude `owner_missing`, omit hidden owner
details, and retain visibility-safe aggregates. Shared-source saves are non-blocking. Any effective Usage protects the JS
Template from deletion; after all effective Usages are detached, deletion may remove only that JS Template source and
unreferenced artifacts. Source Project deletion protection remains separate.
