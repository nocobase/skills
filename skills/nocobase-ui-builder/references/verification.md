# Verification

Use this file to verify inspect/prewrite output and post-write persistence.

Canonical front door is `nocobase-ctl flow-surfaces`. Treat the readback routes below as CLI-first families; use MCP only as fallback after the CLI path is unavailable.

## 1. Inspect / Prewrite Verification

### Core Rules

- `inspect` and page-blueprint drafting are read-only.
- whole-page `applyBlueprint` authoring is **ASCII-first** before the first write; the preview should still be traceable back to one concrete blueprint draft, whether execution pauses for review or continues immediately.
- For menu questions, default to the visible menu tree first.
- For initialized pages/popup trees, default to `nocobase-ctl flow-surfaces get` first.
- Use `nocobase-ctl flow-surfaces describe-surface` only when its richer public tree is actually needed.
- Do not describe a draft as if a write already succeeded.

### Draft Acceptance

A page-blueprint draft is good when:

- create vs replace is clear
- required collections/fields/bindings are backed by live facts
- tabs/blocks/popups are structurally explicit
- any ASCII wireframe shown to the user matches the same tabs / blocks / popup structure as the blueprint draft
- if execution proceeded immediately, the ASCII wireframe still appeared before the first `applyBlueprint`
- if duplicate same-title menu groups existed, the preview/readback states which routeId was chosen and no extra same-title group was created unless the user explicitly asked for one
- canonical public names are used (`collection` vs `resource.collectionName`, `popup`, string `field.target`, layout `key`)
- low-level selectors/internal forms such as `uid`, `ref`, `$ref`, or alias fields do not appear in the JSON
- destructive blast radius is explicit for replace/delete scenarios
- remaining assumptions are stated outside the JSON payload

### Template Decision Acceptance

- Final user-visible preview or summary that claims a template outcome should follow [template-decision-summary.md](./template-decision-summary.md): selected paths must say `reference` or `copy` plus one short controlled reason, and non-binding paths must say discovery-only or non-template explicitly.
- The default ASCII preview should at least expose template identity + `mode` when the blueprint already contains them; runtime preview does not need to invent a reason on its own.
- Without a live `target.uid` / opener, whole-page planning should still use the strongest planned opener/resource context it can describe. If that contextual query yields one stable best candidate, the preview may claim that `template` / `popup.template` was auto-selected.
- If the final result stayed discovery-only, keep that explicit in the summary. Valid non-binding reasons still include live/planned context being too weak, a resolved explicit template being unavailable in the current context, or multiple candidates remaining unresolved after the stable ranking.
- If multiple templates were only discovered but not bound, make that explicit instead of implying the backend or the skill silently chose one.

## 2. Write Readback Principles

- Verify only the surfaces affected by the write, unless hierarchy changed.
- A successful write response is not enough; confirm via readback.
- Popup-specific claims require popup-specific readback.
- Reaction writes should also verify `resolvedScene` / `resolvedSlot` / `fingerprint` from the write result instead of assuming the backend used the guessed scene.
- Template-mode claims require template-mode readback; do not assume `reference` or `copy` from the write request alone.
- Same-task multi-page template reuse needs one live chain: source-page readback -> `save-template` -> `get-template` -> later-page contextual `list-templates` -> later-page write/readback.

## 3. Minimum Readback Targets

| operation | minimum readback |
| --- | --- |
| `apply-blueprint` create | menu tree if menu placement matters + `nocobase-ctl flow-surfaces get --page-schema-uid <pageSchemaUid>` |
| `apply-blueprint` replace | `nocobase-ctl flow-surfaces get --page-schema-uid <pageSchemaUid>` and affected tab/content checks |
| `apply-blueprint` with `reaction.items[]` | `nocobase-ctl flow-surfaces get --page-schema-uid <pageSchemaUid>` plus the affected reaction slot in readback |
| `create-page` | `nocobase-ctl flow-surfaces get --page-schema-uid <pageSchemaUid>` |
| `add-tab` / `update-tab` / `move-tab` / `remove-tab` | page or tab readback |
| `add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` | popup page/tab readback |
| `compose` / `add-block` / `add-field` / `add-action` / `add-record-action` | direct parent/target readback |
| `configure` / `update-settings` | modified target readback |
| `save-template` | `nocobase-ctl flow-surfaces get-template --uid <templateUid>` and, for `saveMode="convert"`, source-target readback |
| `get-reaction-meta` + `set-*` | target readback plus write-result `resolvedScene` / `fingerprint` checks |
| `move-node` / `remove-node` | parent/target readback |
| `convert-template-to-copy` | modified target readback |
| `update-template` | `nocobase-ctl flow-surfaces get-template --uid <uid>` |
| `update-menu` / `create-menu` | menu tree when placement matters |

### Reaction-specific readback

After a reaction write, confirm at least:

- the returned `resolvedScene` matches the intended scene family
- the returned `fingerprint` changed when the slot content changed
- the persisted rule slot exists where expected
- for form `fieldValue` / `fieldLinkage`, rules land on the form-grid slot rather than the outer form step root
- for clear operations, `rules: []` really leaves the persisted slot empty

## 4. Popup-specific Checks

After popup-related writes, confirm:

- popup subtree exists
- required content exists, not just shell
- if the user explicitly cares about binding semantics, binding still matches live facts

## 5. Template-specific Checks

After template-related writes, confirm:

- for `reference` template writes, the readback still exposes the intended template reference / uid / mode
- for `copy` or `convert-template-to-copy`, the readback no longer exposes the template reference
- when the task intentionally stayed inline/discovery-only, no template reference was accidentally written
- the user-facing preview/summary and the persisted result agree on whether the final path was `reference`, `copy`, or non-template
- when whole-page auto-selection chose one best candidate, the persisted uid/mode agrees with that planned winner
- same-task multi-page reuse is accepted only when source-page readback proved the saved scene first, `save-template` returned a template uid that `get-template` can read, and the later page reran contextual `list-templates` before binding
- the later-page contextual `list-templates` result must show the chosen uid as `available = true`; an earlier same-task seed alone is not enough
- if the later-page contextual result does not expose that saved uid as `available = true`, keep the later page discovery-only or inline/non-template instead of binding from the earlier seed alone
- when a later page binds that saved template via `reference`, re-read `get-template` after the write; `usageCount` should usually increase and serves as a secondary confirmation, not the sole proof
- for `saveMode="convert"`, the source readback must now expose the converted template reference / uid / mode rather than the old inline subtree

## 6. Replace / Destructive Checks

For replace/delete style operations, explicitly confirm:

- the intended page/tab/node still exists or was removed as expected
- extra tabs/nodes that should disappear actually disappeared
- unaffected sibling structure was not unexpectedly damaged
