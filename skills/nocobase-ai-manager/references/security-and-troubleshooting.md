# Security and Troubleshooting

## Protected Temporary Files

For any secret-bearing JSON body:

```bash
umask 077
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT INT TERM
```

Write the JSON without printing it, execute with `--body-file "$BODY_FILE"`, then remove the file. Confirm permissions are owner-only when the platform supports it.

Never put real secrets in:

- skill documentation or examples;
- shell command summaries;
- final responses;
- query strings;
- committed files;
- debugging output or pasted full API responses.

## Safe Output

Default LLM output fields:

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

`modelOptions` may appear in reads in some versions. Treat it as read-only and never use it to build an update payload.

## Error Handling

| Symptom | Action |
|---|---|
| `Unknown command: api ai` | Run `nb env update <env> --verbose`; verify AI and API Documentation capability; hand plugin changes to `nocobase-plugin-manage`. |
| 401/403 | Stop; verify env authentication, token, role, and ACL. Do not retry with guessed credentials. |
| Provider/model missing | Refresh runtime, rediscover provider models, and verify provider configuration and model type. |
| `test-flight` fails | Do not save; report provider response safely and ask for corrected settings. |
| Validation rejects a flag | Read real `--help`; remove unsupported or forbidden fields rather than switching to hidden APIs. |
| Referenced delete fails | Preserve the service; list dependencies and plan migration/unbinding. |
| Timeout or 5xx | Treat result as unconfirmed; perform a safe read before deciding whether a mutation happened. |

## Rollback Boundaries

- Create: deleting a newly created service after verification failure still requires a fresh explicit secondary confirmation immediately before `destroy`.
- Update: restore a safe snapshot, but credentials must be re-supplied by the user.
- Delete: automatic restoration is impossible without the complete original configuration and secrets.
- Partial multi-object work: record successful objects and do not delete unrelated pre-existing resources.

## Cleanup Check

Before finishing:

- temporary body files are removed;
- no secret appears in command/output summaries;
- readback result is safe-field only;
- dependency and rollback status are explicit;
- downstream skills receive identifiers, not secrets.
