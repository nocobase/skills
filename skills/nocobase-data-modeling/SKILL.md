---
name: nocobase-data-modeling
description: Create and manage NocoBase data models (collections, fields, relations) via MCP. Use when users want to design schemas and run collection/field operations programmatically.
argument-hint: "[collection-name] [operation: create|update|list|get]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

Design and implement NocoBase data models through MCP (Model Context Protocol).

# Workflow

1. Clarify modeling intent:
   - Create/update/list/get collections
   - Add/update/list fields
   - Configure relations
2. Check if NocoBase MCP server is configured:
   - Look for available MCP tools from NocoBase server.
   - If not configured, guide user to use `nocobase-mcp-setup` skill first.
3. Use the appropriate MCP tools to execute data modeling operations:
   - List collections: Use MCP tool for GET `/collections:list`
   - Create collection: Use MCP tool for POST `/collections:create`
   - Add fields: Use MCP tool for POST `/collections.fields:create`
   - Configure relations: Use MCP tool for field operations with relation types
4. Verify results by querying the created/updated collection or fields.
5. For complex schemas, prefer templates in `assets/collection-templates/`.

# Resources

- `../nocobase-swagger-fetch/` - Shared swagger retrieval skill
- `../nocobase-api-call/` - Shared API execution skill
- `assets/collection-templates/` - Reusable schema templates

# Usage

```text
# 1) Read available endpoints in fixed namespace
Fetch Swagger for namespace `plugins%2Fdata-source-main`.

# 2) Inspect create collection API
Extract from returned Swagger JSON: .paths["/collections:create"]

# 3) Create collection
Ask the agent to create collection `products` via `nocobase-api-call` on endpoint `/collections:create`.

# 4) Verify
Ask the agent to verify collection `products` via `nocobase-api-call` on endpoint `/collections:get?filterByTk=products`.
```
