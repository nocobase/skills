# NocoBase Skills Workspace

This workspace is organized around composable skills. Base capabilities are centralized, and domain skills build on top of them.

## Skill Roles

- `skills/nocobase-install-start`: install and start NocoBase.
- `skills/nocobase-api-call`: single base skill for authenticated API requests and environment setup.
- `skills/nocobase-swagger-fetch`: fetch Swagger by delegating to `nocobase-api-call`.
- `skills/nocobase-data-modeling`: data modeling workflow using fixed namespace `plugin-data-source-main`.

## 1) Install NocoBase

Use `nocobase-install-start` skill first.

It helps choose one method (`docker`, `create-nocobase-app`, `git`) and provides startup commands after you confirm install directory.

## 2) Get API Key

After NocoBase starts:

1. Sign in to NocoBase admin UI.
2. Open `Settings -> API keys`.
3. Create a key and copy the token.

## 3) Configure API Environment (Generic)

Preferred approach: set global/session environment variables:

```bash
export NOCOBASE_URL="http://localhost:13000"
export NOCOBASE_API_TOKEN="<your-token>"
```

Optional fallback: create `./.env` in current working directory:

```bash
cat > .env <<'EOF'
NOCOBASE_URL=http://localhost:13000
NOCOBASE_API_TOKEN=replace-with-your-api-token
EOF
```

Skills will read config in this order:

1. Environment variables (`NOCOBASE_URL`, `NOCOBASE_API_TOKEN`).
2. `./.env` in current working directory.

If token is missing and `./.env` does not exist, `skills/nocobase-api-call/scripts/nocobase-api.sh`
will auto-create `./.env` template and prompt you to edit the token.

## 4) Call API Directly

```bash
skills/nocobase-api-call/scripts/nocobase-api.sh GET /collections:list
skills/nocobase-api-call/scripts/nocobase-api.sh POST /collections:create '{"name":"products","title":"Products"}'
```

## 5) Fetch Swagger (No Default Namespace)

`nocobase-swagger-fetch` requires namespace explicitly every time:

```bash
skills/nocobase-swagger-fetch/scripts/get-swagger.sh plugin-data-source-main
skills/nocobase-swagger-fetch/scripts/get-swagger.sh core
```

## 6) Data Modeling Workflow

`nocobase-data-modeling` always reads Swagger from namespace:

- `plugin-data-source-main`

Typical flow:

```bash
skills/nocobase-swagger-fetch/scripts/get-swagger.sh plugin-data-source-main | jq '.paths | keys'
skills/nocobase-api-call/scripts/nocobase-api.sh POST /collections:create '{"name":"products","title":"Products"}'
```
