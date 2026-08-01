# Knowledge-Base Edition and Capability Preflight

## Contents

- [Static Product Contract](#static-product-contract)
- [Do Not Guess the Edition](#do-not-guess-the-edition)
- [Evidence Sources](#evidence-sources)
- [Consent-Based Enablement](#3-consent-based-enablement)
- [Decision Matrix](#decision-matrix)
- [Preflight Result Contract](#preflight-result-contract)
- [User-Facing Messages](#user-facing-messages)

## Static Product Contract

The knowledge-base package is:

```text
@nocobase/plugin-ai-knowledge-base
```

It requires NocoBase Professional Edition or higher. Enterprise is supported. Community and Standard do not satisfy the minimum edition.

State this requirement at the beginning of every KB-intent workflow, before configuring LLM, embedding, storage, PGVector, documents, or employee bindings.

## Do Not Guess the Edition

Do not claim the current edition from any single weak signal:

- missing `nb api kb` commands;
- missing saved CLI license key;
- `nb env info` output;
- `nb license status` output;
- 401/403;
- plugin absence;
- runtime refresh failure.

Current CLI implementations may report commercial license status as not implemented, and environment info does not provide an edition contract. A missing KB command can also mean disabled plugin, stale generated runtime, old CLI, missing API documentation capability, authentication failure, or ACL denial.

## Evidence Sources

### 1. Entitlement Evidence

When supported for the selected managed environment:

```bash
nb license plugins list --env <env> --yes --json
```

Inspect both arrays:

```text
commercialPlugins
licensedPlugins
```

Classification:

- package in `licensedPlugins`: `entitlement=licensed`;
- package in `commercialPlugins` but absent from `licensedPlugins`: `entitlement=unlicensed`;
- no saved key, unsupported environment, registry/network failure, or unparseable output: `entitlement=unknown`.

Do not expose license secrets or registry credentials.

### 2. Installed and Enabled Plugin Evidence

Use the supported plugin-list surface for the selected environment:

```bash
nb plugin list --env <env> --yes
```

When current generated help exposes a structured plugin list, a safe read of `pm:list` may be used to inspect `packageName` and `enabled`.

Classify the exact package as:

```text
installed-enabled
installed-disabled
absent
unknown
```

Also verify the base package `@nocobase/plugin-ai` is enabled. The knowledge-base plugin cannot operate without it.

If either required package is `installed-disabled`, do not end with a manual instruction telling the user to enable it. Continue with the consent-based enablement branch below.

### 3. Consent-Based Enablement

For every installed-disabled required package:

1. Show the exact environment and exact package name(s).
2. Explain that enabling changes plugin runtime state and that runtime/API checks will be repeated afterward.
3. Ask whether the user wants the agent to enable the package now.
4. If the user explicitly approves, invoke `nocobase-plugin-manage` in safe mode. Its direct command is:

```bash
nb plugin enable --env <env> --yes @nocobase/plugin-ai-knowledge-base
```

If `@nocobase/plugin-ai` is also installed-disabled, include it in the same consent question and enable only the approved exact packages:

```bash
nb plugin enable --env <env> --yes @nocobase/plugin-ai @nocobase/plugin-ai-knowledge-base
```

5. Verify post-state with `nb plugin list --env <env> --yes`.
6. Run `nb env update <env> --verbose`, regenerate/read KB help, and perform a safe read to classify runtime capability and ACL.

If the user declines, preserve disabled state and stop before KB mutation. If enablement fails or post-state remains disabled, report the failure and stop; do not ask the user to run the same command manually, do not retry indefinitely, and do not auto-disable as rollback.

### 4. Runtime/API Evidence

After plugin-state inspection:

```bash
nb env update <env> --verbose
nb api kb --help --env <env> --yes
nb api kb vector-databases --help --env <env> --yes
nb api kb documents --help --env <env> --yes
```

Then perform one safe read, such as KB list, when authorized.

Classify:

```text
available
unavailable
unknown
```

Distinguish:

- command missing/runtime generation failure;
- 401/403 authentication or ACL denial;
- endpoint 404/capability absence;
- successful help plus safe read.

## Decision Matrix

| Entitlement | Plugin state | Runtime/API | Decision |
|---|---|---|---|
| `licensed` | `installed-enabled` | `available` | Continue. |
| `unlicensed` | any | any | Stop and explain Professional+ requirement. |
| `licensed` | `absent` | unavailable | Stop; licensed plugin is not synchronized/installed. |
| `licensed` | `installed-disabled` | unavailable | Ask for exact package/environment consent. If approved, enable through `nocobase-plugin-manage`, verify post-state, refresh runtime, and re-run preflight; if declined or failed, stop. |
| `unknown` | `installed-disabled` | unavailable | State Professional+ requirement, ask for exact package/environment consent, and follow the same enable/readback/refresh branch; continue only if the resulting runtime/API and ACL checks pass. |
| `unknown` | `installed-enabled` | `available` | Continue with `edition=unverified`; operational capability is proven. |
| `unknown` | `absent` | unavailable | Stop as unavailable/unknown; do not claim Community Edition. |
| `unknown` | `installed-enabled` | unavailable | Stop for runtime/API investigation. |
| any | any | 401/403 | Stop for authentication/ACL recovery; do not label as edition failure. |

A source-development environment may have operational commercial-plugin code without local license metadata. The `unknown + enabled + available` path intentionally supports that case while still disclosing the product's Professional+ requirement.

## Preflight Result Contract

```yaml
knowledgeBaseCapability:
  requiredEdition: professional+
  packageName: "@nocobase/plugin-ai-knowledge-base"
  environment: <env>
  entitlement: licensed | unlicensed | unknown
  pluginState: installed-enabled | installed-disabled | absent | unknown
  baseAIPlugin: enabled | disabled | absent | unknown
  pluginEnablement: not-needed | proposed | approved | declined | succeeded | failed
  runtimeCapability: available | unavailable | unknown
  acl: allowed | denied | unknown
  evidence: []
  decision: continue | stop
  reason: <safe explanation>
```

This result is current-environment evidence, not a permanent cache. Re-run it before later KB mutations when the runtime, license, plugin state, or environment may have changed.

## User-Facing Messages

Disabled-plugin consent request:

```text
NocoBase AI Knowledge Base is installed but disabled in <env>.
Should I enable @nocobase/plugin-ai-knowledge-base now, verify the plugin state,
refresh the environment, and continue the KB API and permission checks?
```

Successful enablement:

```text
Enabled @nocobase/plugin-ai-knowledge-base in <env> after your approval.
The enabled state was verified. I will now refresh runtime metadata and re-check
the KB API and permissions before creating any knowledge-base resources.
```

Explicit unlicensed result:

```text
NocoBase AI Knowledge Base requires Professional Edition or higher.
The current commercial-plugin entitlement does not include
@nocobase/plugin-ai-knowledge-base, so this operation stopped before mutation.
```

Unknown result:

```text
NocoBase AI Knowledge Base requires Professional Edition or higher.
The current environment's entitlement or plugin capability could not be verified.
No knowledge-base mutation was performed. A missing KB command alone does not prove
that the environment is Community Edition.
```

Operational but edition-unverified result:

```text
NocoBase AI Knowledge Base is a Professional-or-higher feature. The current CLI
license metadata is unavailable, but the plugin is enabled and its KB API is
operational in this environment, so the requested safe workflow can continue.
```