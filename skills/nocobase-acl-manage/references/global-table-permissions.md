# Global Table Permissions

Use the data-source role strategy endpoint first for broad permissions that should apply consistently across many collections.

Use this layer for rules like:

- this role can generally view records
- this role can generally create and update records
- this role should generally use `view:own`

Prefer global strategy when:

- many collections should behave similarly
- the user is describing a role broadly
- no collection-specific field or scope exception is needed yet

Realistic-role guidance:

- If the final design keeps global strategy empty, state why.
- Valid reasons include:
  - the role should only touch a narrow set of business collections
  - broad global rights would accidentally cover non-business tables
  - every relevant collection has materially different rules and must use independent permissions
- Do not leave global strategy empty simply because independent permissions were faster to prototype.
