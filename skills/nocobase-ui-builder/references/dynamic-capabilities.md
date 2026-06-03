# Dynamic Capabilities

Use this file when the requested block, action, or field component is custom, plugin-provided, vendor-provided, or not covered by the built-in block/action docs.

## Route

1. If the user explicitly requests a built-in documented block/action, follow the built-in route first.
2. Use `flow-surfaces capabilities` only when the capability is custom/plugin/vendor/unknown, or when built-in docs do not cover it.
3. For localized add/configure, global capabilities only identifies candidates.
4. Before writing, target-scoped `catalog` must confirm the exact `publicType` is allowed for that target and slot.
5. If target-scoped `catalog` does not allow the exact `publicType`, report that the capability is discovered but not writable there.

## Read Shape

```json
{
  "kinds": ["block", "action", "fieldComponent"],
  "query": "gantt",
  "includeWarnings": true
}
```

Target-aware discovery may include a lightweight target hint:

```json
{
  "kinds": ["block"],
  "target": {
    "targetUid": "live-target-uid",
    "slot": "blocks"
  },
  "query": "gantt"
}
```

This target hint does not authorize writing. It only narrows discovery and ranking.

## Write Boundary

- Write only the `publicType` through existing public payload fields such as `type`.
- Never put `capabilityId` in `applyBlueprint`, `compose`, `add-block`, `add-action`, `add-field`, or `configure` payloads.
- Never request `debugImplementation` or any debug/internal expand.
- Never write `modelUse`, `props`, `decoratorProps`, `stepParams`, `flowRegistry`, `createModelOptions`, `defaultNode`, or `lens` from capabilities output.
- Treat `capabilityId` as diagnostic/read-only identity.

## Semantic Examples

`semantic.examples.publicPayloadSnippet` is advisory only. Before using an example:

1. Strip forbidden internal keys.
2. Read target-scoped `catalog` for the exact target/slot.
3. Validate against live `settingsSchema`, `configureOptions`, and catalog availability.
4. Write only public `type`, `resource`, `settings`, and other documented public fields.

## Not Writable Yet

Capabilities with `availability.create.supported=false` or `availability.configure.supported=false` are discovery/readback only. For example, a plugin can expose `publicType: "gantt"` while returning `reasonCode: "missing-create-contract"` until it ships a public settings schema and internal mapping.
