# Kimi Agent Build Issues (2026-04-10)

## Issue 1: edit recordAction UID not in state.yaml
- **Root cause**: deployer excludes edit/view from compose, creates via save_model in `_fill_block`, but doesn't write the new action UID back to `block_state.record_actions`
- **Impact**: `auto: [edit]` in enhance.yaml can't resolve `$page.table.record_actions.edit` ref
- **Fix needed**: `_fill_block` should write created popup-action UIDs to block_state

## Issue 2: Kimi modifies tool code (nb.py)
- PM kimi changed `nb.py` to handle select options format
- **Root cause**: YAML `options: [Active, On Leave]` vs deployer expecting string list
- **Fix needed**: `create_field` should handle both `[string]` and `[{value, label}]` formats
- **Skill doc**: add note "DO NOT modify files in tools/"

## Issue 3: Asset kimi abandoned DSL, switched to MCP tools
- After DSL enhance.yaml deploy failed, kimi fell back to nb_page/nb_compose_page MCP tools
- **Root cause**: DSL deploy errors not clear enough for kimi to fix
- **Impact**: lost the DSL workflow advantage

## Issue 4: select field options format
- YAML has `options: [active, probation]` (string list)
- `create_field` passes to `uiSchema.enum` as `[{value, label}]`
- But some formats use `[{value: "active", label: "Active", color: "green"}]`
- Need consistent handling

---

# Manual-Readthrough Findings (2026-04-18, building `workspaces/pm`)

Built a minimal 项目管理 module following SKILL.md only (templates/crm used as
reference). Below are every place I had to guess, saw a contradiction, or
couldn't resolve from the manual alone.

## M-1 ⛔ Auto-FK trap contradicts templates/crm (HIGH)
- SKILL.md "Auto-FK trap" forbids declaring both `owner: m2o` and `owner_id: integer`.
- Every CRM collection pairs them (`owner`+`owner_id`, `parent`+`parent_id`,
  `region`+`region_id`, ...).
- The template is the first thing a builder opens. They'll copy its pattern and
  violate the manual without noticing.
- **Fix**: either (a) sweep the CRM template to remove the `_id` twins, or
  (b) soften the manual rule and explain when twins are actually OK.

## M-2 m2o `foreignKey` — required or optional? (MEDIUM)
- Field Type Reference table lists only `target` as required for m2o.
- Every CRM m2o writes `foreignKey: xxx_id`.
- If omitted, what does NocoBase default to? (snake_case? camelCase? fail?)
- **Fix**: add to the m2o row — "optional; defaults to `<name>_id` if omitted".

## M-3 `foreignKey` semantic flips between m2o and o2m (MEDIUM)
- On m2o: names the FK column in the **current** table.
- On o2m: names the FK column in the **target** table.
- Easy to get backward. Manual mentions both in passing but never side-by-side.
- **Fix**: add one-line callout under Field Type Reference explaining the flip.

## M-4 m2m `through` auto-creation buried (MEDIUM)
- Key Rules / Field Type Reference row for m2m lists `through: join_table` as required.
- Only the Auto-FK trap paragraph quietly mentions "the join table is auto".
- Builder will assume they must hand-write the through collection (I did initially).
- **Fix**: add to Field Type Reference m2m row — "join table is auto-created;
  do NOT write a collection YAML for the through table".

## M-5 `page.yaml` (route_id / schema_uid / tab_uid) not documented (MEDIUM)
- File Structure diagram omits `page.yaml`, but every CRM page has one.
- Contains IDs that look runtime-assigned (route_id: 344558692794368, schema_uid).
- Do I hand-write it? Is it pull-only? First push with only `layout.yaml` —
  will the page render?
- **Fix**: document whether `page.yaml` is author-written, pull-only, or
  optionally author-written with `title`/`icon` and the UIDs filled by pull.

## M-6 Multi-tab pages (`tab_<name>/` subdirs) not documented (LOW)
- CRM customers/ uses `tab_customers/` and `tab_merge/` subdirs instead of a
  flat `layout.yaml`.
- File Structure diagram only shows `layout.yaml`.
- A builder wanting "Details | Activity | Files" tabs on one page can't figure
  this out from the manual.
- **Fix**: add a short "Tabs" subsection showing the `tab_<key>/layout.yaml`
  convention and what wires the tab list.

