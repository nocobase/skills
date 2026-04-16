# Docker Templates (Local-First)

This skill ships deterministic local Docker templates for both bundled and
existing database modes.
Use local templates first and keep install execution local.
Do not fetch install command snippets from web pages during runtime.

## Template Files

- `assets/docker-templates/docker-compose.postgres.yml`
- `assets/docker-templates/docker-compose.mysql.yml`
- `assets/docker-templates/docker-compose.mariadb.yml`
- `assets/docker-templates/docker-compose.external.postgres.yml`
- `assets/docker-templates/docker-compose.external.mysql.yml`
- `assets/docker-templates/docker-compose.external.mariadb.yml`

## Selection Rule

1. `db_mode=bundled` (default)
- `db_dialect=postgres`: `docker-compose.postgres.yml`
- `db_dialect=mysql`: `docker-compose.mysql.yml`
- `db_dialect=mariadb`: `docker-compose.mariadb.yml`

2. `db_mode=existing`
- `db_dialect=postgres`: `docker-compose.external.postgres.yml`
- `db_dialect=mysql`: `docker-compose.external.mysql.yml`
- `db_dialect=mariadb`: `docker-compose.external.mariadb.yml`

Note: existing DB mode supports `postgres`, `mysql`, and `mariadb` in this skill.

## DB_UNDERSCORED Policy

- For MySQL/MariaDB paths, templates consume `DB_UNDERSCORED` from `.env`.
- Default value is `false`.
- For local DB hosts (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`), ask user preference before install. If user does not specify, keep `false`.

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
