# Verification

Use this file to verify inspect/prewrite output and post-write persistence.

Agent-facing flow-surfaces front door is `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs`. Treat the readback routes below as wrapper subcommands.

For template-mode semantics and localized existing-reference edit routing, keep [templates.md](./templates.md) as the normative source and use this file only for readback expectations.

## 1. Inspect / Prewrite Verification

### Core Rules

- `inspect` and page-blueprint drafting are read-only.
- For menu questions, default to the visible menu tree first.
- For initialized pages/popup trees, default to wrapper `get` first.
- Use wrapper `describe-surface` only when its richer public tree is actually needed.
- desktop-route `id` values from the menu tree are not flow-surface `uid` values. When the menu tree gives `{ id, schemaUid }`, carry `id` only as `routeId` context and use `schemaUid` as `pageSchemaUid` for page readback.
- Do not describe a draft as if a write already succeeded.

### Draft Acceptance

A page-blueprint draft is good when:

- create vs replace is clear
- page identity uses menu group routeId plus page title: same group + same page title may mean `replace`, while different group + same page title should not merge, reuse, or auto-replace another page
- required collections/fields/bindings are backed by live facts
- tabs/blocks/popups are structurally explicit
- if duplicate same-title menu groups existed, the summary/readback states that explicit `routeId` was required before write and no extra same-title group was created unless the user explicitly asked for one
- canonical public names are used (`collection` vs `resource.collectionName`, `popup`, string `field.target`, layout `key`)
- low-level selectors/internal forms such as `uid`, `ref`, `$ref`, or alias fields do not appear in the JSON
- destructive blast radius is explicit for replace/delete scenarios
- remaining assumptions are stated outside the JSON payload

### Template Decision Acceptance

- Final user-visible summary that claims a template outcome should follow [template-decision-summary.md](./template-decision-summary.md): selected paths must say `reference` or `copy` plus one short controlled reason, and non-binding paths must say discovery-only or non-template explicitly.
- Without a live `target.uid` / opener, whole-page planning should still use the strongest planned opener/resource context it can describe. If that contextual query yields one stable best candidate, the summary may claim that `template` / `popup.template` was auto-selected.
- If the final result stayed discovery-only, keep that explicit in the summary. Valid non-binding reasons still include live/planned context being too weak, a resolved explicit template being unavailable in the current context, or multiple candidates remaining unresolved after the stable ranking.
- If multiple templates were only discovered but not bound, make that explicit instead of implying the backend or the skill silently chose one.

## 2. Write Readback Principles

- Verify only the surfaces affected by the write, unless hierarchy changed.
- For localized/low-level writes, and for any explicit inspection step, a successful write response is not enough; confirm via readback.
- Whole-page `applyBlueprint` create / replace and whole-page `reaction.items[]` default to successful-response completion. Do not add an extra `get` unless follow-up localized work or explicit inspection needs it.
- Popup-specific claims require popup-specific readback.
- Without an extra `get`, describe whole-page popup/template results only as submitted/created from the success response and sent blueprint, not as readback-verified persisted subtree facts.
- If a popup write relied on `popup.tryTemplate=true` because no explicit `popup.template` was present, verify whether the final persisted popup stayed inline/default, bound a template, or silently missed. When local popup content was also present, confirm whether it became the miss fallback instead of assuming template reuse from the write request alone.
- Reaction writes should also verify `resolvedScene` / `resolvedSlot` / `fingerprint` from the write result instead of assuming the backend used the guessed scene.
- Template-mode claims require template-mode readback; do not assume `reference` or `copy` from the write request alone.
- If a localized edit resolved to a template source, verify the template source readback itself before inferring that current references now reflect the change.
- If live readback before the write showed an existing template reference, and post-write readback no longer exposes that reference or now exposes local inline popup content instead, treat that as a routing failure unless the user explicitly asked for local-only / detach / `copy`.
- Same-task multi-page template reuse needs one live chain: source-page readback -> `save-template` -> `get-template` -> later-page contextual `list-templates` -> later-page write/readback.

## 3. Minimum Readback Targets