## M-7 Block `type` values incomplete (MEDIUM)
- I inferred `filterForm`, `table`, `details`, `createForm` from templates.
- No exhaustive list. Overview/dashboard pages typically want a markdown/hero
  block, KPI cards, charts — are those `type: markdown` / `type: jsBlock` /
  something else? Not knowable from the manual.
- **Fix**: Field Type Reference has a types table; add a parallel Block Type
  Reference listing every supported `type:` and its required props.

## M-8 Variables in `filter:` / popup bindings (MEDIUM)
- Manual shows `{{ctx.view.inputArgs.filterByTk}}` and
  `{{ctx.urlSearchParams.status}}`.
- Common needs — current user, current date, parent record — have no
  documented variable. I guessed `{{$user.id}}` for "my tasks".
- **Fix**: add a "Template variables" table listing at minimum: current user,
  parent record, URL params, popup args, current datetime.

## M-9 `associationName` wording is misleading (LOW)
- Manual: "`<parent_collection_alias>.<o2m_field_name>`".
- Reality: it's the **child's m2o field name** + parent's o2m field name
  (e.g. `ticket.comments` where `ticket` is the m2o on `it_comments` back to
  `it_tickets`, and `comments` is the o2m on `it_tickets`).
- Calling the first part "parent collection alias" made me think it was the
  parent's collection name minus prefix. It isn't.
- **Fix**: reword as "`<child_m2o_fieldname>.<parent_o2m_fieldname>`" with a
  two-line example pointing at both fields in both collections.

## M-10 `titleField` when no natural title field exists (LOW)
- Key Rule says "auto-set if a `name` field exists". For a comments table
  (only `content`, a textarea), what happens?
- Can I omit `titleField` entirely? Will NocoBase fall back to `id`?
- **Fix**: add a line — "If no suitable field exists, omit `titleField`;
  NocoBase falls back to `id`". (Or whatever the true behavior is.)

## M-11 `defaults.yaml` syntax not shown (LOW)
- Manual says "m2o auto-popups" and File Structure lists the file, but no
  example. I had to open templates/crm/defaults.yaml to see the shape
  (`popups: <coll>: <path>` + `forms: <coll>: <path>`).
- **Fix**: add a 6-line example in the manual showing both sections and
  when each binding fires.

## M-12 Top-level single-item route (no group, no children) (LOW)
- CRM routes.yaml has `- title: Lookup` at the top level — no `type: group`,
  no children.
- Manual only shows `type: group` with `children:`. Is a bare leaf allowed?
  What page does it point to?
- **Fix**: add a one-line note on bare top-level routes or remove the pattern
  from the CRM template if it's accidental.

## Meta (readthrough phase)
Before pushing: 12 findings from reading SKILL.md + scanning templates/crm.
Next step: actually run `push` and see which guesses survive.

---

# Push-Time Findings (2026-04-18, `npx tsx cli/cli.ts push pm --force`)

## Results of M-findings against the real deployer
- **M-1 confirmed**: deploy log has 5 `auto-created FK for ...` lines. The
  `_id` twins in CRM are redundant; manual is right.
- **M-2 answered**: `foreignKey` on m2o is optional — deploy proceeded on all
  m2o fields. But specifying it still accepted. Manual should clarify it
  defaults to `<name>_id`.
- **M-4 confirmed**: no hand-written through collection needed. m2m `through`
  is auto.
- **M-10 answered**: omitting `titleField` when no natural title exists →
  warning only ("no titleField (add a name/title field...)"), deploy
  continues. Safe.

## New findings surfaced ONLY by running push

### P-1 `filterForm` requires `field_layout` — BLOCKING (HIGH)
```
✗ filterForm MUST have field_layout with grid layout (e.g. [[field1, field2, field3]])
```
- Manual shows filterForm examples without `field_layout` (only the CRM leads
  layout.yaml uses it).
- Without it, spec-validation fails, deploy aborts.
- **Fix**: add `field_layout` as **required** in Key Rules or in a new
  "Block Type Reference" filterForm row.

### P-2 `filterForm` capped at 3 filter fields — BLOCKING (HIGH)
```
✗ filterForm has too many filter fields (4) — max 3 recommended for layout
```
- Manual does not mention this cap. Builder will routinely write 4–5 filters
  (status, priority, owner, project...) and hit the block.
- **Fix**: document the 3-field limit and point users to multi-target
  filterForm or JS filter block for more complex filtering.

