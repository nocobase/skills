# Boundary Quick Route

Use this file first when the request is only a partial match for Modern page (v2) UI work.

Stay on this route when the right answer is "handle the Modern-page slice, then narrow or hand off the rest" instead of pretending the whole task belongs here.

## Common-case flow

1. Keep only the Modern-page slice that is clearly in scope.
2. Name the out-of-scope slices directly from the skill boundary.
3. Hand off each out-of-scope slice to the matching skill.
4. Do not inspect runtime, scripts, helper docs, or a live workspace just to justify that boundary.

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
| ACL / role / route permission | `nocobase-acl-manage` |
| collection / field / relation authoring | `nocobase-data-modeling` |
| workflow create / update / execution | `nocobase-workflow-manage` |
| browser reproduction / visual QA / site validation | browser or QA skills, not this skill |

## Guardrails

- Do not widen scope just because the user mentioned a page somewhere in the request.
- Do not open template / runtime / helper docs unless the in-scope Modern-page slice actually needs them.
- If nothing meaningful belongs to Modern page (v2) UI work, say so directly and hand off the full request.
