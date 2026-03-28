# NocoBase Installation Methods

Source index: https://docs.nocobase.com/llms.txt

## Preferred Method (Default)

1. Docker installation (recommended)
- Use when: most users, reproducible environment, team consistency.
- Docs: https://docs.nocobase.com/get-started/installation/docker

## Alternative Methods

2. `create-nocobase-app`
- Use when: fastest local bootstrap and quick trial.
- Docs: https://docs.nocobase.com/get-started/installation/create-nocobase-app

3. Git installation
- Use when: source-level customization, framework/plugin core development.
- Docs: https://docs.nocobase.com/get-started/installation/git

## Release Channel

- Ask user to choose release channel before commands: `latest (stable)`, `beta`, or `alpha`.
- Quickstart reference: https://docs.nocobase.com/get-started/quickstart

## Database Decision (Mandatory)

- For Docker: ask whether to install database together in Docker or connect to an existing database service.
- For Docker + install together: ask database type (`PostgreSQL`, `MySQL`, `MariaDB`).
- For Docker + existing database: require existing database readiness confirmation and explicit config-edit instructions before startup commands.
- For `create-nocobase-app` and `git`: require existing database readiness confirmation before commands.

## Quick Mode

- If user asks for quick mode, use preset: `Docker + install together + PostgreSQL`.
- In quick mode, ask only release channel and installation directory, then execute install and startup.

## Selection Rules

- Ask quick mode first.
- In non-quick mode, ask installation method, release channel, and installation directory.
- For Docker, ask database deployment mode.
- For Docker + install together, ask database type.
- For any existing database path, ask existing database readiness.
- If user has no preference, choose Docker.
- If user asks for quickest non-quick setup, choose `create-nocobase-app`.
- If user needs source customization, choose `git`.
- If user asks for quick mode, choose `Docker + install together + PostgreSQL`.

## Output Requirements

Before running commands, confirm:
- Quick mode:
- Release channel.
- Installation directory.
- Method doc link (`docker`) from this file.
- Non-quick mode:
- Installation method.
- Release channel.
- Installation directory.
- For Docker: database deployment mode (`install together` or `connect existing`).
- For Docker + `install together`: database type.
- For Docker + `connect existing`: existing database readiness.
- For `create-nocobase-app` and `git`: existing database readiness.
- Method doc link for the chosen method.

For the chosen method and confirmed directory, always provide:
- Prerequisites checklist.
- Install: execute on behalf of user.
- Startup: execute only in quick mode; otherwise provide commands only.
- If connecting existing database: require user to edit config/env before startup.
- Verification steps (open page + login).

Execution gate:
- If required confirmations are missing or the response does not include the method doc link, do not run commands yet.
