# UID Generation

Use this reference when part of a NocoBase UI, schema, or configuration payload needs a short opaque UID and there is no project-local helper already available.

## Recommended Approach

- Prefer an existing project utility if the current file or package already uses one.
- Otherwise reuse [scripts/uid.js](../../scripts/uid.js).
- Keep the default length `11` unless the surrounding code has a stronger convention.
- When executing the helper as a script, resolve the file path in the current workspace first. Do not assume the current working directory matches the skill document location.

## Guardrails

- This helper is intended for UI/schema identifiers, not security-sensitive tokens.
- It uses `Math.random()`, so it is fine for local opaque IDs but not for secrets, auth, or cryptographic uniqueness guarantees.

## Usage

```js
const blockUid = uid();
const fieldUid = uid(16);
```

Command form:

- Resolve the path to `skills/nocobase-utils/scripts/uid.js` in the current workspace.
- Then run `node <resolved-path-to-uid.js>` or `node <resolved-path-to-uid.js> 16`.

## Implementation

See [scripts/uid.js](../../scripts/uid.js) for the canonical zero-dependency snippet. It can be copied into the target module or executed directly to print a UID.