### P-3 `actions: [addNew]` requires matching popup — BLOCKING (MEDIUM)
```
✗ table "table" has addNew action but no addNew popup —
  create popups/table.addNew.yaml
```
- Contradicts Key Rule #6 "actions are auto-populated — no need to write
  actions/recordActions".
- Real rule: if you DON'T write actions, defaults auto-apply. If you DO
  write `addNew`, the popup file is now required.
- **Fix**: reword Key Rule #6 to — "actions can be omitted for auto-defaults;
  if written explicitly, every action that opens a popup needs its popup
  file (`popups/table.actions.<name>.yaml`)".

### P-4 `table` needs clickToOpen OR recordActions — BLOCKING (MEDIUM)
```
✗ table "table" has no clickToOpen field and no recordActions —
  add "clickToOpen: true" to field "name" (opens nb_pm_comments detail)
```
- Not in manual. A naked table with no click-through and no row actions is
  rejected.
- **Fix**: add to Key Rules — "Every table must expose row access: either a
  `clickToOpen: true` field or `recordActions`".

### P-5 filterForm search anchor must be a real column — SILENT BREAK (HIGH)
- For collection `nb_pm_tasks`, I wrote:
  ```yaml
  - field: name
    label: 搜索
    filterPaths: [title, description]
  ```
- But `name` is not a column on tasks (the name-like field is `title`).
- Deploy logged: `⚠ Block "filterForm" references fields not in nb_pm_tasks:
  name — removing invalid fields`. Search box silently disappears.
- **Fix**: manual shows the `filterPaths` search pattern (CRM leads) but
  doesn't say the anchor `field:` has to match a real column. Add a note:
  "The search anchor field name must exist on the collection; it's the
  column the input is visually bound to. `filterPaths` broadens where the
  value is matched."

### P-6 filterForm expects `js_items` button group — WARN (LOW)
```
⚠ filterForm has no js_items filter button group —
  see templates/crm/js/ for examples
⚠ filterForm JS button group should be on the first row of field_layout
```
- Not in manual. Apparently a style/UX convention is enforced via warning.
- **Fix**: either document as a recommended pattern with example JS snippet,
  or drop the warning if it's not actually required.

### P-7 m2o popup fallback 400s when no defaults.yaml entry — DEPLOY-TIME (MEDIUM)
```
. m2o fallback owner → users: Request failed with status code 400
  (will skip this target for rest of deploy)
. m2o fallback project → nb_pm_projects: Request failed with status code 400
. m2o fallback task → nb_pm_tasks: Request failed with status code 400
```
- Fires on every m2o field. Deploy continues (" will skip this target ")
  but clicking an m2o link in the running app likely has no detail popup.
- Probably caused by missing `defaults.yaml` `popups:` binding. Manual lists
  `defaults.yaml` but doesn't say "if you skip it, m2o links are broken".
- **Fix**: either make defaults.yaml generation automatic from per-collection
  detail popup files, OR document that every collection referenced by any
  m2o needs a `popups:` binding.

### P-8 `cli seed` removed but Round 2 still prescribes it — CONTRADICTION (HIGH)
```
$ npx tsx cli/cli.ts seed pm
Unknown command: seed
```
- SKILL.md "Round 2: Test Data + Verification" step 1:
  `npx tsx cli/cli.ts seed /tmp/myapp`
- Command Reference section at the bottom says:
  `(Removed: cli seed — generate test data ad-hoc with AI / SQL instead; ...)`
- Two sections of the same document contradict each other. A builder
  following Round 2 linearly hits `Unknown command: seed` on their first try.
- **Fix**: rewrite Round 2 step 1 to say "insert test data ad-hoc via the
  NocoBase API or SQL (the old `seed` CLI was retired)". Maybe add a short
  curl/SQL example.

### M-7 REVISED (after looking at CRM overview)
My earlier conclusion said "overview needed markdown/hero blocks but manual
lists no such type". Wrong on the "couldn't know" part — `templates/crm/pages/main/overview/layout.yaml` contains the full pattern I needed:
```yaml
- type: jsBlock
  key: overview_jsBlock
  file: ./js/overview_jsBlock.js
```
Plus block features the manual never mentions that the template demonstrates:
- `clickToOpen: templates/popup/leads_view.yaml` — not just `true`; can
  point at a specific popup template
- `layout: - key: 16` — 24-grid width per block in a row
- `title:` override on blocks
- `pageSize:` on tables
- `actions: [type: link, url: ...]`, `[type: ai, employee, tasks_file]`
- `recordActions: [type: updateRecord, assign:, linkageRules:]`

