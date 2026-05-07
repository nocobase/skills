# Execution Gates

Use this reference when executing an existing NocoBase plan.

## Task Slice Rules

A task slice should be small enough for the user to verify directly. Good slices:

- create or update one related group of collections
- create one page or one tightly related page group only when the user explicitly accepts batch UI work
- create one workflow draft
- configure one role or one permission set after confirmation
- run one acceptance scenario

Avoid combining UI, workflow enablement, and ACL changes in one slice.

## Acceptance Gate Wording

After each mutating slice, stop with:

```text
This task is complete and awaiting your acceptance.
Please check <specific place>.
Reply:
- "accepted" to continue
- "adjust <change>" to revise this task
- "pause" to stop here
```

Do not proceed on vague acknowledgment unless the user clearly asks to continue.

## Readback Evidence By Task Type

- Data model: `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j -e <env>`
- UI route: `nb api resource list --resource desktopRoutes --page-size 200 -j -e <env>`
- UI surface: `nb api flow-surfaces get --target '{"pageSchemaUid":"<uid>"}' -j -e <env>` when detailed surface proof is needed
- Workflow: `nb api workflow workflows get --filter-by-tk <id> --appends nodes --appends versionStats -j -e <env>`
- ACL: use ACL skill readback commands; do not generic-write ACL policy
- Test data: `nb api resource list --resource <collection> -j -e <env>` with filters when needed

Run these readbacks both after task completion and before later tasks that may touch the same target. The pre-task readback feeds drift detection; the post-task readback feeds acceptance evidence and the next baseline snapshot.

## Resume After Interruption

Treat an interrupted command as unknown. First read live state, then classify:

- fully applied: evidence matches expected result
- partially applied: some records/routes/nodes exist, but not all expected pieces
- not applied: no matching live evidence
- uncertain: readback is unavailable or ambiguous

Never clean up automatically. Ask the user whether to keep, adjust, continue, or delete partial work.

## Plan Updates

When a task is adjusted, update the run log with:

- original task id
- user feedback
- adjustment made
- new readback evidence
- acceptance status

Do not rewrite the original plan unless the user explicitly wants the plan file amended.

When live UI or runtime changes are adopted into the plan, record a new plan version entry even if the original plan file is not rewritten. The version entry should state which live changes were adopted, which future tasks were changed, and which baseline snapshot became authoritative.
