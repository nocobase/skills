# JS Template reuse and detach round trip

Use this guide after [js-template-source.md](./js-template-source.md) selects reusable source. The canonical payload,
command, idempotency, CAS, Usage, and recovery contract is [js-template-transport.md](./js-template-transport.md). This
file owns one lifecycle invariant: one Source Project, one Template Entry, two compatible Host bindings, then only Host A detached to Inline.

## Contents

- [Invariant](#invariant)
- [1. Save Host A as one Template Entry](#1-save-host-a-as-one-template-entry)
- [2. Validate the reusable Template and Usage](#2-validate-the-reusable-template-and-usage)
- [3. Bind Host B to the same Template](#3-bind-host-b-to-the-same-template)
- [4. Keep Host settings independent](#4-keep-host-settings-independent)
- [5. Show save impact and Usage locations](#5-show-save-impact-and-usage-locations)
- [6. Detach only Host A to Inline](#6-detach-only-host-a-to-inline)
- [7. Preserve independent histories and deletion protection](#7-preserve-independent-histories-and-deletion-protection)
- [Failure boundaries](#failure-boundaries)
- [Completion evidence](#completion-evidence)

## Invariant

The lifecycle is:

`Host A Inline -> Save as JS Template -> Source Project P / Template Entry T -> bind Host B to T -> Detach Host A to Inline`

At reuse: one Source Project, one Template Entry, and two effective Usages. Reuse does not run Save as JS Template a second time, copy Template source, create another Template Entry, or change `entry.json.key`.
`entry.json.key`, `entryPath`, and entry directories remain source-format identity/location details; the persisted Host
binding uses only `type`, `projectId`, `templateId`, and `kind`.

The two Hosts share Template source but not instance settings. Each Host keeps its own `settings` override. Source Project
saves change the shared Template Entry; `flow-surfaces configure` changes only one targeted Host override and creates no source commit.

## 1. Save Host A as one Template Entry

Complete Host A's current Inline Workspace, then follow the full Save as request in
[js-template-transport.md](./js-template-transport.md):

```bash
nb api js-templates save-as-js-template --body-file /tmp/js-template-save-as.json -j
```

Keep the complete atomic result. `data.project`, `data.template`, `data.binding`, and `data.ownerFingerprint` belong to
one durable operation. The required `idempotencyKey` may be reused only for an equivalent complete request. A different
Host, source snapshot, Source Project destination, Template name/title, or file set is a new request and needs a new
key.

Source Project selection/creation and Template identity are separate inputs. Saving to a new Source Project must create
both Source Project P and Template Entry T. Creating only P is incomplete.

Treat `data.binding` as the canonical reusable binding. It must contain exactly:

```json
{
  "type": "js-template-entry",
  "projectId": "data.binding.projectId",
  "templateId": "data.binding.templateId",
  "kind": "data.binding.kind"
}
```

Do not add Project/Template names, titles, source path, or `entry.json.key` to that binding.

## 2. Validate the reusable Template and Usage

Before binding Host B, prove the same Source Project/Template pair is selectable and runnable:

```bash
nb api js-templates list-selectable --project-id <data.binding.projectId> --kind <data.binding.kind> -j
nb api js-templates get --template-id <data.binding.templateId> -j
```

One result row must agree with `data.binding` on `projectId`, `templateId`/`id`, and `kind`. Record the separate display
and source evidence: Template name/title, `entryPath`, stable `entry.json.key`, lifecycle/health, compiled commit,
runtime/artifact hashes, Settings hashes, and diagnostics. Stop if the Template is missing, unhealthy, unavailable,
compiled from another current Head, or incompatible with Host B.

Read Template-level Usage. Immediately after Save as, Host A contributes one effective Usage:

```json
{
  "templateId": "data.binding.templateId",
  "page": 1,
  "pageSize": 20
}
```

```bash
nb api js-template-usages list-usages --body-file /tmp/js-template-usages.json -j
```

`owner_missing` is excluded. Hidden owners contribute only to `effectiveCount`/`hiddenCount`; never reveal their owner
or location descriptors.

## 3. Bind Host B to the same Template

Create or locate Host B through its normal public `flow-surfaces` route. Host B must support the same `kind`. Put the
four-field binding under the owner's public source settings and keep its local override separate:

```json
{
  "target": { "uid": "host-b-uid" },
  "changes": {
    "sourceMode": "js-template",
    "sourceBinding": {
      "type": "js-template-entry",
      "projectId": "data.binding.projectId",
      "templateId": "data.binding.templateId",
      "kind": "data.binding.kind"
    },
    "settings": {
      "enabled": false,
      "threshold": 0,
      "label": ""
    }
  }
}
```

```bash
nb api flow-surfaces configure --body-file /tmp/host-b-binding.json -j
```

The values are copied from one binding result, not combined across responses. Read back both Hosts. Both must have
`sourceMode: "js-template"` and the same `projectId`/`templateId`/`kind`. The primary catalog still has one row for T,
the advanced Source Project list still has one row for P, and Template Usage `effectiveCount` is now two.

If P also contains another Template Entry, the primary catalog must show two Template rows while the Source Project list
still shows one Project row.

## 4. Keep Host settings independent

Host overrides are values, not truthiness flags. Preserve explicit `false`, `0`, and `""`; do not discard them as empty
defaults. Configure and read each Host separately. Changing Host A's override must not change Host B's override, and vice
versa.

Record Source Project Head and Template compiled commit before and after an override-only edit. Both remain unchanged:
Host settings do not create source commits or republish the Template. Runtime resolution combines shared Template
defaults with only the current Host's override.

## 5. Show save impact and Usage locations

Before or near a shared-source Save, read the current Template Usage aggregate and show a localized, non-blocking impact
message: this Template is used in N locations; after Save those locations immediately use the new code. Do not add a
blocking publish confirmation or Draft/Publish/Version/Pin/Release workflow.

The catalog Usage count opens the paginated Usage locations view. Safely handle loading, empty, error,
disabled/archived, and partially visible states. Visible rows may show the returned owner/location titles and route; a
hidden aggregate must never be expanded into guessed details.

Save source with the canonical CLI only:

```bash
nb js-template pull --project <projectId> --template <templateId> --dir /tmp/js-template-shared --json-output
nb js-template check --dir /tmp/js-template-shared --json-output
nb js-template save --dir /tmp/js-template-shared --message "Update shared template" --yes --json-output
```

Successful Save advances P's Head and T's compiled Artifact. Both Hosts resolve the new source immediately, but their
settings overrides remain independent.

## 6. Detach only Host A to Inline

Re-read Host A's exact binding, pull the current Source Project Head, and build T's latest reachable source set as
specified in [js-template-transport.md](./js-template-transport.md). Never use Host A's retained older Inline fallback,
an older pull, or an incomplete relative-import graph.

Detach requires both a stable `idempotencyKey` and the pulled `expectedProjectHeadCommitId`:

```bash
nb api js-templates detach-to-inline --body-file /tmp/js-template-detach.json -j
```

The server validates Project Head, Template identity, current four-field Host binding, owner permission, source, and
compile result in the same operation. If the Head is stale, it returns 409 `JS_TEMPLATE_SOURCE_OUTDATED` and leaves Host
A, Host B, both bindings/settings, Usage rows, Source Project Head/source, Template, and Artifacts unchanged. Pull the
new Head, rebuild all fields/files, and derive a new key; never replace only the expected Head.

Success changes only Host A to Inline, writes its new RunJS commit/source reference, clears only Host A's binding, and
removes only Host A's effective Usage. Host B stays bound to P/T. An equivalent replay returns the first
`runJSRepoId`, `commitId`, `ownerFingerprint`, `filesHash`, and `sourceRef`; conflicting key reuse fails deterministically.

After success, Template Usage `effectiveCount` is one. Re-read Host A, Host B, the Template, and Usage list. P/T remain
intact, and hidden-owner rules still apply.

## 7. Preserve independent histories and deletion protection

After Host A detaches, histories are independent:

- Host A uses Inline `run-js-sources open/open-latest/save-changes`; its save advances only Host A's generic RunJS Head.
- Template T remains bound to Host B and uses `nb js-template pull/check/save`; its save advances only Source Project P's Head and T's compiled Artifact.
- A later Template save cannot overwrite Host A's Inline source, and a later Host A Inline save cannot advance P or change Host B's binding.

Template deletion is still blocked because Host B is an effective Usage:

```bash
nb api js-templates delete --template-id <templateId> -j
```

Expect 409 `JS_TEMPLATE_USAGE_EXISTS` without hidden owner details. After Host B is also detached or its Usage is
otherwise no longer effective, re-read Usage and retry. Deletion may then remove only T's source and unreferenced
artifacts; it does not delete Source Project P or a sibling Template Entry. Source Project deletion protection remains
separate. Archived Source Projects are read-only.

## Failure boundaries

- Stop before binding Host B when selectable/get identity, health, runtime evidence, or kind does not match; never edit the binding kind.
- A Host configuration or Save as compile failure must not duplicate T or partially advance Project Head, Template, Artifact, binding, or Usage.
- After a Head change, pull again and use a new key. Any Detach validation, compile, permission, CAS, or persistence failure leaves all shared state unchanged.
- With partial visibility, report only visible rows and aggregate counts. Effective Usage blocks deletion until supported Host detach.

## Completion evidence

Report one before/after bundle containing:

- Host A/B identifiers, source modes, exact four-field bindings, settings overrides, and Source Project identity, Head, commits, and history boundary
- Template identity, `entry.json.key`, `entryPath`, compiled commit, hashes, catalog count, visible Usage rows, aggregates, and excluded `owner_missing`
- save impact and proof both Hosts resolved it, plus Detach idempotency, `expectedProjectHeadCommitId`, and returned Inline commit/source reference
- proof Host B stayed bound and histories remain independent, plus deletion conflict and success after effective Usage reaches zero when in scope
- whether browser rendering was actually verified; API/CLI evidence alone is not browser evidence