The manual instructs "JS + Charts (optional): Copy JS files from a page's
pages/<group>/<page>/js/ directory in the CRM template" — which IS the
right guidance, but only in Round 4, and it never says that the overview
page's jsBlock pattern is what unblocks dashboards.

- **Fix**:
  1. In the Block Type Reference (once added), list `jsBlock` with
     `file:` as the required prop, and point to the CRM overview as the
     canonical example.
  2. In Round 0 / data modeling, cross-reference the overview template so
     that "how do I build a dashboard" has a template to copy from the
     start, not only at Round 4.
  3. Decide whether features like grid widths, `clickToOpen: <path>`,
     action variants (`type: link/ai`), `recordActions` with linkageRules
     need their own manual subsections or a single "template recipes"
     appendix. They're heavily used in CRM but invisible in the manual.

---

## STRUCTURAL: manual vs. template reference model is broken (ROOT CAUSE)

Observed during the pm build: the manual tells the builder "Don't pull in
source code. This skill is a manual" — but 2/3 of the build-time knowledge
(block type values, dashboard patterns, layout grid widths, action
variants, recordActions, clickToOpen-to-popup, defaults.yaml format,
filterForm field_layout shape, js_items convention, ...) lives ONLY in
`templates/crm/`, not in SKILL.md.

So in practice the agent must read the manual AND grep through the CRM
template before it can build most pages. But:

- The manual doesn't instruct the agent to consult CRM for specific
  questions — it just lists templates/crm/ in the Reference Files table
  and expects discovery.
- The agent (me) therefore skipped the overview template entirely because
  the manual's Round 0/1 made no mention of "check CRM overview before
  designing your dashboard".
- Result: avoidable M-7 (block types), M-11 (defaults format), M-6 (tabs),
  P-1 (field_layout on filterForm), P-6 (js_items), P-5 (search anchor
  must be a real column), all of which were inferable from CRM patterns I
  didn't read.

### Two valid resolutions — pick one
1. **Manual-as-single-source**: pull the CRM conventions UP into SKILL.md
   (new Block Type Reference, filterForm recipe, defaults.yaml example,
   tab pattern, layout grid widths). Keeps the "just read SKILL.md"
   promise honest.
2. **Template-as-reference, explicitly**: keep SKILL.md short, but rewrite
   every Round (0, 1, 3, 4) to include a sentence like:
   "Before designing X, read `templates/crm/pages/main/<Y>/layout.yaml` —
   it's the canonical example of X." Possibly bake this into per-step
   checkpoints.

(1) is simpler for solo agents; (2) scales better as features grow. The
worst option is the current hybrid — partial manual + unmentioned
template dependency — because it invites exactly the kind of mistakes
this readthrough produced.

---

## Meta (push phase)
Deploy ended with "State saved. Done." — so the module is technically
live, but with P-5 (missing search boxes on tasks), P-7 (broken m2o links
on all 3 m2o fields), and no overview/dashboard content (M-7, blocked by
missing markdown/jsBlock block type docs). Before this can be called a
real working PM module, the manual needs P-1 through P-7 documented so
that a first-time builder doesn't hit 4 blocking errors and 3 silent
breakages in one push.

---

# Enrichment-Phase Findings (2026-04-18, adding KPI/tabs/milestones/JS cols)

Added: overview KPI jsBlock, recordActions (updateRecord + linkageRules
Done toggle), `nb_pm_milestones` collection + 2-tab page, JS column on
tasks table, multi-block popup with 24-grid width splits. All via
edit → push. Deployer fixes (commits 3ca4ce1 / 0fc84fd / 791f327 /
2774d01) landed alongside.

## E-1 `associationName` short-name trap — CRITICAL (now validator-caught)
Wrote `associationName: project.tasks` instead of
`nb_pm_projects.tasks`. Validator-blind until e7a75e... this session
(commit 2774d01 added the check). Runtime symptom was
`Collection project not found in data source main` deep inside a popup
render, not a push error. The CRM uses full names everywhere — short
form is simply a miswrite, easy for a human or AI to produce. Now
blocked pre-deploy.

## E-2 Popup template content depends on host-field convert context
Running `saveTemplate(saveMode: 'convert')` on an m2o field host stamps
that host's `associationName` + `sourceId` onto every block inside the
resulting popup template. Shared templates pointed at from other m2o
fields then render empty / 400 ("id=undefined"). Fix required a
post-compose walk to clear `resource.init.associationName` / sourceId /
binding on every block inside the template target (commit 791f327).

