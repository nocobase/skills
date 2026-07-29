# Boundary Quick Route

Use this file first when a Portal-resolved request is only a partial match for Modern page (v2) UI work.

Stay on this route when the right answer is "handle the Modern-page slice, then narrow or hand off the rest" instead of pretending the whole task belongs here.

## Common-case flow

1. Before any `flow-surfaces` mutation, require one selected no-code Portal or explicit `capabilities.multiPortal === false` evidence.
2. Keep only the Modern-page slice that is clearly in scope.
3. Name the out-of-scope slices directly from the skill boundary.
4. Hand off each out-of-scope slice to the matching skill.
5. Do not inspect runtime, scripts, helper docs, or a live workspace just to justify that boundary.

## Default artifact-only output

For artifact-only boundary tasks, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `boundary-report.md`

The report can stay short. It should say:

- which part of the request this skill can handle
- which part is out of scope
- which skill should take each out-of-scope slice next

## Common handoffs

| Request slice | Handoff |
| --- | --- |
| any unresolved NocoBase page/UI request, whether or not it mentions a Portal | `nocobase-portal-manage` first. Return here only with one selected no-code Portal or explicit `capabilities.multiPortal === false`; AI Portal UI stays on its source-code path. |
| ACL / role / route permission | `nocobase-acl-manage` |
| collection / field / relation authoring | `nocobase-data-modeling` |
| workflow create / update / execution | `nocobase-workflow-manage` |
| browser reproduction / visual QA / site validation | browser or QA skills, not this skill |

## Guardrails

- Do not widen scope just because the user mentioned a page somewhere in the request.
- No Portal, multiple unselected Portals, or an AI Portal means stop UI Builder without a `flow-surfaces` write; do not infer from cwd/config or retry against Admin.
- Missing `nb portal` is not a no-code fallback. Only an explicit `capabilities.multiPortal === false` result enables the legacy Admin/Mobile lane.
- Do not open template / runtime / helper docs unless the in-scope Modern-page slice actually needs them.
- If nothing meaningful belongs to Modern page (v2) UI work, say so directly and hand off the full request.
