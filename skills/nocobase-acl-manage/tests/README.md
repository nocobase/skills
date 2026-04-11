# ACL MCP Capability Runner

This folder provides a practical MCP-based capability check for `nocobase-acl-manage` v2.

## What It Verifies

Covered in this runner:

- protocol readiness
  - initialize / tools:list / tools:call
- role domain
  - create blank role and readback
  - role audit read chain
- global role-mode domain
  - role mode read
  - role mode write (`default`, `allow-use-union`, `only-use-union`) with optional rollback
- permission domain
  - system snippets
  - data-source global strategy
  - data-source resource independent strategy
  - desktop route capability
  - role collections listing with `filter.dataSourceKey`
- user domain
  - strict path behavior for membership write
  - optional guarded fallback with `resource_update`
  - membership readback with association resources
- risk-domain prerequisites
  - required read APIs for risk assessment

## Run

Basic run (safe defaults, skip runtime writes):

```bash
node ./skills/nocobase-acl-manage/tests/run-acl-mcp-capability.js \
  --mcp-url 'http://127.0.0.1:13000/api/mcp' \
  --token-env 'NOCOBASE_API_TOKEN' \
  --data-source-key 'main' \
  --collection-name 'users' \
  --skip-writes
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
  --desktop-route-key 'crm.customers' \
  --enable-guarded-user-writes
```

Use tool-name overrides when runtime names differ:

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
- `1`: one or more `fail`

## Notes

- The runner uses MCP JSON-RPC and `tools/call` only.
- No direct ACL `/api/*` fallback is performed.
- Global role-mode checks are high impact and guarded by `--enable-high-impact-writes`.
- Guarded user membership writes are disabled by default and require `--enable-guarded-user-writes`.
- For resource scope `all` or `own`, runner expects explicit non-null `scopeId` binding and matching `scope.key` in readback.
- For default-all field policy, runner expects explicit non-empty field lists (not `fields: []`) and readback field-count parity.
- Field defaults are validated per selected action; operation wording like `add permission` should not be interpreted as ACL action `create` unless capability intent is explicit.
- In current runtime, guarded fallback write may fail with `statusCode=500` and `list.filter is not a function`.
- Temporary test role cleanup is attempted when `roles_destroy` exists.
