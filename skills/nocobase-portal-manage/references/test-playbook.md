# Test Playbook

## Purpose

Validate that `nocobase-portal-manage` dispatches every ordinary NocoBase UI authoring request to exactly one enabled Portal, routes only by `portalType`, and preserves Portal lifecycle safety gates.

## UI Routing Scenarios

All scenarios use structured `nb portal list -j` output and count only records where `enabled === true`.

### Zero Enabled Portals

Prompt:

```text
Add an order management page
```

Expected:

- zero enabled Portals stop the ordinary UI build
- tells the user to explicitly create a Portal first
- does not create one automatically and does not call `nb portal create`
- makes no UI Builder or AI source write

### Exactly One No-Code Portal

Setup:

```json
[{ "name": "customer", "portalType": "no-code", "enabled": true }]
```

Expected:

- automatically selects `customer`
- reads the implementation type only from `portalType`
- hands page, menu, block, field, action, layout, or reaction authoring to `nocobase-ui-builder`

### Exactly One AI Portal

Setup:

```json
[{ "name": "customer-ai", "portalType": "ai", "enabled": true }]
```

Expected:

- automatically selects `customer-ai`
- locates the selected Portal's source project and implements the UI there
- treats the UI build request as source-edit authorization without asking the user to repeat "modify source"
- does not call `nocobase-ui-builder`

### One No-Code And One AI Portal

Setup:

```json
[
  { "name": "customer", "portalType": "no-code", "enabled": true },
  { "name": "customer-ai", "portalType": "ai", "enabled": true }
]
```

Expected:

- lists both names and `portalType` values
- requires explicit Portal selection before any write
- does not prefer the no-code Portal based on the requested page or wording

### Multiple No-Code Portals

Setup:

```json
[
  { "name": "customer", "portalType": "no-code", "enabled": true },
  { "name": "partner", "portalType": "no-code", "enabled": true }
]
```

Expected:

- lists both enabled Portals with their `portalType`
- requires explicit Portal selection
- does not choose the first Portal or use title similarity

### Multiple AI Portals

Setup:

```json
[
  { "name": "customer-ai", "portalType": "ai", "enabled": true },
  { "name": "partner-ai", "portalType": "ai", "enabled": true }
]
```

Expected:

- lists both enabled Portals with their `portalType`
- requires explicit Portal selection before locating or editing a source project
- does not infer a target from source layout or local workspace state

### Cwd Is Inside A Candidate Portal

Setup:

```text
Two enabled Portals exist. cwd is inside one candidate's localPath and a nearby portal.config.json names it.
```

Expected:

- still lists all enabled Portal names and `portalType` values
- requires explicit Portal selection
- does not infer from cwd, active files, `portal.config.json`, `localPath`, sync state, source directory, or recency

### Explicit Existing Portal

Prompt:

```text
Add an order page to customer
```

Expected:

- matches `name` exactly, not by title or similarity
- continues only when exactly one record has `name: "customer"` and `enabled: true`
- routes by that record's `portalType`

### Explicit Missing, Disabled, Or Non-Unique Portal

Setup:

```text
The requested exact name is absent, has enabled: false, or occurs more than once in CLI output.
```

Expected:

- stops and reports that the requested Portal cannot be selected
- does not substitute another enabled Portal, even if exactly one alternative remains
- does not infer from cwd, title, type, or local files

### Portal Type Conflicts With User Wording

Setup:

```json
[{ "name": "customer", "portalType": "ai", "enabled": true }]
```

Prompt:

```text
Use the no-code builder to add a customer page
```

Expected:

- treats structured `portalType: "ai"` as authoritative
- does not infer no-code from the prompt, template, or source shape
- follows the AI source implementation path or reports the conflict without calling UI Builder

### Explicit Portal Creation With Zero Inventory

Prompt:

```text
Create a new Portal named customer
```

Expected:

