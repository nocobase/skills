---
name: nocobase-data-modeling
description: Create and manage NocoBase data models (collections, fields, relations) via API. Use when users want to design schemas and run collection/field operations programmatically.
argument-hint: "[collection-name] [operation: create|update|list|get]"
allowed-tools: Bash, Read
---

# Goal

Design and implement NocoBase data models through API calls.

# Workflow

1. Clarify modeling intent:
   - Create/update/list/get collections
   - Add/update/list fields
   - Configure relations
2. Ensure API authentication is ready by following `nocobase-api-call` skill rules.
3. Fetch API spec for data modeling namespace only:
   - `skills/nocobase-swagger-fetch/scripts/get-swagger.sh plugins%2Fdata-source-main`
4. Parse Swagger response to identify endpoint, method, and payload schema.
5. Execute the request with `nocobase-api-call`:
   - `skills/nocobase-api-call/scripts/nocobase-api.sh <METHOD> <ENDPOINT> [JSON_OR_FILE]`
6. Verify results by querying the created/updated collection or fields.
7. For complex schemas, prefer templates in `assets/collection-templates/`.

# Mandatory Doc-Read Gate

- Do not construct API requests before fetching Swagger.
- Namespace is fixed to `plugins%2Fdata-source-main` for this skill.

# Resources

- `../nocobase-swagger-fetch/` - Shared swagger retrieval skill
- `../nocobase-api-call/` - Shared API execution skill
- `assets/collection-templates/` - Reusable schema templates

# Usage

```bash
# 1) Read available endpoints in fixed namespace
skills/nocobase-swagger-fetch/scripts/get-swagger.sh plugins%2Fdata-source-main | jq '.paths | keys'

# 2) Inspect create collection API
skills/nocobase-swagger-fetch/scripts/get-swagger.sh plugins%2Fdata-source-main | jq '.paths["/collections:create"]'

# 3) Create collection
skills/nocobase-api-call/scripts/nocobase-api.sh POST /collections:create '{"name":"products","title":"Products"}'

# 4) Verify
skills/nocobase-api-call/scripts/nocobase-api.sh GET '/collections:get?filterByTk=products'
```
