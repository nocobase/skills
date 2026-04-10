# ACL MCP Capability Runner

This folder provides a practical MCP-based capability check for `nocobase-acl-manage`.

## What It Verifies

Covered in this runner:

- phase 1: smoke + base capabilities
  - protocol initialize/tools/list/tools/call
  - create role
  - bind user to role
  - set default role
  - role modes (`default`, `allow-use-union`, `only-use-union`)
- phase 2: configuration capabilities
  - system snippets (`ui.*`, `pm`, `pm.*`, `app`, plugin snippet)
  - data-source global strategy
  - single-table strategy
  - route permission capability

Not covered here:

- deprecated AI permission branch

## Run

Basic run (safe defaults):

```bash
node ./skills/nocobase-acl-manage/tests/run-acl-mcp-capability.js \
  --mcp-url 'http://127.0.0.1:13000/api/mcp' \
  --token-env 'NOCOBASE_API_TOKEN' \
  --data-source-key 'main' \
  --collection-name 'users'
```

Run with deeper runtime checks:

```bash
node ./skills/nocobase-acl-manage/tests/run-acl-mcp-capability.js \
  --mcp-url 'http://127.0.0.1:13000/api/mcp' \
  --token-env 'NOCOBASE_API_TOKEN' \
  --data-source-key 'main' \
  --collection-name 'users' \
  --test-user-id '1' \
  --enable-high-impact-writes \
  --enable-route-writes \
  --desktop-route-key 'crm.customers'
```

Use tool-name overrides when your MCP server names differ:

```bash
node ./skills/nocobase-acl-manage/tests/run-acl-mcp-capability.js \
  --mcp-url 'http://127.0.0.1:13000/api/mcp' \
  --token-env 'NOCOBASE_API_TOKEN' \
  --tool-overrides-path './skills/nocobase-acl-manage/tests/tool-overrides.example.json'
```

## Output

Default report path:

- `skills/nocobase-acl-manage/tests/report/acl-capability-<timestamp>.json`

Exit code:

- `0`: no `fail`
- `1`: at least one `fail`

## Notes

- The runner uses MCP JSON-RPC and `tools/call` only.
- No direct ACL `/api/*` fallback is performed.
- Default-role and role-mode checks are high impact and are guarded by `--enable-high-impact-writes`.
- Temporary test role cleanup is attempted when `roles_destroy` is available.
