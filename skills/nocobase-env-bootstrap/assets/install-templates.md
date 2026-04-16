# Install Templates (Local-Only)

This skill ships deterministic local templates for non-Docker installation paths.
Use these templates with `scripts/install.ps1` or `scripts/install.sh`.
Do not fetch install commands from web pages during execution.

Non-Docker paths (`create-nocobase-app` / `git`) require existing database mode
with PostgreSQL, MySQL, or MariaDB. Required inputs:

- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USER`
- `DB_PASSWORD`
- `DB_UNDERSCORED` (optional, default `false`; ask user preference for local DB hosts)

## Template Files

- `assets/install-templates/create-app.command.template.txt`
- `assets/install-templates/git.clone.command.template.txt`
- `assets/install-templates/git.env.template`

## Release Channel Mapping

The install scripts map release channels to local command presets:

- `latest`
  - create path package: `nocobase-app`
  - git path ref: `main`
- `beta`
  - create path package: `nocobase-app@beta`
  - git path ref: `next`
- `alpha`
  - create path package: `nocobase-app@alpha`
  - git path ref: `develop`

You can override these defaults with script arguments:

- create path: `--create-package <pkg>`
- git path: `--git-ref <ref>`

## Script Entrypoints

Windows:

```powershell
powershell -File scripts/install.ps1 --method create-nocobase-app --target-dir . --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase-app
```

Linux/macOS:

```bash
bash scripts/install.sh --method create-nocobase-app --target-dir . --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase-app
```

Git path example:

```bash
bash scripts/install.sh --method git --target-dir . --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase
```
