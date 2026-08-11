# Security and Troubleshooting

## Protected Temporary Files

For secret-bearing JSON:

```bash
umask 077
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT INT TERM
```

Write JSON without printing it, execute with `--body-file "$BODY_FILE"`, verify owner-only permissions when supported, and remove the file on every exit path.

Never put real secrets in:

- skill documentation or examples;
- shell arguments that appear in history/process listings when a body file is supported;
- query strings;
- command summaries or final responses;
- committed files;
- debugging output or copied full API responses.

## Safe Output

Default safe service fields:

```text
name,title,provider,enabled,enabledModels
```

Do not output:

```text
options
API keys
access tokens
full secret-bearing response bodies
```

`modelOptions` may appear in reads in some versions. Treat it as read-only and never include it in writes.

## Capability and Dependency Failures

| Symptom | Action |
|---|---|
| `Unknown command: api ai` | Run `nb env update <env> --verbose`; verify the base AI plugin and API documentation capability; hand plugin changes to plugin management. |
| KB consumer has no capability result | Return to `nocobase-ai-knowledge-base-manager`; do not discover/configure KB prerequisites as if the commercial gate passed. |
| `nb api kb` unavailable during a disruptive LLM change | Mark KB dependencies `unknown` and block the disruptive change. Do not infer Community Edition and do not assume an empty dependency set. |
| `nb license status` says not implemented | Ignore it for readiness. Knowledge-base entitlement is handled by the KB manager through supported evidence. |
| 401/403 | Stop; verify environment auth, token, role, and ACL. Do not retry with guessed credentials. |
| Provider/model missing | Refresh runtime, rediscover provider models, and verify model type. |
| `test-flight` fails | Do not save; report the provider error without secrets and request corrected settings. |
| Validation rejects a flag | Read current help and remove unsupported fields; do not switch to hidden APIs. |
| Timeout or 5xx | Treat mutation state as unknown and perform one safe readback before deciding whether to retry. |

Do not collapse edition, entitlement, plugin enablement, API capability, ACL, and provider errors into one generic "plugin unavailable" message.

## Rollback Boundaries

- Create: deleting a newly created service after verification failure requires a separate fresh confirmation.
- Update: restore the safe snapshot, but the user must re-supply credentials.
- Disable: restore the previous enabled state only after dependency and impact checks.
- Delete: automatic restoration is impossible without the original complete configuration and secrets.
- Partial multi-object work: record successful objects and never delete unrelated pre-existing resources.

## Cleanup Check

Before finishing:

- temporary body files are removed;
- no secret appears in command/output summaries;
- readback is safe-field only;
- core-AI and KB-prerequisite status are separated;
- employee and KB dependency visibility is explicit;
- rollback limits and downstream handoffs are explicit.