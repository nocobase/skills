# Boundary Quick Route

Use this file first when a Portal-resolved request is only a partial match for Modern page (v2) UI work.

Stay on this route when the right answer is "handle the Modern-page slice, then narrow or hand off the rest" instead of pretending the whole task belongs here.

## Common-case flow

1. Before applying this route, load and execute `nocobase-portal-manage` for the same request unless its current-request routing outcome is already present; reuse that outcome to avoid loops. Continue only with one selected Portal whose inventory record explicitly has `portalType === "no-code"`, or explicit `capabilities.multiPortal === false` evidence. A one-Portal count without that type check is insufficient.
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
| any unresolved NocoBase page/UI request, whether or not it mentions a Portal | `nocobase-portal-manage` first. Return here only with one selected no-code Portal or explicit `capabilities.multiPortal === false`; a sole AI Portal automatically continues on its source-code path without a confirmation question. |
| ACL / role / route permission | `nocobase-acl-manage` |
| collection / field / relation authoring | `nocobase-data-modeling` |
| workflow create / update / execution | `nocobase-workflow-manage` |
| browser reproduction / visual QA / site validation | browser or QA skills, not this skill |

## Guardrails

- Do not widen scope just because the user mentioned a page somewhere in the request.
- No Portal, multiple unselected Portals, or one Portal whose `portalType` is AI, missing, or unsupported means stop UI Builder without a `flow-surfaces` write; do not infer no-code from the count, cwd/config, or retry against Admin. A sole AI Portal immediately continues through Portal Manage's source project in the same request—do not ask whether to use it or create a no-code Portal.
- Missing `nb portal` alone is not a no-code fallback. The legacy Admin/Mobile lane requires explicit `capabilities.multiPortal === false` or Portal Manager's verified legacy Flow Surfaces signature; command absence without the successful core authoring/read probes still stops.
- Do not open template / runtime / helper docs unless the in-scope Modern-page slice actually needs them.
- If nothing meaningful belongs to Modern page (v2) UI work, say so directly and hand off the full request.
