---
name: nocobase-install-start
description: Select an installation method, install NocoBase, and start it locally or on a server. Use when users ask how to install NocoBase, initialize a project, or start a running instance.
argument-hint: "[docker|create-nocobase-app|git] [install-dir]"
allowed-tools: Bash, Read, WebFetch
---

# Goal

Install NocoBase successfully and start it with verifiable access.

# Workflow

1. Ask which installation method the user wants.
2. Ask the target installation directory (absolute or relative path).
3. If user has no method preference, recommend Docker first.
4. Follow the method guide in `references/install-methods.md`.
5. Provide exact install and startup commands using the confirmed directory.
6. Verify startup with login page access and health check.

# Method Rule

- Docker is the default recommended method.
- Use `create-nocobase-app` when user wants the fastest local bootstrap.
- Use Git/source installation only when user needs source-level customization.

# Mandatory Clarification Gate

- Do not output installation commands before both of these are confirmed:
- Installation method.
- Installation directory.
- If either is missing, ask concise questions first.
- If user says "you decide", choose Docker and ask only for directory.

# Mandatory Doc-Read Gate

- Do not output installation commands before reading `references/install-methods.md`.
- Do not output installation commands unless the chosen method matches one method in `references/install-methods.md`.
- Include the exact method doc link from `references/install-methods.md` before listing commands.
- If method mapping is unclear, stop and ask a clarification question.

# Question Template

- Method question: "Which NocoBase installation method do you want: Docker (recommended), create-nocobase-app, or Git/source?"
- Directory question: "Please provide the target installation directory (for example `./my-nocobase` or `/opt/nocobase`)."

# Resources

- Must read `references/install-methods.md` before generating commands.