| operation | minimum readback |
| --- | --- |
| `apply-blueprint` create | default: none after successful response; if menu placement matters or follow-up localized work / explicit inspection is needed, read the menu tree and wrapper `get --page-schema-uid <pageSchemaUid>` |
| `apply-blueprint` replace | default: none after successful response; wrapper `get --page-schema-uid <pageSchemaUid>` only for follow-up localized work or explicit inspection |
| `apply-blueprint` with `reaction.items[]` | default: none after successful response; wrapper `get --page-schema-uid <pageSchemaUid>` only for follow-up localized work or explicit inspection |
| `create-page` | wrapper `get --page-schema-uid <pageSchemaUid>` |
| `add-tab` / `update-tab` / `move-tab` / `remove-tab` | page or tab readback |
| `add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` | popup page/tab readback |
| `compose` / `add-block` / `add-field` / `add-action` / `add-record-action` | direct parent/target readback |
| `configure` / `update-settings` | modified target readback |
| `save-template` | wrapper `get-template --uid <templateUid>` and, for `saveMode="convert"`, source-target readback |
| `get-reaction-meta` + `set-*` | target readback plus write-result `resolvedScene` / `fingerprint` checks |
| `move-node` / `remove-node` | parent/target readback |
| `convert-template-to-copy` | modified target readback |
| `update-template` | wrapper `get-template --uid <uid>` |
| `update-menu` / `create-menu` | menu tree when placement matters |

### Reaction-specific readback

After a reaction write, confirm at least:

- the returned `resolvedScene` matches the intended scene family
- the returned `fingerprint` changed when the slot content changed
- the persisted rule slot exists where expected
- for form `fieldValue` / `fieldLinkage`, rules land on the form-grid slot rather than the outer form step root
- for clear operations, `rules: []` really leaves the persisted slot empty

### Whole-page success-only reporting

When whole-page `applyBlueprint` succeeds and no extra `get` runs:

- report only the successful write, returned `target` / `pageSchemaUid`, and the blueprint intent you sent
- use wording such as `submitted`, `created`, `replace succeeded`, or `wrote the page blueprint`
- do not describe popup subtree, template binding, reaction slot placement, or normalized page structure as persisted/readback-verified facts yet
- switch to persisted/readback wording only after an explicit live `get` or other target-specific readback

### Structured verification summary

If you hand-write a readback bundle or a short persisted verification note, start with a stable public summary instead of depending on raw model names or loose full-tree dumps.

- always include page identity under `page` when page-level create / replace happened, especially `page.pageSchemaUid`, `page.pageTitle`, and `page.menuGroupTitle`
- use `root`, `tables`, `popups`, `forms`, and `reactions` only when those sections matter to what you changed
- prefer normalized public type labels such as `table`, `details`, `editForm`, `filterForm`, `createForm`
- when a scenario spans multiple pages, use the same canonical page identity keys under `pages.*`, especially `pageSchemaUid`, `pageTitle`, and `menuGroupTitle`
- use `type` for concrete summary nodes such as `tables.*`, `lists.*`, and `forms.*`; reserve `blockTypes` for aggregate summaries such as `root.blockTypes` or `popups.*.blockTypes`
- if root-level content matters, keep `root.blockTypes`, `root.collections`, `root.fields`, and `root.actionTitles` explicit even when the raw live root only says `type: "page"`
- for popup same-row layouts, surface a stable `sameRow: true` style proof instead of leaving a free-form layout string as the only evidence
- when a critical outcome depends on a helper, guard, or computed field, surface one stable boolean or scalar outcome near the summary instead of burying the only proof inside richer nested metadata
- when raw live readback is still useful, nest it under an extra key after the public summary instead of making raw model names the only proof

## 4. Popup-specific Checks

For localized popup writes, or when explicit post-write inspection is requested, confirm:

- popup subtree exists
- required content exists, not just shell
- if the user explicitly cares about binding semantics, binding still matches live facts

If a whole-page `applyBlueprint` finished without that extra inspection, keep the result phrased as submitted/created popup intent rather than as persisted/readback-verified popup facts.

## 5. Template-specific Checks

When template readback was actually requested or needed after a write, confirm:

- for `reference` template writes, the readback still exposes the intended template reference / uid / mode
- for `copy` or `convert-template-to-copy`, the readback no longer exposes the template reference
- when the task intentionally stayed inline/discovery-only, no template reference was accidentally written
- the user-facing summary and the persisted result agree on whether the final path was `reference`, `copy`, or non-template
- when whole-page auto-selection chose one best candidate, the persisted uid/mode agrees with that planned winner
- when a localized edit was supposed to change template-owned content on an existing reference, the template `targetUid` readback contains the change and the current reference still points at the same template uid/mode
- when a localized edit was supposed to change current-instance host/openView config only, that current target readback changed while the template source remained unchanged when that distinction matters
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