Documented for awareness — anyone touching popup template deploy has
to remember this host-context leakage. Baked into click-to-open.ts
`neutraliseTemplateTargetBlocks`.

## E-3 Complex layout 24-grid widths work (docs lacking)
Layout rows accept `{ key: width }` per block: `[milestones: 12, comments: 12]`
renders two tables side-by-side at 50%/50%. Manual doesn't show this;
only CRM overview demonstrates it (`[high_score_leads: 16, today_s_tasks: 8]`).
Should be a one-liner in SKILL.md under "Two identifiers" or in a new
"Layout grid widths" sidenote.

## E-4 Multi-tab page: removing old flat layout leaves orphan popups
Migrating `milestones/layout.yaml` → `milestones/tab_upcoming/layout.yaml` +
`milestones/tab_achieved/layout.yaml`: filesystem cleanly switches, but
the OLD auto-derived page popup (e.g. `popups/table.fields.title.yaml`)
was still in the NB state. The next deploy logs
`= popup [$milestones.table.fields.title] (exists, sync content)` and
keeps syncing the old binding. Non-destructive (tabs still work), but
the orphan accumulates. Worth: a validator warn when state has popups
for fields that no longer exist in any tab's blocks.

## E-5 recordActions with linkageRules render but validator doesn't check shape
`updateRecord` + `linkageRules` is the canonical status-toggle pattern
(see templates/crm/pages/main/overview/layout.yaml). The YAML is
gnarly — nested `condition.items[].path / operator / value` + `actions[].
name / params.value: hidden`. Easy to miswire. Validator currently only
checks action type; it could surface structural mistakes (missing
`assign`, wrong `operator`, typos in `linkageSetActionProps`).

## E-6 Icon names unvalidated
Wrote `icon: redoeoutlined` by typo (should be `redooutlined`). Deploy
accepts it; UI renders blank icon. Low-priority but cheap: validator
could maintain a whitelist of Ant Design icon names and warn on
unknowns. Similarly for `flagoutlined` / `checkcircleoutlined` —
wouldn't hurt to verify.

## E-7 `linkageRules` schema differs per host — LANDMINE
Same key `linkageRules` lives in three different storage shapes across
NocoBase flow-model contexts:

| Host | NB stepParams path | Shape |
|---|---|---|
| Action button | `buttonSettings.linkageRules` | **flat array** |
| Form grid (fieldLinkageRules) | `eventSettings.linkageRules.value` | object → `.value` is array |
| Details block (fieldLinkageRules) | `detailsSettings.linkageRules.value` | object → `.value` is array |
| Block card (blockLinkageRules) | `cardSettings.linkageRules` | **flat array** |

Sources: `packages/plugins/@nocobase/plugin-flow-engine/server/flow-surfaces/catalog.ts`
(`linkageRules: ARRAY_SCHEMA` for button) vs `packages/core/client/src/flow/
models/actions/UpdateRecordActionModel.tsx` (flow registration) vs
exporter code that pulls back both shapes.

Our deployer wrote the `{value: [...]}` wrapper on action buttons —
the runtime reader saw no rules and never fired hide/disable. Fixed
in commit `fc09127` for action buttons. The validator should now
catch the wrong shape pre-deploy:

- `recordActions[].linkageRules` — must be a flat array, not `{value: [...]}`
- `actions[].linkageRules` — same
- `fieldLinkageRules` — must be `{value: [...]}` (inverse)
- Anyone writing `linkageRules:` in DSL YAML should match the shape
  that fits the host type.

**Action item**: add a validator rule that errors on mismatched shape
+ a one-line note in SKILL.md Common Errors ("If a hide/disable rule
doesn't fire in UI, re-check linkageRules shape against host — see
ISSUES E-7 for the cheat sheet").

## Summary of validator / deployer improvements this session
- **Validator** (4 new rules):
  - m2o fields must have popup binding (clickToOpen path or defaults.yaml)
  - defaults.yaml popup templates must be inlined somewhere
  - associationName must use full collection name
  - System columns in collection YAML → warn
- **Deployer** (3 new behaviours):
  - Promote fresh popup templates to flowModelTemplates (undo of bfa92ae trim)
  - Compose popup content onto template target grid (not host field)
  - Neutralise host's associationName/sourceId/binding from template blocks
- **Manual** trimmed 437 → 211 lines; decision-table pointing to CRM for patterns.

