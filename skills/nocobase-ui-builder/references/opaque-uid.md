---
title: Opaque UID rules
description: Use `opaque_uid.mjs` to generate page and node uids instead of hand-written semantic identifiers.
---

# Opaque UID rules

All page and node uids must be generated or resolved through `scripts/opaque_uid.mjs`. Do not hand-write semantic ids.

## Default paths

- the registry is resolved from the current session by default
- override it with `--registry-path <path>` or `NOCOBASE_UI_BUILDER_REGISTRY_PATH`
- pin the session directory with `NOCOBASE_UI_BUILDER_SESSION_ROOT` or `NOCOBASE_UI_BUILDER_STATE_DIR`

## Common commands

Reserve a page:

```bash
node scripts/opaque_uid.mjs reserve-page --title "Orders"
```

Resolve an existing page:

```bash
node scripts/opaque_uid.mjs resolve-page --title "Orders"
node scripts/opaque_uid.mjs resolve-page --schemaUid "k7n4x9p2q5ra"
```

Rename a local registry record:

```bash
node scripts/opaque_uid.mjs rename-page \
  --schemaUid "k7n4x9p2q5ra" \
  --title "Orders Admin"
```

Generate stable node uids in bulk:

```bash
node scripts/opaque_uid.mjs node-uids \
  --page-schema-uid "k7n4x9p2q5ra" \
  --specs-json '[{"key":"ordersTable","use":"TableBlockModel","path":"block:table:orders:main"}]'
```

## Hard rules

1. In `createV2` flows, page `schemaUid` must come from `reserve-page`
2. The hidden default tab route is always `tabs-{schemaUid}`
3. The page root node and default grid flow model uid are still server-generated and must not be overridden
4. New blocks, columns, form items, and actions should be generated through `node-uids`
5. Even when only one uid is needed, still pass a single-element array into `node-uids`
6. If the registry is missing and the user did not provide `schemaUid`, do not guess from the title. Stop and ask for `schemaUid`

## Logical path patterns

- block shells:
  - `block:table:{collection}:{slot}`
  - `block:create-form:{collection}:{slot}`
  - `block:edit-form:{collection}:{slot}`
- table children:
  - `block:table:{collection}:{slot}:column:{field}`
  - `block:table:{collection}:{slot}:action:{action}`
- create-form children:
  - `block:create-form:{collection}:{slot}:grid`
  - `block:create-form:{collection}:{slot}:item:{field}`
  - `block:create-form:{collection}:{slot}:action:{action}`
- edit-form children:
  - `block:edit-form:{collection}:{slot}:grid`
  - `block:edit-form:{collection}:{slot}:item:{field}`
  - `block:edit-form:{collection}:{slot}:action:{action}`

Paths must stay stable, recomputable, and reusable. Do not improvise them from natural language.