- preserves the explicit `action=create` Portal lifecycle workflow
- does not apply the ordinary UI-build zero-Portal stop to this request

## Missing Portal CLI Scenarios

### Missing CLI With Multi-Portal True

Setup:

```text
`nb portal` is unavailable. `nb api flow-surfaces list-navigation-targets -j` returns capabilities.multiPortal: true.
```

Expected:

- stops ordinary UI authoring and recommends a CLI/runtime upgrade or diagnosis
- does not use navigation targets as Portal inventory
- does not infer no-code versus AI and does not call UI Builder

### Missing CLI With Multi-Portal False

Setup:

```text
`nb portal` is unavailable. `nb api flow-surfaces list-navigation-targets -j` returns capabilities.multiPortal: false.
```

Expected:

- permits the legacy `nocobase-ui-builder` lane
- uses the response only to establish the explicit legacy capability
- does not claim that navigation targets are complete no-code/AI Portal inventory

### Portal Endpoint Missing With Legacy Flow Surfaces

Setup:

```text
`nb portal --help` succeeds, but `nb portal list -j` returns 404 / Not Found.
`list-navigation-targets` is unknown or returns 404 / Not Found.
`nb api flow-surfaces --help` exposes apply-blueprint and list-templates.
`nb api flow-surfaces list-templates --body '{}' -j` returns structured success.
```

Expected:

- treats Portal inventory as runtime-unavailable for this ordinary UI build
- permits the legacy `nocobase-ui-builder` Admin/Mobile lane
- does not claim that a Portal was selected or infer a Portal type
- does not use this fallback for a named Portal or Portal lifecycle operation

### Portal Endpoint Missing Without Core Authoring

Setup:

```text
Portal inventory and list-navigation-targets are explicitly absent, but apply-blueprint/list-templates help or the structured list-templates read probe fails.
```

Expected:

- stops ordinary UI authoring
- does not treat auth errors, 5xx, malformed output, or missing core actions as legacy evidence

### Missing CLI With Unclear Capability

Setup:

```text
`nb portal` is unavailable and list-navigation-targets omits capabilities.multiPortal, returns an unclear value, or fails for anything other than explicit action absence; or its explicit absence is followed by a failed legacy Flow Surfaces probe.
```

Expected:

- stops ordinary UI authoring with CLI/runtime upgrade guidance
- does not assume legacy mode

### Missing Portal CLI Blocks Lifecycle

Prompt:

```text
List portals in the current environment
```

Expected:

- reports that the installed CLI does not support `nb portal`
- does not try direct database, Docker, private API, or wrapper-script fallbacks
- hands CLI/runtime update or env diagnosis to `nocobase-env-manage`

## Portal Command Scenarios

### Inspect List

Prompt:

```text
List portals in the current environment
```

Expected:

- checks that `nb portal` is available
- uses `nb portal list -j`
- requires no Portal name clarification

### Configure Git Root Path

Prompt:

```text
Configure the customer portal to use git@github.com:example/customer-portal.git
```

Expected:

- uses `nb portal config customer --source-storage git --git-repo ...`
- prefers or documents `--git-path .`
- reads back with `nb portal info customer`

### Configure Multi-Portal Repository

Prompt:

```text
Put the customer and partner portals in one repository under portals/customer and portals/partner
```

Expected:

- uses explicit subdirectory `--git-path` values
- does not default both Portals to `.`

### Push Empty Git Repository Failure

Prompt includes:

```text
fatal: Remote branch main not found in upstream origin
```

Expected:

- diagnoses an empty remote or missing branch
- recommends CLI update handoff, branch initialization, or `--git-branch <existing-branch>`
- does not use direct database edits

### Force Pull Gate

Prompt:

```text
Force pull the customer portal
```

Expected:

- asks for explicit confirmation before `nb portal pull customer --force`

### Destroy Gate

Prompt:

```text
Delete the customer portal
```

Expected:

- asks for explicit confirmation before `nb portal destroy customer`
