# Docker Templates (Local-First)

This skill ships deterministic local Docker templates for bundled databases.
Use local templates first. Only use WebFetch as fallback when a requested
variant is missing locally.

## Template Files

- `assets/docker-templates/docker-compose.postgres.yml`
- `assets/docker-templates/docker-compose.mysql.yml`
- `assets/docker-templates/docker-compose.mariadb.yml`

## Selection Rule

1. Default (`quick` mode): `docker-compose.postgres.yml`
2. `db_dialect=mysql`: `docker-compose.mysql.yml`
3. `db_dialect=mariadb`: `docker-compose.mariadb.yml`

Note: external database compose templates are intentionally not included in this
revision. If users explicitly require external DB, use official docs as fallback.

## APP_KEY Policy

Templates require `APP_KEY` explicitly and fail fast if it is missing.
Do not use placeholder values such as `please-change-me` or `*-secret-key-change-me`.
Use a random key with at least 32 characters.

PowerShell:

```powershell
$env:APP_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Bash:

```bash
export APP_KEY="$(openssl rand -hex 32)"
```

## Release Channel Mapping

Templates expose `NOCOBASE_APP_IMAGE` with a default of `latest-full`.
Switch release channel by setting this environment variable before start:

- `latest`: `registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:latest-full`
- `beta`: `registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:beta-full`
- `alpha`: `registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:alpha-full`

Example:

```bash
export NOCOBASE_APP_IMAGE=registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:beta-full
docker compose up -d
```

PowerShell:

```powershell
$env:NOCOBASE_APP_IMAGE="registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:beta-full"
docker compose up -d
```
