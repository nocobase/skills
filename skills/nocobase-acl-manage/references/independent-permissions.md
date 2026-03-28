# Table Independent Permissions

Use collection-level independent permissions when a collection needs behavior that differs from the global table strategy.

Common cases:

- only one collection should be readable
- one collection should use `view:own` while the rest use `view`
- one collection should expose only part of the fields
- one collection needs a custom scope filter

Key flag:

- `usingActionsConfig: true`

Configuration rule:

- Inspect `availableActions:list` before writing action names.
- Do not guess action names.
- For realistic business roles, do not stop at action names alone.

Realistic-role guidance:

- Independent permissions should usually include:
  - action names
  - field strategy for important actions
  - scope decision for important actions
- If fields are omitted intentionally, confirm that full-field access is acceptable.
- If scope is omitted intentionally, confirm that full-row access is acceptable.
