# Light Extension round trips and multi-Host reuse

Use this guide after [light-extension-source.md](./light-extension-source.md) routes reuse or move-back
request to Light Extension. [light-extension-transport.md](./light-extension-transport.md) remains the canonical command,
payload, CAS, compile, and recovery contract. This file owns the lifecycle invariant: one Repository, one Entry, two
compatible Host bindings, then one Host moved back Inline without changing the other.

## Contents

- [Invariant](#invariant)
- [1. Externalize the first Host](#1-externalize-the-first-host)
- [2. Validate the reusable Entry](#2-validate-the-reusable-entry)
- [3. Bind a second compatible Host](#3-bind-a-second-compatible-host)
- [4. Keep Host settings independent](#4-keep-host-settings-independent)
- [5. Move only the first Host back Inline](#5-move-only-the-first-host-back-inline)
- [6. Continue with independent histories](#6-continue-with-independent-histories)
- [Failure boundaries](#failure-boundaries)
- [Completion evidence](#completion-evidence)

## Invariant

The complete lifecycle is:

`Host A Inline -> moveSource -> Repository R / Entry E -> bind Host B to E -> move Host A back Inline`

At the reuse point there is exactly one Repository, one Entry, and two Host bindings. Reuse does not run another
`moveSource`, copy Entry files, create a second Entry, or change `entry.json.key`. The Entry's stable key is its identity;
a directory or `entryPath` is location metadata, not permission to invent another identity.

The two Hosts share source but not instance settings. Each Host keeps its own `settings` override. Repository source
commits change the shared Entry; `flow-surfaces configure` changes only the targeted Host override and creates no source
commit.

## 1. Externalize the first Host

Complete and persist Host A's Inline Workspace, then externalize it once by following the complete request and evidence
rules in [light-extension-transport.md](./light-extension-transport.md):

```bash
nb api light-extensions move-source --body-file /tmp/light-move-source.json -j
```

Keep the complete success response. `data.repo`, `data.entry`, `data.binding`, and `data.ownerFingerprint` belong to one
atomic result. A retry may reuse its `idempotencyKey` only for the same complete semantic request. Do not use the key for
Host B, and do not treat a different destination, Host, source snapshot, Entry name, or title as a replay.

Treat `data.binding` as the canonical reusable binding. The public `flow-surfaces` binding shape uses these exact identity
fields and values from that result:

```json
{
  "type": "light-extension-entry",
  "repoId": "data.binding.repoId",
  "entryId": "data.binding.entryId",
  "kind": "data.binding.kind"
}
```

Do not reconstruct those values from a RunJS locator, combine them across responses, or change the Entry key. Optional
display metadata in the move response is readback evidence; do not invent or add it to the strict public
`flow-surfaces` source binding.

## 2. Validate the reusable Entry

Before binding Host B, prove that the same Repository/Entry pair is selectable and currently runnable:

```bash
nb api light-extension-entries list-selectable --repo-id <data.binding.repoId> --kind <data.binding.kind> -j
nb api light-extension-entries get --entry-id <data.binding.entryId> -j
```

The selectable row and `get` result must agree with `data.binding` on `repoId`, `id`/`entryId`, and `kind`. Also record
`entryName`, `entryPath`, runtime availability, compiled commit, runtime/artifact hashes, settings schema/default hashes,
and diagnostics. `entryName` must still match the stable `entry.json.key`. Stop if the Entry is absent, unhealthy,
unavailable, compiled from another Head, or incompatible with Host B's public source kind.

## 3. Bind a second compatible Host

Create or locate Host B through its normal public `flow-surfaces` route. When creating it in a blueprint/compose payload,
put the returned four-field binding under that owner's public `settings.sourceBinding`; keep its Host-local override under
the sibling `settings.settings`. For an existing Host, use the equivalent public `configure` request:

```json
{
  "target": { "uid": "host-b-uid" },
  "changes": {
    "sourceMode": "light-extension",
    "sourceBinding": {
      "type": "light-extension-entry",
      "repoId": "data.binding.repoId",
      "entryId": "data.binding.entryId",
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

The four `sourceBinding` values above are copied from the one move result, not literal strings. Host B must support the
same `kind`; for example, a `js-block` Entry cannot bind to a JS Field. Read back Host A and Host B after the write. Both
must point to the same `repoId` and `entryId`, while Repository and Entry counts remain one.

## 4. Keep Host settings independent

Host overrides are values, not truthiness flags. Preserve explicit `false`, `0`, and `""`; do not remove them as empty
defaults. Configure each Host separately and read both back after either change. Changing Host A's override must not
change Host B's override, and changing Host B's override must not change Host A's.

Record the Repository Head and Entry compiled commit before and after a Host-only settings edit. Both must remain
unchanged: an override edit creates no source commit and does not republish the Entry. Runtime resolution combines the
shared Entry defaults with only the current Host's override.

## 5. Move only the first Host back Inline

Require `supportsMoveToInline=true`, re-read Entry E, and pull the current Repository Head into a clean directory. Use
the latest reachable dependency closure for E exactly as described by the move-back section of
[light-extension-transport.md](./light-extension-transport.md). Do not use the retained pre-externalization Inline
fallback, an older pull, or a partial import graph as the move-back source.

Snapshot freshness is the caller's responsibility. Immediately re-read/pull the Entry before constructing the request;
`moveToInline` does not fetch or lock the latest Light Extension Head and does not accept an expected Head/compiled commit
CAS token. If the current Head cannot be proved, stop instead of calling the supplied files “latest.”

Send `move-to-inline` with Host A's exact canonical locator, the current Repository/Entry identity, and a stable
`idempotencyKey` derived for the complete request. Reuse that key after an ambiguous response or in-progress result only
when the entire request is unchanged; changed files, locator, Repository/Entry identity, kind, path, or version require a
new key:

```bash
nb api light-extensions move-to-inline --body-file /tmp/light-move-inline.json -j
```

The transaction clears only Host A's external binding and reference, writes the supplied current reachable Entry snapshot into
Host A's Inline Workspace, and returns its new RunJS Repository/commit/owner evidence. It must preserve Host B's binding
and reference, Repository R, Entry E, stable key, Repository Head, source history, and all unrelated reference rows.
Deleting the Repository/Entry or editing `entry.json.key` is not a move-back operation.

A completed replay returns the first `runJSRepoId`, Inline `commitId`, `ownerFingerprint`, and `sourceRef` even though Host
A is already Inline. The replay still checks current Host, Repository, Entry, and RunJS Repository permissions. Idempotency
does not fetch or lock the latest Repository Head and does not add an expected Head/compiled commit CAS input.

## 6. Continue with independent histories

After move-back, Host A and Entry E have separate histories:

- Host A uses `run-js-sources open/open-latest/save-changes`; an Inline save advances only Host A's RunJS Head.
- Entry E remains bound to Host B and uses `nb light pull/check/save`; a Repository save advances only Repository R's
  Head and Entry compiled commit.
- A later Repository save must not overwrite Host A's Inline source, and a later Host A Inline save must not advance
  Repository R or change Host B's binding.

Never silently reattach Host A. A future externalization is a new explicit move with a new complete request; it is not a
replay of the old move and must not reuse the old `idempotencyKey`.

## Failure boundaries

- If selectable/get identity or runtime evidence does not match, stop before binding Host B.
- If Host B's source kind is incompatible, choose a compatible Host or Entry; do not edit the binding kind.
- If Host configuration fails, keep the existing Repository/Entry and Host A binding; do not duplicate the Entry.
- If the Repository Head changes before move-back, pull the new Head, rebuild the complete reachable closure, and retry.
- If move-back fails validation, compile, permission, CAS, or persistence checks, Host A must remain externally bound and
  Host B, Repository, Entry, Head, history, and references must remain unchanged.

## Completion evidence

Report one before/after bundle containing:

- Host A and Host B identifiers, source modes, exact four-field bindings, and independent settings overrides
- Repository id/name/count, old/current Head, source commit ids/messages, and source history boundary
- Entry id, kind, stable `entry.json.key`/`entryName`, path, compiled commit, runtime/artifact/settings hashes, and count
- reference readback for the exact Repository/Entry before and after Host A move-back
- Host A's move-back RunJS Repository id, commit, owner fingerprint, source reference, and latest reachable file boundary
- proof that Host B still resolves Entry E and that Host A and Repository histories advance independently afterward
- whether browser rendering was verified; API/CLI and reference evidence alone is not browser evidence
