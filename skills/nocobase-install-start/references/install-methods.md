# NocoBase Installation Methods

Source index: https://v2.docs.nocobase.com/llms.txt

## Preferred Method (Default)

1. Docker installation (recommended)
- Use when: most users, reproducible environment, team consistency.
- Docs: https://v2.docs.nocobase.com/welcome/getting-started/installation/docker-compose

## Alternative Methods

2. `create-nocobase-app`
- Use when: fastest local bootstrap and quick trial.
- Docs: https://v2.docs.nocobase.com/welcome/getting-started/installation/create-nocobase-app

3. Git/source installation
- Use when: source-level customization, framework/plugin core development.
- Docs: https://v2.docs.nocobase.com/welcome/getting-started/installation/git-clone

## Selection Rules

- Always ask user preference first.
- Always ask installation directory before giving commands.
- If user has no preference, choose Docker.
- If user asks for quickest local setup, choose `create-nocobase-app`.
- If user needs source customization, choose Git/source.

## Output Requirements

Before commands, confirm:
- Installation method.
- Installation directory.
- Method doc link for the chosen method.

For the chosen method and confirmed directory, always provide:
- Prerequisites check list.
- Install commands.
- Start commands.
- Basic verification steps (open page + login).

Execution gate:
- If the response does not include the chosen method doc link, do not provide commands yet.
